import { tool } from "ai";
import { z } from "zod";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { pushUpdate } from "../agentContext.js";

export const instagramWriter = tool({
  description:
    "Write Instagram post content. Generates engaging Instagram captions with relevant hashtags optimized for reach and engagement. Call this tool when you need Instagram-specific content.",
  inputSchema: z.object({
    concept: z.string().describe("The core concept/theme for the post"),
    brandVoice: z
      .string()
      .describe(
        "The FULL brand summary/analysis — pass the complete brand summary exactly as provided, do NOT paraphrase or shorten it"
      ),
    goals: z.string().describe("The brand's content goals"),
    numberOfVariations: z
      .number()
      .describe("How many variations to generate (should be 4)"),
  }),
  execute: async ({ concept, brandVoice, goals, numberOfVariations }) => {
    await pushUpdate("writing", "Instagram Writer is crafting variations...", [
      `Instagram Writer here — working on ${numberOfVariations} variations about "${concept.substring(0, 80)}". Give me a moment...`,
    ]);

    const result = await generateText({
      model: openai("gpt-4.1-mini"),
      system: `You are a senior Instagram content strategist who creates content that feels authentic and drives real engagement — not generic motivational fluff.

CRITICAL RULES FOR WRITING:
- Study the brand voice/summary carefully. Match the brand's actual tone, vocabulary, and personality.
- Write as if you ARE the brand speaking to their specific audience — not a generic social media manager.
- Reference the brand's actual products, services, values, or industry when relevant.
- Each variation MUST take a fundamentally different angle. Use these approaches:
  * Variation 1: STORYTELLING — personal narrative, behind-the-scenes, or customer story
  * Variation 2: VALUE/EDUCATIONAL — teach something, share a tip, or provide insight
  * Variation 3: ENGAGEMENT-DRIVEN — ask a question, run a poll, start a conversation
  * Variation 4: BOLD/PROVOCATIVE — hot take, myth-busting, or contrarian perspective

FORMAT FOR EACH POST:
- Hook in the FIRST line (pattern interrupt, bold claim, or intriguing question)
- Use line breaks for scannable reading
- Include 1-2 emojis max per paragraph — strategic, not decorative
- End with a specific, actionable CTA (not just "follow for more")
- Add 5-8 highly relevant hashtags (mix of niche + mid-size, avoid overly generic ones)
- 100-250 words per variation`,
      prompt: `Create ${numberOfVariations} distinct Instagram caption variations.

**Concept/Theme:** ${concept}

**Brand Voice & Context (study this carefully and match the tone):**
${brandVoice}

**Content Goals:** ${goals}

Each variation MUST take a completely different angle (storytelling, educational, engagement, bold take). Do NOT create variations that are just rewrites of the same idea with different words.

Return ONLY valid JSON:
{
  "variations": [
    { "variationNumber": 1, "content": "..." },
    { "variationNumber": 2, "content": "..." },
    { "variationNumber": 3, "content": "..." },
    { "variationNumber": 4, "content": "..." }
  ]
}`,
    });

    await pushUpdate("writing", "Instagram Writer finished drafting!", [
      "Instagram Writer is done — 4 variations ready, each with a different angle.",
    ]);

    try {
      const cleaned = result.text.replace(/```json?\n?|\n?```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        variations: [{ variationNumber: 1, content: result.text }],
      };
    }
  },
});
