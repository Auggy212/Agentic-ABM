import { useState } from "react";
import Icon from "@/components/ui/Icon";
import Modal from "@/components/ui/Modal";
import Btn from "@/components/ui/Btn";
import type { BuyerProfile, CommitteeRole, EmailStatus } from "./types";
import { useUpdateBuyerRole } from "./hooks";

// ── Role styling ─────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<
  CommitteeRole,
  { label: string; bg: string; text: string; border: string }
> = {
  DECISION_MAKER: {
    label: "Decision-Maker",
    bg: "#eef2ff",
    text: "#4338ca",
    border: "#c7d2fe",
  },
  CHAMPION: {
    label: "Champion",
    bg: "#f0fdf4",
    text: "#15803d",
    border: "#bbf7d0",
  },
  BLOCKER: {
    label: "Blocker",
    bg: "#fef2f2",
    text: "#b91c1c",
    border: "#fecaca",
  },
  INFLUENCER: {
    label: "Influencer",
    bg: "var(--surface-2)",
    text: "var(--text-2)",
    border: "var(--border)",
  },
};

// ── Email status badge ────────────────────────────────────────────────────────

const EMAIL_STATUS_CONFIG: Record<
  EmailStatus,
  { label: string; color: string; bg: string }
> = {
  VALID: { label: "Valid", color: "#15803d", bg: "#f0fdf4" },
  CATCH_ALL: { label: "Catch-all", color: "#b45309", bg: "#fffbeb" },
  UNVERIFIED: { label: "Unverified", color: "var(--text-3)", bg: "var(--surface-2)" },
  INVALID: { label: "Invalid", color: "#b91c1c", bg: "#fef2f2" },
  NOT_FOUND: { label: "Not found", color: "var(--text-3)", bg: "var(--surface-2)" },
};

