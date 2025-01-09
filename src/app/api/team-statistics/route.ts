import { NextResponse } from "next/server";
import { type TeamStatistics } from "@/types/football-scores";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  const leagueId = searchParams.get("leagueId");
  const season =
    searchParams.get("season") ?? (new Date().getFullYear() - 1).toString();

  if (!teamId || !leagueId) {
    return NextResponse.json(
      { error: "Team ID and League ID are required" },
      { status: 400 },
    );
  }

  const url = `https://api-football-v1.p.rapidapi.com/v3/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`;
  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!,
      "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
    },
  };

  try {
    const response = await fetch(url, options);
    const result = (await response.json()) as { response: TeamStatistics };

    if (!result.response || Object.keys(result.response).length === 0) {
      return NextResponse.json(
        { error: "No team statistics data available" },
        { status: 404 },
      );
    }

    const teamStatistics: TeamStatistics = result.response;

    return NextResponse.json(teamStatistics);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch team statistics" },
      { status: 500 },
    );
  }
}
