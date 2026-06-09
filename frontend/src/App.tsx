import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import Icon from "@/components/ui/Icon";
import { clearSession, getActiveUser, isAuthenticated } from "./lib/session";
import Copilot from "@/components/Copilot";
import LandingPage from "./pages/Landing/LandingPage";
import IntakeForm from "./pages/Intake/IntakeForm";
import ResumeDraft from "./pages/Intake/resume";
import AccountsPage from "./pages/Accounts/AccountsPage";
import AccountDetail from "./pages/Accounts/AccountDetail";
import AgentsPage from "./pages/Agents/AgentsPage";
import BuyersIndexPage from "./pages/Buyers/BuyersIndexPage";
import CampaignDashboardPage from "./pages/Campaign/CampaignDashboardPage";
import CampaignRunsPage from "./pages/Campaign/CampaignRunsPage";
import CP2ReviewPage from "./pages/Checkpoint2/CP2ReviewPage";
import CP3OperatorPage from "./pages/Checkpoint3/CP3OperatorPage";
import CP4QueuePage from "./pages/Checkpoint4/CP4QueuePage";
import ClientReviewPage from "./pages/ClientReview/ClientReviewPage";
import SalesHandoffPage from "./pages/SalesHandoff/SalesHandoffPage";
import PipelinePage from "./pages/Pipeline/PipelinePage";
import VerificationDashboard from "./pages/Verification/VerificationDashboard";
import { SignalsPage } from "./pages/SignalsPage";
import { StorytellerPage } from "./pages/StorytellerPage";
import IntegrationsPage from "./pages/Integrations/IntegrationsPage";
import VisualsPage from "./pages/Visuals/VisualsPage";
import SequencesPage from "./pages/Sequences/SequencesPage";
import { useNavCounts } from "@/hooks/useNavCounts";
import { useAgents } from "@/hooks/useAgents";
import { usePipelineStage, type PhaseStatus } from "@/hooks/usePipelineStage";

// ── Phase-aware nav structure ────────────────────────────────────────────────

type NavIcon = "target" | "users" | "trend" | "check" | "send" | "robot" | "intake" | "list" | "activity" | "mail" | "sparkle" | "image" | "settings" | "logout";

interface NavPhase {
  label: string;
  items: {
    to: string;
    label: string;
    icon: NavIcon;
    stageKey: string | null;
    badge?: "accounts" | "agents";
  }[];
}

const NAV_PHASES: NavPhase[] = [
  {
    label: "Setup",
    items: [
      { to: "/intake",   label: "Intake",     icon: "intake",  stageKey: "intake" },
      { to: "/agents",   label: "Run Agents", icon: "robot",   stageKey: "icp_scout", badge: "agents" },
    ],
  },
  {
    label: "Discovery",
    items: [
      { to: "/accounts", label: "Accounts",   icon: "target",   stageKey: "icp_scout",   badge: "accounts" },
      { to: "/buyers",   label: "Buyers",      icon: "users",    stageKey: "buyer_intel" },
      { to: "/signals",  label: "Signals",     icon: "activity", stageKey: "signal_intel" },
    ],
  },
  {
    label: "Review",
    items: [
      { to: "/checkpoint-2",  label: "Checkpoint 2", icon: "list",  stageKey: "checkpoint_2" },
      { to: "/verification",  label: "Verification", icon: "check", stageKey: "verification" },
    ],
  },
  {
    label: "Activation",
    items: [
      { to: "/storyteller",  label: "Storyteller",  icon: "sparkle", stageKey: "storyteller" },
      { to: "/checkpoint-3", label: "Checkpoint 3", icon: "send",    stageKey: "checkpoint_3" },
      { to: "/checkpoint-4", label: "Checkpoint 4", icon: "check",   stageKey: "checkpoint_4" },
      { to: "/campaigns",      label: "Dashboard",      icon: "mail",    stageKey: "campaigns" },
      { to: "/campaign-runs",  label: "Campaign Runs",  icon: "send",    stageKey: "campaigns" },
    ],
  },
  {
    label: "More",
    items: [
      { to: "/sequences",    label: "Sequences",    icon: "list",     stageKey: null },
      { to: "/pipeline",     label: "Pipeline",     icon: "trend",    stageKey: null },
      { to: "/visuals",      label: "Visuals",      icon: "image",    stageKey: null },
      { to: "/integrations", label: "Integrations", icon: "settings", stageKey: null },
    ],
  },
];

// ── Bypass: this user always has all pages unlocked ──────────────────────────
const UNLOCK_EMAIL = "test2@gmail.com";

// ── Helpers ──────────────────────────────────────────────────────────────────

