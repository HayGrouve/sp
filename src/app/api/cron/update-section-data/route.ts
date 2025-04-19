// src/app/api/cron/update-section-data/route.ts
import { NextResponse } from "next/server";
import { db } from "@/server/db"; // Adjust import path if needed
// --- Add forecastHistory back ---
import {
  apiCache,
  footballScores,
  forecastHistory,
} from "@haygrouve/db-schema"; // Adjust import path
import { eq, not, inArray } from "drizzle-orm";
import { subMinutes } from "date-fns";
// --- Import getDateRange and fetchFootballScores ---
import { getDateRange, fetchFootballScores } from "@/lib/football-api"; // Adjust import path
// --- Import prediction utils ---
import { rowForecastMap } from "@/utils/rowForecastMap"; // Adjust import path
import { LEAGUE_IDS } from "@/utils/leagueIds"; // Adjust import path

const CACHE_DURATION_MINUTES = 15; // How often this job should ideally run

export async function GET(request: Request) {
  // Optional: Add secret key check
  console.log("Base Data Cron: Job started...");
  const now = new Date();
  const cacheKey = "football_scores_base_data";

  // --- Cache Check ---
  const cacheEntry = await db.query.apiCache.findFirst({
    where: eq(apiCache.key, cacheKey),
  });
  const cacheExpiredTime = subMinutes(now, CACHE_DURATION_MINUTES);
  if (cacheEntry && new Date(cacheEntry.lastFetched) > cacheExpiredTime) {
    console.log(
      `Base Data Cron: Skipped update, last fetch < ${CACHE_DURATION_MINUTES} min ago.`,
    );
    return NextResponse.json({
      message: `Skipped update, last fetch was recent.`,
    });
  }

  try {
    // --- Fetch Data ---
    console.log("Base Data Cron: Fetching date range...");
    const dateRangeInfo = getDateRange(); // Get current section info
    console.log(`Base Data Cron: Current section: ${dateRangeInfo.sectionId}`);

    console.log("Base Data Cron: Fetching base scores with odds from API...");
    // fetchFootballScores returns only fixtures with odds and startTime as Date
    const fetchedScoresWithOdds = await fetchFootballScores(
      LEAGUE_IDS,
      dateRangeInfo,
    );
    console.log(
      `Base Data Cron: Fetched ${fetchedScoresWithOdds.length} scores WITH odds.`,
    );

    // --- Database Transaction ---
    console.log("Base Data Cron: Starting DB transaction...");
    await db.transaction(async (tx) => {
      const processedFixtureIds = new Set<number>();
      // Get previous state for ALL fixtures currently in DB for comparison
      const existingScoresMap = new Map<
        number,
        {
          status: { short: string };
          score: { home: number | null; away: number | null };
        }
      >();
      const existingDbScores = await tx.query.footballScores.findMany({
        columns: { fixtureId: true, status: true, score: true }, // Fetch status/score for comparison
      });
      existingDbScores.forEach((s) =>
        existingScoresMap.set(s.fixtureId, {
          status: s.status,
          score: s.score,
        }),
      );
      const existingFixtureIds = Array.from(existingScoresMap.keys()); // Get IDs before loop

      let finishedCount = 0;
      let historySavedCount = 0;

      // Process fetched scores
      for (const currentScore of fetchedScoresWithOdds) {
        const fixtureId = currentScore.fixtureId;
        processedFixtureIds.add(fixtureId);
        const existingData = existingScoresMap.get(fixtureId);
        const previousStatusShort = existingData?.status?.short;
        const currentStatus = currentScore.status;

        // Upsert into footballScores table
        await tx
          .insert(footballScores)
          .values({
            fixtureId: fixtureId,
            rowNumber: currentScore.rowNumber,
            day: currentScore.day,
            startTime: new Date(currentScore.startTime),
            status: currentStatus,
            home: currentScore.home,
            away: currentScore.away,
            score: currentScore.score,
            league: currentScore.league,
            odds: currentScore.odds,
            lastUpdated: now,
          })
          .onConflictDoUpdate({
            target: footballScores.fixtureId,
            set: {
              rowNumber: currentScore.rowNumber,
              day: currentScore.day,
              startTime: new Date(currentScore.startTime),
              home: currentScore.home,
              away: currentScore.away,
              league: currentScore.league,
              odds: currentScore.odds,
              status: currentStatus, // Update status/score here as well
              score: currentScore.score,
              lastUpdated: now,
            },
          });

        // --- Prediction Checking Logic (MOVED HERE) ---
        const justFinished =
          currentStatus.short === "FT" && previousStatusShort !== "FT";

        if (justFinished) {
          finishedCount++;
          console.log(
            `Base Data Cron: Fixture ${fixtureId} detected as finished.`,
          );

          // Determine the section this fixture BELONGED TO
          let fixtureSectionId: string | null = null;
          let fixtureSectionType: "SatMon" | "TueFri" | null = null;
          try {
            const fixtureStartDate = new Date(currentScore.startTime); // Convert to Date object
            const sectionInfo = getDateRange(fixtureStartDate);
            fixtureSectionId = sectionInfo.sectionId;
            fixtureSectionType = sectionInfo.sectionId.endsWith("-SatMon")
              ? "SatMon"
              : "TueFri";
            console.log(
              ` -> Fixture ${fixtureId} belongs to section: ${fixtureSectionId}`,
            );
          } catch (e) {
            console.error(
              ` -> Error determining section for fixture ${fixtureId}:`,
              e,
            );
          }

          // --- SAVE HISTORY ONLY IF IT BELONGS TO A SatMon SECTION ---
          if (fixtureSectionId && fixtureSectionType === "SatMon") {
            const rowNumber = currentScore.rowNumber; // Use rowNumber from fetched data
            const forecast = getForecast(rowNumber);

            if (
              forecast &&
              typeof currentScore.score.home === "number" &&
              typeof currentScore.score.away === "number"
            ) {
              const isCorrect = isForecastCorrect(currentScore.score, forecast);
              const actualOutcome = determineActualOutcome(currentScore.score);
              console.log(
                ` -> SatMon Section. Row: ${rowNumber}, Forecast: ${forecast}, Actual: ${actualOutcome}, Correct: ${isCorrect}. Saving history...`,
              );

              await tx
                .insert(forecastHistory)
                .values({
                  fixtureId: fixtureId,
                  rowNumber: rowNumber,
                  weekSectionId: fixtureSectionId,
                  forecast: forecast,
                  isCorrect: isCorrect,
                  actualOutcome: actualOutcome,
                })
                .onConflictDoUpdate({
                  target: [
                    forecastHistory.fixtureId,
                    forecastHistory.weekSectionId,
                  ],
                  set: {
                    isCorrect: isCorrect,
                    actualOutcome: actualOutcome,
                    rowNumber: rowNumber,
                    forecast: forecast,
                  },
                });
              historySavedCount++;
            } else {
              /* Log missing forecast or invalid score */
            }
          } else {
            console.log(
              ` -> Fixture ${fixtureId} finished but not in SatMon section (${fixtureSectionId}). Skipping history save.`,
            );
          }
        } // end if(justFinished)
      } // End of loop

      // --- Handle Deletion of Old Fixtures ---
      const idsToDelete = existingFixtureIds.filter(
        (id) => !processedFixtureIds.has(id),
      );
      if (idsToDelete.length > 0) {
        console.log(
          `Base Data Cron: Deleting ${idsToDelete.length} old fixtures.`,
        );
        await tx
          .delete(footballScores)
          .where(inArray(footballScores.fixtureId, idsToDelete));
      } else {
        console.log("Base Data Cron: No old fixtures to delete.");
      }

      // --- Update apiCache ---
      if (cacheEntry) {
        await tx
          .update(apiCache)
          .set({ lastFetched: now })
          .where(eq(apiCache.key, cacheKey));
      } else {
        await tx.insert(apiCache).values({ key: cacheKey, lastFetched: now });
      }

      console.log(
        `Base Data Cron: ${finishedCount} finished. ${historySavedCount} history records saved/updated.`,
      );
      console.log("Base Data Cron: DB transaction committed.");
    }); // End of transaction

    console.log("Base Data Cron: Job finished successfully.");
    return NextResponse.json({
      message: `Successfully updated base data for section ${dateRangeInfo.sectionId}`,
    });
  } catch (error) {
    console.error("Base Data Cron: Error:", error);
    return NextResponse.json(
      { error: "Failed to update base football scores" },
      { status: 500 },
    );
  }
}

// --- Helper Functions (Copied from original live job) ---
function getForecast(rowNumber: number): string | null {
  const item = rowForecastMap.find((i) => i.rowNumber === rowNumber);
  return item ? item.forecast : null;
}
function isForecastCorrect(
  score: { home: number | null; away: number | null },
  forecast: string,
): boolean {
  if (typeof score.home !== "number" || typeof score.away !== "number")
    return false;
  const hW = score.home > score.away,
    aW = score.home < score.away,
    d = score.home === score.away;
  switch (forecast) {
    case "1/X":
      return hW || d;
    case "1/2":
      return hW || aW;
    case "X/2":
      return d || aW;
    default:
      return false;
  }
}
function determineActualOutcome(score: {
  home: number | null;
  away: number | null;
}): string | null {
  if (typeof score.home !== "number" || typeof score.away !== "number")
    return null;
  if (score.home > score.away) return "1";
  if (score.home < score.away) return "2";
  return "X";
}
