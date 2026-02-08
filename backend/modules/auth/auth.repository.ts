import { db } from "../../infra/db/index.js";
import { users, type NewUser, type User } from "../../infra/db/schemas/users.js";
import { eq } from "drizzle-orm";

export class AuthRepository {
  /**
   * Create a new user
   */
  async createUser(userData: NewUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  /**
   * Find user by ID
   */
  async findUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  /**
   * Update user
   */
  async updateUser(id: string, userData: Partial<NewUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...userData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  /**
   * Delete user
   */
  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }
}
