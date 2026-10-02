import { fetchHealth } from "@api/health";
import { useQuery } from "@tanstack/react-query";

export const healthQueryKey = ["health"] as const;

export function useHealthQuery() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: fetchHealth,
    // Health is a live signal — always refetch on mount.
    staleTime: 0,
  });
}
