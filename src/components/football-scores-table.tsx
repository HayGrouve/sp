// src/components/football-scores-table.tsx
"use client";

import React from "react";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { format, startOfDay, isEqual as isDateEqual } from "date-fns";
import { toZonedTime, format as formatTz } from "date-fns-tz";

// Shadcn UI Components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// Removed Accordion imports
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button, buttonVariants } from "@/components/ui/button"; // Keep buttonVariants if used elsewhere, otherwise remove
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
  // Removed MoreVertical
  PlayCircle,
  // Removed Landmark, Scale if only used in mobile accordion
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
    <div className="flex items-center space-x-1">
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
            className="h-2 w-2 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600"
            title="No data"
          />
        ),
      )}
    </div>
  );
};

// --- Live Indicator Component ---
const LiveIndicator: React.FC<{ className?: string }> = ({ className }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("relative flex h-2 w-2", className)}>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>Live</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

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
  const [firstLiveFixtureId, setFirstLiveFixtureId] = useState<number | null>(
    null,
  );

  const SOFIA_TIMEZONE = "Europe/Sofia";

  // --- Helper Functions ---
  const formatDisplayTime = useCallback((startTime: Date): string => {
    try {
      if (!(startTime instanceof Date) || isNaN(startTime.getTime()))
        throw new Error("Invalid Date object");
      return formatTz(startTime, "HH:mm", { timeZone: SOFIA_TIMEZONE });
    } catch (e) {
      console.error("Error formatting time:", e, "Input:", startTime);
      return "--:--";
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
        ["1H", "HT", "2H", "ET", "P", "BT", "LIVE", "INT"].includes(
          status.short,
        )
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

  const getLocalDay = useCallback((date: Date): Date => {
    try {
      if (!(date instanceof Date) || isNaN(date.getTime()))
        throw new Error("Invalid Date object received by getLocalDay");
      return startOfDay(toZonedTime(date, SOFIA_TIMEZONE));
    } catch (e) {
      console.error(e, "Input date:", date);
      return startOfDay(new Date());
    }
  }, []);

  const isLiveStatus = useCallback((statusShort: string): boolean => {
    return ["1H", "HT", "2H", "ET", "P", "BT", "LIVE", "INT"].includes(
      statusShort,
    );
  }, []);

  // --- Effects ---
  useEffect(() => {
    setScores(initialScores);
    calculateForecastCounts(initialScores);
    const liveMatch = initialScores.find((score) =>
      isLiveStatus(score.status.short),
    );
    setFirstLiveFixtureId(liveMatch ? liveMatch.fixtureId : null);
  }, [initialScores, calculateForecastCounts, isLiveStatus]);

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

  const scrollToLiveMatch = useCallback(() => {
    if (firstLiveFixtureId) {
      const element = document.getElementById(`fixture-${firstLiveFixtureId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add(
          "ring-2",
          "ring-offset-2",
          "ring-offset-background",
          "ring-blue-500",
          "dark:ring-blue-400",
          "rounded-md",
          "transition-shadow",
          "duration-1000",
          "ease-out",
        );
        setTimeout(() => {
          element.classList.remove(
            "ring-2",
            "ring-offset-2",
            "ring-offset-background",
            "ring-blue-500",
            "dark:ring-blue-400",
            "rounded-md",
            "transition-shadow",
            "duration-1000",
            "ease-out",
          );
        }, 1500);
      } else {
        console.warn(
          `Element with id fixture-${firstLiveFixtureId} not found.`,
        );
      }
    } else {
      console.log(
        "No live matches to scroll to.",
      ); /* Add toast here if desired */
    }
  }, [firstLiveFixtureId]);

  // --- Render Logic ---
  const displayError = pageError ?? localError;

  return (
    <div
      className={cn(
        "container mx-auto py-10",
        !isLoading && scores.length > 0 ? "" : "pb-10",
      )}
    >
      {/* Header Section */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Football Scores</h1>
        <Button
          onClick={scrollToLiveMatch}
          disabled={isLoading || !firstLiveFixtureId}
          variant="outline"
        >
          <PlayCircle className="mr-2 h-4 w-4" /> Live
        </Button>
      </div>

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

      {/* --- Desktop Table (Always Visible) --- */}
      {!isLoading && scores.length > 0 && (
        <div className="w-full overflow-auto">
          {/* Removed responsive classes */}
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
                      {/* Forecast Stats Popover */}
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
                const isLive = isLiveStatus(score.status.short);
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
                const formattedDay = format(
                  currentMatchDayStart,
                  "EEEE, MMM d",
                );

                return (
                  <React.Fragment key={score.fixtureId}>
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
                    <TableRow id={`fixture-${score.fixtureId}`}>
                      <TableCell className="text-muted-foreground">
                        {score.rowNumber}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isLive && <LiveIndicator />}
                          {formatDisplayTime(new Date(score.startTime))}
                        </div>
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
                        <div className="flex items-center justify-center gap-2">
                          {isLive && (
                            <LiveIndicator className="hidden lg:flex" />
                          )}
                          <span>
                            {getScoreDisplay(score.score, score.status)}
                          </span>
                        </div>
                      </TableCell>
                      {/* Adjusted live indicator display */}
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
                                  <ForecastHistoryDots
                                    history={historyForRow}
                                  />
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
                      >{`${score.league.country} - ${score.league.name}`}</TableCell>
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
        </div>
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
