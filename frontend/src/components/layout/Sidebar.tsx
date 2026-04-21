import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/intake", label: "Intake Agent", icon: "🧾" },
  { to: "/accounts", label: "ICP Scout", icon: "🎯" },
  { to: "/buyers", label: "Buyer Intel", icon: "👥" },
  { to: "/signals", label: "Signal Intel", icon: "📡" },
  { to: "/verify", label: "Verifier", icon: "✅" },
  { to: "/storyteller", label: "Storyteller", icon: "✍️" },
  { to: "/campaigns", label: "Campaign", icon: "🚀" }
];

export function Sidebar() {
  return (
    <aside className="w-64 border-r border-slate-200 bg-brand-primary px-4 py-6 text-white">
      <h1 className="mb-6 text-lg font-semibold">Agentic ABM</h1>
      <nav className="space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                isActive ? "bg-brand-accent text-white" : "text-slate-100 hover:bg-white/10"
              }`
            }
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
