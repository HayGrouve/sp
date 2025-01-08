import { NextResponse } from "next/server";
import { Prediction } from "@/types/football-scores";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fixtureId = searchParams.get("fixtureId");

  if (!fixtureId) {
    return NextResponse.json(
      { error: "Fixture ID is required" },
      { status: 400 },
    );
  }

  const url = `https://api-football-v1.p.rapidapi.com/v3/predictions?fixture=${fixtureId}`;
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

    if (!result.response || result.response.length === 0) {
      return NextResponse.json(
        { error: "No prediction data available" },
        { status: 404 },
      );
    }

    const predictionData = result.response[0];
    const prediction: Prediction = {
      home: predictionData.teams.home.name,
      away: predictionData.teams.away.name,
      prediction: predictionData.predictions.winner.name,
      winPercentHome: predictionData.predictions.percent.home,
      winPercentAway: predictionData.predictions.percent.away,
      winPercentDraw: predictionData.predictions.percent.draw,
    };

    return NextResponse.json(prediction);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch prediction" },
      { status: 500 },
    );
  }
}
