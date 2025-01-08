import { NextResponse } from "next/server";
import type { FootballScore } from "@/types/football-scores";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leagueIds = searchParams.get("leagueIds");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);

  if (!leagueIds) {
    return NextResponse.json(
      { error: "League IDs are required" },
      { status: 400 },
    );
  }

  const leagueIdsArray = leagueIds.split(",").map(Number);
  const today = new Date().toISOString().split("T")[0];
  const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${today}`;

  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!,
      "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
    },
  };

  try {
    console.log(`Fetching data from: ${url}`);
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log(`API Response: ${result.results} fixtures found`);

    if (!result.response || !Array.isArray(result.response)) {
      console.error("Unexpected response format:", result);
      throw new Error("Unexpected response format from external API");
    }

    const filteredFixtures = result.response.filter((fixture: any) =>
      leagueIdsArray.includes(fixture.league.id),
    );

    console.log(
      `Filtered ${filteredFixtures.length} fixtures for the specified leagues`,
    );

    if (filteredFixtures.length === 0) {
      console.log("No matches found for the given leagues and date");
      return NextResponse.json([]);
    }

    const allScores: FootballScore[] = filteredFixtures.map(
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

    // Sort matches: Live first, then by start time
    allScores.sort((a, b) => {
      if (a.status.short !== "FT" && b.status.short === "FT") return -1;
      if (a.status.short === "FT" && b.status.short !== "FT") return 1;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedScores = allScores.slice(startIndex, endIndex);

    // Reassign row numbers after sorting and pagination
    paginatedScores.forEach((score, index) => {
      score.rowNumber = startIndex + index + 1;
    });

    console.log(`Returning ${paginatedScores.length} matches`);
    return NextResponse.json(paginatedScores);
  } catch (error) {
    console.error("Error fetching football scores:", error);
    return NextResponse.json(
      { error: "Failed to fetch football scores" },
      { status: 500 },
    );
  }
}
