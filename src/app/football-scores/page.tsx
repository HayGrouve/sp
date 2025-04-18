// src/app/football-scores/page.tsx
"use client";

import { FootballScoresTable } from "@/components/football-scores-table";
import { useFootballScores } from "@/hooks/use-football-scores";
import { LEAGUE_IDS } from "@/utils/leagueIds";

export default function FootballScoresPage() {
  const { data: scores, isLoading, error } = useFootballScores(LEAGUE_IDS);

  // Convert error object to string message if necessary
  const errorMessage = error
    ? error instanceof Error
      ? error.message
      : String(error)
    : null;

  return (
    <>
      <FootballScoresTable
        initialScores={scores ?? []}
        isLoading={isLoading}
        error={errorMessage}
      />
    </>
  );
}
