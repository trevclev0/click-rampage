import { describe, expect, it } from "vitest";
import { MAX_ERROR_TEXT_LENGTH, sanitizeErrorText } from "./sanitizeError";

describe("sanitizeErrorText", () => {
  it("redacts secret key=value pairs", () => {
    expect(
      sanitizeErrorText(
        "login failed: password=hunter2&token=abc123; Authorization=Bearer xyz",
      ),
    ).toBe(
      "login failed: password=[REDACTED]&token=[REDACTED]; Authorization=[REDACTED]",
    );
  });

  it("redacts secret header values", () => {
    expect(sanitizeErrorText("fetch failed: x-api-key: secret-key-123")).toBe(
      "fetch failed: x-api-key=[REDACTED]",
    );
  });

  it("redacts quoted JSON secret values", () => {
    const out = sanitizeErrorText('{"password":"hunter2","token":"abc123"}');
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("abc123");
    expect(sanitizeErrorText('{"password":"hunter2"}')).toBe(
      '{"password=[REDACTED]}',
    );
  });

  it("redacts quoted authorization fields", () => {
    const out = sanitizeErrorText('{"authorization":"Bearer hunter2"}');
    expect(out).not.toContain("hunter2");
    expect(out).toContain("[REDACTED]");
  });

  it("coerces non-string input without throwing", () => {
    expect(sanitizeErrorText({ detail: "boom" })).toBe("[object Object]");
    expect(sanitizeErrorText(null)).toBe("");
    expect(sanitizeErrorText(undefined)).toBe("");
  });

  it("redacts query-string values in URLs", () => {
    expect(
      sanitizeErrorText(
        "request failed: https://api.example.com/search?q=riddle&code=abc123",
      ),
    ).toBe(
      "request failed: https://api.example.com/search?q=[REDACTED]&code=[REDACTED]",
    );
  });

  it("truncates to the max length by default", () => {
    expect(
      sanitizeErrorText("x".repeat(MAX_ERROR_TEXT_LENGTH + 100)),
    ).toHaveLength(MAX_ERROR_TEXT_LENGTH);
  });

  it("supports a custom max length", () => {
    expect(sanitizeErrorText("abcdef", 3)).toBe("abc");
  });

  it("passes through empty input", () => {
    expect(sanitizeErrorText("")).toBe("");
  });

  it("leaves ordinary error text untouched", () => {
    expect(sanitizeErrorText("D1 connection failed")).toBe(
      "D1 connection failed",
    );
  });
});
