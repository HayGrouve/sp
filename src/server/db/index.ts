import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@haygrouve/db-schema";
import {
  apiCache,
  footballScores,
  forecastHistory,
} from "@haygrouve/db-schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(connectionString, { prepare: false });

export const db = drizzle(sql, { schema });

export { schema, apiCache, footballScores, forecastHistory };
