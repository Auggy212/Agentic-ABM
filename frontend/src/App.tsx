import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import Icon from "@/components/ui/Icon";
import Copilot from "@/components/Copilot";
import LandingPage from "./pages/Landing/LandingPage";
import IntakeForm from "./pages/Intake/IntakeForm";
import ResumeDraft from "./pages/Intake/resume";
import AccountsPage from "./pages/Accounts/AccountsPage";
import AccountDetail from "./pages/Accounts/AccountDetail";
import AgentsPage from "./pages/Agents/AgentsPage";
import SequencesPage from "./pages/Sequences/SequencesPage";
import { useNavCounts } from "@/hooks/useNavCounts";
import { useAgents } from "@/hooks/useAgents";

const NAV_ITEMS = [
  { to: "/accounts",  label: "Accounts",  icon: "target"  as const },
  { to: "/sequences", label: "Sequences", icon: "send"    as const },
  { to: "/agents",    label: "Agents",    icon: "robot"   as const },
  { to: "/intake",    label: "Intake",    icon: "intake"  as const },
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
  const isIntake = location.pathname.startsWith("/intake");
  const { data: navCounts } = useNavCounts();

  return (
    <div className="app-shell">
      {/* Left nav */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-brand-mark">A</div>
          <span>ABM Engine</span>
        </div>

        <div className="nav-section">Workspace</div>
        {NAV_ITEMS.map((n) => {
          const active =
            location.pathname === n.to ||
            (n.to === "/accounts" && location.pathname.startsWith("/accounts"));
          return (
            <Link key={n.to} to={n.to} className="nav-item" data-active={String(active)}>
              <Icon name={n.icon} size={15} />
              <span>{n.label}</span>
              <NavBadge to={n.to} counts={navCounts} />
            </Link>
          );
        })}

        <div className="nav-section">Insights</div>
        <button className="nav-item" data-active="false">
          <Icon name="trend" size={15} /><span>Pipeline</span>
        </button>
        <button className="nav-item" data-active="false">
          <Icon name="money" size={15} /><span>Attribution</span>
        </button>
        <button className="nav-item" data-active="false">
          <Icon name="list" size={15} /><span>Saved views</span>
        </button>

        <div className="nav-section">Settings</div>
        <button className="nav-item" data-active="false">
          <Icon name="settings" size={15} /><span>Integrations</span>
        </button>

        <div className="nav-foot">
          <div className="nav-avatar">M</div>
          <div className="nav-foot-text">
            <div style={{ fontWeight: 600 }}>Maya Okafor</div>
            <div>Sennen · Admin</div>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="main">
        <Routes>
          <Route path="/intake" element={<IntakeForm />} />
          <Route path="/intake/resume" element={<ResumeDraft />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/accounts/:id" element={<AccountDetail />} />
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
