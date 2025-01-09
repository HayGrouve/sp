import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type Event } from "@/types/football-scores";

interface EventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fixtureId: number;
}

export function EventsModal({ isOpen, onClose, fixtureId }: EventsModalProps) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && fixtureId) {
      setIsLoading(true);
      setError(null);
      fetch(`/api/events?fixtureId=${fixtureId}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch events");
          }
          return response.json();
        })
        .then((data) => {
          setEvents(Array.isArray(data) ? data : null);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching events:", err);
          setError("Failed to fetch events");
          setIsLoading(false);
        });
    }
  }, [isOpen, fixtureId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[80vh] flex-col">
        <DialogHeader>
          <DialogTitle>Match Events</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-grow">
          {isLoading && <p>Loading events...</p>}
          {error && <p className="text-red-500">{error}</p>}
          {events && events.length > 0 ? (
            <div className="space-y-4 pr-4">
              {events.map((event, index) => (
                <div key={index} className="border-b pb-2">
                  <p className="font-semibold">
                    {event.time.elapsed}&apos;
                    {event.time.extra && `+${event.time.extra}`} -
                    {event.team.name}
                  </p>
                  <p>
                    {event.type}: {event.detail}
                  </p>
                  <p>Player: {event.player.name}</p>
                  {event.assist.name && <p>Assist: {event.assist.name}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p>No events available</p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
