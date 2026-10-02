import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { routeTree } from "../routeTree.gen";
import { createTestQueryClient } from "./queryTestUtils";

export function createTestRouter(initialUrl = "/") {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    context: {
      queryClient: createTestQueryClient(),
    },
  });
}

export function renderWithRouter(router: ReturnType<typeof createTestRouter>) {
  return render(
    <QueryClientProvider client={router.options.context.queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
