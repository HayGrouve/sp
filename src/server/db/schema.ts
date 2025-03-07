// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { sql } from "drizzle-orm";
import { index, integer, pgTableCreator, timestamp } from "drizzle-orm/pg-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `sp_${name}`);

export const forecastHistory = createTable(
  "forecast_history",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    rowNumber: integer("row_number").notNull(),
    isCorrect: integer("is_correct").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (example) => ({
    rowNumberIndex: index("row_number_idx").on(example.rowNumber),
  }),
);
