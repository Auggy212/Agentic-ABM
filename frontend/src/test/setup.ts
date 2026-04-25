import "@testing-library/jest-dom";
import { afterAll, afterEach, beforeAll } from "vitest";
import { resetMockAccountsState } from "../mocks/accounts";
import { server } from "../mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockAccountsState();
});
afterAll(() => server.close());
