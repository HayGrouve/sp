"use client";

import React from "react";
import { useState, useEffect } from "react";
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
import type { FootballScore } from "@/types/football-scores";
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
} from "lucide-react";
import Image from "next/image";
import { rowForecastMap } from "@/utils/rowForecastMap";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FootballScoresTableProps {
  initialScores: FootballScore[];
}

type ForecastHistory = Record<number, boolean[]>;

const ForecastHistoryDots: React.FC<{ history: boolean[] }> = ({ history }) => {
  return (
    <div className="flex space-x-1">
      {history.slice(-3).map((isCorrect, index) => (
        <div
          key={index}
          className={`h-2 w-2 rounded-full ${
            isCorrect ? "bg-green-500" : "bg-red-500"
          }`}
        />
      ))}
    </div>
  );
};

export function FootballScoresTable({
  initialScores,
}: FootballScoresTableProps) {
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
  const [error, setError] = useState<string | null>(null);
  const [correctForecasts, setCorrectForecasts] = useState(0);
  const [incorrectForecasts, setIncorrectForecasts] = useState(0);
  const [forecastHistory, setForecastHistory] = useState<ForecastHistory>({});

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    const sofiaTime = new Date(
      date.toLocaleString("en-US", { timeZone: "Europe/Sofia" }),
    );
    return sofiaTime.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const getScoreDisplay = (
    score: FootballScore["score"],
    status: FootballScore["status"],
  ): string => {
    if (status.short === "FT") {
      return `${score.home} - ${score.away}`;
    }
    if (status.short === "1H" || status.short === "2H") {
      return `${score.home} - ${score.away} (${status.short} ${status.elapsed}')`;
    }
    return status.short;
  };

  const sortMatches = (a: FootballScore, b: FootballScore): number => {
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  };

  const getForecast = React.useCallback((rowNumber: number): string => {
    const forecastItem = rowForecastMap.find(
      (item) => item.rowNumber === rowNumber % 175,
    );
    return forecastItem ? forecastItem.forecast : "";
  }, []);

  const isForecastCorrect = React.useCallback(
    (score: FootballScore["score"], forecast: string): boolean => {
      if (score.home === null || score.away === null) return false;

      const homeWin = score.home > score.away;
      const awayWin = score.home < score.away;
      const draw = score.home === score.away;

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

  const getForecastCellStyle = (
    score: FootballScore["score"],
    forecast: string,
  ): React.CSSProperties => {
    if (score.home === null || score.away === null) return {};

    return {
      backgroundColor: isForecastCorrect(score, forecast)
        ? "rgba(0, 255, 0, 0.2)"
        : "rgba(255, 0, 0, 0.2)",
    };
  };

  const calculateForecastCounts = React.useCallback(
    (scores: FootballScore[]): { correct: number; incorrect: number } => {
      let correct = 0;
      let incorrect = 0;

      scores.forEach((score) => {
        const forecast = getForecast(score.rowNumber);
        if (
          forecast &&
          score.score.home !== null &&
          score.score.away !== null
        ) {
          if (isForecastCorrect(score.score, forecast)) {
            correct++;
          } else {
            incorrect++;
          }
        }
      });

      return { correct, incorrect };
    },
    [getForecast, isForecastCorrect],
  );

  const calculateWinRate = (): number => {
    const total = correctForecasts + incorrectForecasts;
    if (total === 0) return 0;
    return (correctForecasts / total) * 100;
  };

  const updateForecastHistory = React.useCallback(
    async (scores: FootballScore[]): Promise<void> => {
      const newHistory: ForecastHistory = { ...forecastHistory };
      for (const score of scores) {
        const forecast = getForecast(score.rowNumber);
        if (
          forecast &&
          score.score.home !== null &&
          score.score.away !== null
        ) {
          const isCorrect = isForecastCorrect(score.score, forecast);

          // Save to database
          try {
            await fetch("/api/forecast-history", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rowNumber: score.rowNumber, isCorrect }),
            });
          } catch (error) {
            console.error("Error saving forecast history:", error);
          }

          // Update local state
          if (!newHistory[score.rowNumber]) {
            newHistory[score.rowNumber] = [];
          }
          newHistory[score.rowNumber]!.push(isCorrect);
          // Keep only the last 3 states
          if (newHistory[score.rowNumber]!.length > 3) {
            newHistory[score.rowNumber]!.shift();
          }
        }
      }
      setForecastHistory(newHistory);
    },
    [forecastHistory, getForecast, isForecastCorrect],
  );

  const fetchForecastHistory = async (
    rowNumber: number,
  ): Promise<boolean[]> => {
    try {
      const response = await fetch(
        `/api/forecast-history?rowNumber=${rowNumber}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch forecast history");
      }
      const history: boolean[] = (await response.json()) as boolean[];
      return history;
    } catch (error) {
      console.error("Error fetching forecast history:", error);
      return [];
    }
  };

  useEffect(() => {
    // Set initial scores
    const sortedScores = [...initialScores].sort(sortMatches);
    setScores(sortedScores);

    // Calculate initial forecast counts
    const { correct, incorrect } = calculateForecastCounts(sortedScores);
    setCorrectForecasts(correct);
    setIncorrectForecasts(incorrect);

    // Set up interval to update scores
    const interval = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/api/football-scores");
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const updatedScores: FootballScore[] =
            (await response.json()) as FootballScore[];
          const sortedUpdatedScores = updatedScores.sort(sortMatches);
          setScores(sortedUpdatedScores);

          // Recalculate forecast counts
          const { correct, incorrect } =
            calculateForecastCounts(sortedUpdatedScores);
          setCorrectForecasts(correct);
          setIncorrectForecasts(incorrect);

          // Update forecast history
          await updateForecastHistory(sortedUpdatedScores);
        } catch (error) {
          console.error("Error updating scores:", error);
          if (error instanceof Error) {
            console.error("Error message:", error.message);
            setError(`Failed to update scores: ${error.message}`);
          } else {
            setError("An unknown error occurred while updating scores");
          }
        }
      })();
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [calculateForecastCounts, initialScores, updateForecastHistory]);

  useEffect(() => {
    // Fetch initial forecast history
    const fetchInitialHistory = async () => {
      const newHistory: ForecastHistory = {};
      for (const forecast of rowForecastMap) {
        newHistory[forecast.rowNumber] = await fetchForecastHistory(
          forecast.rowNumber,
        );
      }
      setForecastHistory(newHistory);
    };
    fetchInitialHistory().catch((error) => {
      console.error("Error fetching initial forecast history:", error);
    });
  }, []);

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

  return (
    <div className="w-full overflow-auto">
      {error && (
        <div
          className="relative mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
          role="alert"
        >
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">#</TableHead>
            <TableHead>Time (Sofia)</TableHead>
            <TableHead className="text-left">Home</TableHead>
            <TableHead className="text-left">Away</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>1</TableHead>
            <TableHead>X</TableHead>
            <TableHead>2</TableHead>
            <TableHead>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="h-8 w-full p-0 font-bold">
                    fcast
                    <Info className="ml-1 h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">
                        Forecast Statistics
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Overview of forecast accuracy
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
                        <span className="text-sm font-medium">Incorrect:</span>
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
          {scores.map((score, index) => (
            <React.Fragment key={score.fixtureId}>
              {(index === 0 || score.day !== scores[index - 1]?.day) && (
                <TableRow key={`day-${score.day}-${score.fixtureId}`}>
                  <TableCell
                    colSpan={12}
                    className="bg-muted text-center font-semibold"
                  >
                    {score.day}
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell>{score.rowNumber}</TableCell>
                <TableCell>{formatTime(score.startTime)}</TableCell>
                <TableCell className="text-left">
                  <button
                    onClick={() =>
                      handleTeamClick(
                        score.home.id,
                        score.home.name,
                        score.league.id,
                      )
                    }
                    className="flex items-center text-left text-blue-600 hover:underline"
                  >
                    {score.home.logo ? (
                      <Image
                        src={score.home.logo}
                        alt={score.home.name}
                        width={20}
                        height={20}
                        className="mr-2"
                      />
                    ) : (
                      <div className="mr-2 h-5 w-5 rounded-full bg-gray-200" />
                    )}
                    {score.home.name}
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
                    className="flex items-center text-left text-blue-600 hover:underline"
                  >
                    {score.away.logo ? (
                      <Image
                        src={score.away.logo}
                        alt={score.away.name}
                        width={20}
                        height={20}
                        className="mr-2"
                      />
                    ) : (
                      <div className="mr-2 h-5 w-5 rounded-full bg-gray-200" />
                    )}
                    {score.away.name}
                  </button>
                </TableCell>
                <TableCell>
                  {getScoreDisplay(score.score, score.status)}
                </TableCell>
                <TableCell>{score.odds.home}</TableCell>
                <TableCell>{score.odds.draw}</TableCell>
                <TableCell>{score.odds.away}</TableCell>
                <TableCell
                  style={
                    getForecast(score.rowNumber)
                      ? getForecastCellStyle(
                          score.score,
                          getForecast(score.rowNumber),
                        )
                      : {}
                  }
                >
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" className="h-8 w-full p-0">
                        {getForecast(score.rowNumber)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">
                          Forecast History:
                        </span>
                        <ForecastHistoryDots
                          history={forecastHistory[score.rowNumber] ?? []}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </TableCell>
                <TableCell>{`${score.league.country} - ${score.league.name}`}</TableCell>
                <TableCell>
                  {score.league.flag ? (
                    <Image
                      src={score.league.flag}
                      alt={score.league.country}
                      width={20}
                      height={20}
                    />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-gray-200" />
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
                        <span>Prediction</span>
                      </DropdownMenuItem>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleOptionClick(
                                    score.fixtureId,
                                    "statistics",
                                  )
                                }
                                disabled={score.status.short === "NS"}
                                className={
                                  score.status.short === "NS"
                                    ? "cursor-not-allowed opacity-50"
                                    : ""
                                }
                              >
                                <BarChart className="mr-2 h-4 w-4" />
                                <span>Statistics</span>
                              </DropdownMenuItem>
                            </div>
                          </TooltipTrigger>
                          {score.status.short === "NS" && (
                            <TooltipContent>
                              <p>
                                Statistics will be available once the match
                                starts
                              </p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleOptionClick(score.fixtureId, "lineups")
                                }
                                disabled={score.status.short === "NS"}
                                className={
                                  score.status.short === "NS"
                                    ? "cursor-not-allowed opacity-50"
                                    : ""
                                }
                              >
                                <Users className="mr-2 h-4 w-4" />
                                <span>Lineups</span>
                              </DropdownMenuItem>
                            </div>
                          </TooltipTrigger>
                          {score.status.short === "NS" && (
                            <TooltipContent>
                              <p>
                                Lineups will be available once the match starts
                              </p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleOptionClick(score.fixtureId, "events")
                                }
                                disabled={score.status.short === "NS"}
                                className={
                                  score.status.short === "NS"
                                    ? "cursor-not-allowed opacity-50"
                                    : ""
                                }
                              >
                                <Calendar className="mr-2 h-4 w-4" />
                                <span>Events</span>
                              </DropdownMenuItem>
                            </div>
                          </TooltipTrigger>
                          {score.status.short === "NS" && (
                            <TooltipContent>
                              <p>
                                Events will be available once the match starts
                              </p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
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
