// src/components/football-scores-table.tsx
"use client";

import React from "react";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { format, startOfDay, isEqual as isDateEqual } from "date-fns"; // Import date-fns functions
import { toZonedTime, format as formatTz } from "date-fns-tz"; // Use date-fns-tz for formatting

// Shadcn UI Components
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Modals (Assuming these paths are correct)
import { PredictionModal } from "./prediction-modal";
import { StatisticsModal } from "./statistics-modal";
import { LineupsModal } from "./lineups-modal";
import { EventsModal } from "./events-modal";
import { TeamStatisticsModal } from "./team-statistics-modal";

// Icons
import {
  MoreHorizontal,
  LineChart,
  BarChart,
  Users,
  Calendar,
  Info,
  Loader2,
  History,
} from "lucide-react";

// Utilities & Types
import type { FootballScore } from "@/types/football-scores"; // Adjust import path if needed
import { rowForecastMap } from "@/utils/rowForecastMap"; // Ensure path is correct
import { cn } from "@/lib/utils"; // Import cn utility if using shadcn

// Props definition
interface FootballScoresTableProps {
  initialScores: FootballScore[];
  isLoading: boolean;
  error: string | null;
}

// Type for the fetched forecast history data
type FetchedForecastHistory = Record<
  number, // rowNumber
  { isCorrect: boolean | null; weekSectionId: string }[]
>;

