import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Lineup } from "@/types/football-scores";

interface LineupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fixtureId: number;
}

export function LineupsModal({
  isOpen,
  onClose,
  fixtureId,
}: LineupsModalProps) {
  const [lineups, setLineups] = useState<Lineup[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && fixtureId) {
      setIsLoading(true);
      setError(null);
      fetch(`/api/lineups?fixtureId=${fixtureId}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch lineups");
          }
          return response.json();
        })
        .then((data) => {
          setLineups(Array.isArray(data) ? data : null);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching lineups:", err);
          setError("Failed to fetch lineups");
          setIsLoading(false);
        });
    }
  }, [isOpen, fixtureId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Match Lineups</DialogTitle>
        </DialogHeader>
        {isLoading && <p>Loading lineups...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {lineups && lineups.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {lineups.map((team, index) => (
              <div key={index} className="col-span-1">
                <h3 className="text-center font-bold">{team.team.name}</h3>
                <p className="text-center">Formation: {team.formation}</p>
                <h4 className="mt-2 font-semibold">Starting XI:</h4>
                <ul>
                  {team.startXI.map((player, playerIndex) => (
                    <li key={playerIndex}>
                      {player.player.number}. {player.player.name} (
                      {player.player.pos})
                    </li>
                  ))}
                </ul>
                <h4 className="mt-2 font-semibold">Substitutes:</h4>
                <ul>
                  {team.substitutes.map((player, playerIndex) => (
                    <li key={playerIndex}>
                      {player.player.number}. {player.player.name} (
                      {player.player.pos})
                    </li>
                  ))}
                </ul>
                <p className="mt-2">Coach: {team.coach.name}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No lineups available</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
