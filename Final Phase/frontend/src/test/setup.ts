import "@testing-library/jest-dom";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { resetMockAccountsState } from "../mocks/accounts";
import { resetMockSalesHandoffs } from "../mocks/salesHandoff";
import { resetMockCP4 } from "../mocks/cp4";
import { resetMockCampaign } from "../mocks/campaign";
import { resetMockVerificationState } from "../mocks/verification";
import { server } from "../mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeAll(() => {
  window.scrollTo = vi.fn();
});
afterEach(() => {
  server.resetHandlers();
  resetMockAccountsState();
  resetMockSalesHandoffs();
  resetMockCP4();
  resetMockCampaign();
  resetMockVerificationState();
});
afterAll(() => server.close());
