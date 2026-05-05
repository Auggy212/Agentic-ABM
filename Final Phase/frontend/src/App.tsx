import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import Icon from "@/components/ui/Icon";
import { clearSession } from "./lib/session";
import Copilot from "@/components/Copilot";
import { useNavCounts } from "@/hooks/useNavCounts";
import { useAgents } from "@/hooks/useAgents";

// ── Page imports (flat src/pages/ structure) ──────────────────────────────────
import { AccountsPage } from "./pages/AccountsPage";
import { BuyerIntelPage } from "./pages/BuyerIntelPage";
import { SignalsPage } from "./pages/SignalsPage";
import { StorytellerPage } from "./pages/StorytellerPage";
import { CampaignPage } from "./pages/CampaignPage";
import { SalesHandoffPage } from "./pages/SalesHandoffPage";
import { SalesAcceptancePage } from "./pages/SalesAcceptancePage";
import { VerifierPage } from "./pages/VerifierPage";
import LandingPage from "./pages/Landing/LandingPage";
import AgentsPage from "./pages/Agents/AgentsPage";
import IntakeForm from "./pages/Intake/IntakeForm";
import { IntegrationsPage } from "./pages/IntegrationsPage";

// ── Stub pages for routes not yet built ──────────────────────────────────────
function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-light">
        <span className="text-3xl">🚧</span>
      </div>
      <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      <p className="max-w-sm text-sm text-slate-500">
        This page is coming soon. The rest of the app is fully functional.
      </p>
    </section>
  );
}

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: "/accounts",      label: "Accounts",      icon: "target"   as const },
  { to: "/buyers",        label: "Buyers",        icon: "users"    as const },
  { to: "/verification",  label: "Verification",  icon: "check"    as const },
  { to: "/agents",        label: "Agents",        icon: "robot"    as const },
  { to: "/intake",        label: "Intake",        icon: "intake"   as const },
];

const INSIGHT_ITEMS = [
  { to: "/signals",       label: "Signals",       icon: "activity" as const },
  { to: "/campaigns",     label: "Campaigns",     icon: "mail"     as const },
  { to: "/storyteller",   label: "Storyteller",   icon: "sparkle"  as const },
  { to: "/handoff",       label: "Handoff",       icon: "send"     as const },
  { to: "/acceptance",    label: "Acceptance",    icon: "check"    as const },
];

// ── Agent rail ────────────────────────────────────────────────────────────────

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
          {doubled.map((text, i) => (
            <span key={i}>{text}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Nav badge ─────────────────────────────────────────────────────────────────

function NavBadge({ to, counts }: { to: string; counts: ReturnType<typeof useNavCounts>["data"] }) {
  if (!counts) return null;
  if (to === "/accounts"  && counts.accounts)  return <span className="nav-item-count">{counts.accounts}</span>;
  if (to === "/agents"    && counts.agents)    return <span className="nav-item-count">{counts.agents}</span>;
  return null;
}

// ── App shell ─────────────────────────────────────────────────────────────────

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isIntake = location.pathname.startsWith("/intake");
  const { data: navCounts } = useNavCounts();

  const handleLogout = () => {
    clearSession();
    navigate("/");
  };

  return (
    <div className="app-shell">
      {/* Left nav */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-brand-mark">A</div>
          <span>ABM Engine</span>
        </div>

        <div className="nav-scrollable">
          <div className="nav-section">Workspace</div>
          {NAV_ITEMS.map((n) => {
            const active =
              location.pathname === n.to ||
              (n.to === "/accounts" && location.pathname.startsWith("/accounts")) ||
              (n.to === "/buyers" && location.pathname.startsWith("/buyers")) ||
              (n.to === "/verification" && location.pathname.startsWith("/verification"));
            return (
              <Link key={n.to} to={n.to} className="nav-item" data-active={String(active)}>
                <Icon name={n.icon} size={15} />
                <span>{n.label}</span>
                <NavBadge to={n.to} counts={navCounts} />
              </Link>
            );
          })}

          <div className="nav-section">Insights</div>
          {INSIGHT_ITEMS.map((n) => {
            const active = location.pathname === n.to || location.pathname.startsWith(`${n.to}/`);
            return (
              <Link key={n.to} to={n.to} className="nav-item" data-active={String(active)}>
                <Icon name={n.icon} size={15} /><span>{n.label}</span>
              </Link>
            );
          })}

          <div className="nav-section">Settings</div>
          <Link
            to="/integrations"
            className="nav-item"
            data-active={String(location.pathname.startsWith("/integrations"))}
          >
            <Icon name="settings" size={15} /><span>Integrations</span>
          </Link>
        </div>

        <div className="nav-footer">
          <div className="nav-avatar">M</div>
          <div className="nav-foot-text">
            <div style={{ fontWeight: 600 }}>Maya Okafor</div>
            <div>Sennen · Admin</div>
          </div>
          <button
            onClick={handleLogout}
            className="nav-logout-btn"
            title="Logout"
          >
            <Icon name="logout" size={15} />
          </button>
        </div>
      </nav>

      {/* Main */}
      <main className="main">
        <Routes>
          {/* Workspace */}
          <Route path="/intake"        element={<IntakeForm />} />
          <Route path="/accounts"      element={<AccountsPage />} />
          <Route path="/accounts/:id"  element={<PlaceholderPage title="Account Detail" />} />
          <Route path="/buyers"        element={<BuyerIntelPage />} />
          <Route path="/verification"  element={<VerifierPage />} />
          <Route path="/agents"        element={<AgentsPage />} />

          {/* Insights */}
          <Route path="/signals"       element={<SignalsPage />} />
          <Route path="/campaigns"     element={<CampaignPage />} />
          <Route path="/storyteller"   element={<StorytellerPage />} />
          <Route path="/handoff"       element={<SalesHandoffPage />} />
          <Route path="/acceptance"    element={<SalesAcceptancePage />} />
          <Route path="/integrations"  element={<IntegrationsPage />} />
        </Routes>

        {/* Live agent rail */}
        {!isIntake && <AgentRail />}
      </main>

      {/* Copilot pane */}
      {!isIntake && <Copilot />}
    </div>
  );
}

// ── Root router ───────────────────────────────────────────────────────────────

function RootRouter() {
  const location = useLocation();
  if (location.pathname === "/") return <LandingPage />;
  return <AppShell />;
}

// ── App ───────────────────────────────────────────────────────────────────────

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
