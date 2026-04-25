import { useLocation } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const titleByPath: Record<string, string> = {
  "/": "Intake Page",
  "/accounts": "Accounts Dashboard"
};

export function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  const title = titleByPath[location.pathname] || "Agentic ABM";

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
