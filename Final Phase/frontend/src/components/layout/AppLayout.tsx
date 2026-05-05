import { useLocation } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const titleByPath: Record<string, string> = {
  "/intake": "Intake Agent",
  "/accounts": "ICP Scout",
  "/buyers": "Buyer Intel",
  "/signals": "Signal Intel",
  "/verify": "Verifier",
  "/storyteller": "Storyteller",
  "/campaigns": "Campaign"
};

export function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  const title = titleByPath[location.pathname] || "Agentic ABM";

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
