import type { CopilotContextResponse } from "@/types/copilot";
import { listMockAccounts } from "./accounts";
import { mockSequences } from "./sequences";

export function mockCopilotContext(): CopilotContextResponse {
  const accounts = listMockAccounts(new URLSearchParams());
  const accountCount = accounts.total;
  const sequenceCount = mockSequences.sequences.filter((s) => s.status === "active").length;
  const tier1Count = accounts.meta?.tier_breakdown.tier_1 ?? 0;

  return {
    greeting: `I have context on your ICP, ${accountCount} accounts in review, and ${sequenceCount} active sequences. What would you like to do?`,
    chips: [
      `Build a sequence for Tier 1 (${tier1Count} accounts)`,
      "Why did the top account score so high?",
      "Find lookalikes of my best accounts",
      "Pause low-performing sequences",
    ],
    initial_cards: [
      {
        title: "ICP Scout run complete",
        body: `${tier1Count} Tier-1 accounts surfaced. Shall I enrich the buying committees and add them to your review list?`,
        actions: [`Enrich all ${tier1Count}`, "Show me first"],
      },
    ],
    account_count: accountCount,
    sequence_count: sequenceCount,
    agent_run_label: `run #${Math.floor(accountCount / 2)}`,
  };
}
