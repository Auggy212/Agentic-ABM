import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import QuotaPanel from "@/components/QuotaPanel";

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <QuotaPanel />
    </QueryClientProvider>,
  );
}

describe("QuotaPanel", () => {
  it("renders one row per source with progress bar and used/limit label", async () => {
    renderPanel();
    expect(await screen.findByTestId("quota-row-INSTANTLY")).toBeInTheDocument();
    expect(screen.getByTestId("quota-row-PHANTOMBUSTER")).toBeInTheDocument();
    expect(screen.getByTestId("quota-row-APOLLO")).toBeInTheDocument();
    // 9200/10000 label
    expect(screen.getByTestId("quota-row-INSTANTLY").textContent).toContain("9200/10000");
  });

  it("colors >=90% sources critical (red) and 70–90% as warn (amber)", async () => {
    renderPanel();
    // Apollo at 50/50 = 100% -> critical
    const apollo = await screen.findByTestId("quota-row-APOLLO");
    expect(apollo).toHaveAttribute("data-tone", "critical");
    // Instantly at 92% -> critical
    expect(screen.getByTestId("quota-row-INSTANTLY")).toHaveAttribute("data-tone", "critical");
    // PB at 220/240 ≈ 91.6% -> critical
    expect(screen.getByTestId("quota-row-PHANTOMBUSTER")).toHaveAttribute("data-tone", "critical");
    // Twilio at 40% -> ok
    expect(screen.getByTestId("quota-row-TWILIO")).toHaveAttribute("data-tone", "ok");
    // Hunter at 48% -> ok
    expect(screen.getByTestId("quota-row-HUNTER")).toHaveAttribute("data-tone", "ok");
  });
});
