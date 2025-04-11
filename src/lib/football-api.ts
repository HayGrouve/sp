// src/lib/football-api.ts
import { type FootballScore } from "@/types/football-scores";
import {
  getDay,
  startOfWeek,
  addDays,
  getISOWeek,
  isSaturday,
  isSunday,
  isMonday,
  isTuesday,
  isWednesday,
  getHours,
  parseISO,
  isBefore,
  isEqual,
  getYear, // Added getYear import
} from "date-fns";
// --- CHANGE HERE: Import toZonedTime instead of utcToZonedTime ---
import { toZonedTime, format } from "date-fns-tz";

// --- Interfaces for API response shapes (Keep these as they were) ---
interface ApiFixture {
  fixture: {
    id: number;
    date: string; // ISO String (UTC)
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
  id: number; // e.g., 1 for Match Winner
  name: string; // e.g., "Match Winner"
  values: OddsValue[];
}

interface OddsBookmaker {
  id: number; // e.g., 6 for Betway
  name: string; // e.g., "Betway"
  bets: OddsBet[];
}

interface OddsFixture {
  fixture: { id: number };
  bookmakers: OddsBookmaker[];
}

interface OddsResponse {
  response: OddsFixture[];
}
// --- End of API Interfaces ---

const SOFIA_TIMEZONE = "Europe/Sofia";
const RAPIDAPI_HOST = "api-football-v1.p.rapidapi.com";
const MATCH_WINNER_BET_ID = 1; // Common ID for Match Winner odds
const TARGET_BOOKMAKER_ID = 6; // Example: Betway (check API docs for IDs)

// Helper to get current date object in Sofia timezone
function getCurrentSofiaDate(): Date {
  // --- CHANGE HERE: Use toZonedTime ---
  return toZonedTime(new Date(), SOFIA_TIMEZONE);
}

// Define the structure for the return value of getDateRange
export interface DateRangeInfo {
  dates: string[]; // YYYY-MM-DD format strings
  sectionId: string; // e.g., "2025-W15-SatMon"
  startDate: Date; // Start Date object of the section (in Sofia time)
  endDate: Date; // End Date object of the section (in Sofia time)
}

/**
 * Calculates the current relevant date range (Sat-Mon or Tue-Fri)
 * and a unique identifier for that section based on Sofia time.
 * Sat-Mon section includes Sat, Sun, Mon.
 * Tue-Fri section includes Tue, Wed, Thu, Fri.
 * The switch happens relative to the start of the week (Monday).
 */
export function getDateRange(): DateRangeInfo {
  const nowSofia = getCurrentSofiaDate();
  const currentDay = getDay(nowSofia); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  let sectionStart: Date;
  let sectionEnd: Date;
  let sectionType: "SatMon" | "TueFri";

  // Use Monday as the start of the week for calculations
  const startOfCurrentWeek = startOfWeek(nowSofia, { weekStartsOn: 1 });

  // Determine if we are currently in the Sat-Mon period or Tue-Fri period
  if (isSaturday(nowSofia) || isSunday(nowSofia) || isMonday(nowSofia)) {
    // Currently Saturday, Sunday, or Monday -> Show Sat/Sun/Mon
    sectionType = "SatMon";
    sectionStart = addDays(startOfCurrentWeek, 5); // Saturday of this week cycle
    sectionEnd = addDays(startOfCurrentWeek, 7); // Monday of this week cycle (end of day)
  } else {
    // Currently Tuesday, Wednesday, Thursday, or Friday -> Show Tue/Wed/Thu/Fri
    sectionType = "TueFri";
    sectionStart = addDays(startOfCurrentWeek, 1); // Tuesday of this week cycle
    sectionEnd = addDays(startOfCurrentWeek, 4); // Friday of this week cycle
  }

  // Generate date strings (YYYY-MM-DD) for the section
  const dates: string[] = [];
  let currentDate = sectionStart;
  // Loop from sectionStart up to and including sectionEnd
  while (
    isBefore(currentDate, sectionEnd) ||
    isEqual(currentDate, sectionEnd)
  ) {
    dates.push(format(currentDate, "yyyy-MM-dd", { timeZone: SOFIA_TIMEZONE }));
    currentDate = addDays(currentDate, 1);
  }

  // Create the section ID using the week number of the *start* date
  const weekNumber = getISOWeek(sectionStart);
  // --- CHANGE HERE: Use getYear from date-fns ---
  const year = getYear(sectionStart);
  const sectionId = `${year}-W${String(weekNumber).padStart(
    2,
    "0",
  )}-${sectionType}`;

  return {
    dates: dates,
    sectionId: sectionId,
    startDate: sectionStart,
    endDate: sectionEnd,
  };
}

/**
 * Fetches football scores and odds from RapidAPI for given leagues and date range.
 * Assigns sequential row numbers after filtering and sorting.
 */
export async function fetchFootballScores(
  leagueIds: number[],
  dateRangeInfo: DateRangeInfo,
): Promise<FootballScore[]> {
  if (!process.env.RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY environment variable is not set.");
  }

  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
  };

  // --- Fetch Fixtures ---
  const fixtureUrls = dateRangeInfo.dates.map(
    (date) => `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${date}`,
  );

  console.log(`Fetching fixtures for dates: ${dateRangeInfo.dates.join(", ")}`);

