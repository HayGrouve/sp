import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../server/db";
import { forecastHistory } from "../../../server/db/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rowNumber = searchParams.get("rowNumber");

  if (!rowNumber) {
    return NextResponse.json(
      { error: "Row number is required" },
      { status: 400 },
    );
  }

  try {
    const history = await db
      .select()
      .from(forecastHistory)
      .where(eq(forecastHistory.rowNumber, parseInt(rowNumber)))
      .orderBy(desc(forecastHistory.createdAt))
      .limit(3);

    return NextResponse.json(history.map((h) => h.isCorrect === 1));
  } catch (error) {
    console.error("Error fetching forecast history:", error);
    return NextResponse.json(
      { error: "Failed to fetch forecast history" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { rowNumber, isCorrect } = body;

  if (typeof rowNumber !== "number" || typeof isCorrect !== "boolean") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    await db.insert(forecastHistory).values({
      rowNumber,
      isCorrect: isCorrect ? 1 : 0,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving forecast history:", error);
    return NextResponse.json(
      { error: "Failed to save forecast history" },
      { status: 500 },
    );
  }
}
