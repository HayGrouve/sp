// src/hooks/use-football-scores.ts
import { useQuery } from "@tanstack/react-query";
import type { FootballScore } from "@/types/football-scores";

async function fetchFootballScores(
  leagueIds?: number[],
): Promise<FootballScore[]> {
  const params = new URLSearchParams();
  if (leagueIds && leagueIds.length > 0) {
    params.append("leagueIds", leagueIds.join(","));
  }

  const response = await fetch(`/api/football-scores?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to fetch scores");
  }
  return response.json() as Promise<FootballScore[]>;
}

export function useFootballScores(leagueIds?: number[]) {
  return useQuery({
    queryKey: ["footballScores", leagueIds],
    queryFn: () => fetchFootballScores(leagueIds),
    refetchInterval: 60000, // Refetch every minute
  });
}
