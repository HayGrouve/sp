// src/lib/football-api.ts
import type { FootballScore } from "@/types/football-scores";
import {
  getDay,
  addDays,
  getISOWeek,
  getHours,
  parseISO,
  isBefore,
  isEqual,
  getYear,
} from "date-fns";
import { toZonedTime, format } from "date-fns-tz";

// --- Interfaces for API response shapes (Add Paging) ---
interface Paging {
  current: number;
  total: number;
}
interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: { long: string; short: string; elapsed: number | null };
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
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
}
interface ApiResponse {
  response: ApiFixture[];
  paging: Paging; // Add paging info
  results: number;
}
interface OddsValue {
  value: string;
  odd: string;
}
interface OddsBet {
  id: number;
  name: string;
  values: OddsValue[];
}
interface OddsBookmaker {
  id: number;
  name: string;
  bets: OddsBet[];
}
interface OddsFixture {
  fixture: { id: number };
  bookmakers: OddsBookmaker[];
}
interface OddsResponse {
  response: OddsFixture[];
  paging: Paging; // Add paging info
  results: number;
}
// --- End of API Interfaces ---

// --- Constants ---
const SOFIA_TIMEZONE = "Europe/Sofia";
const RAPIDAPI_HOST = "api-football-v1.p.rapidapi.com";
const MATCH_WINNER_BET_ID = 1;
const TARGET_BOOKMAKER_ID = 6;
// --- End Constants ---

// --- Helper Functions ---
function getCurrentSofiaDate(): Date {
  return toZonedTime(new Date(), SOFIA_TIMEZONE);
}
export interface DateRangeInfo {
  dates: string[];
  sectionId: string;
  startDate: Date;
  endDate: Date;
}
export function getDateRange(referenceDateInput?: Date): DateRangeInfo {
  const referenceDate = referenceDateInput
    ? toZonedTime(referenceDateInput, SOFIA_TIMEZONE)
    : getCurrentSofiaDate();
  const currentDay = getDay(referenceDate);
  const currentHour = getHours(referenceDate);
  let sectionStart: Date,
    sectionEnd: Date,
    sectionType: "SatMon" | "TueFri",
    referenceDateForWeek = referenceDate;

  const isSatMonWindow =
    (currentDay === 6 && currentHour >= 10) ||
    currentDay === 0 ||
    currentDay === 1 ||
    (currentDay === 2 && currentHour < 10);

  if (isSatMonWindow) {
    sectionType = "SatMon";
    if (currentDay === 6 && currentHour >= 10) sectionStart = referenceDate;
    else if (currentDay === 0) sectionStart = addDays(referenceDate, -1);
    else if (currentDay === 1) sectionStart = addDays(referenceDate, -2);
    else {
      sectionStart = addDays(referenceDate, -3);
      referenceDateForWeek = sectionStart;
    }
    sectionEnd = addDays(sectionStart, 2);
  } else {
    sectionType = "TueFri";
    if (currentDay === 2 && currentHour >= 10) sectionStart = referenceDate;
    else if (currentDay === 3) sectionStart = addDays(referenceDate, -1);
    else if (currentDay === 4) sectionStart = addDays(referenceDate, -2);
    else if (currentDay === 5) sectionStart = addDays(referenceDate, -3);
    else {
      sectionStart = addDays(referenceDate, -4);
      referenceDateForWeek = sectionStart;
    }
    sectionEnd = addDays(sectionStart, 3);
  }

  const dates: string[] = [];
  let currentDate = sectionStart;
  while (
    isBefore(currentDate, sectionEnd) ||
    isEqual(currentDate, sectionEnd)
  ) {
    dates.push(format(currentDate, "yyyy-MM-dd", { timeZone: SOFIA_TIMEZONE }));
    currentDate = addDays(currentDate, 1);
  }

  const weekNumber = getISOWeek(referenceDateForWeek);
  const year = getYear(referenceDateForWeek);
  const sectionId = `${year}-W${String(weekNumber).padStart(2, "0")}-${sectionType}`;

  return { dates, sectionId, startDate: sectionStart, endDate: sectionEnd };
}
// --- End Helper Functions ---

/**
 * Helper function to fetch all pages for a given API endpoint URL.
 */
async function fetchAllPages<
  // Constraint: T must have a 'response' array, 'paging' info, and 'results'
  T extends { response: R[]; paging: Paging; results: number },
  // Infer the type of the elements within the 'response' array
  R = T["response"][number],
