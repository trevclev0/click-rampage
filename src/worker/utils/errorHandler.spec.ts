// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatErrorResponse, logError } from "./errorHandler";

const parseLog = (spy: ReturnType<typeof vi.spyOn>) =>
  JSON.parse(String(spy.mock.calls[0][0]));

describe("errorHandler", () => {
  describe("logError", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("logs a structured JSON line with request details", () => {
      logError(new Error("Test error"), "GET", "/test-path", "req-123");

      const log = parseLog(consoleErrorSpy);
      expect(log).toMatchObject({
        level: "error",
        method: "GET",
        path: "/test-path",
        requestId: "req-123",
        message: "Test error",
      });
      expect(log.ts).toEqual(expect.any(String));
      expect(log.cause).toBeUndefined();
    });

    it("logs the underlying cause when present", () => {
      const error = new Error("Main error", {
        cause: new Error("Upstream failed"),
      });
      logError(error, "POST", "/api/data");

      expect(parseLog(consoleErrorSpy).cause).toBe("Upstream failed");
    });

    it("redacts secrets from the message", () => {
      logError(new Error("failed: token=abc123"), "GET", "/x");

      expect(parseLog(consoleErrorSpy).message).toBe(
        "failed: token=[REDACTED]",
      );
    });
  });

  describe("formatErrorResponse", () => {
    it("returns a generic body with no error details", () => {
      expect(formatErrorResponse()).toEqual({
        status: "error",
        message: "Server Error",
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });
});