// --- Forecast History Dots Component ---
const ForecastHistoryDots: React.FC<{
  history: { isCorrect: boolean | null; weekSectionId: string }[];
}> = ({ history }) => {
  const validHistory = history.filter((h) => h.isCorrect !== null);

  return (
    <div className="flex space-x-1">
      {validHistory.slice(0, 3).map((item, index) => (
        <TooltipProvider key={`${item.weekSectionId}-${index}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`h-2 w-2 shrink-0 rounded-full ${
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
      ))}
      {Array.from({ length: Math.max(0, 3 - validHistory.length) }).map(
        (_, index) => (
          <div
            key={`placeholder-${index}`}
            className="h-2 w-2 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" // Adjusted placeholder for dark
            title="No data"
          />
        ),
      )}
    </div>
  );
};

// --- Main Table Component ---
export function FootballScoresTable({
  initialScores,
  isLoading,
  error: pageError,
}: FootballScoresTableProps) {
  // --- State ---
  const [scores, setScores] = useState<FootballScore[]>(initialScores);
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
  const [localError, setLocalError] = useState<string | null>(null);
  const [correctForecasts, setCorrectForecasts] = useState(0);
  const [incorrectForecasts, setIncorrectForecasts] = useState(0);
  const [forecastHistory, setForecastHistory] =
    useState<FetchedForecastHistory>({});
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  const SOFIA_TIMEZONE = "Europe/Sofia";

  // --- Helper Functions ---
  const formatDisplayTime = useCallback((startTime: Date): string => {
    try {
      // Ensure startTime is a valid Date object before formatting
      if (!(startTime instanceof Date) || isNaN(startTime.getTime())) {
        throw new Error("Invalid Date object received");
      }
      return formatTz(startTime, "HH:mm", { timeZone: SOFIA_TIMEZONE });
    } catch (e) {
      console.error("Error formatting time:", e, "Input:", startTime);
      return "--:--"; // Return placeholder on error
    }
  }, []);

  const getScoreDisplay = useCallback(
    (
      scoreData: FootballScore["score"],
      status: FootballScore["status"],
    ): string => {
      if (status.short === "NS") return "-";
      if (status.short === "PST") return "PST";
      if (status.short === "CANC") return "CANC";
      if (status.short === "ABD") return "ABD";
      if (status.short === "TBD") return "TBD";
      const homeScore = scoreData.home ?? "-";
      const awayScore = scoreData.away ?? "-";
      if (status.short === "FT") return `${homeScore} - ${awayScore}`;
      if (
        status.short === "1H" ||
        status.short === "HT" ||
        status.short === "2H" ||
        status.short === "ET" ||
        status.short === "P" ||
        status.short === "BT"
      ) {
        const elapsed = status.elapsed ? ` ${status.elapsed}'` : "";
        return `${homeScore} - ${awayScore} (${status.short}${elapsed})`;
      }
      return `${homeScore} - ${awayScore}`;
    },
    [],
  );

  const getForecast = useCallback((rowNumber: number): string | null => {
    const forecastItem = rowForecastMap.find(
      (item) => item.rowNumber === rowNumber,
    );
    return forecastItem ? forecastItem.forecast : null;
  }, []);

  const isForecastCorrect = useCallback(
    (
      scoreData: FootballScore["score"],
      forecast: string | null,
    ): boolean | null => {
      if (
        !forecast ||
        typeof scoreData.home !== "number" ||
        typeof scoreData.away !== "number"
      )
        return null;
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
          return false;
      }
    },
    [],
  );

  const getForecastCellClasses = useCallback(
    (
      scoreData: FootballScore["score"],
      status: FootballScore["status"],
      forecast: string | null,
    ): string => {
      if (status.short !== "FT" || !forecast) return "";
      const correct = isForecastCorrect(scoreData, forecast);
      if (correct === null) return "";
      return correct
        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
        : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300";
    },
    [isForecastCorrect],
  );

  const calculateForecastCounts = useCallback(
    (currentScores: FootballScore[]): void => {
      let correct = 0;
      let incorrect = 0;
      currentScores.forEach((score) => {
        if (score.status.short === "FT") {
          const forecast = getForecast(score.rowNumber);
          const correctness = isForecastCorrect(score.score, forecast);
          if (correctness === true) correct++;
          else if (correctness === false) incorrect++;
        }
      });
      setCorrectForecasts(correct);
      setIncorrectForecasts(incorrect);
    },
    [getForecast, isForecastCorrect],
  );

  const calculateWinRate = useCallback((): number => {
    const total = correctForecasts + incorrectForecasts;
    if (total === 0) return 0;
    return (correctForecasts / total) * 100;
  }, [correctForecasts, incorrectForecasts]);

  // --- Effects ---
  useEffect(() => {
    setScores(initialScores);
    calculateForecastCounts(initialScores);
  }, [initialScores, calculateForecastCounts]);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      setLocalError(null);
      try {
        const response = await fetch("/api/forecast-history");
        if (!response.ok)
          throw new Error(
            `Failed to fetch forecast history: ${response.statusText}`,
          );
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
  }, []);

  // --- Event Handlers ---
  const handleOptionClick = useCallback(
    (
      fixtureId: number,
      type: "prediction" | "statistics" | "lineups" | "events",
    ): void => {
      setSelectedFixtureId(fixtureId);
      setModalType(type);
    },
    [],
  );

  const handleTeamClick = useCallback(
    (teamId: number, teamName: string, leagueId: number): void => {
      setSelectedTeam({ id: teamId, name: teamName, leagueId });
    },
    [],
  );

  // --- Render Logic ---
  const displayError = pageError ?? localError;

  // Helper to get the start of the day in Sofia time for grouping
  const getLocalDay = useCallback((date: Date): Date => {
    try {
      // Ensure input is a valid Date object
      if (!(date instanceof Date) || isNaN(date.getTime())) {
        throw new Error("Invalid Date object received by getLocalDay");
      }
      return startOfDay(toZonedTime(date, SOFIA_TIMEZONE));
    } catch (e) {
      console.error(e, "Input date:", date);
      return startOfDay(new Date()); // Fallback to current day start
    }
  }, []);

  return (
    <div
      className={cn(
        "w-full overflow-auto",
        !isLoading && scores.length > 0 ? "" : "pb-10",
      )}
    >
      {/* Error Display */}
      {displayError && (
        <div
          className="relative mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700 dark:border-red-600 dark:bg-red-900/20 dark:text-red-400"
          role="alert"
        >
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{displayError}</span>
        </div>
      )}
      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>Loading scores...</span>
        </div>
      )}
      {/* No Matches Found */}
      {!isLoading && !displayError && scores.length === 0 && (
        <div className="py-4 text-center text-muted-foreground">
          No matches found for the current period.
        </div>
      )}

      {/* --- Table (Desktop & Mobile handled within) --- */}
      {!isLoading && scores.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px] text-muted-foreground">
                #
              </TableHead>
              <TableHead className="text-muted-foreground">Time</TableHead>
              <TableHead className="text-left text-muted-foreground">
                Home
              </TableHead>
              <TableHead className="text-left text-muted-foreground">
                Away
              </TableHead>
              <TableHead className="text-muted-foreground">Score</TableHead>
              <TableHead className="text-muted-foreground">1</TableHead>
              <TableHead className="text-muted-foreground">X</TableHead>
              <TableHead className="text-muted-foreground">2</TableHead>
              <TableHead>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-8 w-full p-0 font-bold text-muted-foreground hover:text-foreground"
                    >
                      fcast <Info className="ml-1 h-4 w-4" />
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
                          <span className="col-span-2 text-green-600 dark:text-green-400">
                            {correctForecasts}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 items-center gap-4">
                          <span className="text-sm font-medium">
                            Incorrect:
                          </span>
                          <span className="col-span-2 text-red-600 dark:text-red-400">
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
              <TableHead className="text-muted-foreground">League</TableHead>
              <TableHead className="text-muted-foreground">Flag</TableHead>
              <TableHead>
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scores.map((score, index) => {
              const forecastValue = getForecast(score.rowNumber);
              const historyForRow = forecastHistory[score.rowNumber] ?? [];
              const isMatchNotStarted = score.status.short === "NS";

              // Day Grouping Logic (using local day)
              const currentMatchDayStart = getLocalDay(
                new Date(score.startTime),
              );
              const prevMatchDayStart =
                index > 0
                  ? getLocalDay(new Date(scores[index - 1]!.startTime))
                  : null;
              const showDaySeparator =
                index === 0 ||
                (prevMatchDayStart &&
                  !isDateEqual(currentMatchDayStart, prevMatchDayStart));
              const formattedDay = format(currentMatchDayStart, "EEEE, MMM d");

              return (
                <React.Fragment key={score.fixtureId}>
                  {/* Day Separator Row */}
                  {showDaySeparator && (
                    <TableRow
                      key={`day-${formattedDay}-${score.fixtureId}`}
                      className="hover:bg-transparent dark:hover:bg-transparent"
                    >
                      <TableCell
                        colSpan={12}
                        className="bg-slate-100 py-2 text-center font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      >
                        {formattedDay}
                      </TableCell>
                    </TableRow>
                  )}
                  {/* Main Row */}
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      {score.rowNumber}
                    </TableCell>
                    <TableCell>
                      {formatDisplayTime(new Date(score.startTime))}
                    </TableCell>
                    <TableCell className="text-left">
                      <button
                        onClick={() =>
                          handleTeamClick(
                            score.home.id,
                            score.home.name,
                            score.league.id,
                          )
                        }
                        className="flex items-center gap-2 text-left hover:text-blue-500 hover:underline dark:hover:text-blue-400"
                        title={score.home.name}
                      >
                        {score.home.logo ? (
                          <Image
                            src={score.home.logo}
                            alt=""
                            width={20}
                            height={20}
                            className="shrink-0"
                          />
                        ) : (
                          <div className="h-5 w-5 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
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
                        className="flex items-center gap-2 text-left hover:text-blue-500 hover:underline dark:hover:text-blue-400"
                        title={score.away.name}
                      >
                        {score.away.logo ? (
                          <Image
                            src={score.away.logo}
                            alt=""
                            width={20}
                            height={20}
                            className="shrink-0"
                          />
                        ) : (
                          <div className="h-5 w-5 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
                        )}
                        <span className="truncate">{score.away.name}</span>
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">
                      {getScoreDisplay(score.score, score.status)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {score.odds.home ?? "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {score.odds.draw ?? "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {score.odds.away ?? "-"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-center",
                        getForecastCellClasses(
                          score.score,
                          score.status,
                          forecastValue,
                        ),
                      )}
                    >
                      {forecastValue ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="link"
                              className="h-auto p-0 font-medium text-current hover:no-underline"
                              disabled={isHistoryLoading}
                            >
                              {forecastValue}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2">
                            {isHistoryLoading ? (
                              <div className="flex items-center text-sm text-muted-foreground">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading...
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium">
                                  History:
                                </span>
                                <ForecastHistoryDots history={historyForRow} />
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="max-w-[150px] truncate text-muted-foreground"
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
                        <div className="h-4 w-5 shrink-0 rounded-sm bg-gray-200 dark:bg-gray-700" />
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
      {/* Modals */}
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
