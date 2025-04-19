// src/app/api/cron/update-live-scores/route.ts
import { NextResponse } from "next/server";
import { db } from "@/server/db"; // Adjust import path if needed
import { footballScores } from "@haygrouve/db-schema"; // Adjust import path - only need footballScores table
import { eq } from "drizzle-orm";
import { fetchLiveFixtures } from "@/lib/football-api"; // Adjust import path
import { LEAGUE_IDS } from "@/utils/leagueIds"; // Adjust import path

export async function GET(request: Request) {
  // Optional: Add secret key check
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

    // --- Process Live Fixtures ---
    // No transaction needed usually for simple updates unless high contention expected
    for (const liveFixture of liveFixtures) {
      const fixtureId = liveFixture.fixture.id;
      const currentStatus = liveFixture.fixture.status;
      const currentScore = liveFixture.goals;

      // Update only status, score, and lastUpdated in the database
      // Use .returning() to see if a row was actually updated (optional)
      const result = await db
        .update(footballScores)
        .set({
          status: currentStatus,
          score: currentScore,
          lastUpdated: now,
        })
        .where(eq(footballScores.fixtureId, fixtureId))
        .returning({ updatedId: footballScores.id }); // Check if update happened

      if (result.length > 0) {
        updatedCount++;
      } else {
        console.warn(
          `Live Scores Cron: Fixture ${fixtureId} is live but update didn't affect any row in DB.`,
        );
      }

      // --- NO Prediction Checking Logic HERE ---
    } // End of loop

    console.log(
      `Live Scores Cron: Attempted updates for ${liveFixtures.length} fixtures. Successfully updated ${updatedCount} rows.`,
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
