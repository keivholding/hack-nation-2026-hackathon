import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const personas = pgTable("personas", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  name: varchar("name", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(), // e.g. "VP of Marketing"
  company: varchar("company", { length: 500 }).notNull(), // e.g. "Series B SaaS startup"
  industry: varchar("industry", { length: 255 }).notNull(),
  ageRange: varchar("age_range", { length: 50 }).notNull(), // e.g. "30-40"
  bio: text("bio").notNull(), // 2-3 sentence personality description
  interests: text("interests").notNull(), // JSON array of topics they care about
  painPoints: text("pain_points").notNull(), // JSON array of challenges
  contentPreferences: text("content_preferences").notNull(), // What content they engage with
  socialBehavior: varchar("social_behavior", { length: 50 }).notNull(), // lurker, casual_engager, active_commenter, power_sharer
  platform: varchar("platform", { length: 50 }).notNull(), // Instagram, LinkedIn
  avatarUrl: varchar("avatar_url", { length: 500 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Persona = typeof personas.$inferSelect;
export type NewPersona = typeof personas.$inferInsert;
