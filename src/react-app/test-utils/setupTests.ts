import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { MockWebSocket } from "./mockWebSocket";
import { server } from "./msw/server";

// Every request must hit an MSW handler — an unmocked request fails the test
// instead of reaching the network.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// No test opens a real socket. Re-stubbed per test because unstubGlobals
// restores the real WebSocket after each one.
beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());
