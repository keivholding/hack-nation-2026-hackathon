import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const generatedPosts = pgTable("generated_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  concept: text("concept").notNull(), // The core idea/theme
  variationNumber: integer("variation_number").notNull(), // 1-4
  platform: varchar("platform", { length: 50 }).notNull(), // Instagram, LinkedIn
  content: text("content").notNull(), // The actual post text
  imageUrl: text("image_url"), // Placeholder for now
  imageDescription: text("image_description"), // AI-generated image description
  feedback: varchar("feedback", { length: 10 }), // "up" or "down"

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GeneratedPost = typeof generatedPosts.$inferSelect;
export type NewGeneratedPost = typeof generatedPosts.$inferInsert;
