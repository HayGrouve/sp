import { NextResponse } from "next/server";
import { type Statistics } from "@/types/football-scores";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fixtureId = searchParams.get("fixtureId");

  if (!fixtureId) {
    return NextResponse.json(
      { error: "Fixture ID is required" },
      { status: 400 },
    );
  }

  const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures/statistics?fixture=${fixtureId}`;
  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!,
      "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
    },
  };

  try {
    const response = await fetch(url, options);
    const result = (await response.json()) as { response: Statistics[] };

    if (
      !result.response ||
      !Array.isArray(result.response) ||
      result.response.length === 0
    ) {
      return NextResponse.json(
        { error: "No statistics data available" },
        { status: 404 },
      );
    }

    const statistics: Statistics[] = result.response;

    return NextResponse.json(statistics);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 },
    );
  }
}
