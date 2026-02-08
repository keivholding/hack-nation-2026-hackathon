import { tool } from "ai";
import { z } from "zod";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { pushUpdate } from "../agentContext.js";

export const finalizer = tool({
  description:
    "Finalize and polish all post variations for maximum engagement. Reviews all content, ensures brand consistency, optimizes for the platform algorithm, and refines copy. Call this as the last step after all content has been written.",
  inputSchema: z.object({
    variations: z
      .string()
      .describe(
        "JSON string of all post variations to finalize, including platform, content, and image descriptions"
      ),
    brandVoice: z
      .string()
      .describe(
        "The FULL brand summary/analysis — pass the complete brand summary exactly as provided"
      ),
    goals: z.string().describe("The brand's content goals"),
  }),
  execute: async ({ variations, brandVoice, goals }) => {
    await pushUpdate("finalizing", "Engagement Expert is reviewing all variations...", [
      "Engagement Expert here — reviewing all 4 variations for brand consistency, hook strength, and CTA quality...",
    ]);

    const result = await generateText({
      model: openai("gpt-4.1-mini"),
      system: `You are a senior content editor and engagement optimization specialist. You take drafted social media content and elevate it from good to exceptional.

YOUR REVIEW CHECKLIST:
1. **Brand Voice Match** — Does every variation sound like THIS specific brand? Compare against the brand summary. Fix any generic or off-brand language.
2. **Hook Strength** — Is the first line genuinely scroll-stopping? If someone saw this in a feed of 100 posts, would they stop? Rewrite weak hooks.
3. **Distinct Angles** — Do all 4 variations feel genuinely different? If two are too similar, rewrite one to take a sharper angle.
4. **CTA Quality** — Is the call-to-action specific and compelling? "Follow for more" is lazy. "Drop your biggest challenge below" is better.
5. **Platform Optimization** — Instagram: check hashtag relevance and emoji usage. LinkedIn: check line break formatting and professional tone.
6. **Authenticity Check** — Remove anything that sounds like AI-generated filler. No "in today's fast-paced world", "game-changer", "journey", or similar clichés unless the brand actually uses them.
7. **Value Density** — Every sentence should earn its place. Cut fluff. Tighten copy.

IMPORTANT: Preserve the writer's core message and angle. You're polishing, not rewriting from scratch. Make surgical improvements.`,
      prompt: `Review and finalize these post variations:

${variations}

**Brand Voice & Context (ensure all content matches this):**
${brandVoice}

**Content Goals:** ${goals}

Polish each variation according to your checklist. Make them feel like they were written by a top-tier marketing team that deeply understands this brand.

Return ONLY valid JSON:
{
  "finalized": [
    {
      "variationNumber": 1,
      "platform": "Instagram",
      "content": "polished content here...",
      "engagementTip": "specific tip for this post (best time, engagement strategy, etc.)"
    }
  ]
}`,
    });

    await pushUpdate("finalizing", "Engagement Expert finished!", [
      "Engagement Expert is done — copy is polished, hooks are tightened, CTAs are clear.",
    ]);

    try {
      const cleaned = result.text.replace(/```json?\n?|\n?```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return { finalized: [], raw: result.text };
    }
  },
});
