"use client";

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
} from "lucide-react";
import Image from "next/image";

interface FootballScoresTableProps {
  initialScores: FootballScore[];
}

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
  } | null>(null);

  const formatTime = (isoString: string) => {
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
  ) => {
    if (status.short === "FT") {
      return `${score.home} - ${score.away}`;
    }
    if (status.short === "1H" || status.short === "2H") {
      return `${score.home} - ${score.away} (${status.short} ${status.elapsed}')`;
    }
    return status.short;
  };

  const sortMatches = (a: FootballScore, b: FootballScore) => {
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  };

  useEffect(() => {
    setScores([...initialScores].sort(sortMatches));
  }, [initialScores]);

  const handleOptionClick = (
    fixtureId: number,
    type: "prediction" | "statistics" | "lineups" | "events",
  ) => {
    setSelectedFixtureId(fixtureId);
    setModalType(type);
  };

  const handleTeamClick = (teamId: number, teamName: string) => {
    setSelectedTeam({ id: teamId, name: teamName });
  };

  return (
    <div className="w-full overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">#</TableHead>
            <TableHead>Time (Sofia)</TableHead>
            <TableHead className="text-left">Home</TableHead>
            <TableHead className="text-left">Away</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>League</TableHead>
            <TableHead>Flag</TableHead>
            <TableHead>
              <MoreHorizontal className="h-4 w-4" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scores.map((score, index) => (
            <TableRow key={score.fixtureId}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>{formatTime(score.startTime)}</TableCell>
              <TableCell className="text-left">
                <button
                  onClick={() =>
                    handleTeamClick(score.home.id, score.home.name)
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
                    handleTeamClick(score.away.id, score.away.name)
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
                    <DropdownMenuItem
                      onClick={() =>
                        handleOptionClick(score.fixtureId, "statistics")
                      }
                    >
                      <BarChart className="mr-2 h-4 w-4" />
                      <span>Statistics</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleOptionClick(score.fixtureId, "lineups")
                      }
                    >
                      <Users className="mr-2 h-4 w-4" />
                      <span>Lineups</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleOptionClick(score.fixtureId, "events")
                      }
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      <span>Events</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
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
        leagueId={1}
        season={2023}
      />
    </div>
  );
}
