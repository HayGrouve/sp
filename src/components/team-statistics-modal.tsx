import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TeamStatistics } from "@/types/football-scores";

interface TeamStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: number;
  leagueId: number;
  season: number;
}

export function TeamStatisticsModal({
  isOpen,
  onClose,
  teamId,
  leagueId,
  season,
}: TeamStatisticsModalProps) {
  const [statistics, setStatistics] = useState<TeamStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && teamId && leagueId && season) {
      setIsLoading(true);
      setError(null);
      fetch(
        `/api/team-statistics?teamId=${teamId}&leagueId=${leagueId}&season=${season}`,
      )
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch team statistics");
          }
          return response.json();
        })
        .then((data) => {
          setStatistics(data as TeamStatistics);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching team statistics:", err);
          setError("Failed to fetch team statistics");
          setIsLoading(false);
        });
    }
  }, [isOpen, teamId, leagueId, season]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Team Statistics</DialogTitle>
        </DialogHeader>
        {isLoading && <p>Loading team statistics...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {statistics && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">{statistics.team.name}</h2>
            <img
              src={statistics.team.logo}
              alt={`${statistics.team.name} logo`}
              className="h-16 w-16"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-lg font-semibold">Form</h3>
                <p>{statistics.form}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Fixtures</h3>
                <p>Played: {statistics.fixtures.played.total}</p>
                <p>Wins: {statistics.fixtures.wins.total}</p>
                <p>Draws: {statistics.fixtures.draws.total}</p>
                <p>Losses: {statistics.fixtures.loses.total}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Goals For</h3>
                <p>Total: {statistics.goals.for.total.total}</p>
                <p>Average: {statistics.goals.for.average.total}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Goals Against</h3>
                <p>Total: {statistics.goals.against.total.total}</p>
                <p>Average: {statistics.goals.against.average.total}</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
