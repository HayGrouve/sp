// src/app/api/cron/cleanup-history/route.ts
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { forecastHistory } from "@/server/db/index";
import { not, inArray } from "drizzle-orm";
import { getISOWeek, startOfWeek, subWeeks, getYear, addDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const SOFIA_TIMEZONE = "Europe/Sofia";
const WEEKEND_SECTION_TYPE = "SatMon";
const HISTORY_WEEKS_TO_KEEP = 3;

function getCurrentSofiaDate(): Date {
  return toZonedTime(new Date(), SOFIA_TIMEZONE);
}

function getWeekendSectionIdsToKeep(count: number): string[] {
  const nowSofia = getCurrentSofiaDate();
  const sectionIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const targetDate = subWeeks(nowSofia, i);
    const startOfTargetWeek = startOfWeek(targetDate, { weekStartsOn: 1 });
    const saturdayOfTargetWeek = addDays(startOfTargetWeek, 5);
    const weekNumber = getISOWeek(saturdayOfTargetWeek);
    const year = getYear(saturdayOfTargetWeek);
    const sectionId = `${year}-W${String(weekNumber).padStart(2, "0")}-${WEEKEND_SECTION_TYPE}`;
    sectionIds.push(sectionId);
  }
  return sectionIds;
}

export async function GET(request: Request) {
  // Optional: Secret key check
  try {
    console.log("Cleanup cron: Starting forecast history cleanup...");
    const sectionIdsToKeep = getWeekendSectionIdsToKeep(HISTORY_WEEKS_TO_KEEP);
    if (sectionIdsToKeep.length === 0) {
      console.log("Cleanup cron: No valid section IDs found. Skipping.");
      return NextResponse.json({ message: "No sections found to keep." });
    }
    console.log(
      `Cleanup cron: Keeping history for sections: ${sectionIdsToKeep.join(", ")}`,
    );

    const deleteResult = await db
      .delete(forecastHistory)
      .where(not(inArray(forecastHistory.weekSectionId, sectionIdsToKeep)))
      .returning({ deletedId: forecastHistory.id });
    const deletedCount = deleteResult.length;
    console.log(`Cleanup cron: Deleted ${deletedCount} old history records.`);
    return NextResponse.json({
      message: `Successfully deleted ${deletedCount} old forecast history records.`,
    });
  } catch (error) {
    console.error("Cleanup cron: Error:", error);
    return NextResponse.json(
      { error: "Failed to cleanup forecast history" },
      { status: 500 },
    );
  }
}
