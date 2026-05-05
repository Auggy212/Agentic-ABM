import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "@/lib/api";
import TypedConfirmationModal from "@/components/ui/TypedConfirmationModal";
import type { CopilotProposedAction } from "@/types/copilot";

interface Props {
  actions: CopilotProposedAction[];
  results?: Record<string, "confirmed" | "cancelled" | "error">;
  onResult: (key: string, result: "confirmed" | "cancelled" | "error") => void;
}

/**
 * Renders proposed_action cards inside an agent message bubble. Each action
 * has its own confirm modal:
 *   - confirm_token === null  → simple Confirm/Cancel pair
 *   - confirm_token !== null  → TypedConfirmationModal with that token
 *
 * On confirm, POST /api/copilot/actions/execute. On success, call onResult so
 * the parent can mark the action as completed and gray it out.
 */
export default function CopilotProposedActions({ actions, results = {}, onResult }: Props) {
  const navigate = useNavigate();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [errorByIdx, setErrorByIdx] = useState<Record<number, string>>({});

  function actionKey(idx: number, action: CopilotProposedAction) {
    return `${idx}:${action.tool}`;
  }

  async function execute(idx: number, action: CopilotProposedAction, typed: string | null) {
    const key = actionKey(idx, action);
    setPending(idx);
    setErrorByIdx((prev) => ({ ...prev, [idx]: "" }));
    try {
      const { data } = await api.post<{ tool: string; status: string; result: Record<string, unknown> }>(
        "/api/copilot/actions/execute",
        {
          tool: action.tool,
          args: action.args,
          confirmation: typed,
          actor: "ops@sennen.io",
        },
      );
      // Special-case navigate — server returns the path, frontend handles the SPA hop.
      if (data.tool === "navigate" && typeof data.result?.path === "string") {
        navigate(data.result.path as string);
      }
      onResult(key, "confirmed");
      setOpenIdx(null);
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? "Action failed — please try again.";
      setErrorByIdx((prev) => ({ ...prev, [idx]: message }));
      onResult(key, "error");
    } finally {
      setPending(null);
    }
  }

  if (actions.length === 0) return null;

  return (
    <div data-testid="copilot-proposed-actions" style={{ marginTop: 10, display: "grid", gap: 8 }}>
      {actions.map((action, idx) => {
        const key = actionKey(idx, action);
        const result = results[key];
        const isOpen = openIdx === idx;
        const typed = action.confirm_token !== null;
        const buttonLabel = result === "confirmed"
          ? "Done ✓"
          : typed
          ? `Confirm (type ${action.confirm_token})`
          : "Confirm";

        return (
          <div
            key={key}
            data-testid={`proposed-action-${action.tool}`}
            data-status={result ?? "pending"}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              background: result === "confirmed" ? "#f1f5f9" : "white",
              padding: "10px 12px",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, color: "#0f172a" }}>
              {action.tool.replaceAll("_", " ")}
            </div>
            <div style={{ marginTop: 4, color: "#475569", fontSize: 12 }}>{action.consequence}</div>
            {errorByIdx[idx] ? (
              <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 12 }}>{errorByIdx[idx]}</div>
            ) : null}
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => {
                  if (result === "confirmed") return;
                  if (typed) {
                    setOpenIdx(idx);
                  } else {
                    void execute(idx, action, null);
                  }
                }}
                disabled={result === "confirmed" || pending === idx}
                data-testid={`proposed-action-${action.tool}-confirm`}
                style={{
                  borderRadius: 6,
                  border: "none",
                  background: result === "confirmed" ? "#94a3b8" : "#0f172a",
                  color: "white",
                  padding: "6px 12px",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: result === "confirmed" ? "default" : "pointer",
                }}
              >
                {pending === idx ? "Working…" : buttonLabel}
              </button>
              {result !== "confirmed" ? (
                <button
                  type="button"
                  onClick={() => onResult(key, "cancelled")}
                  disabled={pending === idx}
                  style={{
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    background: "white",
                    color: "#0f172a",
                    padding: "6px 12px",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>

            {typed && isOpen ? (
              <TypedConfirmationModal
                open
                title={`Confirm: ${action.tool.replaceAll("_", " ")}`}
                confirmationText={action.confirm_token!}
                consequence={action.consequence}
                isPending={pending === idx}
                onCancel={() => setOpenIdx(null)}
                onConfirm={(typedValue) => execute(idx, action, typedValue)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
