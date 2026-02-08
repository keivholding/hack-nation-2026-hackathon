import { tool } from "ai";
import { z } from "zod";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { pushUpdate } from "../agentContext.js";

export const linkedinWriter = tool({
  description:
    "Write LinkedIn post content. Generates professional, thought-leadership style posts optimized for the LinkedIn algorithm. Call this tool when you need LinkedIn-specific content.",
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
    await pushUpdate("writing", "LinkedIn Writer is drafting variations...", [
      `LinkedIn Writer here — crafting ${numberOfVariations} thought-leadership variations about "${concept.substring(
        0,
        80
      )}". This takes a moment...`,
    ]);

    const result = await generateText({
      model: openai("gpt-4.1-mini"),
      system: `You are a senior LinkedIn content strategist who builds thought leadership and drives meaningful professional engagement — not generic corporate content.

CRITICAL RULES FOR WRITING:
- Study the brand voice/summary carefully. Match the brand's actual tone, expertise level, and industry language.
- Write as the brand's voice — an authority in their space, sharing genuine insights.
- Reference the brand's actual domain expertise, industry, or products when relevant.
- Each variation MUST take a fundamentally different angle:
  * Variation 1: PERSONAL STORY — a narrative with a lesson, "Here's what I learned when..."
  * Variation 2: CONTRARIAN/HOT TAKE — challenge conventional wisdom in the industry
  * Variation 3: DATA/INSIGHT — lead with a stat, trend, or observation; break it down
  * Variation 4: TACTICAL/HOW-TO — actionable framework, tips, or process breakdown

FORMAT FOR EACH POST:
- Strong opening hook (1-2 lines that stop the scroll — no "I'm excited to share...")
- One sentence per line with line breaks between them (LinkedIn algorithm rewards this)
- Use storytelling beats: setup → tension → insight → resolution
- End with a genuine question that invites discussion (not "Agree?")
- Add 3-5 hashtags ONLY at the very end, separated from the content
- 150-350 words per variation
- Professional but human — write like a smart person talking, not a press release`,
      prompt: `Create ${numberOfVariations} distinct LinkedIn post variations.

**Concept/Theme:** ${concept}

**Brand Voice & Context (study this carefully and match the tone):**
${brandVoice}

**Content Goals:** ${goals}

Each variation MUST take a completely different angle (personal story, contrarian take, data-driven insight, tactical how-to). These should feel like 4 different people wrote them about the same topic.

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

    await pushUpdate("writing", "LinkedIn Writer finished drafting!", [
      "LinkedIn Writer is done — 4 thought-leadership variations ready.",
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
