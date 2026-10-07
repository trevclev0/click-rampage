import { AppShell } from "@components/AppShell";
import { RoomProvider } from "@components/RoomProvider";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <RoomProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </RoomProvider>
  );
}
