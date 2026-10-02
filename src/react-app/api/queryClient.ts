import { QueryClient } from "@tanstack/react-query";

// App-wide defaults. Override `staleTime` per query based on how fresh that
// data needs to be — don't rely on this default everywhere.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});
