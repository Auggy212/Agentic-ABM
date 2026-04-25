import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Intake Page", icon: "🧾" },
  { to: "/accounts", label: "Accounts Dashboard", icon: "🎯" }
];

export function Sidebar() {
  return (
    <aside className="w-72 border-r border-slate-200 bg-brand-primary px-5 py-6 text-white">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Workspace</p>
        <h1 className="mt-2 text-lg font-semibold">Agentic ABM</h1>
        <p className="mt-2 text-sm text-slate-200">Move between intake and account review from one clean navigation rail.</p>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            end={item.to === "/"}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition ${
                isActive
                  ? "bg-white text-brand-primary shadow-sm"
                  : "text-slate-100 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
