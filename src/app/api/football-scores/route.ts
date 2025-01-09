import { NextResponse } from "next/server";
import { FootballScore } from "@/types/football-scores";

interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: {
      long: string;
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    round: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string;
      winner: boolean | null;
    };
    away: {
      id: number;
      name: string;
      logo: string;
      winner: boolean | null;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

interface ApiResponse {
  response: ApiFixture[];
}

interface OddsValue {
  value: string;
  odd: string;
}

interface OddsBet {
  values: OddsValue[];
}

interface OddsBookmaker {
  bets: OddsBet[];
}

interface OddsResponse {
  response: Array<{
    bookmakers: OddsBookmaker[];
  }>;
}

const SOFIA_TIMEZONE = "Europe/Sofia";

function getSofiaTime(): string {
  return new Date().toLocaleString("en-US", { timeZone: SOFIA_TIMEZONE });
}

function getDateRange(): string[] {
  const sofiaTime = new Date(getSofiaTime());
  const dayOfWeek = sofiaTime.getDay();
  const hour = sofiaTime.getHours();

  let startDay: number, endDay: number;

  if (
    (dayOfWeek === 6 && hour >= 10) ||
    (dayOfWeek >= 0 && dayOfWeek <= 2) ||
    (dayOfWeek === 3 && hour < 10)
  ) {
    // Saturday 10:00 or later, or Sunday through Tuesday, or Wednesday before 10:00
    startDay = dayOfWeek === 6 && hour >= 10 ? 0 : dayOfWeek;
    endDay = 2;
  } else {
    // Wednesday 10:00 or later, or Thursday through Friday
    startDay = 3;
    endDay = 5;
  }

  const dates: string[] = [];
  for (let i = startDay; i <= endDay; i++) {
    const date = new Date(sofiaTime);
    date.setDate(sofiaTime.getDate() - sofiaTime.getDay() + i);
    dates.push(date.toISOString().split("T")[0]!);
  }

  return dates;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leagueIds = searchParams.get("leagueIds");

  if (!leagueIds) {
    return NextResponse.json(
      { error: "League IDs are required" },
      { status: 400 },
    );
  }

  const leagueIdsArray = leagueIds.split(",").map(Number);
  const dateRange = getDateRange();

  const urls = dateRange.map(
    (date) => `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${date}`,
  );

  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!,
      "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
    },
  };

  try {
    const responses = await Promise.all(urls.map((url) => fetch(url, options)));
    const results: ApiResponse[] = await Promise.all(
      responses.map((res) => res.json() as Promise<ApiResponse>),
    );

    let allFixtures: (ApiFixture & { day: string })[] = [];
    results.forEach((result, index) => {
      if (result.response && Array.isArray(result.response)) {
        const filteredFixtures = result.response.filter((fixture: ApiFixture) =>
          leagueIdsArray.includes(fixture.league.id),
        );
        allFixtures = [
          ...allFixtures,
          ...filteredFixtures.map((fixture: ApiFixture) => ({
            ...fixture,
            day: new Date(dateRange[index] ?? "").toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
              timeZone: SOFIA_TIMEZONE,
            }),
          })),
        ];
      } else {
        console.error("Unexpected response format:", result);
      }
    });

    if (allFixtures.length === 0) {
      console.log("No matches found for the given leagues and dates");
      return NextResponse.json([]);
    }

    // Fetch odds for all fixtures
    const oddsPromises = allFixtures.map((fixture) =>
      fetch(
        `https://api-football-v1.p.rapidapi.com/v3/odds?fixture=${fixture.fixture.id}&bookmaker=6`,
        options,
      ).then((res) => res.json() as Promise<OddsResponse>),
    );

    const oddsResults = await Promise.all(oddsPromises);

    const allScores: FootballScore[] = allFixtures
      .map((fixture, index) => {
        const oddsData =
          oddsResults[index]!.response[0]?.bookmakers[0]?.bets[0]?.values ?? [];
        const odds = {
          home:
            oddsData.find((odd: OddsValue) => odd.value === "Home")?.odd ??
            null,
          draw:
            oddsData.find((odd: OddsValue) => odd.value === "Draw")?.odd ??
            null,
          away:
            oddsData.find((odd: OddsValue) => odd.value === "Away")?.odd ??
            null,
        };

        return {
          day: fixture.day,
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
          odds,
        };
      })
      .filter((score) => score.odds.home && score.odds.draw && score.odds.away);

    // Sort matches by start time
    allScores.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    // Reassign row numbers after filtering and sorting
    allScores.forEach((score, index) => {
      score.rowNumber = index + 1;
    });

    console.log(`Returning ${allScores.length} matches`);
    return NextResponse.json(allScores);
  } catch (error) {
    console.error("Error fetching football scores:", error);
    return NextResponse.json(
      { error: "Failed to fetch football scores" },
      { status: 500 },
    );
  }
}
