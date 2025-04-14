// src/lib/football-api.ts
import { type FootballScore } from "@/types/football-scores"; // Assuming this path is correct
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
  getYear,
} from "date-fns";
import { toZonedTime, format } from "date-fns-tz";

// --- Interfaces for API response shapes ---
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
  fixture: { id: number }; // Ensure fixture ID is here
  bookmakers: OddsBookmaker[];
}

interface OddsResponse {
  response: OddsFixture[]; // Expecting an array of fixtures with their odds
}
// --- End of API Interfaces ---

// --- Constants ---
const SOFIA_TIMEZONE = "Europe/Sofia";
const RAPIDAPI_HOST = "api-football-v1.p.rapidapi.com";
const MATCH_WINNER_BET_ID = 1; // Common ID for Match Winner odds
const TARGET_BOOKMAKER_ID = 6; // Example: Betway (check API docs for IDs)
// --- End Constants ---

// --- Helper Functions ---
// Helper to get current date object in Sofia timezone
function getCurrentSofiaDate(): Date {
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
  const currentHour = getHours(nowSofia);

  let sectionStart: Date;
  let sectionEnd: Date;
  let sectionType: "SatMon" | "TueFri";
  let referenceDateForWeek = nowSofia; // Use current date to determine the week

  // Determine if we are in the Sat-Mon display window
  const isSatMonWindow =
    (currentDay === 6 && currentHour >= 10) || // Saturday 10:00 onwards
    currentDay === 0 || // Sunday
    currentDay === 1 || // Monday
    (currentDay === 2 && currentHour < 10); // Tuesday before 10:00

  if (isSatMonWindow) {
    sectionType = "SatMon";
    // Find the Saturday of the relevant week cycle
    if (currentDay === 6 && currentHour >= 10) {
      // It's Saturday >= 10:00, start is today
      sectionStart = nowSofia;
    } else if (currentDay === 0) {
      // It's Sunday, start was yesterday
      sectionStart = addDays(nowSofia, -1);
    } else if (currentDay === 1) {
      // It's Monday, start was 2 days ago
      sectionStart = addDays(nowSofia, -2);
    } else {
      // It's Tuesday < 10:00, start was 3 days ago
      sectionStart = addDays(nowSofia, -3);
      // Adjust reference date for week calculation if needed (e.g., if Tue is start of ISO week)
      referenceDateForWeek = sectionStart;
    }
    // End date is always the Monday of this cycle
    sectionEnd = addDays(sectionStart, 2); // Saturday + 2 days = Monday
  } else {
    sectionType = "TueFri";
    // Find the Tuesday of the relevant week cycle
    if (currentDay === 2 && currentHour >= 10) {
      // It's Tuesday >= 10:00, start is today
      sectionStart = nowSofia;
    } else if (currentDay === 3) {
      // It's Wednesday, start was yesterday
      sectionStart = addDays(nowSofia, -1);
    } else if (currentDay === 4) {
      // It's Thursday, start was 2 days ago
      sectionStart = addDays(nowSofia, -2);
    } else if (currentDay === 5) {
      // It's Friday, start was 3 days ago
      sectionStart = addDays(nowSofia, -3);
    } else {
      // It's Saturday < 10:00, start was 4 days ago
      sectionStart = addDays(nowSofia, -4);
      // Adjust reference date for week calculation
      referenceDateForWeek = sectionStart;
    }
    // End date is always the Friday of this cycle
    sectionEnd = addDays(sectionStart, 3); // Tuesday + 3 days = Friday
  }

  // Generate date strings (YYYY-MM-DD) for the section
  const dates: string[] = [];
  let currentDate = sectionStart;
  while (
    isBefore(currentDate, sectionEnd) ||
    isEqual(currentDate, sectionEnd)
  ) {
    dates.push(format(currentDate, "yyyy-MM-dd", { timeZone: SOFIA_TIMEZONE }));
    currentDate = addDays(currentDate, 1);
  }

  // Create the section ID using the week number of the reference date
  // Using referenceDateForWeek ensures consistency if the section spans across ISO week boundaries
  const weekNumber = getISOWeek(referenceDateForWeek);
  const year = getYear(referenceDateForWeek);
  const sectionId = `${year}-W${String(weekNumber).padStart(
    2,
    "0",
  )}-${sectionType}`;

  return {
    dates: dates,
    sectionId: sectionId,
    startDate: sectionStart, // Keep returning Date objects if useful elsewhere
    endDate: sectionEnd,
  };
}
// --- End Helper Functions ---

