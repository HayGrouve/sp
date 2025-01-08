import { NextResponse } from "next/server";
import { Event } from "@/types/football-scores";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fixtureId = searchParams.get("fixtureId");

  if (!fixtureId) {
    return NextResponse.json(
      { error: "Fixture ID is required" },
      { status: 400 },
    );
  }

  const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures/events?fixture=${fixtureId}`;
  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!,
      "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
    },
  };

  try {
    const response = await fetch(url, options);
    const result = await response.json();

    if (
      !result.response ||
      !Array.isArray(result.response) ||
      result.response.length === 0
    ) {
      return NextResponse.json(
        { error: "No events data available" },
        { status: 404 },
      );
    }

    const events: Event[] = result.response;

    return NextResponse.json(events);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
}
