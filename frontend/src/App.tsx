import React, { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import { clearSession, getActiveUser, isAuthenticated } from "./lib/session";
import LandingPage from "./pages/Landing/LandingPage";
import IntakeForm from "./pages/Intake/IntakeForm";
import ResumeDraft from "./pages/Intake/resume";
import AccountDetail from "./pages/Accounts/AccountDetail";
import ClientReviewPage from "./pages/ClientReview/ClientReviewPage";
import SalesHandoffPage from "./pages/SalesHandoff/SalesHandoffPage";

// New design pages
import DashboardPage from "./pages/Dashboard/DashboardPage";
import AccountsPage from "./pages/Accounts/AccountsPage";
import SignalsPageV2 from "./pages/Signals/SignalsPageV2";
import BuyersPageV2 from "./pages/Buyers/BuyersPageV2";
import StorytellerPageV2 from "./pages/Storyteller/StorytellerPageV2";
import CampaignsPageV2 from "./pages/Campaign/CampaignsPageV2";
import VerificationPageV2 from "./pages/Verification/VerificationPageV2";
import CheckpointsPage from "./pages/Checkpoints/CheckpointsPage";
import AgentsPage from "./pages/Agents/AgentsPage";

// ── Nav structure ────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// SVG icon helpers
const IconDash = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>;
const IconIntake = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="M9 12h6M9 16h4"/></svg>;
const IconAccounts = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="9" y1="9.5" x2="9" y2="20"/></svg>;
const IconSignals = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5a6.4 6.4 0 0 1 0 9M7.5 16.5a6.4 6.4 0 0 1 0-9"/><path d="M19.8 4.2a10.6 10.6 0 0 1 0 15.6M4.2 19.8a10.6 10.6 0 0 1 0-15.6"/></svg>;
const IconBuyers = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8M16.5 19a5.5 5.5 0 0 0-3-4.9"/></svg>;
const IconStory = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>;
const IconCampaigns = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>;
const IconVerify = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5 4.5 5.5v5.5c0 4.6 3.1 8.4 7.5 9.8 4.4-1.4 7.5-5.2 7.5-9.8V5.5z"/><path d="M9 12l2.2 2.2L15 10"/></svg>;
const IconCheckpoints = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4"/><path d="M4 4h13l-2 4 2 4H4"/></svg>;
const IconSettings = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.4l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.4-1.4L13.8 2h-3.6l-.4 2.9a7 7 0 0 0-2.4 1.4l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.4 1.4l.4 2.9h3.6l.4-2.9a7 7 0 0 0 2.4-1.4l2.3 1 2-3.4-2-1.5A7 7 0 0 0 19 12z"/></svg>;
const IconToggle = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg>;
const IconBell = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.5 21a2 2 0 0 1-3 0"/></svg>;
const IconSearch = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9aa0b4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>;

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: <IconDash /> },
      { to: "/intake", label: "Intake", icon: <IconIntake /> },
      { to: "/accounts", label: "Accounts", icon: <IconAccounts /> },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/signals", label: "Signals", icon: <IconSignals /> },
      { to: "/buyers", label: "Buyer Intel", icon: <IconBuyers /> },
    ],
  },
  {
    label: "Outreach",
    items: [
      { to: "/storyteller", label: "Storyteller", icon: <IconStory /> },
      { to: "/campaigns", label: "Campaigns", icon: <IconCampaigns /> },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/verification", label: "Verification", icon: <IconVerify /> },
      { to: "/checkpoints", label: "Checkpoints", icon: <IconCheckpoints /> },
      { to: "/agents", label: "Agents", icon: <IconSettings /> },
    ],
  },
];

