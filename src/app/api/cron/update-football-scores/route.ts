import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { apiCache, footballScores } from "@/server/db/index";
import { eq } from "drizzle-orm";
import { subMinutes } from "date-fns";

// Reuse your existing API fetching logic
import { getDateRange, fetchFootballScores } from "@/lib/football-api";

// This should be protected with a secret token in production
export async function GET(request: Request) {
  try {
    // Check if we've fetched within the last minute
    const cacheKey = "football_scores";
    const cacheEntry = await db.query.apiCache.findFirst({
      where: eq(apiCache.key, cacheKey),
    });

    const now = new Date();
    const oneMinuteAgo = subMinutes(now, 1);

    // If we have a cache entry and it's less than a minute old, skip fetching
    if (cacheEntry && new Date(cacheEntry.lastFetched) > oneMinuteAgo) {
      return NextResponse.json({
        message: "Skipped update, last fetch was less than a minute ago",
      });
    }

    // Get league IDs (you might want to store these in your database or env vars)
    const leagueIds = [
      39, 40, 41, 42, 43, 49, 50, 51, 48, 45, 140, 556, 141, 135, 547, 136, 78,
      79, 529, 61, 62, 63, 66, 188, 179, 180, 183, 184, 103, 104, 113, 114, 94,
      95, 119, 120, 88, 245, 244, 98, 99, 292, 253, 219, 144, 207, 197, 203,
      172, 71, 72, 128, 129, 271, 383, 283, 345, 262, 263, 106, 235, 848, 1, 2,
      3, 4,
    ];

    // Fetch scores from RapidAPI
    const dateRange = getDateRange();
    const allScores = await fetchFootballScores(leagueIds, dateRange);

    // Update database in a transaction
    await db.transaction(async (tx) => {
      // Update or insert each score
      for (const score of allScores) {
        const existingScore = await tx.query.footballScores.findFirst({
          where: eq(footballScores.fixtureId, score.fixtureId),
        });

        if (existingScore) {
          await tx
            .update(footballScores)
            .set({
              rowNumber: score.rowNumber,
              day: score.day,
              status: score.status,
              score: score.score,
              odds: score.odds,
              lastUpdated: now,
            })
            .where(eq(footballScores.fixtureId, score.fixtureId));
        } else {
          await tx.insert(footballScores).values({
            fixtureId: score.fixtureId,
            rowNumber: score.rowNumber,
            day: score.day,
            startTime: new Date(score.startTime),
            status: score.status,
            home: score.home,
            away: score.away,
            score: score.score,
            league: score.league,
            odds: score.odds,
            lastUpdated: now,
          });
        }
      }

      // Update or insert cache entry
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
    });

    return NextResponse.json({
      message: `Successfully updated ${allScores.length} football scores`,
    });
  } catch (error) {
    console.error("Error updating football scores:", error);
    return NextResponse.json(
      { error: "Failed to update football scores" },
      { status: 500 },
    );
  }
}
