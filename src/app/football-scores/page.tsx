"use client";

import { useState, useEffect } from "react";
import { FootballScoresTable } from "@/components/football-scores-table";
import type { FootballScore } from "@/types/football-scores";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Array of league IDs
const LEAGUE_IDS = [
  39, 40, 41, 42, 43, 49, 50, 51, 48, 45, 140, 556, 141, 135, 547, 136, 78, 79,
  529, 61, 62, 63, 66, 188, 179, 180, 183, 184, 103, 104, 113, 114, 94, 95, 119,
  120, 88, 245, 244, 98, 99, 292, 253, 219, 144, 207, 197, 203, 172, 71, 72,
  128, 129, 271, 383, 283, 345, 262, 263, 106, 235, 848, 1, 2, 3, 4,
];

export default function FootballScoresPage() {
  const [scores, setScores] = useState<FootballScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const itemsPerPage = 20;

  const fetchScores = async (pageNumber: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/football-scores?leagueIds=${LEAGUE_IDS.join(",")}&page=${pageNumber}&limit=${itemsPerPage}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch scores");
      }
      const data = (await response.json()) as
        | FootballScore[]
        | { error: string };
      if (Array.isArray(data)) {
        if (pageNumber === 1) {
          setScores(data);
        } else {
          setScores((prevScores) => [...prevScores, ...data]);
        }
        setHasMore(data.length === itemsPerPage);
      } else if ("error" in data) {
        throw new Error(data.error);
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (err) {
      setError(
        `An error occurred while fetching the scores: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = () => {
    if (!isLoading && hasMore) {
      setPage((prevPage) => prevPage + 1);
    }
  };

  useEffect(() => {
    void fetchScores(page);
  }, [page]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchScores(1);
    }, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container mx-auto py-10">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Football Scores</h1>
        <Button onClick={() => fetchScores(1)} disabled={isLoading}>
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
        <div className="text-center text-red-500">{error}</div>
      ) : scores.length > 0 ? (
        <>
          <FootballScoresTable initialScores={scores} />
          {hasMore && (
            <div className="mt-4 text-center">
              <Button onClick={loadMore} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center">
          {isLoading ? (
            <Loader2 className="mx-auto h-8 w-8 animate-spin" />
          ) : (
            "No matches scheduled for today in the selected leagues."
          )}
        </div>
      )}
    </div>
  );
}
