import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MessageContactSummary } from "../types/api.types";
import { mockBuyersResponse } from "../mocks/data";

async function fetchContacts(): Promise<MessageContactSummary[]> {
  try {
    const res = await fetch("/api/messages/contacts");
    if (!res.ok) throw new Error("failed");
    return res.json();
  } catch {
    // Fall back to mock data in dev
    return mockBuyersResponse.contacts.map((c) => ({
      contactId: c.contactId,
      name: c.fullName,
      company: "Northstar Revenue",
      buyerRole: "Decision Maker",
      role: c.title,
    }));
  }
}

interface ContactSelectorPanelProps {
  selectedContactId: string;
  onSelect: (contact: MessageContactSummary) => void;
}

export default function ContactSelectorPanel({
  selectedContactId,
  onSelect,
}: ContactSelectorPanelProps) {
  const [search, setSearch] = useState("");

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["message-contacts"],
    queryFn: fetchContacts,
  });

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col border-r border-slate-200 bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-accent">
          Contacts
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts…"
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No contacts match.</p>
        ) : (
          <ul className="p-2 space-y-1">
            {filtered.map((contact) => {
              const isSelected = contact.contactId === selectedContactId;
              return (
                <li key={contact.contactId}>
                  <button
                    type="button"
                    onClick={() => onSelect(contact)}
                    className={`w-full rounded-xl px-3 py-3 text-left transition-all hover:bg-white hover:shadow-sm ${isSelected
                        ? "bg-white shadow-sm ring-1 ring-brand-accent/20"
                        : "bg-transparent"
                      }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-accent to-blue-400 text-xs font-bold text-white">
                        {contact.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`truncate text-sm font-semibold ${isSelected ? "text-brand-primary" : "text-slate-900"
                            }`}
                        >
                          {contact.name}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {contact.role} · {contact.company}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${contact.buyerRole === "Decision Maker"
                          ? "bg-blue-100 text-blue-700"
                          : contact.buyerRole === "Champion"
                            ? "bg-green-100 text-green-700"
                            : contact.buyerRole === "Blocker"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                    >
                      {contact.buyerRole}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
