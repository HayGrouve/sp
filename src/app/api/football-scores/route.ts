// src/app/api/football-scores/route.ts
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { footballScores } from "@/server/db/index";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leagueIdsParam = searchParams.get("leagueIds");

  try {
    // Start with a base query
    let scores = await db.select().from(footballScores);

    // Filter by league IDs if provided
    if (leagueIdsParam) {
      const leagueIds = leagueIdsParam.split(",").map(Number);

      // Since we're dealing with a JSON column, we'll filter in memory
      // after fetching the data from the database
      scores = scores.filter((score) => {
        // Extract the league ID from the JSON and check if it's in the provided array
        const leagueId = score.league.id;
        return leagueIds.includes(leagueId);
      });
    }

    // Sort by start time
    scores.sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    return NextResponse.json(scores);
  } catch (error) {
    console.error("Error fetching football scores from database:", error);
    return NextResponse.json(
      { error: "Failed to fetch football scores" },
      { status: 500 },
    );
  }
}