>(
  initialUrl: string,
  options: RequestInit,
  entityName: string, // For logging (e.g., "fixtures", "odds")
): Promise<R[]> {
  // Return an array of the inferred element type R
  let currentPage = 1;
  let totalPages = 1;
  // Use the inferred element type R for the accumulator array
  let allResponses: R[] = [];

  console.log(
    `(fetchAllPages - ${entityName}) Fetching page ${currentPage} from ${initialUrl}`,
  );
  const initialRes = await fetch(initialUrl, options);

  if (!initialRes.ok) {
    console.error(
      `(fetchAllPages - ${entityName}) Error fetching page ${currentPage}: ${initialRes.status} ${initialRes.statusText}`,
    );
    return []; // Return empty on initial fetch error
  }

  try {
    const initialData = (await initialRes.json()) as T;
    if (initialData.response) {
      // Assign directly as initialData.response matches R[]
      allResponses = initialData.response;
    }
    totalPages = initialData.paging?.total ?? 1;
    console.log(
      `(fetchAllPages - ${entityName}) Page ${currentPage}/${totalPages} fetched. Results: ${initialData.results ?? "N/A"}`,
    ); // Use results if available

    // Fetch subsequent pages if necessary
    for (currentPage = 2; currentPage <= totalPages; currentPage++) {
      const pageUrl = `${initialUrl}&page=${currentPage}`;
      console.log(
        `(fetchAllPages - ${entityName}) Fetching page ${currentPage}/${totalPages} from ${pageUrl}`,
      );
      const pageRes = await fetch(pageUrl, options);

      if (!pageRes.ok) {
        console.error(
          `(fetchAllPages - ${entityName}) Error fetching page ${currentPage}: ${pageRes.status} ${pageRes.statusText}`,
        );
        continue;
      }

      try {
        const pageData = (await pageRes.json()) as T;
        if (pageData.response) {
          // Concatenate arrays of type R
          allResponses = allResponses.concat(pageData.response);
        }
        console.log(
          `(fetchAllPages - ${entityName}) Page ${currentPage}/${totalPages} fetched. Results: ${pageData.results ?? "N/A"}. Total accumulated: ${allResponses.length}`,
        );
      } catch (e) {
        console.error(
          `(fetchAllPages - ${entityName}) Error parsing JSON for page ${currentPage}:`,
          e,
        );
      }
      // Optional delay
    }
  } catch (e) {
    console.error(
      `(fetchAllPages - ${entityName}) Error parsing JSON for initial page:`,
      e,
    );
  }

  return allResponses; // Returns R[]
}