  const fixtureResponses = await Promise.all(
    fixtureUrls.map((url) => fetch(url, options)),
  );
  const fixtureResults: ApiResponse[] = await Promise.all(
    fixtureResponses.map(async (res, index) => {
      if (!res.ok) {
        console.error(
          `Error fetching fixtures for ${dateRangeInfo.dates[index]}: ${res.status} ${res.statusText}`,
        );
        const errorBody = await res.text();
        console.error("Error body:", errorBody);
        return { response: [] }; // Return empty response on error
      }
      try {
        return (await res.json()) as ApiResponse;
      } catch (e) {
        console.error(
          `Error parsing JSON for ${dateRangeInfo.dates[index]}:`,
          e,
        );
        return { response: [] }; // Return empty response on JSON parse error
      }
    }),
  );

  let allFixtures: (ApiFixture & { day: string })[] = [];
  fixtureResults.forEach((result, index) => {
    if (result.response && Array.isArray(result.response)) {
      const filteredFixtures = result.response.filter((fixture: ApiFixture) =>
        leagueIds.includes(fixture.league.id),
      );
      allFixtures = [
        ...allFixtures,
        ...filteredFixtures.map((fixture: ApiFixture) => {
          // Parse the UTC date string from API, format in Sofia time
          const fixtureDate = parseISO(fixture.fixture.date);
          const formattedDay = format(fixtureDate, "EEEE, MMM d", {
            timeZone: SOFIA_TIMEZONE,
          });
          return {
            ...fixture,
            day: formattedDay,
          };
        }),
      ];
    } else {
      console.warn(
        `Unexpected or empty response format for date ${dateRangeInfo.dates[index]}:`,
        result,
      );
    }
  });

  if (allFixtures.length === 0) {
    console.log("No matches found for the given leagues and dates.");
    return [];
  }
  console.log(`Found ${allFixtures.length} initial fixtures.`);

  // --- Fetch Odds (Consider batching if API supports it) ---
  // Note: Fetching odds one by one can be slow and hit rate limits.
  console.log(`Fetching odds for ${allFixtures.length} fixtures...`);
  const oddsPromises = allFixtures.map((fixture) =>
    fetch(
      `https://api-football-v1.p.rapidapi.com/v3/odds?fixture=${fixture.fixture.id}&bookmaker=${TARGET_BOOKMAKER_ID}&bet=${MATCH_WINNER_BET_ID}`,
      options,
    )
      .then(async (res) => {
        if (!res.ok) {
          console.error(
            `Error fetching odds for fixture ${fixture.fixture.id}: ${res.status} ${res.statusText}`,
          );
          return null; // Return null on error
        }
        try {
          return (await res.json()) as OddsResponse;
        } catch (e) {
          console.error(
            `Error parsing odds JSON for fixture ${fixture.fixture.id}:`,
            e,
          );
          return null; // Return null on JSON parse error
        }
      })
      .catch((error) => {
        console.error(
          `Network error fetching odds for fixture ${fixture.fixture.id}:`,
          error,
        );
        return null; // Return null on network error
      }),
  );

  const oddsResults = await Promise.all(oddsPromises);
  console.log("Finished fetching odds.");

  // --- Combine Fixtures and Odds ---
  const mappedAndFilteredScores = allFixtures
    .map((fixture, index): FootballScore | null => {
      // Return type includes null here
      const oddsResult = oddsResults[index];
      let odds: {
        home: string | null;
        draw: string | null;
        away: string | null;
      } = {
        home: null,
        draw: null,
        away: null,
      };

      const bookmakerData = oddsResult?.response?.[0]?.bookmakers?.find(
        (b) => b.id === TARGET_BOOKMAKER_ID,
      );
      const matchWinnerBet = bookmakerData?.bets?.find(
        (bet) => bet.id === MATCH_WINNER_BET_ID,
      );

      if (matchWinnerBet?.values) {
        odds = {
          home:
            matchWinnerBet.values.find((odd) => odd.value === "Home")?.odd ??
            null,
          draw:
            matchWinnerBet.values.find((odd) => odd.value === "Draw")?.odd ??
            null,
          away:
            matchWinnerBet.values.find((odd) => odd.value === "Away")?.odd ??
            null,
        };
      }

      if (!odds.home || !odds.draw || !odds.away) {
        return null; // Indicate filtering needed
      }

      // Construct the FootballScore object
      return {
        day: fixture.day,
        rowNumber: 0, // Placeholder
        fixtureId: fixture.fixture.id,
        startTime: fixture.fixture.date,
        status: fixture.fixture.status,
        home: fixture.teams.home,
        away: fixture.teams.away,
        score: fixture.goals,
        league: fixture.league,
        odds,
      };
    })
    .filter((score): score is FootballScore => score !== null); // Type predicate correctly filters nulls

  // Now assign the guaranteed FootballScore[] array
  const combinedScores: FootballScore[] = mappedAndFilteredScores;

  console.log(`Combined ${combinedScores.length} fixtures with complete odds.`);

  // --- Sort by Start Time ---
  combinedScores.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  // --- Assign Final Row Numbers ---
  combinedScores.forEach((score, index) => {
    score.rowNumber = index + 1;
  });

  console.log(`Returning ${combinedScores.length} sorted scores.`);
  return combinedScores;
}
