// src/app/api/cron/update-live-scores/route.ts
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { footballScores, forecastHistory } from "@/server/db/index";
import { eq } from "drizzle-orm";
import { fetchLiveFixtures, getDateRange } from "@/lib/football-api";
import { rowForecastMap } from "@/utils/rowForecastMap";
import { LEAGUE_IDS } from "@/utils/leagueIds";

export async function GET(request: Request) {
  console.log("Live Scores Cron: Job started...");
  const now = new Date();

  try {
    // --- Fetch Live Data ---
    const liveFixtures = await fetchLiveFixtures(LEAGUE_IDS);
    console.log(
      `Live Scores Cron: Fetched ${liveFixtures.length} live fixtures.`,
    );

    if (liveFixtures.length === 0) {
      console.log("Live Scores Cron: No live fixtures found. Exiting.");
      return NextResponse.json({ message: "No live fixtures to update." });
    }

    let updatedCount = 0;
    let finishedCount = 0;
    let historySavedCount = 0;

    for (const liveFixture of liveFixtures) {
      const fixtureId = liveFixture.fixture.id;
      const currentStatus = liveFixture.fixture.status;
      const currentScore = liveFixture.goals;

      // Get previous state (status, rowNumber, startTime) from DB
      const existingData = await db.query.footballScores.findFirst({
        where: eq(footballScores.fixtureId, fixtureId),
        columns: { status: true, rowNumber: true, startTime: true },
      });

      if (!existingData) {
        console.warn(
          `Live Scores Cron: Fixture ${fixtureId} is live but not in DB (might be missing odds initially). Skipping update.`,
        );
        continue; // Skip if base data job filtered it out
      }

      const previousStatusShort = existingData.status?.short;

      // --- Update Live Status/Score in DB ---
      await db
        .update(footballScores)
        .set({
          status: currentStatus,
          score: currentScore,
          lastUpdated: now,
        })
        .where(eq(footballScores.fixtureId, fixtureId));
      updatedCount++;

      // --- Prediction Checking Logic ---
      const justFinished =
        currentStatus.short === "FT" && previousStatusShort !== "FT";

      if (justFinished) {
        finishedCount++;
        console.log(`Live Scores Cron: Fixture ${fixtureId} just finished.`);

        // Determine the section this fixture BELONGED TO
        let fixtureSectionId: string | null = null;
        let fixtureSectionType: "SatMon" | "TueFri" | null = null;
        try {
          const fixtureStartDate = existingData.startTime; // Get Date object from DB
          const sectionInfo = getDateRange(fixtureStartDate); // Pass date to get its section info
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
          const rowNumber = existingData.rowNumber;
          const forecast = getForecast(rowNumber);

          if (
            forecast &&
            typeof currentScore.home === "number" &&
            typeof currentScore.away === "number"
          ) {
            const isCorrect = isForecastCorrect(currentScore, forecast);
            const actualOutcome = determineActualOutcome(currentScore);
            console.log(
              ` -> SatMon Section. Row: ${rowNumber}, Forecast: ${forecast}, Actual: ${actualOutcome}, Correct: ${isCorrect}. Saving history...`,
            );

            await db
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
      }
    } // End of loop

    console.log(
      `Live Scores Cron: Updated ${updatedCount} fixtures. ${finishedCount} finished. ${historySavedCount} history records saved.`,
    );
    console.log("Live Scores Cron: Job finished successfully.");
    return NextResponse.json({
      message: `Successfully processed ${liveFixtures.length} live fixtures.`,
    });
  } catch (error) {
    console.error("Live Scores Cron: Error:", error);
    return NextResponse.json(
      { error: "Failed to update live scores" },
      { status: 500 },
    );
  }
}

// --- Helper Functions ---
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