/**
 * Fetches football scores and odds from RapidAPI for given leagues and date range.
 * Uses date-based endpoints for both fixtures and odds to minimize API calls.
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

  // --- Step 1: Fetch Fixtures by Date ---
  const fixtureUrls = dateRangeInfo.dates.map(
    (date) => `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${date}`,
  );

  console.log(`Fetching fixtures for dates: ${dateRangeInfo.dates.join(", ")}`);
  const fixturePromises = fixtureUrls.map((url) => fetch(url, options));
  const fixtureResponses = await Promise.all(fixturePromises);

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
  console.log(
    `Found ${allFixtures.length} initial fixtures across ${dateRangeInfo.dates.length} dates.`,
  );

  // --- Step 2: Fetch Odds by Date ---
  const oddsUrls = dateRangeInfo.dates.map(
    // Fetch odds for the specific bookmaker and bet type for the whole date
    (date) =>
      `https://api-football-v1.p.rapidapi.com/v3/odds?date=${date}&bookmaker=${TARGET_BOOKMAKER_ID}&bet=${MATCH_WINNER_BET_ID}`,
  );

  console.log(`Fetching odds for dates: ${dateRangeInfo.dates.join(", ")}`);
  const oddsPromises = oddsUrls.map((url) => fetch(url, options));
  const oddsResponses = await Promise.all(oddsPromises);

  const oddsResults: OddsResponse[] = await Promise.all(
    oddsResponses.map(async (res, index) => {
      if (!res.ok) {
        // Log error but don't stop the process
        console.error(
          `Error fetching odds for date ${dateRangeInfo.dates[index]}: ${res.status} ${res.statusText}`,
        );
        const errorBody = await res.text();
        console.error("Error body:", errorBody);
        return { response: [] }; // Return empty response on error
      }
      try {
        return (await res.json()) as OddsResponse;
      } catch (e) {
        console.error(
          `Error parsing odds JSON for date ${dateRangeInfo.dates[index]}:`,
          e,
        );
        return { response: [] }; // Return empty response on JSON parse error
      }
    }),
  );

  // --- Step 3: Process Odds into a Map for Efficient Lookup ---
  const oddsMap = new Map<
    number,
    { home: string | null; draw: string | null; away: string | null }
  >();
  let oddsProcessedCount = 0;

  oddsResults.forEach((result) => {
    if (result.response && Array.isArray(result.response)) {
      result.response.forEach((oddsFixture) => {
        const fixtureId = oddsFixture.fixture.id;
        // Find the target bookmaker (should be the only one if API call included it)
        const bookmakerData = oddsFixture.bookmakers?.find(
          (b) => b.id === TARGET_BOOKMAKER_ID,
        );
        // Find the target bet type (should be the only one if API call included it)
        const matchWinnerBet = bookmakerData?.bets?.find(
          (b) => b.id === MATCH_WINNER_BET_ID,
        );

        if (matchWinnerBet?.values) {
          const homeOdd =
            matchWinnerBet.values.find((v) => v.value === "Home")?.odd ?? null;
          const drawOdd =
            matchWinnerBet.values.find((v) => v.value === "Draw")?.odd ?? null;
          const awayOdd =
            matchWinnerBet.values.find((v) => v.value === "Away")?.odd ?? null;

          // Only store if all three odds are present
          if (homeOdd && drawOdd && awayOdd) {
            oddsMap.set(fixtureId, {
              home: homeOdd,
              draw: drawOdd,
              away: awayOdd,
            });
            oddsProcessedCount++;
          }
        }
      });
    }
  });
  console.log(`Processed odds for ${oddsProcessedCount} fixtures into map.`);

  // --- Step 4: Combine Fixtures and Odds, Filter, Sort, and Assign Row Numbers ---
  const combinedScores: FootballScore[] = allFixtures
    .map((fixture): FootballScore | null => {
      const fixtureId = fixture.fixture.id;
      const fixtureOdds = oddsMap.get(fixtureId); // Efficient lookup

      // Skip if odds weren't found or incomplete in the map
      if (!fixtureOdds) {
        // console.log(`Skipping fixture ${fixtureId} - odds not found in map.`);
        return null;
      }

      // Construct the FootballScore object
      return {
        day: fixture.day,
        rowNumber: 0, // Placeholder
        fixtureId: fixtureId,
        startTime: fixture.fixture.date,
        status: fixture.fixture.status,
        home: fixture.teams.home,
        away: fixture.teams.away,
        score: fixture.goals,
        league: fixture.league,
        odds: fixtureOdds, // Assign the looked-up odds
      };
    })
    .filter((score): score is FootballScore => score !== null); // Filter out fixtures without odds

  console.log(`Combined ${combinedScores.length} fixtures with complete odds.`);

  // Sort by Start Time
  combinedScores.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  // Assign Final Row Numbers
  combinedScores.forEach((score, index) => {
    score.rowNumber = index + 1;
  });

  console.log(`Returning ${combinedScores.length} sorted scores.`);
  return combinedScores;
}
