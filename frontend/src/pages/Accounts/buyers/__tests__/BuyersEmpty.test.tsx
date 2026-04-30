import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import BuyersEmpty from "../BuyersEmpty";

vi.mock("../hooks", () => ({
  useDiscoverBuyers: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
  }),
}));

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("BuyersEmpty", () => {
  it("shows the domain name", () => {
    wrapper(<BuyersEmpty domain="acme.example.com" />);
    expect(screen.getByText("acme.example.com")).toBeInTheDocument();
  });

  it("shows the run button", () => {
    wrapper(<BuyersEmpty domain="acme.example.com" />);
    expect(screen.getByText(/Run Buyer Intel/i)).toBeInTheDocument();
  });

  it("shows explanatory copy about the empty state", () => {
    wrapper(<BuyersEmpty domain="acme.example.com" />);
    expect(screen.getByText(/No buying committee found yet/i)).toBeInTheDocument();
    expect(screen.getByText(/hasn't run for/i)).toBeInTheDocument();
  });
});
