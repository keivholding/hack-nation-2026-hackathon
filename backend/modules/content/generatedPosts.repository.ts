import { db } from "../../infra/db/index.js";
import {
  generatedPosts,
  type NewGeneratedPost,
  type GeneratedPost,
} from "../../infra/db/schemas/generatedPosts.js";
import { eq } from "drizzle-orm";

export class GeneratedPostsRepository {
  async create(postData: NewGeneratedPost): Promise<GeneratedPost> {
    const [post] = await db
      .insert(generatedPosts)
      .values(postData)
      .returning();
    return post;
  }

  async createBulk(posts: NewGeneratedPost[]): Promise<GeneratedPost[]> {
    return await db.insert(generatedPosts).values(posts).returning();
  }

  async getByUserId(userId: string): Promise<GeneratedPost[]> {
    return await db
      .select()
      .from(generatedPosts)
      .where(eq(generatedPosts.userId, userId))
      .orderBy(generatedPosts.variationNumber);
  }

  async updateFeedback(
    postId: string,
    feedback: "up" | "down" | null
  ): Promise<GeneratedPost | undefined> {
    const [post] = await db
      .update(generatedPosts)
      .set({ feedback, updatedAt: new Date() })
      .where(eq(generatedPosts.id, postId))
      .returning();
    return post;
  }

  async getById(postId: string): Promise<GeneratedPost | undefined> {
    const [post] = await db
      .select()
      .from(generatedPosts)
      .where(eq(generatedPosts.id, postId));
    return post;
  }

  async updateContent(
    postId: string,
    content: string
  ): Promise<GeneratedPost | undefined> {
    const [post] = await db
      .update(generatedPosts)
      .set({ content, updatedAt: new Date() })
      .where(eq(generatedPosts.id, postId))
      .returning();
    return post;
  }

  async deleteByUserId(userId: string): Promise<void> {
    await db
      .delete(generatedPosts)
      .where(eq(generatedPosts.userId, userId));
  }
}
