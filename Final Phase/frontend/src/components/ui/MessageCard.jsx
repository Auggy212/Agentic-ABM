import { useState } from "react";

const channelTheme = {
  linkedin: {
    label: "LinkedIn",
    accent: "border-l-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-700"
  },
  linkedin_dm: {
    label: "LinkedIn",
    accent: "border-l-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-700"
  },
  email: {
    label: "Email",
    accent: "border-l-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700"
  },
  whatsapp: {
    label: "WhatsApp",
    accent: "border-l-green-500",
    badge: "border-green-200 bg-green-50 text-green-700"
  },
  reddit: {
    label: "Reddit",
    accent: "border-l-orange-500",
    badge: "border-orange-200 bg-orange-50 text-orange-700"
  }
};

export default function MessageCard({ channel, messageText, subject, day, wordCount, copyText }) {
  const [copied, setCopied] = useState(false);
  const theme = channelTheme[channel] ?? channelTheme.email;

  async function handleCopy() {
    if (!copyText) {
      return;
    }

    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <article className={`rounded-xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm ${theme.accent}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${theme.badge}`}>{theme.label}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            Day {day}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            {wordCount} words
          </span>
        </div>

        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!copyText}
          className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {subject ? <h4 className="mt-4 text-base font-semibold text-slate-900">{subject}</h4> : null}

      <div className="mt-4 max-h-64 overflow-y-auto rounded-lg bg-slate-50 px-4 py-3">
        <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{messageText}</div>
      </div>
    </article>
  );
}
