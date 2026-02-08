import { db } from "../../infra/db/index.js";
import { contentCalendar, type NewContentCalendar, type ContentCalendar } from "../../infra/db/schemas/contentCalendar.js";
import { eq } from "drizzle-orm";

export class ContentCalendarRepository {
  async createPost(postData: NewContentCalendar): Promise<ContentCalendar> {
    const [post] = await db.insert(contentCalendar).values(postData).returning();
    return post;
  }

  async createBulk(posts: NewContentCalendar[]): Promise<ContentCalendar[]> {
    return await db.insert(contentCalendar).values(posts).returning();
  }

  async getUserCalendar(userId: string): Promise<ContentCalendar[]> {
    return await db
      .select()
      .from(contentCalendar)
      .where(eq(contentCalendar.userId, userId))
      .orderBy(contentCalendar.dayNumber, contentCalendar.postNumber);
  }

  async deleteUserCalendar(userId: string): Promise<void> {
    await db.delete(contentCalendar).where(eq(contentCalendar.userId, userId));
  }
}
