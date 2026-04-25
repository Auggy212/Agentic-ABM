import { useState } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export default function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-lg bg-gray-900 px-3 py-2
                     text-xs text-gray-100 shadow-lg leading-relaxed pointer-events-none"
        >
          {content}
          <span className="absolute top-full left-3 -translate-y-px border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}