// --- fetchFootballScores function ---
export async function fetchFootballScores(
  leagueIds: number[],
  dateRangeInfo: DateRangeInfo,
): Promise<FootballScore[]> {
  // Returns the application type FootballScore
  if (!process.env.RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY missing");
  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
  };

  // --- Step 1: Fetch ALL Fixtures by Date (Handles Pagination) ---
  console.log(
    `(Base Data) Fetching all pages of fixtures for dates: ${dateRangeInfo.dates.join(", ")}`,
  );
  const allFixturesPromises = dateRangeInfo.dates.map((date) =>
    // T is ApiResponse, R is inferred as ApiFixture
    fetchAllPages<ApiResponse>(
      `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${date}`,
      options,
      `fixtures-${date}`, // Logging identifier
    ),
  );
  // fixturesByDate will be Promise<(ApiFixture[])[]>
  const fixturesByDate = await Promise.all(allFixturesPromises);

  // Flatten the array: allApiFixtures will be ApiFixture[]
  let allApiFixtures: ApiFixture[] = [];
  fixturesByDate.forEach(
    (fixtures) => (allApiFixtures = allApiFixtures.concat(fixtures)),
  );

  // Filter by league ID *after* fetching all pages
  const allFilteredApiFixtures = allApiFixtures.filter((f) =>
    leagueIds.includes(f.league.id),
  );

  // Add the 'day' property
  const allFixturesWithDay: (ApiFixture & { day: string })[] =
    allFilteredApiFixtures.map((f) => ({
      ...f,
      day: format(parseISO(f.fixture.date), "EEEE, MMM d", {
        timeZone: SOFIA_TIMEZONE,
      }),
    }));

  if (allFixturesWithDay.length === 0) {
    console.log("(Base Data) No matches found for leagues.");
    return [];
  }
  console.log(
    `(Base Data) Found ${allFixturesWithDay.length} initial fixtures after league filtering.`,
  );

  // --- Step 2: Fetch ALL Odds by Date (Handles Pagination) ---
  console.log(
    `(Base Data) Fetching all pages of odds for dates: ${dateRangeInfo.dates.join(", ")}`,
  );
  const allOddsPromises = dateRangeInfo.dates.map((date) =>
    // T is OddsResponse, R is inferred as OddsFixture
    fetchAllPages<OddsResponse>(
      `https://api-football-v1.p.rapidapi.com/v3/odds?date=${date}&bookmaker=${TARGET_BOOKMAKER_ID}&bet=${MATCH_WINNER_BET_ID}`,
      options,
      `odds-${date}`, // Logging identifier
    ),
  );
  // oddsByDate will be Promise<(OddsFixture[])[]>
  const oddsByDate = await Promise.all(allOddsPromises);

  // Flatten the array: allOddsFixtures will be OddsFixture[]
  let allOddsFixtures: OddsFixture[] = [];
  oddsByDate.forEach(
    (odds) => (allOddsFixtures = allOddsFixtures.concat(odds)),
  );

  // --- Step 3: Process Odds into Map ---
  const oddsMap = new Map<
    number,
    { home: string; draw: string; away: string }
  >(); // Expect non-null strings here
  allOddsFixtures.forEach((oFix) => {
    const b = oFix.bookmakers?.find((b) => b.id === TARGET_BOOKMAKER_ID);
    const bet = b?.bets?.find((b) => b.id === MATCH_WINNER_BET_ID);
    if (bet?.values) {
      const h = bet.values.find((v) => v.value === "Home")?.odd;
      const d = bet.values.find((v) => v.value === "Draw")?.odd;
      const a = bet.values.find((v) => v.value === "Away")?.odd;
      if (h && d && a)
        oddsMap.set(oFix.fixture.id, { home: h, draw: d, away: a });
    }
  });
  console.log(
    `(Base Data) Processed odds for ${oddsMap.size} fixtures into map.`,
  );

  // --- Step 4: Combine Fixtures and Odds, FILTERING for odds, Sort, Assign Row Numbers ---
  const combinedScores: FootballScore[] = allFixturesWithDay // Final type is FootballScore
    .map((fixture): FootballScore | null => {
      // Intermediate can be null
      const fixtureId = fixture.fixture.id;
      const fixtureOdds = oddsMap.get(fixtureId); // Lookup odds

      // *** FILTERING STEP ***: Skip if odds weren't found in the map
      if (!fixtureOdds) {
        return null;
      }

      // Construct the object - odds are guaranteed non-null here
      // Ensure the structure matches the application-level FootballScore type
      return {
        day: fixture.day,
        rowNumber: 0, // Placeholder
        fixtureId: fixtureId,
        startTime: fixture.fixture.date, // Use Date object
        status: fixture.fixture.status,
        home: fixture.teams.home,
        away: fixture.teams.away,
        score: fixture.goals,
        league: fixture.league,
        odds: fixtureOdds, // Assign the non-null odds
      };
    })
    .filter((score): score is FootballScore => score !== null); // Type predicate removes nulls

  console.log(
    `(Base Data) Combined ${combinedScores.length} fixtures WITH complete odds.`,
  );

  // Sort by Start Time
  combinedScores.sort(
    (a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime(),
  );

  // Assign Final Row Numbers
  combinedScores.forEach((score, index) => {
    score.rowNumber = index + 1;
  });

  console.log(`(Base Data) Returning ${combinedScores.length} sorted scores.`);
  return combinedScores;
}

/**
 * Fetches ONLY live football scores from RapidAPI.
 * Uses the /fixtures?live=... endpoint. PAGINATION IS NOT EXPECTED/HANDLED HERE.
 * The 'live' endpoint typically returns only currently active games, unlikely to be paginated.
 */
export async function fetchLiveFixtures(
  leagueIds: number[],
): Promise<ApiFixture[]> {
  if (!process.env.RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY missing");

  const liveFilter = leagueIds.join("-"); // Check API limits for length
  const initialUrl = `https://api-football-v1.p.rapidapi.com/v3/fixtures?live=${liveFilter}`;
  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
  };

  console.log(
    `(Live Data) Fetching all pages of live fixtures for ${leagueIds.length} leagues...`,
  );

  try {
    // Use fetchAllPages to handle potential pagination for the live endpoint
    // T is ApiResponse, R is inferred as ApiFixture
    const allLiveFixtures: ApiFixture[] = await fetchAllPages<ApiResponse>(
      initialUrl,
      options,
      `live-${liveFilter.substring(0, 50)}`, // Create a logging identifier
    );

    console.log(
      `(Live Data) Found ${allLiveFixtures.length} total live fixtures across all pages.`,
    );
    return allLiveFixtures;
  } catch (error) {
    // Error during fetchAllPages execution (e.g., initial fetch failed hard)
    console.error("(Live Data) Error fetching live fixtures:", error);
    return [];
  }
}
