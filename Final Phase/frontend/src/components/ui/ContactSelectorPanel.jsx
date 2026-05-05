import { useMessageContactsQuery } from "../api/api";

const buyerRoleClasses = {
  "Decision Maker": "border-blue-200 bg-blue-50 text-blue-700",
  Champion: "border-green-200 bg-green-50 text-green-700",
  Blocker: "border-red-200 bg-red-50 text-red-700",
  Influencer: "border-yellow-200 bg-yellow-50 text-yellow-800"
};

export default function ContactSelectorPanel({ selectedContactId, onSelect }) {
  const { data: contacts = [], isLoading, isError, refetch } = useMessageContactsQuery();

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-b border-slate-200 bg-slate-50/80 lg:border-b-0 lg:border-r">
      <div className="border-b border-slate-200 px-5 py-5 backdrop-blur-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-accent">Storyteller Dashboard</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">Messaging by contact</h2>
        <p className="mt-2 text-sm text-slate-600">Pick a contact to load their message sequence and review channel-by-channel outreach.</p>
      </div>

      <div className="min-h-0 max-h-[22rem] flex-1 overflow-y-auto p-3 lg:max-h-none">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">Unable to load contacts</p>
            <button type="button" onClick={() => void refetch()} className="mt-3 rounded-md bg-white px-3 py-2 font-medium text-red-700">
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => (
              <button
                key={contact.contactId}
                type="button"
                onClick={() => onSelect(contact)}
                className={`w-full rounded-xl border px-4 py-4 text-left transition-all duration-200 ${
                  contact.contactId === selectedContactId
                    ? "border-brand-accent bg-white shadow-sm ring-1 ring-brand-accent/10"
                    : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{contact.name}</p>
                    <p className="mt-1 truncate text-sm text-slate-600">{contact.company}</p>
                    <p className="mt-2 text-xs text-slate-500">{contact.role}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      buyerRoleClasses[contact.buyerRole] ?? "border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                  >
                    {contact.buyerRole}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
