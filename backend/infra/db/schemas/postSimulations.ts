import {
  pgTable,
  uuid,
  timestamp,
  text,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { generatedPosts } from "./generatedPosts";
import { personas } from "./personas";

export const postSimulations = pgTable("post_simulations", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => generatedPosts.id, { onDelete: "cascade" }),
  personaId: uuid("persona_id")
    .notNull()
    .references(() => personas.id, { onDelete: "cascade" }),

  liked: boolean("liked").notNull().default(false),
  shared: boolean("shared").notNull().default(false),
  commented: boolean("commented").notNull().default(false),
  commentText: text("comment_text"), // What they'd comment
  reasoning: text("reasoning").notNull(), // Why they reacted this way
  engagementScore: integer("engagement_score").notNull().default(0), // Weighted: like=1, comment=3, share=5

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PostSimulation = typeof postSimulations.$inferSelect;
export type NewPostSimulation = typeof postSimulations.$inferInsert;
