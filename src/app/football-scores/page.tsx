import { FootballScoresTable } from "@/components/football-scores-table";
import { FootballScore } from "@/types/football-scores";

function getMockFootballScores(): FootballScore[] {
  return [
    {
      rowNumber: 1,
      fixtureId: 674770,
      startTime: "2021-04-08T00:00:00+03:00",
      status: {
        long: "Match Finished",
        short: "FT",
        elapsed: 90,
      },
      home: {
        id: 3662,
        name: "Guastatoya",
        logo: "https://media.api-sports.io/football/teams/3662.png",
        winner: true,
      },
      away: {
        id: 3655,
        name: "Sacachispas",
        logo: "https://media.api-sports.io/football/teams/3655.png",
        winner: false,
      },
      score: {
        home: 3,
        away: 0,
      },
      league: {
        id: 339,
        name: "Liga Nacional",
        country: "Guatemala",
        logo: "https://media.api-sports.io/football/leagues/339.png",
        flag: "https://media.api-sports.io/flags/gt.svg",
        season: 2020,
        round: "Clausura - 9",
      },
    },
    {
      rowNumber: 2,
      fixtureId: 674772,
      startTime: "2021-04-08T00:00:00+03:00",
      status: {
        long: "Match Finished",
        short: "FT",
        elapsed: 90,
      },
      home: {
        id: 3665,
        name: "Municipal",
        logo: "https://media.api-sports.io/football/teams/3665.png",
        winner: true,
      },
      away: {
        id: 3636,
        name: "Achuapa",
        logo: "https://media.api-sports.io/football/teams/3636.png",
        winner: false,
      },
      score: {
        home: 3,
        away: 0,
      },
      league: {
        id: 339,
        name: "Liga Nacional",
        country: "Guatemala",
        logo: "https://media.api-sports.io/football/leagues/339.png",
        flag: "https://media.api-sports.io/flags/gt.svg",
        season: 2020,
        round: "Clausura - 9",
      },
    },
  ];
}

export default function FootballScoresPage() {
  const initialScores = getMockFootballScores();

  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-5 text-2xl font-bold">Live Football Scores</h1>
      <FootballScoresTable initialScores={initialScores} />
    </div>
  );
}
