// src/app/api/forecast-history/route.ts
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { forecastHistory } from "@/server/db/index";
import { inArray, desc, and } from "drizzle-orm";
import { getISOWeek, startOfWeek, subWeeks, addDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const SOFIA_TIMEZONE = "Europe/Sofia";
const WEEKEND_SECTION_TYPE = "SatMon"; // Identifier for the weekend section
const HISTORY_WEEKS = 3; // Number of previous weekend sections to fetch

// Helper to get current date object in Sofia timezone
function getCurrentSofiaDate(): Date {
  return toZonedTime(new Date(), SOFIA_TIMEZONE);
}

/**
 * Calculates the section IDs for the current and specified number of previous
 * weekend (SatMon) sections.
 */
function getLastWeekendSectionIds(count: number): string[] {
  const nowSofia = getCurrentSofiaDate();
  const sectionIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const targetDate = subWeeks(nowSofia, i);
    // Find the start of the week (Monday) containing the target date
    const startOfTargetWeek = startOfWeek(targetDate, { weekStartsOn: 1 });
    // Calculate the Saturday of that week cycle
    const saturdayOfTargetWeek = addDays(startOfTargetWeek, 5);

    const weekNumber = getISOWeek(saturdayOfTargetWeek);
    const year = saturdayOfTargetWeek.getFullYear(); // Use year of the Saturday
    const sectionId = `${year}-W${String(weekNumber).padStart(2, "0")}-${WEEKEND_SECTION_TYPE}`;
    sectionIds.push(sectionId);
  }
  return sectionIds;
}

export async function GET(request: Request) {
  try {
    console.log("API: Fetching forecast history...");
    const relevantSectionIds = getLastWeekendSectionIds(HISTORY_WEEKS);
    console.log(`API: Relevant section IDs: ${relevantSectionIds.join(", ")}`);

    if (!relevantSectionIds.length) {
      console.log("API: No relevant section IDs found.");
      return NextResponse.json({}); // Return empty object if no sections
    }

    // Fetch history data for the relevant sections
    // Order by weekSectionId descending to get recent ones first if needed
    const historyData = await db
      .select({
        rowNumber: forecastHistory.rowNumber,
        isCorrect: forecastHistory.isCorrect,
        weekSectionId: forecastHistory.weekSectionId,
        // fixtureId: forecastHistory.fixtureId, // Include if needed
        // createdAt: forecastHistory.createdAt, // Include if needed for sorting
      })
      .from(forecastHistory)
      .where(
        and(
          inArray(forecastHistory.weekSectionId, relevantSectionIds),
          // Only include entries where a result is known
          // You might want nulls if you display pending checks differently
          // eq(forecastHistory.isCorrect, true), or eq(forecastHistory.isCorrect, false)
          // or isNotNull(forecastHistory.isCorrect)
        ),
      )
      .orderBy(
        desc(forecastHistory.weekSectionId),
        desc(forecastHistory.createdAt),
      ); // Sort by section then time

    console.log(`API: Found ${historyData.length} history records.`);

    // Group data by rowNumber for the frontend, keeping only the last 3 results per row
    const groupedHistory: Record<
      number,
      { isCorrect: boolean | null; weekSectionId: string }[]
    > = {};

    for (const item of historyData) {
      if (!groupedHistory[item.rowNumber]) {
        groupedHistory[item.rowNumber] = [];
      }
      // Add to the group only if we haven't reached the limit of 3 per row
      if (groupedHistory[item.rowNumber]!.length < HISTORY_WEEKS) {
        groupedHistory[item.rowNumber]!.push({
          isCorrect: item.isCorrect,
          weekSectionId: item.weekSectionId,
        });
      }
    }

    console.log("API: Grouped history prepared.");
    return NextResponse.json(groupedHistory);
  } catch (error) {
    console.error("API: Error fetching forecast history:", error);
    return NextResponse.json(
      { message: "Failed to fetch forecast history" },
      { status: 500 },
    );
  }
}
