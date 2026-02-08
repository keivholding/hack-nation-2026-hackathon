import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  integer,
  text,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  onboardingStep: integer("onboarding_step").notNull().default(1),

  // Onboarding data
  website: varchar("website", { length: 500 }),
  goals: text("goals"),
  platforms: text("platforms"), // JSON string array
  additionalInfo: text("additional_info"),
  aiBrandSummary: text("ai_brand_summary"),
  brandVisualProfile: text("brand_visual_profile"), // JSON - colors, style, mood, aesthetic
  brandAnalysisStatus: varchar("brand_analysis_status", { length: 50 }).default(
    "thinking"
  ), // thinking, discovering, exploring, scanning_visuals, analyzing_identity, understanding, crafting, complete, error
  calendarGenerationStatus: varchar("calendar_generation_status", { length: 50 }).default("pending"), // pending, planning, organizing, finalizing, complete, error
  contentPlan: text("content_plan"),
  postingFrequency: varchar("posting_frequency", { length: 100 }),

  // Post generation (AI agent)
  postGenerationStatus: varchar("post_generation_status", { length: 50 }).default("pending"), // pending, orchestrating, researching, writing, designing, finalizing, complete, error
  currentAgent: varchar("current_agent", { length: 200 }), // Human-friendly agent activity message
  agentActivityLog: text("agent_activity_log"), // JSON array of conversational log messages

  // Topic selection (step 4)
  selectedTopic: text("selected_topic"), // The topic user chose from content calendar

  // Persona generation
  personaGenerationStatus: varchar("persona_generation_status", { length: 50 }).default("pending"), // pending, generating, complete, error

  // Audience simulation
  simulationStatus: varchar("simulation_status", { length: 50 }).default("pending"), // pending, simulating, complete, error
  simulationActivityLog: text("simulation_activity_log"), // JSON array of simulation progress messages

  // Post selection & scheduling (step 8)
  selectedPostId: uuid("selected_post_id"), // The post the user accepted from step 7
  scheduledAt: timestamp("scheduled_at"), // When the user wants to publish

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
