import { db } from "../../infra/db/index.js";
import {
  personas,
  type NewPersona,
  type Persona,
} from "../../infra/db/schemas/personas.js";
import { eq } from "drizzle-orm";

export class PersonaRepository {
  async create(personaData: NewPersona): Promise<Persona> {
    const [persona] = await db
      .insert(personas)
      .values(personaData)
      .returning();
    return persona;
  }

  async createBulk(personaList: NewPersona[]): Promise<Persona[]> {
    return await db.insert(personas).values(personaList).returning();
  }

  async getByUserId(userId: string): Promise<Persona[]> {
    return await db
      .select()
      .from(personas)
      .where(eq(personas.userId, userId));
  }

  async deleteByUserId(userId: string): Promise<void> {
    await db.delete(personas).where(eq(personas.userId, userId));
  }
}
