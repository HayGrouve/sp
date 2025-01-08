import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Prediction } from "@/types/football-scores";

interface PredictionModalProps {
  isOpen: boolean;
  onClose: () => void;
  fixtureId: number;
}

export function PredictionModal({
  isOpen,
  onClose,
  fixtureId,
}: PredictionModalProps) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError(null);
      fetch(`/api/prediction?fixtureId=${fixtureId}`)
        .then((response) => response.json())
        .then((data: Prediction) => {
          setPrediction(data);
          setIsLoading(false);
        })
        .catch((err) => {
          setError("Failed to fetch prediction");
          setIsLoading(false);
        });
    }
  }, [isOpen, fixtureId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Match Prediction</DialogTitle>
          <DialogDescription>
            Prediction details for the selected fixture
          </DialogDescription>
        </DialogHeader>
        {isLoading && <p>Loading prediction...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {prediction && (
          <div className="mt-4">
            <p>
              <strong>{prediction.home}</strong> vs{" "}
              <strong>{prediction.away}</strong>
            </p>
            <p>Prediction: {prediction.prediction}</p>
            <p>Win Probability:</p>
            <ul>
              <li>Home: {prediction.winPercentHome}</li>
              <li>Draw: {prediction.winPercentDraw}</li>
              <li>Away: {prediction.winPercentAway}</li>
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
