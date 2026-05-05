import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import Icon from "@/components/ui/Icon";
import { clearSession } from "./lib/session";
import Copilot from "@/components/Copilot";
import LandingPage from "./pages/Landing/LandingPage";
import IntakeForm from "./pages/Intake/IntakeForm";
import ResumeDraft from "./pages/Intake/resume";
import AccountsPage from "./pages/Accounts/AccountsPage";
import AccountDetail from "./pages/Accounts/AccountDetail";
import AgentsPage from "./pages/Agents/AgentsPage";
import SequencesPage from "./pages/Sequences/SequencesPage";
import BuyersIndexPage from "./pages/Buyers/BuyersIndexPage";
import CampaignDashboardPage from "./pages/Campaign/CampaignDashboardPage";
import CP2ReviewPage from "./pages/Checkpoint2/CP2ReviewPage";
import CP3OperatorPage from "./pages/Checkpoint3/CP3OperatorPage";
import CP4QueuePage from "./pages/Checkpoint4/CP4QueuePage";
import ClientReviewPage from "./pages/ClientReview/ClientReviewPage";
import SalesHandoffPage from "./pages/SalesHandoff/SalesHandoffPage";
import PipelinePage from "./pages/Pipeline/PipelinePage";
import VerificationDashboard from "./pages/Verification/VerificationDashboard";
import { SignalsPage } from "./pages/SignalsPage";
import { StorytellerPage } from "./pages/StorytellerPage";
import { useNavCounts } from "@/hooks/useNavCounts";
import { useAgents } from "@/hooks/useAgents";

const NAV_ITEMS = [
  { to: "/accounts",  label: "Accounts",  icon: "target"  as const },
  { to: "/buyers",    label: "Buyers",    icon: "users"   as const },
  { to: "/pipeline",  label: "Pipeline",  icon: "trend"   as const },
  { to: "/verification", label: "Verification", icon: "check" as const },
  { to: "/sequences", label: "Sequences", icon: "send"    as const },
  { to: "/agents",    label: "Agents",    icon: "robot"   as const },
  { to: "/intake",    label: "Intake",    icon: "intake"  as const },
];

const INSIGHT_ITEMS = [
  { to: "/checkpoint-2", label: "Checkpoint 2", icon: "list" as const },
  { to: "/checkpoint-4", label: "Checkpoint 4", icon: "check" as const },
  { to: "/signals", label: "Signals", icon: "activity" as const },
  { to: "/campaigns", label: "Campaigns", icon: "mail" as const },
  { to: "/storyteller", label: "Storyteller", icon: "sparkle" as const },
];

function AgentRail() {
  const { data } = useAgents();
  if (!data?.events?.length) return null;

  // Build the rail text from live agent events
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

function NavBadge({ to, counts }: { to: string; counts: ReturnType<typeof useNavCounts>["data"] }) {
  if (!counts) return null;
  if (to === "/accounts"  && counts.accounts)  return <span className="nav-item-count">{counts.accounts}</span>;
  if (to === "/sequences" && counts.sequences) return <span className="nav-item-count">{counts.sequences}</span>;
  if (to === "/agents"    && counts.agents)    return <span className="nav-item-count">{counts.agents}</span>;
  return null;
}

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
              (n.to === "/pipeline" && location.pathname.startsWith("/pipeline")) ||
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
          <button className="nav-item" data-active="false">
            <Icon name="settings" size={15} /><span>Integrations</span>
          </button>
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
          <Route path="/storyteller" element={<StorytellerPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/sequences" element={<SequencesPage />} />
        </Routes>

        {/* Live agent rail — driven by real agent events, hidden on intake */}
        {!isIntake && <AgentRail />}
      </main>

      {/* Copilot pane — hidden on intake */}
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