// ── App Shell ────────────────────────────────────────────────────────────────

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getActiveUser();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");

  const sidebarW = collapsed ? 56 : 220;
  const labelOpacity = collapsed ? 0 : 1;

  const handleLogout = () => {
    clearSession();
    navigate("/");
  };

  const isActive = (to: string) =>
    location.pathname === to ||
    (to !== "/dashboard" && location.pathname.startsWith(to));

  const navBg = (to: string) => isActive(to) ? "rgba(67,56,202,0.2)" : "transparent";
  const navColor = (to: string) => isActive(to) ? "#818cf8" : "#7a8194";

  const initials = user?.initials ?? user?.name?.split(" ").map(w => w[0]).join("").toUpperCase() ?? "?";

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", background: "#f6f6f4", color: "#1a1d29", fontFamily: "'Inter',system-ui,sans-serif", WebkitFontSmoothing: "antialiased" }}>

      {/* SIDEBAR */}
      <aside style={{ width: sidebarW, flexShrink: 0, background: "#16181f", display: "flex", flexDirection: "column", transition: "width .2s ease", overflow: "hidden" }}>
        {/* Logo row */}
        <div style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, background: "#4338ca", display: "grid", placeItems: "center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff", letterSpacing: "-0.01em", whiteSpace: "nowrap", opacity: labelOpacity, transition: "opacity .15s" }}>ABM Engine</span>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{ marginLeft: "auto", width: 26, height: 26, flexShrink: 0, border: "none", background: "transparent", color: "#7a8194", borderRadius: 6, cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <IconToggle />
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 10px 12px", overflowY: "auto" }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", color: "#565b6d", textTransform: "uppercase", padding: "8px 10px 6px", opacity: labelOpacity, whiteSpace: "nowrap", transition: "opacity .15s" }}>
                {section.label}
              </div>
              {section.items.map((item) => (
                <button
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  style={{
                    display: "flex", alignItems: "center", gap: 11, width: "100%", border: "none", cursor: "pointer",
                    padding: "9px 11px", borderRadius: 7, marginBottom: 2, font: "inherit", fontSize: 13.5, fontWeight: 500,
                    textAlign: "left", overflow: "hidden", justifyContent: collapsed ? "center" : "flex-start",
                    background: navBg(item.to), color: navColor(item.to), transition: "background .12s",
                  }}
                >
                  <span style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 18, height: 18 }}>{item.icon}</span>
                  <span style={{ whiteSpace: "nowrap", opacity: labelOpacity, transition: "opacity .15s" }}>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Settings footer */}
        <div style={{ flexShrink: 0, padding: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", border: "none", cursor: "pointer", padding: "9px 11px", borderRadius: 7, font: "inherit", fontSize: 13.5, fontWeight: 500, textAlign: "left", overflow: "hidden", justifyContent: collapsed ? "center" : "flex-start", background: "transparent", color: "#7a8194", transition: "background .12s" }}
            onClick={handleLogout}
          >
            <span style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 18, height: 18 }}><IconSettings /></span>
            <span style={{ whiteSpace: "nowrap", opacity: labelOpacity, transition: "opacity .15s" }}>Settings</span>
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}>

        {/* Header */}
        <header style={{ height: 56, flexShrink: 0, background: "#ffffff", borderBottom: "1px solid #e7e7e3", display: "flex", alignItems: "center", gap: 18, padding: "0 22px", zIndex: 5 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.01em", color: "#1a1d29", whiteSpace: "nowrap" }}>ABM Engine</span>
          <div style={{ position: "relative", flex: 1, maxWidth: 440, marginLeft: 8 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><IconSearch /></span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search accounts, signals, contacts…"
              style={{ width: "100%", height: 34, padding: "0 12px 0 34px", border: "1px solid #e3e3df", borderRadius: 7, background: "#f7f7f5", font: "inherit", fontSize: 13, color: "#1a1d29", outline: "none", transition: "border-color .12s, background .12s" }}
            />
          </div>
          <div style={{ flex: 1 }} />
          <button style={{ width: 34, height: 34, flexShrink: 0, border: "1px solid #e7e7e3", background: "#fff", borderRadius: 7, cursor: "pointer", display: "grid", placeItems: "center", color: "#6b7180", position: "relative" }}>
            <IconBell />
            <span style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: "50%", background: "#4338ca", border: "1.5px solid #fff" }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 9, paddingLeft: 4 }}>
            <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: "50%", background: "#4338ca", display: "grid", placeItems: "center", color: "#fff", fontSize: 12, fontWeight: 600 }}>{initials}</div>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1a1d29" }}>{user?.name ?? "User"}</div>
              <div style={{ fontSize: 11, color: "#8a8f9e" }}>{user?.email ?? ""}</div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px 26px 44px" }}>
          <Routes location={location}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/intake" element={<IntakeForm />} />
            <Route path="/intake/resume" element={<ResumeDraft />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/accounts/:id" element={<AccountDetail />} />
            <Route path="/signals" element={<SignalsPageV2 />} />
            <Route path="/buyers" element={<BuyersPageV2 />} />
            <Route path="/storyteller" element={<StorytellerPageV2 />} />
            <Route path="/campaigns" element={<CampaignsPageV2 />} />
            <Route path="/verification" element={<VerificationPageV2 />} />
            <Route path="/checkpoints" element={<CheckpointsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
          </Routes>
        </main>
      </div>
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
