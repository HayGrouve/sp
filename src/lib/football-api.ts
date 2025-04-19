// src/lib/football-api.ts
import type { FootballScore } from "@/types/football-scores"; // Adjust import path
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

/**
 * Calculates the relevant date range and section ID based on a given reference date
 * (defaults to current time in Sofia) using the specific rotation schedule:
 * - Sat 10:00 AM to Tue 10:00 AM (Sofia): Shows Sat, Sun, Mon fixtures (sectionType 'SatMon').
 * - Tue 10:00 AM to Sat 10:00 AM (Sofia): Shows Tue, Wed, Thu, Fri fixtures (sectionType 'TueFri').
 */
export function getDateRange(referenceDateInput?: Date): DateRangeInfo {
  const referenceDate = referenceDateInput
    ? toZonedTime(referenceDateInput, SOFIA_TIMEZONE)
    : getCurrentSofiaDate();
  const currentDay = getDay(referenceDate);
  const currentHour = getHours(referenceDate);

  // Initialize return variables
  let sectionStart: Date;
  let sectionEnd: Date;
  let sectionType: "SatMon" | "TueFri";
  let referenceDateForWeek = referenceDate;

  const isSatMonWindow =
    (currentDay === 6 && currentHour >= 10) || // Saturday 10:00 onwards
    currentDay === 0 || // Sunday
    currentDay === 1 || // Monday
    (currentDay === 2 && currentHour < 10); // Tuesday before 10:00

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

  // Ensure variables are assigned (should be guaranteed by above logic)
  // This check is mostly for TypeScript's benefit if it was confused.
  if (!sectionStart || !sectionEnd || !sectionType) {
    console.error(
      "Error in getDateRange logic: section variables not assigned.",
    );
    // Provide a default fallback return to satisfy TS, although it indicates a bug
    const fallbackDate = new Date();
    return {
      dates: [format(fallbackDate, "yyyy-MM-dd")],
      sectionId: "ERROR-UNKNOWN-SECTION",
      startDate: fallbackDate,
      endDate: fallbackDate,
    };
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

  // This return statement is now definitely reached after assignments
  return { dates, sectionId, startDate: sectionStart, endDate: sectionEnd };
}
// --- End Helper Functions ---

/**
 * Helper function to fetch all pages for a given API endpoint URL.
 */
async function fetchAllPages<
  T extends { response: R[]; paging: Paging; results: number },
  R = T["response"][number],
>(initialUrl: string, options: RequestInit, entityName: string): Promise<R[]> {
  let currentPage = 1;
  let totalPages = 1;
  let allResponses: R[] = [];

  console.log(
    `(fetchAllPages - ${entityName}) Fetching page ${currentPage} from ${initialUrl}`,
  );
  const initialRes = await fetch(initialUrl, options);

  if (!initialRes.ok) {
    console.error(
      `(fetchAllPages - ${entityName}) Error fetching page ${currentPage}: ${initialRes.status} ${initialRes.statusText}`,
    );
    return [];
  }

  try {
    const initialData = (await initialRes.json()) as T;
    if (initialData.response) {
      allResponses = initialData.response;
    }
    totalPages = initialData.paging?.total ?? 1;
    console.log(
      `(fetchAllPages - ${entityName}) Page ${currentPage}/${totalPages} fetched. Results: ${initialData.results ?? "N/A"}`,
    );

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
    }
  } catch (e) {
    console.error(
      `(fetchAllPages - ${entityName}) Error parsing JSON for initial page:`,
      e,
    );
  }

  return allResponses;
}

/**
 * Fetches BASE football scores and odds from RapidAPI for given leagues and date range.
 * Handles pagination. FILTERS OUT fixtures with missing odds.
 * Assigns sequential row numbers after sorting.
 */
export async function fetchFootballScores(
  leagueIds: number[],
  dateRangeInfo: DateRangeInfo,
): Promise<FootballScore[]> {
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
    fetchAllPages<ApiResponse>(
      `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${date}`,
      options,
      `fixtures-${date}`,
    ),
  );
  const fixturesByDate = await Promise.all(allFixturesPromises);
  let allApiFixtures: ApiFixture[] = [];
  fixturesByDate.forEach(
    (fixtures) => (allApiFixtures = allApiFixtures.concat(fixtures)),
  );

  // Filter by league ID *after* fetching all pages
  const leagueFilteredApiFixtures = allApiFixtures.filter((f) =>
    leagueIds.includes(f.league.id),
  );
  console.log(
    `(Base Data) Found ${leagueFilteredApiFixtures.length} initial fixtures for leagues.`,
  );

  // Add the 'day' property based on local time
  const allFixturesWithDay: (ApiFixture & { day: string })[] =
    leagueFilteredApiFixtures.map((f) => ({
      ...f,
      day: format(parseISO(f.fixture.date), "EEEE, MMM d", {
        timeZone: SOFIA_TIMEZONE,
      }),
    }));

  if (allFixturesWithDay.length === 0) {
    console.log("(Base Data) No matches found after league filtering.");
    return [];
  }

  // --- Step 2: Fetch ALL Odds by Date (Handles Pagination) ---
  console.log(
    `(Base Data) Fetching all pages of odds for dates: ${dateRangeInfo.dates.join(", ")}`,
  );
  const allOddsPromises = dateRangeInfo.dates.map((date) =>
    fetchAllPages<OddsResponse>(
      `https://api-football-v1.p.rapidapi.com/v3/odds?date=${date}&bookmaker=${TARGET_BOOKMAKER_ID}&bet=${MATCH_WINNER_BET_ID}`,
      options,
      `odds-${date}`,
    ),
  );
  const oddsByDate = await Promise.all(allOddsPromises);
  let allOddsFixtures: OddsFixture[] = [];
  oddsByDate.forEach(
    (odds) => (allOddsFixtures = allOddsFixtures.concat(odds)),
  );

  // --- Step 3: Process Odds into Map ---
  const oddsMap = new Map<
    number,
    { home: string; draw: string; away: string }
  >();
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
  const combinedScores: FootballScore[] = allFixturesWithDay
    .map((fixture): FootballScore | null => {
      const fixtureId = fixture.fixture.id;
      const fixtureOdds = oddsMap.get(fixtureId);
      if (!fixtureOdds) return null; // Filter if no odds

      return {
        day: fixture.day,
        rowNumber: 0,
        fixtureId: fixtureId,
        startTime: fixture.fixture.date, // Keep as ISO string
        status: fixture.fixture.status,
        home: fixture.teams.home,
        away: fixture.teams.away,
        score: fixture.goals,
        league: fixture.league,
        odds: fixtureOdds,
      };
    })
    .filter((score): score is FootballScore => score !== null);

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
 * Uses the /fixtures?live=... endpoint. Handles pagination.
 */
export async function fetchLiveFixtures(
  leagueIds: number[],
): Promise<ApiFixture[]> {
  if (!process.env.RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY missing");
  const liveFilter = leagueIds.join("-");
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
    const allLiveFixtures: ApiFixture[] = await fetchAllPages<ApiResponse>(
      initialUrl,
      options,
      `live-${liveFilter.substring(0, 50)}`,
    );
    console.log(
      `(Live Data) Found ${allLiveFixtures.length} total live fixtures across all pages.`,
    );
    return allLiveFixtures;
  } catch (error) {
    console.error("(Live Data) Error fetching live fixtures:", error);
    return [];
  }
}
