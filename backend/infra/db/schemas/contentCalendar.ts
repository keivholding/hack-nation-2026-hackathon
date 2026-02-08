import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const contentCalendar = pgTable("content_calendar", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  dayOfWeek: varchar("day_of_week", { length: 20 }).notNull(), // Monday, Tuesday, etc
  dayNumber: integer("day_number").notNull(), // 1-7

  postNumber: integer("post_number").notNull(), // 1, 2, 3 for multiple posts per day
  theme: text("theme").notNull(),
  platform: varchar("platform", { length: 50 }).notNull(), // Instagram, LinkedIn

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ContentCalendar = typeof contentCalendar.$inferSelect;
export type NewContentCalendar = typeof contentCalendar.$inferInsert;
