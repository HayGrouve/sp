// src/components/football-scores-table.tsx
"use client";

import React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FootballScore } from "@/types/football-scores"; // Assuming this path is correct
import { PredictionModal } from "./prediction-modal";
import { StatisticsModal } from "./statistics-modal";
import { LineupsModal } from "./lineups-modal";
import { EventsModal } from "./events-modal";
import { TeamStatisticsModal } from "./team-statistics-modal";
import {
  MoreHorizontal,
  LineChart,
  BarChart,
  Users,
  Calendar,
  Info,
  Loader2, // For loading state
} from "lucide-react";
import Image from "next/image";
import { rowForecastMap } from "@/utils/rowForecastMap"; // Ensure path is correct
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns-tz"; // Use date-fns-tz for formatting

interface FootballScoresTableProps {
  initialScores: FootballScore[]; // Scores for the current section, passed from page
  isLoading: boolean; // Pass loading state from the page/hook
  error: string | null; // Pass error state from the page/hook
}

// Type for the fetched forecast history data
type FetchedForecastHistory = Record<
  number, // rowNumber
  { isCorrect: boolean | null; weekSectionId: string }[]
>;

// Component to display history dots
const ForecastHistoryDots: React.FC<{
  history: { isCorrect: boolean | null; weekSectionId: string }[];
}> = ({ history }) => {
  // Ensure we only show dots for entries with a non-null isCorrect status
  const validHistory = history.filter((h) => h.isCorrect !== null);

  return (
    <div className="flex space-x-1">
      {validHistory.slice(0, 3).map(
        (
          item,
          index, // Show up to 3 dots
        ) => (
          <TooltipProvider key={`${item.weekSectionId}-${index}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`h-2 w-2 rounded-full ${
                    item.isCorrect ? "bg-green-500" : "bg-red-500"
                  }`}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>Section: {item.weekSectionId}</p>
                <p>Result: {item.isCorrect ? "Correct" : "Incorrect"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ),
      )}
      {Array.from({ length: Math.max(0, 3 - validHistory.length) }).map(
        (_, index) => (
          <div
            key={`placeholder-${index}`}
            className="h-2 w-2 rounded-full bg-gray-300"
            title="No data"
          />
        ),
      )}
    </div>
  );
};

export function FootballScoresTable({
  initialScores,
  isLoading,
  error: pageError, // Rename prop to avoid conflict with local error state
}: FootballScoresTableProps) {
  // State for the scores displayed (initially from props)
  const [scores, setScores] = useState<FootballScore[]>(initialScores);
  // State for modals
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(
    null,
  );
  const [modalType, setModalType] = useState<
    "prediction" | "statistics" | "lineups" | "events" | null
  >(null);
  const [selectedTeam, setSelectedTeam] = useState<{
    id: number;
    name: string;
    leagueId: number;
  } | null>(null);
  // State for local errors (e.g., history fetch error)
  const [localError, setLocalError] = useState<string | null>(null);
  // State for forecast counts (calculated from current scores)
  const [correctForecasts, setCorrectForecasts] = useState(0);
  const [incorrectForecasts, setIncorrectForecasts] = useState(0);
  // State for fetched forecast history
  const [forecastHistory, setForecastHistory] =
    useState<FetchedForecastHistory>({});
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  const SOFIA_TIMEZONE = "Europe/Sofia";

  // Format time using date-fns-tz
  const formatDisplayTime = (isoString: string): string => {
    try {
      const date = new Date(isoString); // Parse ISO string
      return format(date, "HH:mm", { timeZone: SOFIA_TIMEZONE });
    } catch (e) {
      console.error("Error formatting time:", e);
      return "Invalid Date";
    }
  };

  // Get score display string
  const getScoreDisplay = (
    scoreData: FootballScore["score"],
    status: FootballScore["status"],
  ): string => {
    if (status.short === "NS") return "-"; // Not Started
    if (status.short === "PST") return "PST"; // Postponed
    if (status.short === "CANC") return "CANC"; // Cancelled
    if (status.short === "ABD") return "ABD"; // Abandoned
    if (status.short === "TBD") return "TBD"; // To Be Defined

    const homeScore = scoreData.home ?? "-";
    const awayScore = scoreData.away ?? "-";

    if (status.short === "FT") {
      return `${homeScore} - ${awayScore}`;
    }
    // Live statuses
    if (
      status.short === "1H" ||
      status.short === "HT" || // Halftime
      status.short === "2H" ||
      status.short === "ET" || // Extra Time
      status.short === "P" || // Penalty Shootout
      status.short === "BT" // Break Time (Extra Time)
    ) {
      const elapsed = status.elapsed ? ` ${status.elapsed}'` : "";
      return `${homeScore} - ${awayScore} (${status.short}${elapsed})`;
    }
    // Default fallback
    return `${homeScore} - ${awayScore}`;
  };

  // Get forecast based on row number (NO MODULO)
  const getForecast = useCallback((rowNumber: number): string | null => {
    const forecastItem = rowForecastMap.find(
      (item) => item.rowNumber === rowNumber,
    );
    return forecastItem ? forecastItem.forecast : null;
  }, []);

  // Check if forecast is correct (for styling finished matches)
  const isForecastCorrect = useCallback(
    (
      scoreData: FootballScore["score"],
      forecast: string | null,
    ): boolean | null => {
      // Can only determine correctness if match is finished and forecast exists
      if (
        !forecast ||
        typeof scoreData.home !== "number" ||
        typeof scoreData.away !== "number"
      ) {
        return null; // Undetermined
      }

      const homeWin = scoreData.home > scoreData.away;
      const awayWin = scoreData.home < scoreData.away;
      const draw = scoreData.home === scoreData.away;

      switch (forecast) {
        case "1/X":
          return homeWin || draw;
        case "1/2":
          return homeWin || awayWin;
        case "X/2":
          return draw || awayWin;
        default:
          return false; // Should not happen with valid forecast map
      }
    },
    [],
  );

  // Get style for forecast cell based on correctness (only for finished matches)
  const getForecastCellStyle = (
    scoreData: FootballScore["score"],
    status: FootballScore["status"],
    forecast: string | null,
  ): React.CSSProperties => {
    if (status.short !== "FT" || !forecast) return {}; // Only style finished matches with forecasts

    const correct = isForecastCorrect(scoreData, forecast);
    if (correct === null) return {}; // Undetermined

    return {
      backgroundColor: correct
        ? "rgba(74, 222, 128, 0.2)" // Green-400 with opacity
        : "rgba(248, 113, 113, 0.2)", // Red-400 with opacity
    };
  };

  // Calculate forecast counts for the *currently displayed* finished matches
  const calculateForecastCounts = useCallback(
    (currentScores: FootballScore[]): void => {
      let correct = 0;
      let incorrect = 0;

      currentScores.forEach((score) => {
        if (score.status.short === "FT") {
          const forecast = getForecast(score.rowNumber);
          const correctness = isForecastCorrect(score.score, forecast);
          if (correctness === true) {
            correct++;
          } else if (correctness === false) {
            incorrect++;
          }
        }
      });

      setCorrectForecasts(correct);
      setIncorrectForecasts(incorrect);
    },
    [getForecast, isForecastCorrect],
  );

  // Calculate win rate based on state
  const calculateWinRate = (): number => {
    const total = correctForecasts + incorrectForecasts;
    if (total === 0) return 0;
    return (correctForecasts / total) * 100;
  };

  // --- Effects ---

  // Update scores and recalculate counts when initialScores prop changes
  useEffect(() => {
    // No need to sort here if backend already sorts
    setScores(initialScores);
    calculateForecastCounts(initialScores);
  }, [initialScores, calculateForecastCounts]);

  // Fetch forecast history on component mount
  useEffect(() => {
    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      setLocalError(null);
      try {
        const response = await fetch("/api/forecast-history"); // Call the new API route
        if (!response.ok) {
          throw new Error(
            `Failed to fetch forecast history: ${response.statusText}`,
          );
        }
        const data = (await response.json()) as FetchedForecastHistory;
        setForecastHistory(data);
      } catch (error) {
        console.error("Error fetching forecast history:", error);
        setLocalError(
          error instanceof Error
            ? error.message
            : "Unknown error fetching history",
        );
      } finally {
        setIsHistoryLoading(false);
      }
    };

    void fetchHistory();
    // No dependency array needed if it should only run once on mount
  }, []);

  // --- Event Handlers ---
  const handleOptionClick = (
    fixtureId: number,
    type: "prediction" | "statistics" | "lineups" | "events",
  ): void => {
    setSelectedFixtureId(fixtureId);
    setModalType(type);
  };

  const handleTeamClick = (
    teamId: number,
    teamName: string,
    leagueId: number,
  ): void => {
    setSelectedTeam({ id: teamId, name: teamName, leagueId });
  };

  // --- Render Logic ---
  const displayError = pageError ?? localError;

  return (
    <div className="w-full overflow-auto">
      {displayError && (
        <div
          className="relative mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
          role="alert"
        >
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{displayError}</span>
        </div>
      )}
      {isLoading && ( // Show loading indicator based on page loading state
        <div className="flex items-center justify-center py-4">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>Loading scores...</span>
        </div>
      )}
      {!isLoading && !displayError && scores.length === 0 && (
        <div className="py-4 text-center text-muted-foreground">
          No matches found for the current period.
        </div>
      )}
      {!isLoading && scores.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-left">Home</TableHead>
              <TableHead className="text-left">Away</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>1</TableHead>
              <TableHead>X</TableHead>
              <TableHead>2</TableHead>
              <TableHead>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-8 w-full p-0 font-bold"
                    >
                      fcast
                      <Info className="ml-1 h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <h4 className="font-medium leading-none">
                          Current Section Forecasts
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Accuracy for finished matches in this view.
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <div className="grid grid-cols-3 items-center gap-4">
                          <span className="text-sm font-medium">Correct:</span>
                          <span className="col-span-2 text-green-600">
                            {correctForecasts}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 items-center gap-4">
                          <span className="text-sm font-medium">
                            Incorrect:
                          </span>
                          <span className="col-span-2 text-red-600">
                            {incorrectForecasts}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 items-center gap-4">
                          <span className="text-sm font-medium">Win Rate:</span>
                          <span className="col-span-2 font-semibold">
                            {calculateWinRate().toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </TableHead>
              <TableHead>League</TableHead>
              <TableHead>Flag</TableHead>
              <TableHead>
                <MoreHorizontal className="h-4 w-4" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scores.map((score, index) => {
              const forecastValue = getForecast(score.rowNumber);
              const historyForRow = forecastHistory[score.rowNumber] ?? [];
              const isMatchFinished = score.status.short === "FT";
              const isMatchNotStarted = score.status.short === "NS";

              return (
                <React.Fragment key={score.fixtureId}>
                  {(index === 0 || score.day !== scores[index - 1]?.day) && (
                    <TableRow key={`day-${score.day}-${score.fixtureId}`}>
                      <TableCell
                        colSpan={12}
                        className="bg-muted py-2 text-center font-semibold"
                      >
                        {score.day}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell>{score.rowNumber}</TableCell>
                    <TableCell>{formatDisplayTime(score.startTime)}</TableCell>
                    <TableCell className="text-left">
                      <button
                        onClick={() =>
                          handleTeamClick(
                            score.home.id,
                            score.home.name,
                            score.league.id,
                          )
                        }
                        className="flex items-center gap-2 text-left hover:text-blue-600 hover:underline"
                        title={score.home.name}
                      >
                        {score.home.logo ? (
                          <Image
                            src={score.home.logo}
                            alt="" // Decorative
                            width={20}
                            height={20}
                            className="shrink-0"
                          />
                        ) : (
                          <div className="h-5 w-5 shrink-0 rounded-full bg-gray-200" />
                        )}
                        <span className="truncate">{score.home.name}</span>
                      </button>
                    </TableCell>
                    <TableCell className="text-left">
                      <button
                        onClick={() =>
                          handleTeamClick(
                            score.away.id,
                            score.away.name,
                            score.league.id,
                          )
                        }
                        className="flex items-center gap-2 text-left hover:text-blue-600 hover:underline"
                        title={score.away.name}
                      >
                        {score.away.logo ? (
                          <Image
                            src={score.away.logo}
                            alt="" // Decorative
                            width={20}
                            height={20}
                            className="shrink-0"
                          />
                        ) : (
                          <div className="h-5 w-5 shrink-0 rounded-full bg-gray-200" />
                        )}
                        <span className="truncate">{score.away.name}</span>
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">
                      {getScoreDisplay(score.score, score.status)}
                    </TableCell>
                    <TableCell>{score.odds.home ?? "-"}</TableCell>
                    <TableCell>{score.odds.draw ?? "-"}</TableCell>
                    <TableCell>{score.odds.away ?? "-"}</TableCell>
                    <TableCell
                      style={getForecastCellStyle(
                        score.score,
                        score.status,
                        forecastValue,
                      )}
                    >
                      {forecastValue ? ( // Only show popover if there's a forecast
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-full p-0 font-medium"
                              disabled={isHistoryLoading} // Disable while loading history
                            >
                              {forecastValue}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2">
                            {isHistoryLoading ? (
                              <div className="flex items-center text-sm text-muted-foreground">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading history...
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium">
                                  Recent History:
                                </span>
                                <ForecastHistoryDots history={historyForRow} />
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span></span>
                      )}
                    </TableCell>
                    <TableCell
                      className="truncate"
                      title={`${score.league.country} - ${score.league.name}`}
                    >
                      {`${score.league.country} - ${score.league.name}`}
                    </TableCell>
                    <TableCell>
                      {score.league.flag ? (
                        <Image
                          src={score.league.flag}
                          alt={score.league.country}
                          title={score.league.country}
                          width={20}
                          height={15}
                          className="shrink-0"
                        />
                      ) : (
                        <div className="h-4 w-5 shrink-0 rounded-sm bg-gray-200" />
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              handleOptionClick(score.fixtureId, "prediction")
                            }
                          >
                            <LineChart className="mr-2 h-4 w-4" />
                            <span>Prediction Details</span>
                          </DropdownMenuItem>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div // Wrap for TooltipTrigger when disabled
                                  className={
                                    isMatchNotStarted
                                      ? "cursor-not-allowed"
                                      : ""
                                  }
                                >
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleOptionClick(
                                        score.fixtureId,
                                        "statistics",
                                      )
                                    }
                                    disabled={isMatchNotStarted}
                                    className={
                                      isMatchNotStarted ? "opacity-50" : ""
                                    }
                                  >
                                    <BarChart className="mr-2 h-4 w-4" />
                                    <span>Statistics</span>
                                  </DropdownMenuItem>
                                </div>
                              </TooltipTrigger>
                              {isMatchNotStarted && (
                                <TooltipContent>
                                  <p>Available after match starts</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={
                                    isMatchNotStarted
                                      ? "cursor-not-allowed"
                                      : ""
                                  }
                                >
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleOptionClick(
                                        score.fixtureId,
                                        "lineups",
                                      )
                                    }
                                    disabled={isMatchNotStarted}
                                    className={
                                      isMatchNotStarted ? "opacity-50" : ""
                                    }
                                  >
                                    <Users className="mr-2 h-4 w-4" />
                                    <span>Lineups</span>
                                  </DropdownMenuItem>
                                </div>
                              </TooltipTrigger>
                              {isMatchNotStarted && (
                                <TooltipContent>
                                  <p>Available after match starts</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={
                                    isMatchNotStarted
                                      ? "cursor-not-allowed"
                                      : ""
                                  }
                                >
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleOptionClick(
                                        score.fixtureId,
                                        "events",
                                      )
                                    }
                                    disabled={isMatchNotStarted}
                                    className={
                                      isMatchNotStarted ? "opacity-50" : ""
                                    }
                                  >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    <span>Events</span>
                                  </DropdownMenuItem>
                                </div>
                              </TooltipTrigger>
                              {isMatchNotStarted && (
                                <TooltipContent>
                                  <p>Available after match starts</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
      <PredictionModal
        isOpen={modalType === "prediction"}
        onClose={() => setModalType(null)}
        fixtureId={selectedFixtureId ?? 0}
      />
      <StatisticsModal
        isOpen={modalType === "statistics"}
        onClose={() => setModalType(null)}
        fixtureId={selectedFixtureId ?? 0}
      />
      <LineupsModal
        isOpen={modalType === "lineups"}
        onClose={() => setModalType(null)}
        fixtureId={selectedFixtureId ?? 0}
      />
      <EventsModal
        isOpen={modalType === "events"}
        onClose={() => setModalType(null)}
        fixtureId={selectedFixtureId ?? 0}
      />
      <TeamStatisticsModal
        isOpen={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        teamId={selectedTeam?.id ?? 0}
        leagueId={selectedTeam?.leagueId ?? 0}
      />
    </div>
  );
}
