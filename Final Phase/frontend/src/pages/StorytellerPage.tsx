import { useMemo, useState } from "react";
import { useContactMessagesQuery } from "../api/api";
import ContactSelectorPanel from "../components/ContactSelectorPanel";
import { EmptyState, LoadingSpinner, MessageCard } from "../components/ui";
import type { ContactMessagesResponse, MessageContactSummary } from "../types/api.types";

type ChannelTab = "linkedin_dm" | "email" | "whatsapp" | "reddit";

const channelLabels: Record<ChannelTab, string> = {
  linkedin_dm: "LinkedIn",
  email: "Email",
  whatsapp: "WhatsApp",
  reddit: "Reddit"
};

const buyerRoleClasses: Record<string, string> = {
  "Decision Maker": "border-blue-200 bg-blue-50 text-blue-700",
  Champion: "border-green-200 bg-green-50 text-green-700",
  Blocker: "border-red-200 bg-red-50 text-red-700",
  Influencer: "border-yellow-200 bg-yellow-50 text-yellow-800"
};

function getWordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function highlightPersonalization(text: string, contact: MessageContactSummary) {
  const tokens = [contact.name, contact.company, contact.role];
  let result = text;

  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(escaped, "g"),
      `@@HIGHLIGHT_START@@${token}@@HIGHLIGHT_END@@`
    );
  }

  return result.split(/(@@HIGHLIGHT_START@@|@@HIGHLIGHT_END@@)/).reduce<React.ReactNode[]>((parts, part, index, array) => {
    if (part === "@@HIGHLIGHT_START@@" || part === "@@HIGHLIGHT_END@@") {
      return parts;
    }

    const isHighlighted = array[index - 1] === "@@HIGHLIGHT_START@@" && array[index + 1] === "@@HIGHLIGHT_END@@";
    parts.push(
      isHighlighted ? (
        <mark key={`${part}-${index}`} className="rounded bg-amber-200 px-1 text-slate-900">
          {part}
        </mark>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      )
    );
    return parts;
  }, []);
}

export function StorytellerPage() {
  const [selectedContact, setSelectedContact] = useState<MessageContactSummary>({
    contactId: "con_1",
    name: "Asha Rao",
    company: "Northstar Revenue",
    buyerRole: "Decision Maker",
    role: "Founder & CEO"
  });
  const [activeChannel, setActiveChannel] = useState<ChannelTab>("linkedin_dm");

  const { data, isLoading, isError, refetch, isFetching } = useContactMessagesQuery(selectedContact.contactId, {
    select: (response: ContactMessagesResponse) => response
  });

  const messagesByChannel = useMemo(() => {
    const groups: Record<ChannelTab, ContactMessagesResponse["messages"]> = {
      linkedin_dm: [],
      email: [],
      whatsapp: [],
      reddit: []
    };

    for (const message of data?.messages ?? []) {
      if (message.channel in groups) {
        groups[message.channel as ChannelTab].push(message);
      }
    }

    for (const key of Object.keys(groups) as ChannelTab[]) {
      groups[key].sort((left, right) => (left.dayNumber ?? 0) - (right.dayNumber ?? 0));
    }

    return groups;
  }, [data?.messages]);

  const currentMessages = messagesByChannel[activeChannel];

  return (
    <section className="min-h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-h-[calc(100vh-8rem)] min-w-0 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <ContactSelectorPanel selectedContactId={selectedContact.contactId} onSelect={setSelectedContact} />

        <div className="flex min-h-0 min-w-0 flex-col bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
          <div className="border-b border-slate-200 px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold text-slate-900 sm:text-2xl">{selectedContact.name}</h3>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      buyerRoleClasses[selectedContact.buyerRole] ?? "border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                  >
                    {selectedContact.buyerRole}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {selectedContact.role} at {selectedContact.company}
                </p>
              </div>

              {isFetching ? <LoadingSpinner size="sm" label="Refreshing messages" /> : null}
            </div>

            <div className="mt-5 overflow-x-auto pb-1">
              <div className="inline-flex min-w-full rounded-2xl border border-slate-200 bg-slate-100/80 p-1 sm:min-w-0">
                {(Object.keys(channelLabels) as ChannelTab[]).map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => setActiveChannel(channel)}
                    className={`relative flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                      activeChannel === channel
                        ? "bg-white text-brand-primary shadow-sm ring-1 ring-brand-accent/10"
                        : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                    }`}
                  >
                    <span>{channelLabels[channel]}</span>
                    {messagesByChannel[channel].length > 0 ? (
                      <span
                        className={`ml-2 inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] ${
                          activeChannel === channel ? "bg-brand-light text-brand-primary" : "bg-white text-slate-500"
                        }`}
                      >
                        {messagesByChannel[channel].length}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-6 sm:py-6">
            {isLoading ? (
              <div className="flex h-full min-h-[24rem] items-center justify-center rounded-2xl bg-slate-50">
                <LoadingSpinner size="lg" label="Loading storyteller messages" />
              </div>
            ) : isError ? (
              <EmptyState
                icon="!"
                heading="Unable to load messages"
                subtext="The storyteller feed did not load for this contact. Try again in a moment."
                action={{ label: "Retry", onClick: () => void refetch() }}
              />
            ) : currentMessages.length === 0 ? (
              <EmptyState
                icon="[]"
                heading="No messages for this channel"
                subtext="Switch channels or generate a new sequence for this contact."
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/80">
                <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{channelLabels[activeChannel]} Sequence</p>
                      <p className="text-xs text-slate-500">
                        {currentMessages.length} message{currentMessages.length === 1 ? "" : "s"} for {selectedContact.name}
                      </p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
                      Ordered by day
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
                  <div className="space-y-4 transition-all duration-300 ease-out">
                    {currentMessages.map((message, index) => (
                      <MessageCard
                        key={`${activeChannel}-${message.dayNumber ?? index}`}
                        channel={activeChannel}
                        day={message.dayNumber ?? 1}
                        wordCount={getWordCount(message.body)}
                        subject={message.subject ? highlightPersonalization(message.subject, selectedContact) : undefined}
                        messageText={
                          <>
                            {highlightPersonalization(message.body, selectedContact)}
                            {message.cta ? <span className="mt-4 block font-medium text-brand-primary">{highlightPersonalization(message.cta, selectedContact)}</span> : null}
                          </>
                        }
                        copyText={[message.subject, message.body, message.cta].filter(Boolean).join("\n\n")}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
