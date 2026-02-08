import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface GeneratedPersona {
  name: string;
  title: string;
  company: string;
  industry: string;
  ageRange: string;
  bio: string;
  interests: string[];
  painPoints: string[];
  contentPreferences: string;
  socialBehavior: "lurker" | "casual_engager" | "active_commenter" | "power_sharer";
  platform: string;
}

/**
 * Realistic distribution of social media behavior types.
 * Based on the 90-9-1 rule adapted for a 25-person focus group panel.
 *
 * Distribution: 10 lurkers (40%), 8 casual (32%), 5 active (20%), 2 power (8%).
 * This gives enough signal to differentiate posts while staying realistic.
 */
const BEHAVIOR_DISTRIBUTION: {
  type: GeneratedPersona["socialBehavior"];
  count: number;
  description: string;
}[] = [
  { type: "lurker", count: 10, description: "Mostly passive — scrolls through feed quickly. Occasionally double-taps a like on something that catches their eye, but rarely." },
  { type: "casual_engager", count: 8, description: "Likes posts that are clearly relevant to them. Might leave a comment once in a while if something resonates. Rarely shares." },
  { type: "active_commenter", count: 5, description: "Regularly likes relevant content. Enjoys adding their perspective in comments. Shares content that makes them look knowledgeable." },
  { type: "power_sharer", count: 2, description: "Highly active — likes most relevant content, comments frequently, and shares things that provide value to their network." },
];

export class PersonaService {
  /**
   * Generate 25 synthetic audience personas (focus group panel).
   * Enforces a specific distribution of engagement types to avoid the
   * "everyone loves everything" problem.
   */
  async generatePersonas(
    brandSummary: string,
    targetAudience: string,
    industry: string,
    goals: string,
    platforms: string[]
  ): Promise<GeneratedPersona[]> {
    // Build explicit behavioral slots
    const slots = BEHAVIOR_DISTRIBUTION.flatMap((b) =>
      Array.from({ length: b.count }, (_, i) => ({
        type: b.type,
        description: b.description,
        slotIndex: i,
        platform: platforms[Math.floor((i + (b.type === "lurker" ? 0 : 2)) % platforms.length)] || platforms[0],
      }))
    );

    // Split into batches to stay within token limits (generate in groups of ~13)
    const BATCH_SIZE = 13;
    const allPersonas: GeneratedPersona[] = [];

    for (let batchStart = 0; batchStart < slots.length; batchStart += BATCH_SIZE) {
      const batchSlots = slots.slice(batchStart, batchStart + BATCH_SIZE);
      const batchDescriptions = batchSlots
        .map(
          (s, i) =>
            `Persona ${batchStart + i + 1}: socialBehavior="${s.type}", platform="${s.platform}"
  Engagement style: ${s.description}`
        )
        .join("\n\n");

      const prompt = `Generate ${batchSlots.length} synthetic audience personas for a brand's simulated focus group. These represent REAL followers — people who chose to follow the brand.

## Brand Context:
${brandSummary}

${targetAudience ? `## Target Audience:\n${targetAudience}` : ""}
${industry ? `## Industry:\n${industry}` : ""}
${goals ? `## Content Goals:\n${goals}` : ""}

## MANDATORY PERSONA SLOTS (you MUST follow these exactly):

${batchDescriptions}

## RULES:
1. Each persona MUST match the socialBehavior type assigned above.
2. These are real followers who have genuine interest in this brand's space.
3. Make contentPreferences SPECIFIC — e.g., "data-backed insights" or "behind-the-scenes stories."
4. Give each persona a distinct personality, career, and perspective.
5. Vary ages, seniority levels, company sizes, and backgrounds.
${batchStart === 0 ? "6. Include 1-2 personas who prefer peer/organic content over branded posts." : "6. Ensure these personas feel distinct from typical marketing personas — give them real quirks."}

Return a JSON array with this EXACT structure for each persona:
[
  {
    "name": "Full Name",
    "title": "Job Title",
    "company": "Company description",
    "industry": "Their industry",
    "ageRange": "e.g., 25-34",
    "bio": "2-3 sentences: personality, social media habits, what catches their attention",
    "interests": ["topic1", "topic2", "topic3"],
    "painPoints": ["challenge1", "challenge2"],
    "contentPreferences": "Specific content triggers",
    "socialBehavior": "(must match assigned slot above)",
    "platform": "(must match assigned slot above)"
  }
]

Return ONLY valid JSON array. ${batchSlots.length} personas total.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `You are creating personas for a simulated focus group panel. These are believable people who follow this brand — they have genuine interest but varying engagement levels. Create well-rounded, diverse professionals with real personalities and specific content preferences.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.9,
        max_tokens: 5000,
      });

      const text = response.choices[0]?.message?.content || "";
      const cleaned = text.replace(/```json?\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned) as GeneratedPersona[];
      allPersonas.push(...parsed);
    }

    return allPersonas.slice(0, 25);
  }
}
