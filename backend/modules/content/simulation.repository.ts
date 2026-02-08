import { db } from "../../infra/db/index.js";
import {
  postSimulations,
  type NewPostSimulation,
  type PostSimulation,
} from "../../infra/db/schemas/postSimulations.js";
import { generatedPosts } from "../../infra/db/schemas/generatedPosts.js";
import { personas } from "../../infra/db/schemas/personas.js";
import { eq, sql } from "drizzle-orm";

export interface PostEngagementSummary {
  postId: string;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  totalEngagementScore: number;
  simulationCount: number;
}

export interface SimulationWithPersona extends PostSimulation {
  persona: {
    name: string;
    title: string;
    company: string;
    platform: string;
    avatarUrl: string | null;
  };
}

export class SimulationRepository {
  async create(simData: NewPostSimulation): Promise<PostSimulation> {
    const [sim] = await db
      .insert(postSimulations)
      .values(simData)
      .returning();
    return sim;
  }

  async createBulk(sims: NewPostSimulation[]): Promise<PostSimulation[]> {
    return await db.insert(postSimulations).values(sims).returning();
  }

  async getByPostId(postId: string): Promise<SimulationWithPersona[]> {
    const rows = await db
      .select({
        simulation: postSimulations,
        personaName: personas.name,
        personaTitle: personas.title,
        personaCompany: personas.company,
        personaPlatform: personas.platform,
        personaAvatarUrl: personas.avatarUrl,
      })
      .from(postSimulations)
      .innerJoin(personas, eq(postSimulations.personaId, personas.id))
      .where(eq(postSimulations.postId, postId));

    return rows.map((r) => ({
      ...r.simulation,
      persona: {
        name: r.personaName,
        title: r.personaTitle,
        company: r.personaCompany,
        platform: r.personaPlatform,
        avatarUrl: r.personaAvatarUrl,
      },
    }));
  }

  async getEngagementByUserId(userId: string): Promise<PostEngagementSummary[]> {
    const rows = await db
      .select({
        postId: postSimulations.postId,
        totalLikes: sql<number>`CAST(SUM(CASE WHEN ${postSimulations.liked} THEN 1 ELSE 0 END) AS INTEGER)`,
        totalShares: sql<number>`CAST(SUM(CASE WHEN ${postSimulations.shared} THEN 1 ELSE 0 END) AS INTEGER)`,
        totalComments: sql<number>`CAST(SUM(CASE WHEN ${postSimulations.commented} THEN 1 ELSE 0 END) AS INTEGER)`,
        totalEngagementScore: sql<number>`CAST(SUM(${postSimulations.engagementScore}) AS INTEGER)`,
        simulationCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(postSimulations)
      .innerJoin(generatedPosts, eq(postSimulations.postId, generatedPosts.id))
      .where(eq(generatedPosts.userId, userId))
      .groupBy(postSimulations.postId);

    return rows;
  }

  async deleteByUserId(userId: string): Promise<void> {
    // Delete simulations for all posts belonging to a user
    const userPosts = await db
      .select({ id: generatedPosts.id })
      .from(generatedPosts)
      .where(eq(generatedPosts.userId, userId));

    for (const post of userPosts) {
      await db
        .delete(postSimulations)
        .where(eq(postSimulations.postId, post.id));
    }
  }
}
