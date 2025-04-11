import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { apiCache, footballScores, forecastHistory } from "@/server/db/index"; // Use schema directly
import { eq, and, not, inArray } from "drizzle-orm";
import { subMinutes } from "date-fns";
import { getDateRange, fetchFootballScores } from "@/lib/football-api";
import { rowForecastMap } from "@/utils/rowForecastMap"; // Ensure this path is correct

// Define your league IDs (consider moving to config or DB)
const LEAGUE_IDS = [
  39, 40, 41, 42, 43, 49, 50, 51, 48, 45, 140, 556, 141, 135, 547, 136, 78, 79,
  529, 61, 62, 63, 66, 188, 179, 180, 183, 184, 103, 104, 113, 114, 94, 95, 119,
  120, 88, 245, 244, 98, 99, 292, 253, 219, 144, 207, 197, 203, 172, 71, 72,
  128, 129, 271, 383, 283, 345, 262, 263, 106, 235, 848, 1, 2, 3, 4,
];

// This should be protected in production (e.g., check CRON_SECRET env var)
export async function GET(request: Request) {
  // Optional: Add secret key check for security
  // const secret = request.headers.get('Authorization')?.split(' ')[1];
  // if (secret !== process.env.CRON_SECRET) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  try {
    console.log("Cron job started...");
    const now = new Date();
    const cacheKey = "football_scores_cron"; // Use a specific key for cron

    // --- Cache Check ---
    const cacheEntry = await db.query.apiCache.findFirst({
      where: eq(apiCache.key, cacheKey),
    });
    const oneMinuteAgo = subMinutes(now, 1);

    if (cacheEntry && new Date(cacheEntry.lastFetched) > oneMinuteAgo) {
      console.log("Skipped update, last fetch was less than a minute ago.");
      return NextResponse.json({
        message: "Skipped update, last fetch was less than a minute ago",
      });
    }

    // --- Fetch Data ---
    console.log("Fetching date range...");
    const dateRangeInfo = getDateRange();
    const currentSectionId = dateRangeInfo.sectionId;
    console.log(`Current section: ${currentSectionId}`);

    console.log("Fetching football scores from API...");
    const fetchedScores = await fetchFootballScores(LEAGUE_IDS, dateRangeInfo);
    console.log(`Fetched ${fetchedScores.length} scores from API.`);

    // --- Database Transaction ---
    console.log("Starting database transaction...");
    await db.transaction(async (tx) => {
      const processedFixtureIds = new Set<number>();

      // Get existing scores for comparison (only need fixtureId and status)
      const existingScoresMap = new Map<
        number,
        { status: { short: string } }
      >();
      const existingDbScores = await tx.query.footballScores.findMany({
        columns: { fixtureId: true, status: true },
      });
      existingDbScores.forEach((s) => existingScoresMap.set(s.fixtureId, s));
      console.log(`Found ${existingScoresMap.size} existing scores in DB.`);

      // Process fetched scores
      for (const currentScore of fetchedScores) {
        processedFixtureIds.add(currentScore.fixtureId);
        const existingScore = existingScoresMap.get(currentScore.fixtureId);

        // Upsert into footballScores table
        await tx
          .insert(footballScores)
          .values({
            fixtureId: currentScore.fixtureId,
            rowNumber: currentScore.rowNumber,
            day: currentScore.day,
            startTime: new Date(currentScore.startTime), // Store as Date object
            status: currentScore.status,
            home: currentScore.home,
            away: currentScore.away,
            score: currentScore.score,
            league: currentScore.league,
            odds: currentScore.odds,
            lastUpdated: now,
          })
          .onConflictDoUpdate({
            target: footballScores.fixtureId, // Unique constraint
            set: {
              // Only update fields that can change during a match
              rowNumber: currentScore.rowNumber, // Row number might change if sorting changes mid-section
              day: currentScore.day, // Day might change if API corrects it? Unlikely but possible.
              status: currentScore.status,
              score: currentScore.score,
              odds: currentScore.odds, // Odds might update pre-match
              lastUpdated: now,
            },
          });

        // --- Prediction Checking Logic ---
        const justFinished =
          currentScore.status.short === "FT" &&
          existingScore?.status.short !== "FT";

        if (justFinished) {
          console.log(`Fixture ${currentScore.fixtureId} just finished.`);
          const forecast = getForecast(currentScore.rowNumber);
          if (
            forecast &&
            currentScore.score.home !== null &&
            currentScore.score.away !== null
          ) {
            const isCorrect = isForecastCorrect(currentScore.score, forecast);
            const actualOutcome = determineActualOutcome(currentScore.score);
            console.log(
              ` -> Forecast: ${forecast}, Actual: ${actualOutcome}, Correct: ${isCorrect}`,
            );

            // Insert/Update forecastHistory
            await tx
              .insert(forecastHistory)
              .values({
                fixtureId: currentScore.fixtureId,
                rowNumber: currentScore.rowNumber,
                weekSectionId: currentSectionId,
                forecast: forecast,
                isCorrect: isCorrect,
                actualOutcome: actualOutcome,
                // createdAt defaults
              })
              .onConflictDoUpdate({
                // Unique constraint on (fixtureId, weekSectionId)
                target: [
                  forecastHistory.fixtureId,
                  forecastHistory.weekSectionId,
                ],
                set: {
                  // Update if somehow it was inserted before finishing? Unlikely but safe.
                  isCorrect: isCorrect,
                  actualOutcome: actualOutcome,
                  rowNumber: currentScore.rowNumber, // Update rowNumber in case it changed
                  forecast: forecast, // Update forecast in case map changed?
                },
              });
          } else if (forecast) {
            console.log(
              ` -> Fixture ${currentScore.fixtureId} finished but score is null. Cannot check forecast.`,
            );
          } else {
            console.log(
              ` -> Fixture ${currentScore.fixtureId} finished but no forecast found for row ${currentScore.rowNumber}.`,
            );
          }
        }
      } // End of loop

      // --- Handle Deletion of Old Fixtures ---
      // Delete fixtures from footballScores that were NOT in the latest fetch for this section
      const idsToDelete = Array.from(existingScoresMap.keys()).filter(
        (id) => !processedFixtureIds.has(id),
      );

      if (idsToDelete.length > 0) {
        console.log(`Deleting ${idsToDelete.length} old fixtures from DB.`);
        await tx
          .delete(footballScores)
          .where(inArray(footballScores.fixtureId, idsToDelete));
      } else {
        console.log("No old fixtures to delete.");
      }

      // --- Update apiCache ---
      if (cacheEntry) {
        await tx
          .update(apiCache)
          .set({ lastFetched: now })
          .where(eq(apiCache.key, cacheKey));
      } else {
        await tx.insert(apiCache).values({
          key: cacheKey,
          lastFetched: now,
        });
      }
      console.log("Database transaction committed.");
    }); // End of transaction

    console.log("Cron job finished successfully.");
    return NextResponse.json({
      message: `Successfully updated/processed ${fetchedScores.length} football scores for section ${currentSectionId}`,
    });
  } catch (error) {
    console.error("Error in cron job:", error);
    return NextResponse.json(
      { error: "Failed to update football scores" },
      { status: 500 },
    );
  }
}

// --- Helper Functions ---
function getForecast(rowNumber: number): string | null {
  // Ensure rowForecastMap is imported correctly
  const forecastItem = rowForecastMap.find(
    (item) => item.rowNumber === rowNumber,
  );
  return forecastItem ? forecastItem.forecast : null;
}

function isForecastCorrect(
  score: { home: number | null; away: number | null },
  forecast: string,
): boolean {
  // Ensure score values are numbers
  if (typeof score.home !== "number" || typeof score.away !== "number") {
    return false;
  }
  const homeWin = score.home > score.away;
  const awayWin = score.home < score.away;
  const draw = score.home === score.away;
  switch (forecast) {
    case "1/X":
      return homeWin || draw;
    case "1/2":
      return homeWin || awayWin;
    case "X/2":
      return draw || awayWin;
    default:
      console.warn(`Unknown forecast type encountered: ${forecast}`);
      return false;
  }
}

function determineActualOutcome(score: {
  home: number | null;
  away: number | null;
}): string | null {
  if (typeof score.home !== "number" || typeof score.away !== "number") {
    return null;
  }
  if (score.home > score.away) return "1";
  if (score.home < score.away) return "2";
  return "X";
}
