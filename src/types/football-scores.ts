export interface FootballScore {
  rowNumber: number;
  fixtureId: number;
  startTime: string;
  status: {
    long: string;
    short: string;
    elapsed: number | null;
  };
  home: {
    id: number;
    name: string;
    logo: string;
    winner: boolean | null;
  };
  away: {
    id: number;
    name: string;
    logo: string;
    winner: boolean | null;
  };
  score: {
    home: number | null;
    away: number | null;
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    round: string;
  };
}

export interface Prediction {
  home: string;
  away: string;
  prediction: string;
  winPercentHome: string;
  winPercentAway: string;
  winPercentDraw: string;
}

export interface Statistics {
  team: {
    name: string;
    logo: string;
  };
  statistics: Array<{
    type: string;
    value: number | string | null;
  }>;
}

export interface Player {
  player: {
    id: number;
    name: string;
    number: number;
    pos: string;
    grid: string;
  };
}

export interface Lineup {
  team: {
    id: number;
    name: string;
    logo: string;
    colors: {
      player: {
        primary: string;
        number: string;
        border: string;
      };
      goalkeeper: {
        primary: string;
        number: string;
        border: string;
      };
    };
  };
  formation: string;
  startXI: Player[];
  substitutes: Player[];
  coach: {
    id: number;
    name: string;
    photo: string;
  };
}

export interface Event {
  time: {
    elapsed: number;
    extra?: number;
  };
  team: {
    name: string;
    logo: string;
  };
  player: {
    name: string;
  };
  assist: {
    name: string | null;
  };
  type: string;
  detail: string;
}

export interface TeamStatistics {
  team: {
    id: number;
    name: string;
    logo: string;
  };
  form: string;
  fixtures: {
    played: {
      home: number;
      away: number;
      total: number;
    };
    wins: {
      home: number;
      away: number;
      total: number;
    };
    draws: {
      home: number;
      away: number;
      total: number;
    };
    loses: {
      home: number;
      away: number;
      total: number;
    };
  };
  goals: {
    for: {
      total: {
        home: number;
        away: number;
        total: number;
      };
      average: {
        home: string;
        away: string;
        total: string;
      };
    };
    against: {
      total: {
        home: number;
        away: number;
        total: number;
      };
      average: {
        home: string;
        away: string;
        total: string;
      };
    };
  };
}