function phaseIcon(status: PhaseStatus | undefined, bypass: boolean) {
  if (status === "done") return <span style={{ color: "#16a05c", fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>✓</span>;
  if (!bypass && status === "locked") return <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>🔒</span>;
  return null;
}

function AgentRail() {
  const { data } = useAgents();
  if (!data?.events?.length) return null;
  const railItems = data.events.map((e) => `${e.agent} · ${e.title}: ${e.meta}`);
  const doubled = [...railItems, ...railItems];
  return (
    <div className="agent-rail">
      <span className="agent-rail-pulse">Live</span>
      <div className="agent-rail-marquee">
        <div className="agent-rail-marquee-track">
          {doubled.map((text, i) => <span key={i}>{text}</span>)}
        </div>
      </div>
    </div>
  );
}

// ── Locked page fallback ──────────────────────────────────────────────────────

const LOCK_MESSAGES: Record<string, { reason: string; action: string; to: string }> = {
  "/buyers":       { reason: "Run ICP Scout first to discover accounts.", action: "Go to Run Agents", to: "/agents" },
  "/signals":      { reason: "Run ICP Scout first to discover accounts.", action: "Go to Run Agents", to: "/agents" },
  "/checkpoint-2": { reason: "Run Buyer Intel and Signal Intel first.", action: "Go to Run Agents", to: "/agents" },
  "/verification": { reason: "Approve Checkpoint 2 first.", action: "Go to Checkpoint 2", to: "/checkpoint-2" },
  "/storyteller":  { reason: "Approve Checkpoint 2 first.", action: "Go to Checkpoint 2", to: "/checkpoint-2" },
  "/checkpoint-3": { reason: "Run Storyteller first to generate messages.", action: "Go to Storyteller", to: "/storyteller" },
  "/checkpoint-4": { reason: "Approve Checkpoint 3 first.", action: "Go to Checkpoint 3", to: "/checkpoint-3" },
  "/campaigns":      { reason: "Approve Checkpoint 4 first.", action: "Go to Checkpoint 4", to: "/checkpoint-4" },
  "/campaign-runs":  { reason: "Approve Checkpoint 4 first.", action: "Go to Checkpoint 4", to: "/checkpoint-4" },
};

function LockedPage({ path }: { path: string }) {
  const navigate = useNavigate();
  const msg = LOCK_MESSAGES[path];
  if (!msg) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, padding: 40 }}>
      <div style={{
        maxWidth: 420, textAlign: "center", padding: "36px 32px",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14,
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>This page is locked</div>
        <div style={{ color: "var(--text-3)", fontSize: 14, marginBottom: 20 }}>{msg.reason}</div>
        <button className="btn-primary" onClick={() => navigate(msg.to)} style={{ padding: "8px 20px" }}>
          {msg.action} →
        </button>
      </div>
    </div>
  );
}

// ── Next-step banner ──────────────────────────────────────────────────────────

const NEXT_STEPS: Record<string, { message: string; action: string; to: string }> = {
  "/intake":       { message: "Intake complete.", action: "Go run ICP Scout →", to: "/agents" },
  "/accounts":     { message: "Accounts discovered.", action: "Run Buyer Intel & Signal Intel →", to: "/agents" },
  "/buyers":       { message: "Buyer profiles ready.", action: "Review Signal Intel →", to: "/signals" },
  "/signals":      { message: "Signal reports ready.", action: "Review inferred claims at Checkpoint 2 →", to: "/checkpoint-2" },
  "/checkpoint-2": { message: "CP2 approved!", action: "Run Verification →", to: "/agents" },
  "/verification": { message: "Verified!", action: "Generate messaging →", to: "/storyteller" },
  "/storyteller":  { message: "Messages drafted.", action: "Operator review at Checkpoint 3 →", to: "/checkpoint-3" },
  "/checkpoint-3": { message: "CP3 approved!", action: "Review at Checkpoint 4 →", to: "/checkpoint-4" },
  "/checkpoint-4": { message: "CP4 approved!", action: "Launch Campaign →", to: "/campaigns" },
};

function NextStepBanner({ path, stage }: { path: string; stage: ReturnType<typeof usePipelineStage>["data"] }) {
  const navigate = useNavigate();
  if (!stage) return null;

  const stageKeyMap: Record<string, keyof typeof stage> = {
    "/intake":        "intake",
    "/accounts":      "icp_scout",
    "/buyers":        "buyer_intel",
    "/signals":       "signal_intel",
    "/checkpoint-2":  "checkpoint_2",
    "/verification":  "verification",
    "/storyteller":   "storyteller",
    "/checkpoint-3":  "checkpoint_3",
    "/checkpoint-4":  "checkpoint_4",
  };

  const key = stageKeyMap[path];
  if (!key || stage[key] !== "done") return null;

  const next = NEXT_STEPS[path];
  if (!next) return null;

  return (
    <div style={{
      background: "var(--acc-950)", borderBottom: "1px solid var(--acc-800)",
      padding: "10px 24px", display: "flex", alignItems: "center", gap: 12,
      fontSize: 13,
    }}>
      <span style={{ color: "var(--acc-300)" }}>✓ {next.message}</span>
      <button
        onClick={() => navigate(next.to)}
        style={{
          background: "var(--acc-600)", color: "#fff", border: "none",
          borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
        }}
      >
        {next.action}
      </button>
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isIntake = location.pathname.startsWith("/intake");
  const { data: navCounts } = useNavCounts();
  const { data: stage } = usePipelineStage();
  const user = getActiveUser();
  const isBypassUser = user?.email === UNLOCK_EMAIL;

  // Gate: redirect to intake if not yet completed
  React.useEffect(() => {
    if (stage && stage.intake !== "done" && !isIntake) {
      navigate("/intake", { replace: true });
    }
  }, [stage, isIntake, navigate]);

  const handleLogout = () => {
    clearSession();
    navigate("/");
  };

  // Determine if current route is locked (bypass users always unlocked)
  const lockMsg = LOCK_MESSAGES[location.pathname];
  const stageKeyMap: Record<string, keyof NonNullable<typeof stage>> = {
    "/buyers":        "buyer_intel",
    "/signals":       "signal_intel",
    "/checkpoint-2":  "checkpoint_2",
    "/verification":  "verification",
    "/storyteller":   "storyteller",
    "/checkpoint-3":  "checkpoint_3",
    "/checkpoint-4":  "checkpoint_4",
    "/campaigns":      "campaigns",
    "/campaign-runs":  "campaigns",
  };
  const currentStageKey = stageKeyMap[location.pathname];
  const isLocked = !isBypassUser && !!lockMsg && !!currentStageKey && stage?.[currentStageKey] === "locked";

  return (
    <div className="app-shell">
      {/* Left nav */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-brand-mark">A</div>
          <span>ABM Engine</span>
        </div>

        <div className="nav-scrollable">
          {NAV_PHASES.map((phase) => (
            <div key={phase.label}>
              <div className="nav-section">{phase.label}</div>
              {phase.items.map((n) => {
                const phaseStatus: PhaseStatus | undefined =
                  n.stageKey && stage ? stage[n.stageKey as keyof typeof stage] as PhaseStatus : undefined;
                const locked = !isBypassUser && phaseStatus === "locked";
                const active =
                  location.pathname === n.to ||
                  (n.to === "/accounts" && location.pathname.startsWith("/accounts")) ||
                  (n.to === "/buyers" && location.pathname.startsWith("/buyers"));

                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className="nav-item"
                    data-active={String(active)}
                    style={locked ? { opacity: 0.35, pointerEvents: "none" } : undefined}
                    tabIndex={locked ? -1 : undefined}
                  >
                    <Icon name={n.icon} size={15} />
                    <span>{n.label}</span>
                    {/* badges */}
                    {n.badge === "accounts" && navCounts?.accounts
                      ? <span className="nav-item-count">{navCounts.accounts}</span>
                      : null}
                    {n.badge === "agents" && navCounts?.agents
                      ? <span className="nav-item-count">{navCounts.agents}</span>
                      : null}
                    {phaseIcon(phaseStatus, isBypassUser)}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="nav-footer">
          <div className="nav-footer-user">
            <div className="nav-avatar">{user?.initials ?? "?"}</div>
            <div className="nav-foot-text">
              <div>{user?.name ?? "Unknown"}</div>
              <div>{user?.email ?? ""}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="nav-logout-btn" title="Logout">
            <Icon name="logout" size={13} />
            Sign out
          </button>
        </div>
      </nav>

      {/* Main */}
      <main className="main">
        {/* Next-step banner — guides user to next action after each phase */}
        {!isIntake && (
          <NextStepBanner path={location.pathname} stage={stage} />
        )}

        {isLocked ? (
          <LockedPage path={location.pathname} />
        ) : (
          <Routes>
          <Route path="/intake" element={<IntakeForm />} />
          <Route path="/intake/resume" element={<ResumeDraft />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/accounts/:id" element={<AccountDetail />} />
          <Route path="/buyers" element={<BuyersIndexPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/verification" element={<VerificationDashboard />} />
          <Route path="/checkpoint-2" element={<CP2ReviewPage />} />
          <Route path="/checkpoint-3" element={<CP3OperatorPage />} />
          <Route path="/checkpoint-4" element={<CP4QueuePage />} />
          <Route path="/signals" element={<SignalsPage />} />
          <Route path="/campaigns" element={<CampaignDashboardPage />} />
          <Route path="/campaign-runs" element={<CampaignRunsPage />} />
          <Route path="/storyteller" element={<StorytellerPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/sequences" element={<SequencesPage />} />
          <Route path="/visuals" element={<VisualsPage />} />
        </Routes>
        )}

        {!isIntake && <AgentRail />}
      </main>

      {!isIntake && <Copilot />}
    </div>
  );
}

function RootRouter() {
  const location = useLocation();

  if (location.pathname === "/") return <LandingPage />;
  if (location.pathname.startsWith("/client-review/")) {
    return (
      <Routes>
        <Route path="/client-review/:share_token" element={<ClientReviewPage />} />
      </Routes>
    );
  }
  if (location.pathname.startsWith("/sales/handoff/")) {
    return (
      <Routes>
        <Route path="/sales/handoff/:token" element={<SalesHandoffPage />} />
      </Routes>
    );
  }
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <AppShell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RootRouter />
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
