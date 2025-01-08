import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Statistics } from "@/types/football-scores";

interface StatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fixtureId: number;
}

export function StatisticsModal({
  isOpen,
  onClose,
  fixtureId,
}: StatisticsModalProps) {
  const [statistics, setStatistics] = useState<Statistics[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && fixtureId) {
      setIsLoading(true);
      setError(null);
      fetch(`/api/statistics?fixtureId=${fixtureId}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch statistics");
          }
          return response.json();
        })
        .then((data) => {
          setStatistics(Array.isArray(data) ? data : null);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching statistics:", err);
          setError("Failed to fetch statistics");
          setIsLoading(false);
        });
    }
  }, [isOpen, fixtureId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Match Statistics</DialogTitle>
        </DialogHeader>
        {isLoading && <p>Loading statistics...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {statistics && statistics.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            {statistics.map((team, index) => (
              <div key={index} className="col-span-1">
                <h3 className="text-center font-bold">{team.team.name}</h3>
                {team.statistics.map((stat, statIndex) => (
                  <p key={statIndex} className="text-sm">
                    {stat.type}: {stat.value ?? "N/A"}
                  </p>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p>No statistics available</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