function EmailBadge({ status }: { status: EmailStatus }) {
  const cfg = EMAIL_STATUS_CONFIG[status];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 4,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Tenure formatting ─────────────────────────────────────────────────────────

function formatTenure(months: number | "not_found"): string {
  if (months === "not_found" || typeof months !== "number") return "—";
  if (months < 12) return `${months}mo`;
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${yrs}yr ${rem}mo` : `${yrs}yr`;
}

// ── Role change modal ─────────────────────────────────────────────────────────

const ROLE_OPTIONS: CommitteeRole[] = [
  "DECISION_MAKER",
  "CHAMPION",
  "BLOCKER",
  "INFLUENCER",
];

interface RoleModalProps {
  open: boolean;
  currentRole: CommitteeRole;
  contactId: string;
  onClose: () => void;
}

function RoleChangeModal({ open, currentRole, contactId, onClose }: RoleModalProps) {
  const [selectedRole, setSelectedRole] = useState<CommitteeRole>(currentRole);
  const [reason, setReason] = useState("");
  const update = useUpdateBuyerRole(contactId);

  async function handleSubmit() {
    if (!reason.trim()) return;
    await update.mutateAsync({
      committee_role: selectedRole,
      committee_role_reasoning: reason,
      note: reason,
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Change committee role" size="sm">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 8 }}>
            New role
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ROLE_OPTIONS.map((role) => {
              const cfg = ROLE_CONFIG[role];
              return (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${selectedRole === role ? cfg.border : "var(--border)"}`,
                    background: selectedRole === role ? cfg.bg : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: `2px solid ${selectedRole === role ? cfg.text : "var(--border)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {selectedRole === role && (
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.text }} />
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: selectedRole === role ? cfg.text : "var(--text-1)",
                    }}
                  >
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
            Reason <span style={{ color: "#b91c1c" }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why you're overriding the AI assignment…"
            rows={3}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${!reason.trim() && "var(--bad-300, #fca5a5)" || "var(--border)"}`,
              fontSize: 13,
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
          {!reason.trim() && (
            <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>
              A reason is required before submitting.
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid var(--border)",
        }}
      >
        <Btn variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Btn>
        <Btn
          variant="accent"
          size="sm"
          disabled={!reason.trim() || selectedRole === currentRole}
          loading={update.isPending}
          onClick={handleSubmit}
        >
          Save override
        </Btn>
      </div>
    </Modal>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface BuyerCardProps {
  contact: BuyerProfile;
}

export default function BuyerCard({ contact }: BuyerCardProps) {
  const [painOpen, setPainOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  const role = ROLE_CONFIG[contact.committee_role];
  const tenureAtCompany = formatTenure(contact.tenure_current_company_months);
  const isManualOverride = Boolean(contact.manual_override_reason);

  return (
    <div
      className="card"
      style={{
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderLeft: `3px solid ${role.border}`,
      }}
    >
      {/* Top row: name, title, linkedin, three-dot menu */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{contact.full_name}</span>
            {contact.linkedin_url && (
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#0a66c2", display: "flex" }}
                title="LinkedIn profile"
              >
                <Icon name="linkedin" size={14} />
              </a>
            )}
            {isManualOverride && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  border: "1px solid #bfdbfe",
                }}
              >
                ✏ Manually corrected
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 3 }}>
            {contact.current_title}
          </div>
        </div>

        {/* Three-dot menu */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              padding: "4px 6px",
              borderRadius: 6,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--text-3)",
            }}
            title="Actions"
          >
            <Icon name="more" size={16} />
          </button>
          {menuOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 9 }}
                onClick={() => setMenuOpen(false)}
              />
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: 4,
                  background: "white",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  zIndex: 10,
                  minWidth: 160,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => { setMenuOpen(false); setRoleModalOpen(true); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "9px 14px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    textAlign: "left",
                  }}
                >
                  <Icon name="settings" size={13} />
                  Change role
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-3)", flexWrap: "wrap" }}>
        <span>{contact.department}</span>
        <span>·</span>
        <span>{contact.seniority.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</span>
        <span>·</span>
        <span>{tenureAtCompany} at company</span>
      </div>

      {/* Email row */}
      {contact.email && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <Icon name="mail" size={13} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{contact.email}</span>
          <EmailBadge status={contact.email_status} />
        </div>
      )}
      {contact.phone && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <Icon name="phone" size={13} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{contact.phone}</span>
        </div>
      )}

      {/* Role badge + confidence */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 6,
            background: role.bg,
            color: role.text,
            border: `1px solid ${role.border}`,
          }}
        >
          {role.label}
        </span>
        <button
          onClick={() => setReasonOpen((v) => !v)}
          style={{
            fontSize: 12,
            color: "var(--text-3)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 4px",
          }}
        >
          {Math.round(contact.committee_role_confidence * 100)}% confident
          <span style={{ fontSize: 10 }}>{reasonOpen ? "▲" : "▼"}</span>
        </button>
      </div>

      {reasonOpen && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-2)",
            background: "var(--surface-2)",
            padding: "8px 12px",
            borderRadius: 6,
            lineHeight: 1.5,
          }}
        >
          {contact.committee_role_reasoning}
        </div>
      )}

      {/* Job change banner */}
      {contact.job_change_signal && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 6,
            fontSize: 12,
            color: "#92400e",
          }}
        >
          <span style={{ fontSize: 14 }}>🆕</span>
          Joined {formatTenure(contact.tenure_current_role_months)} ago — strong signal for outreach
        </div>
      )}

      {/* Title mismatch banner */}
      {contact.title_mismatch_flag && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "8px 12px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 6,
            fontSize: 12,
            color: "#92400e",
          }}
        >
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
          <span>
            Apollo says <strong>&ldquo;{contact.apollo_title}&rdquo;</strong> · current title shows{" "}
            <strong>&ldquo;{contact.current_title}&rdquo;</strong> — Verifier will reconcile in Phase 3
          </span>
        </div>
      )}

      {/* Inferred pain points */}
      <div>
        <button
          onClick={() => setPainOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-2)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span>{painOpen ? "▼" : "▶"}</span>
          Inferred pain points ({contact.inferred_pain_points.length})
        </button>

        {painOpen && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {contact.inferred_pain_points.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
                No pain points inferred for this contact.
              </div>
            ) : (
              contact.inferred_pain_points.map((pp, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 12px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#b91c1c",
                        background: "#fee2e2",
                        padding: "1px 5px",
                        borderRadius: 3,
                      }}
                    >
                      [INFERRED]
                    </span>
                    <span style={{ fontWeight: 500, color: "var(--text-1)" }}>{pp.pain_point}</span>
                  </div>
                  <div style={{ color: "var(--text-3)", lineHeight: 1.4 }}>{pp.reasoning}</div>
                  <div style={{ color: "var(--text-3)", marginTop: 4 }}>
                    Confidence: {Math.round(pp.confidence * 100)}%
                  </div>
                </div>
              ))
            )}
            <div style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>
              These inferences will be reviewed in Checkpoint 2.
            </div>
          </div>
        )}
      </div>

      {/* Recent activity — intentional placeholder */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--surface-2)",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--text-3)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon name="activity" size={13} />
        No recent activity captured — Apollo doesn't expose LinkedIn posts. Phase 3 (PhantomBuster) will fill this in automatically.
      </div>

      {/* Role change modal */}
      <RoleChangeModal
        open={roleModalOpen}
        currentRole={contact.committee_role}
        contactId={contact.contact_id}
        onClose={() => setRoleModalOpen(false)}
      />
    </div>
  );
}
