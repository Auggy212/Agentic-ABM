import type { ReactNode } from "react";

interface TopBarProps {
  title: string;
  action?: ReactNode;
}

export function TopBar({ title, action }: TopBarProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      {action ? <div>{action}</div> : null}
    </header>
  );
}
