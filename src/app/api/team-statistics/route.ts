import { NextResponse } from "next/server";
import { TeamStatistics } from "@/types/football-scores";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  const leagueId = searchParams.get("leagueId");
  const season = searchParams.get("season");

  if (!teamId || !leagueId || !season) {
    return NextResponse.json(
      { error: "Team ID, League ID, and Season are required" },
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
    const result = await response.json();

    if (!result.response) {
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
