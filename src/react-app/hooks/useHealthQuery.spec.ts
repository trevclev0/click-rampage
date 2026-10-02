import { server } from "@test-utils/msw/server";
import { createQueryWrapper } from "@test-utils/queryTestUtils";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { useHealthQuery } from "./useHealthQuery";

describe("useHealthQuery", () => {
  it("returns the health payload", async () => {
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useHealthQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      status: "ok",
      environment: "test",
    });
  });

  it("surfaces a non-2xx response as an error", async () => {
    server.use(
      http.get("/api/health", () => new HttpResponse(null, { status: 503 })),
    );
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useHealthQuery(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      "Health check failed with status 503",
    );
  });
});
