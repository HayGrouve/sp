// src/app/api/cron/update-section-data/route.ts
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { apiCache, footballScores } from "@/server/db/index";
import { eq, inArray } from "drizzle-orm";
import { subMinutes } from "date-fns";
import { getDateRange, fetchFootballScores } from "@/lib/football-api";
import { LEAGUE_IDS } from "@/utils/leagueIds";

const CACHE_DURATION_MINUTES = 60; // How often this job should ideally run

export async function GET(request: Request) {
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
    const dateRangeInfo = getDateRange(); // Get current section
    console.log(`Base Data Cron: Current section: ${dateRangeInfo.sectionId}`);

    console.log("Base Data Cron: Fetching base scores with odds from API...");
    // fetchFootballScores now returns only fixtures with odds
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
      const existingFixtureIds = (
        await tx.select({ id: footballScores.fixtureId }).from(footballScores)
      ).map((f) => f.id);

      // Process fetched scores (guaranteed to have odds)
      for (const currentScore of fetchedScoresWithOdds) {
        processedFixtureIds.add(currentScore.fixtureId);

        // Upsert into footballScores table
        await tx
          .insert(footballScores)
          .values({
            fixtureId: currentScore.fixtureId,
            rowNumber: currentScore.rowNumber,
            day: currentScore.day,
            startTime: new Date(currentScore.startTime),
            status: currentScore.status, // Set initial status/score
            home: currentScore.home,
            away: currentScore.away,
            score: currentScore.score, // Set initial status/score
            league: currentScore.league,
            odds: currentScore.odds, // Set non-null odds
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
              lastUpdated: now,
              // DO NOT UPDATE status or score here
            },
          });
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
