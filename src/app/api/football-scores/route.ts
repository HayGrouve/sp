import { NextResponse } from "next/server";
import { FootballScore } from "@/types/football-scores";

export async function GET() {
  const url = "https://api-football-v1.p.rapidapi.com/v3/fixtures?live=all";
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

    const scores: FootballScore[] = result.response.map(
      (fixture: any, index: number) => ({
        rowNumber: index + 1,
        fixtureId: fixture.fixture.id,
        startTime: fixture.fixture.date,
        status: {
          long: fixture.fixture.status.long,
          short: fixture.fixture.status.short,
          elapsed: fixture.fixture.status.elapsed,
        },
        home: {
          id: fixture.teams.home.id,
          name: fixture.teams.home.name,
          logo: fixture.teams.home.logo,
          winner: fixture.teams.home.winner,
        },
        away: {
          id: fixture.teams.away.id,
          name: fixture.teams.away.name,
          logo: fixture.teams.away.logo,
          winner: fixture.teams.away.winner,
        },
        score: {
          home: fixture.goals.home,
          away: fixture.goals.away,
        },
        league: {
          id: fixture.league.id,
          name: fixture.league.name,
          country: fixture.league.country,
          logo: fixture.league.logo,
          flag: fixture.league.flag,
          season: fixture.league.season,
          round: fixture.league.round,
        },
      }),
    );

    return NextResponse.json(scores);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch football scores" },
      { status: 500 },
    );
  }
}
