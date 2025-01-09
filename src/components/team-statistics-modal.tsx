import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type TeamStatistics } from "@/types/football-scores";

interface TeamStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: number;
  leagueId: number;
}

export function TeamStatisticsModal({
  isOpen,
  onClose,
  teamId,
  leagueId,
}: TeamStatisticsModalProps) {
  const [statistics, setStatistics] = useState<TeamStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(
    new Date().getFullYear() - 1,
  );

  const seasons = Array.from(
    { length: 5 },
    (_, i) => new Date().getFullYear() - i,
  );

  const isStatisticsEmpty = (stats: TeamStatistics | null): boolean => {
    if (!stats) return true;
    return (
      stats.fixtures.played.total === 0 &&
      stats.fixtures.wins.total === 0 &&
      stats.fixtures.draws.total === 0 &&
      stats.fixtures.loses.total === 0 &&
      stats.goals.for.total.total === 0 &&
      stats.goals.against.total.total === 0
    );
  };

  const fetchStatistics = async (season: number) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/team-statistics?teamId=${teamId}&leagueId=${leagueId}&season=${season}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch team statistics");
      }
      const data = await response.json();
      setStatistics(data);
    } catch (err) {
      console.error("Error fetching team statistics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && teamId && leagueId) {
      fetchStatistics(selectedSeason);
    }
  }, [isOpen, teamId, leagueId, selectedSeason]);

  const handleSeasonChange = (value: string) => {
    setSelectedSeason(Number(value));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Team Statistics</DialogTitle>
        </DialogHeader>
        <div className="mb-4">
          <Select
            onValueChange={handleSeasonChange}
            defaultValue={selectedSeason.toString()}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((season) => (
                <SelectItem key={season} value={season.toString()}>
                  {season}/{season + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLoading && <p>Loading team statistics...</p>}
        {statistics && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">{statistics.team.name}</h2>
            <img
              src={statistics.team.logo}
              alt={`${statistics.team.name} logo`}
              className="h-16 w-16"
            />
            {isStatisticsEmpty(statistics) ? (
              <p className="text-lg text-yellow-600">
                Statistics are not available for this team in the selected
                season.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-lg font-semibold">Form</h3>
                  <p>{statistics.form || "N/A"}</p>
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
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
