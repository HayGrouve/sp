// src/app/football-scores/page.tsx
"use client";

import { FootballScoresTable } from "@/components/football-scores-table";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useFootballScores } from "@/hooks/use-football-scores";

// Array of league IDs
const LEAGUE_IDS = [
  39, 40, 41, 42, 43, 49, 50, 51, 48, 45, 140, 556, 141, 135, 547, 136, 78, 79,
  529, 61, 62, 63, 66, 188, 179, 180, 183, 184, 103, 104, 113, 114, 94, 95, 119,
  120, 88, 245, 244, 98, 99, 292, 253, 219, 144, 207, 197, 203, 172, 71, 72,
  128, 129, 271, 383, 283, 345, 262, 263, 106, 235, 848, 1, 2, 3, 4,
];

export default function FootballScoresPage() {
  const {
    data: scores,
    isLoading,
    error,
    refetch,
  } = useFootballScores(LEAGUE_IDS);

  return (
    <div className="container mx-auto py-10">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Football Scores</h1>
        <Button onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Refreshing...
            </>
          ) : (
            "Refresh Scores"
          )}
        </Button>
      </div>
      {error ? (
        <div className="text-center text-red-500">
          {error instanceof Error ? error.message : "An error occurred"}
        </div>
      ) : (
        <FootballScoresTable initialScores={scores ?? []} />
      )}
    </div>
  );
}
