import { server } from "@test-utils/msw/server";
import { createQueryWrapper } from "@test-utils/queryTestUtils";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { HealthStatus } from "./HealthStatus";

const renderHealthStatus = () => {
  const { wrapper } = createQueryWrapper();
  return render(<HealthStatus />, { wrapper });
};

describe("HealthStatus", () => {
  it("shows a pending state, then the environment", async () => {
    renderHealthStatus();

    expect(screen.getByRole("status")).toHaveTextContent("Checking API…");
    expect(await screen.findByText("test")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("API ok");
  });

  it("shows an alert when the API fails", async () => {
    server.use(
      http.get("/api/health", () => new HttpResponse(null, { status: 500 })),
    );
    renderHealthStatus();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "API unreachable",
    );
  });
});
