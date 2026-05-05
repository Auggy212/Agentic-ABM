import React, { useState } from "react";

interface MessageCardProps {
  channel: string;
  day: number;
  wordCount: number;
  subject?: React.ReactNode;
  messageText: React.ReactNode;
  copyText: string;
}

const CHANNEL_ICONS: Record<string, string> = {
  email: "📧",
  linkedin_dm: "💼",
  whatsapp: "📱",
  reddit: "🔴",
  call_script: "📞",
};

export function MessageCard({
  channel,
  day,
  wordCount,
  subject,
  messageText,
  copyText,
}: MessageCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{CHANNEL_ICONS[channel] ?? "✉️"}</span>
          <span className="text-sm font-semibold capitalize text-slate-900">
            Day {day}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
            {wordCount} words
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              copied
                ? "border-green-300 bg-green-50 text-green-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {subject && (
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Subject
            </p>
            <p className="text-sm font-medium text-slate-800">{subject}</p>
          </div>
        )}
        <div className="text-sm leading-7 text-slate-700 whitespace-pre-line">
          {messageText}
        </div>
      </div>
    </div>
  );
}
