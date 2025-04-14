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

// --- Interfaces for API response shapes ---
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
 * Fetches BASE football scores and odds from RapidAPI for given leagues and date range.
 * Uses date-based endpoints. FILTERS OUT fixtures with missing odds.
 * Assigns sequential row numbers after sorting.
 * Returns the type FootballScore (where odds are guaranteed non-null).
 */
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

  // --- Step 1: Fetch Fixtures by Date ---
  const fixtureUrls = dateRangeInfo.dates.map(
    (d) => `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${d}`,
  );
  console.log(
    `(Base Data) Fetching fixtures for dates: ${dateRangeInfo.dates.join(", ")}`,
  );
  const fixturePromises = fixtureUrls.map((url) => fetch(url, options));
  const fixtureResponses = await Promise.all(fixturePromises);
  const fixtureResults: ApiResponse[] = await Promise.all(
    fixtureResponses.map(async (res, i) => {
      if (!res.ok) {
        console.error(
          `Error fixtures ${dateRangeInfo.dates[i]}: ${res.status}`,
        );
        return { response: [] };
      }
      try {
        return (await res.json()) as ApiResponse;
      } catch (e) {
        console.error(`Error JSON fixtures ${dateRangeInfo.dates[i]}:`, e);
        return { response: [] };
      }
    }),
  );

  let allFixtures: (ApiFixture & { day: string })[] = [];
  fixtureResults.forEach((result, index) => {
    if (result.response) {
      const filtered = result.response.filter((f) =>
        leagueIds.includes(f.league.id),
      );
      allFixtures = [
        ...allFixtures,
        ...filtered.map((f) => ({
          ...f,
          day: format(parseISO(f.fixture.date), "EEEE, MMM d", {
            timeZone: SOFIA_TIMEZONE,
          }),
        })),
      ];
    }
  });
  if (allFixtures.length === 0) {
    console.log("(Base Data) No matches found.");
    return [];
  }
  console.log(`(Base Data) Found ${allFixtures.length} initial fixtures.`);

  // --- Step 2: Fetch Odds by Date ---
  const oddsUrls = dateRangeInfo.dates.map(
    (d) =>
      `https://api-football-v1.p.rapidapi.com/v3/odds?date=${d}&bookmaker=${TARGET_BOOKMAKER_ID}&bet=${MATCH_WINNER_BET_ID}`,
  );
  console.log(
    `(Base Data) Fetching odds for dates: ${dateRangeInfo.dates.join(", ")}`,
  );
  const oddsPromises = oddsUrls.map((url) => fetch(url, options));
  const oddsResponses = await Promise.all(oddsPromises);
  const oddsResults: OddsResponse[] = await Promise.all(
    oddsResponses.map(async (res, i) => {
      if (!res.ok) {
        console.error(`Error odds ${dateRangeInfo.dates[i]}: ${res.status}`);
        return { response: [] };
      }
      try {
        return (await res.json()) as OddsResponse;
      } catch (e) {
        console.error(`Error JSON odds ${dateRangeInfo.dates[i]}:`, e);
        return { response: [] };
      }
    }),
  );

  // --- Step 3: Process Odds into Map ---
  const oddsMap = new Map<
    number,
    { home: string; draw: string; away: string }
  >(); // Expect non-null strings here
  oddsResults.forEach((result) => {
    if (result.response) {
      result.response.forEach((oFix) => {
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
    }
  });
  console.log(
    `(Base Data) Processed odds for ${oddsMap.size} fixtures into map.`,
  );

  // --- Step 4: Combine Fixtures and Odds, FILTERING for odds, Sort, Assign Row Numbers ---
  const combinedScores: FootballScore[] = allFixtures // Final type is FootballScore
    .map((fixture): FootballScore | null => {
      // Intermediate can be null
      const fixtureId = fixture.fixture.id;
      const fixtureOdds = oddsMap.get(fixtureId); // Lookup odds

      // *** FILTERING STEP ***: Skip if odds weren't found in the map
      if (!fixtureOdds) {
        return null;
      }

      // Construct the object - odds are guaranteed non-null here
      return {
        day: fixture.day,
        rowNumber: 0,
        fixtureId: fixtureId,
        startTime: fixture.fixture.date,
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
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
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
 * Uses the /fixtures?live=... endpoint, filtered by league IDs.
 */
export async function fetchLiveFixtures(
  leagueIds: number[],
): Promise<ApiFixture[]> {
  if (!process.env.RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY missing");
  const liveFilter = leagueIds.join("-"); // Check API limits for length
  const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures?live=${liveFilter}`;
  console.log(
    `(Live Data) Fetching live fixtures for ${leagueIds.length} leagues...`,
  );
  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      console.error(`(Live Data) Error fetching live: ${response.status}`);
      return [];
    }
    const data = (await response.json()) as ApiResponse;
    return data.response ?? [];
  } catch (error) {
    console.error("(Live Data) Network error fetching live:", error);
    return [];
  }
}
