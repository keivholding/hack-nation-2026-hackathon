import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import OpenAI from "openai";
import { instagramWriter } from "./tools/instagram-writer.js";
import { linkedinWriter } from "./tools/linkedin-writer.js";
import { imageGenerator } from "./tools/image-generator.js";
import { finalizer } from "./tools/finalizer.js";
import { webSearch } from "./tools/web-search.js";
import { agentSession } from "./agentContext.js";
import type {
  AgentContext,
  AgentResult,
  PostVariation,
  StatusUpdateCallback,
} from "./types.js";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

/**
 * Determine which single platform to target for this post.
 * Picks from the first calendar entry, or falls back to the first user platform.
 */
function pickPlatform(context: AgentContext): string {
  // Check the first calendar post's platform
  const firstPost = context.contentCalendar[0]?.posts[0];
  if (firstPost?.platform) {
    return firstPost.platform;
  }
  // Fallback to first user platform
  return context.platforms[0] || "Instagram";
}

function buildPromptFromContext(
  context: AgentContext,
  targetPlatform: string
): string {
  const calendarSummary = context.contentCalendar
    .slice(0, 3)
    .map(
      (day) =>
        `${day.day}: ${day.posts
          .map((p) => `${p.theme} (${p.platform})`)
          .join(", ")}`
    )
    .join("\n");

  const writerTool =
    targetPlatform === "Instagram" ? "instagramWriter" : "linkedinWriter";

  return `You are the lead strategist orchestrating content creation for a specific brand. Study the brand context below carefully — every tool call you make must reflect this brand's identity.

---

## BRAND CONTEXT (pass this VERBATIM as the "brandVoice" parameter to every tool)

${context.brandSummary}

---

${context.website ? `**Brand Website:** ${context.website}` : ""}

**Target Platform:** ${targetPlatform}

**Content Goals:** ${context.goals}

${
  context.additionalInfo
    ? `**Additional Brand Context from the client:** ${context.additionalInfo}`
    : ""
}

**Upcoming Content Calendar:**
${
  calendarSummary ||
  "No calendar available — pick a theme that fits the brand's core expertise and audience."
}

---

## YOUR TASK — follow these steps IN ORDER:

### Step 1: Choose the concept
${
  context.basePost
    ? `## REFINEMENT MODE — ITERATIVE, NOT REWRITE

The user previously selected this post and wants you to **refine** it based on their feedback. This is an ITERATION, not a restart.

**Original post they liked:**
---
${context.basePost}
---

**User's feedback:** "${context.refinementFeedback || "make it better"}"

### REFINEMENT RULES (critical):
- The **core message, topic, and angle** must stay the same across all variations. You are fine-tuning, not pivoting.
- The **structure** (hook → body → CTA flow) should remain recognizable. Don't completely restructure.
- Apply the feedback as **targeted adjustments** — think of it like a designer doing revision rounds, not starting over.
- Each variation should interpret the feedback at a different intensity:
  - Variation 1: Very subtle change — minimal edits, just addressing the feedback
  - Variation 2: Moderate refinement — noticeable improvement but clearly the same post
  - Variation 3: Slightly bolder take — still the same core message but with a fresh angle on the feedback
  - Variation 4: Most creative interpretation — pushes the feedback further while keeping the topic
- Do NOT change the topic, subject matter, or fundamental argument of the post.
- If the feedback is about tone (e.g., "more professional"), adjust word choice and phrasing, not the content itself.`
    : context.selectedTopic
    ? `The user has chosen this specific topic: "${context.selectedTopic}". Use this as the concept for all variations.`
    : `Pick the first theme from the content calendar. If no calendar is available, choose a topic that:
- Aligns with the brand's core expertise (see brand summary above)
- Would resonate with their target audience
- Supports their content goals`
}

### Step 2: Research (optional)
${
  context.basePost
    ? `Skip research — you already have the base post and user feedback. Go straight to writing.`
    : `If the theme involves a specific event, trend, person, or time-sensitive topic, call \`webSearch\` to get current context. Skip for evergreen topics.`
}

### Step 3: Write
Call the \`${writerTool}\` tool with these EXACT parameters:
- \`concept\`: ${
    context.basePost
      ? `"Iterative refinement based on feedback: ${
          context.refinementFeedback || "improved"
        }. Original post provided — do NOT change the topic."`
      : "The chosen theme/concept"
  }
- \`brandVoice\`: Copy-paste the ENTIRE brand context section above — do NOT summarize, paraphrase, or shorten it. The writer needs the full brand analysis to match the tone.
- \`goals\`: "${context.goals}"
- \`numberOfVariations\`: 4

${
  context.skipImageGeneration
    ? `### Step 4: Skip — images are being reused
Do NOT call imageGenerator. The original post's image is being reused for all variations (visual consistency across iterations).`
    : `### Step 4: Generate images
Call \`imageGenerator\` with:
- \`concepts\`: An array of EXACTLY 4 objects. Each object has:
  - \`variationNumber\`: 1-4
  - \`headline\`: A short, punchy headline (5-12 words) extracted from THAT variation's post content. This will be rendered as large bold text on the graphic — it IS the design. Pull the most impactful stat, claim, or hook from the post. Examples: "Ship 10x faster with AI", "We just hit 1M users", "$2M+ saved in SaaS costs".
  - \`description\`: Additional visual direction — background tone (dark/light), gradient accent colors, and any optional supporting visual (product screenshot, device mockup, stat callout).
  
  THESE ARE BOLD TYPOGRAPHIC POSTER DESIGNS — like Lovable, Notion, Stripe, or Vercel post on LinkedIn:
  - Big bold headline text as the centerpiece
  - Dark background with a dramatic gradient accent sweep (pink, magenta, blue, purple)
  - Clean sans-serif typography
  - Optional small product UI or brand element as secondary visual
  - NOT 3D renders, NOT abstract art, NOT stock photos${
    context.visualProfile
      ? `
  
  BRAND VISUALS: Colors: ${context.visualProfile.colorPalette.join(
    ", "
  )}. Aesthetic: "${context.visualProfile.overallAesthetic}". Color mood: "${
          context.visualProfile.colorMood
        }". Style: "${
          context.visualProfile.visualStyle
        }". Use the brand's colors as the gradient accent direction.`
      : ""
  }
- \`platform\`: "${targetPlatform}"
- \`brandVoice\`: The full brand context (same as above)`
}

### Step ${context.skipImageGeneration ? "4" : "5"}: Finalize
Call \`finalizer\` with:
- \`variations\`: JSON.stringify of all 4 variations (include platform, content, variationNumber)
- \`brandVoice\`: The full brand context (same as above)
- \`goals\`: "${context.goals}"

---

## CRITICAL RULES:
1. Generate exactly 4 variations, ALL for ${targetPlatform}.
2. Only call \`${writerTool}\`. Do NOT call the other writer tool.
3. You MUST call: ${
    context.skipImageGeneration
      ? `writer → finalizer (in that order). Do NOT call imageGenerator.`
      : `writer → imageGenerator → finalizer (in that order). webSearch is optional.`
  }
4. **BRAND VOICE PASSTHROUGH**: When calling ANY tool, the \`brandVoice\` parameter must contain the FULL brand context from above. Do NOT summarize it. The sub-agents need the complete brand analysis to produce on-brand content.
${
  context.skipImageGeneration
    ? ""
    : `5. The imageGenerator concepts array MUST have exactly 4 entries (variationNumbers 1-4), each with a punchy headline extracted from that variation's post content AND a visual description.`
}
${
  context.skipImageGeneration ? "5" : "6"
}. Do NOT write post content yourself — always delegate to the tools.${
    context.basePost
      ? `
${
  context.skipImageGeneration ? "6" : "7"
}. **ITERATIVE REFINEMENT**: The writer's output must be recognizably based on the original post. Same topic, same angle, refined execution. If a reader saw the original and the new version side by side, they should clearly see it's the same post improved — not a different post entirely.`
      : ""
  }`;
}

/**
 * Run the content creation agent orchestrator.
 * Fully reusable — takes context and returns results,
 * with no coupling to onboarding or any specific flow.
 */
export async function runContentAgent(
  context: AgentContext,
  onStatusUpdate?: StatusUpdateCallback
): Promise<AgentResult> {
  const targetPlatform = pickPlatform(context);

  const isRefinement = Boolean(context.basePost);

  if (onStatusUpdate) {
    await onStatusUpdate(
      "orchestrating",
      isRefinement
        ? "Lead Strategist is reviewing your feedback..."
        : "Lead Strategist is analyzing your brand...",
      [
        isRefinement
          ? `Got your feedback: "${
              context.refinementFeedback || "make it better"
            }". Let me refine the post while keeping the same core message and image...`
          : "Let me take a look at your brand and figure out the best angle for this post...",
      ]
    );
  }

  const allVariations: PostVariation[] = [];
  let concept = "";

  // In refinement mode, exclude the image generator from available tools
  // Build the tools object explicitly to avoid TypeScript issues with optional properties
  const baseTools = { webSearch, instagramWriter, linkedinWriter, finalizer };
  const availableTools = context.skipImageGeneration
    ? baseTools
    : { ...baseTools, imageGenerator };

  // Wrap in AsyncLocalStorage so all tools can push real-time updates
  const sessionStore = onStatusUpdate
    ? { onStatusUpdate }
    : { onStatusUpdate: async () => {} };

  let finalizerHasRun = false;

  const result = await agentSession.run(sessionStore, () =>
    generateText({
      model: openai("gpt-4.1-mini"),
      system: `You are the lead content strategist AI — think of yourself as a creative director at a top agency. You orchestrate a team of specialized AI agents to create social media content that sounds like it came from the brand's own marketing team.

KEY PRINCIPLES:
- You NEVER write post content directly — you always delegate to your writer tools.
- You study the brand context deeply before making any decisions.
- When calling tools, you ALWAYS pass the FULL brand summary/context as the brandVoice parameter — never paraphrase or shorten it. Your sub-agents need the complete picture.
- You make smart decisions about when research adds value vs. when to go straight to writing.
- Quality over speed: you'd rather get 4 exceptional variations than rush through the process.
${
  isRefinement
    ? `
REFINEMENT MODE:
You are refining an existing post the user already liked. This is an ITERATION, not a fresh start.
- Do NOT call imageGenerator — the original image is being reused for visual consistency.
- Focus purely on text/copy refinement based on the user's feedback.
- The output should be recognizably the same post, just improved.
- Think of this like a revision round — same creative brief, refined execution.`
    : ""
}

THINKING OUT LOUD:
Before EVERY tool call, write 2-3 sentences explaining your reasoning in first person — as if you're a real creative director talking to a colleague. Reference the brand's actual details: their name, goals, audience, industry, colors, etc. Explain WHY you're making each decision. For example:
${
  isRefinement
    ? `- "The user wants it more [feedback]. Looking at the original post, I think the hook is solid but the body could be tightened. Let me send it to the Writer with instructions to [specific adjustment]."
- "Good — the writer made 4 variations with different levels of refinement. Let me get the Engagement Expert to make sure none of them drifted too far from the original message."`
    : `- "Okay, so [brand]'s main goal is [goal] and they're targeting [audience]. The calendar has [theme] coming up — I think a [angle] approach will land well. Let me send this to the [platform] Writer."
- "The writer came back with 4 solid variations. Variation 2 has a killer hook: '[key phrase]'. I'll pull that as the headline for the graphic. Dark background with their brand gradient as an accent — that'll pop on the feed."
- "The graphics turned out great — bold headlines, clean layouts, they look like real marketing assets from [brand]'s team. Let me get the Engagement Expert to tighten everything up — I want to make sure the CTAs align with their goal of [goal]."`
}

After a tool returns results, write 1-2 sentences reacting to the output naturally. Be specific about what you see.

This text is shown to the user in real-time, so be conversational and genuine. Don't be generic — prove you actually read and understood this brand.`,
      tools: availableTools,
      stopWhen: stepCountIs(12),
      prompt: buildPromptFromContext(context, targetPlatform),
      onStepFinish: async (event) => {
        if (!onStatusUpdate) return;

        const hasToolCalls = event.toolCalls && event.toolCalls.length > 0;

        // Track whether the finalizer has run. Once it has, all meaningful work is
        // done — any further LLM text is just a redundant summary that bunches up
        // with the queue worker's final message.
        if (hasToolCalls) {
          for (const tc of event.toolCalls!) {
            if (tc.toolName === "finalizer") {
              finalizerHasRun = true;
            }
          }
        }

        // Only push LLM reasoning text when it's a "thinking" step (no tool calls).
        // Skip entirely after the finalizer — the Engagement Expert tool already
        // announced completion, so the LLM's retrospective commentary is redundant
        // and causes a burst of messages at the end.
        if (!hasToolCalls && event.text && !finalizerHasRun) {
          const reasoning = event.text.trim();
          if (reasoning.length > 0) {
            const sentences = reasoning
              .split(/(?<=[.!?])\s+/)
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 10);

            // Cap at 2 messages per step to keep the log conversational
            const messages: string[] = [];
            for (
              let i = 0;
              i < sentences.length && messages.length < 2;
              i += 2
            ) {
              const chunk = sentences.slice(i, i + 2).join(" ");
              if (chunk) messages.push(chunk);
            }

            if (messages.length > 0) {
              await onStatusUpdate(
                "orchestrating",
                "Lead Strategist is thinking...",
                messages
              );
            }
          }
          return;
        }

        // For steps with tool calls, just update the status indicator
        if (hasToolCalls) {
          let status = "";
          let agentMessage = "";

          for (const toolCall of event.toolCalls!) {
            switch (toolCall.toolName) {
              case "webSearch":
                status = "researching";
                agentMessage =
                  "Web Researcher is gathering context and trends...";
                break;
              case "instagramWriter":
                status = "writing";
                agentMessage =
                  "Content Writer is crafting variations for Instagram...";
                break;
              case "linkedinWriter":
                status = "writing";
                agentMessage =
                  "Content Writer is drafting variations for LinkedIn...";
                break;
              case "imageGenerator":
                status = "designing";
                agentMessage =
                  "Visual Designer is generating brand-aligned images...";
                break;
              case "finalizer":
                status = "finalizing";
                agentMessage =
                  "Engagement Expert is polishing for maximum impact...";
                break;
            }
          }

          if (status) {
            await onStatusUpdate(status, agentMessage);
          }
        }
      },
    })
  );

  // Parse results from the tool call responses
  let variationCounter = 1;

  for (const step of result.steps) {
    for (const toolResult of step.toolResults) {
      const toolName = toolResult.toolName;
      const resultData = toolResult.output as Record<string, unknown>;

      if (toolName === "instagramWriter" || toolName === "linkedinWriter") {
        const platform =
          toolName === "instagramWriter" ? "Instagram" : "LinkedIn";
        const variations =
          (resultData.variations as Array<{
            variationNumber: number;
            content: string;
          }>) || [];

        for (const v of variations) {
          allVariations.push({
            variationNumber: variationCounter++,
            platform,
            content: v.content,
          });
        }
      }

      if (toolName === "imageGenerator") {
        const images =
          (resultData.images as Array<{
            variationNumber: number;
            description: string;
            imageUrl: string;
          }>) || [];

        // Attach images to variations by variationNumber
        for (const img of images) {
          const match = allVariations.find(
            (v) => v.variationNumber === img.variationNumber
          );
          if (match) {
            match.imageUrl = img.imageUrl;
            match.imageDescription = img.description;
          } else if (img.variationNumber - 1 < allVariations.length) {
            // Fallback: attach by index
            const idx = img.variationNumber - 1;
            allVariations[idx].imageUrl = img.imageUrl;
            allVariations[idx].imageDescription = img.description;
          }
        }
      }

      if (toolName === "finalizer") {
        const finalized =
          (resultData.finalized as Array<{
            variationNumber: number;
            platform: string;
            content: string;
          }>) || [];

        // Override content with finalized versions
        for (const f of finalized) {
          const match = allVariations.find(
            (v) => v.variationNumber === f.variationNumber
          );
          if (match) {
            match.content = f.content;
          }
        }
      }
    }
  }

  // Extract the concept
  concept =
    context.selectedTopic ||
    context.contentCalendar[0]?.posts[0]?.theme ||
    "Brand awareness and engagement";

  // Ensure we have exactly 4 variations (pad if needed)
  while (allVariations.length < 4) {
    allVariations.push({
      variationNumber: allVariations.length + 1,
      platform: targetPlatform,
      content: `[Variation ${
        allVariations.length + 1
      } - ${targetPlatform}] Content being refined...`,
    });
  }

  // Trim to 4 variations max
  const finalVariations = allVariations.slice(0, 4);

  // --- Guaranteed image generation fallback ---
  // Skip image generation entirely in refinement mode (images are reused from the original)
  // If any variation is missing an image, generate one based on its actual content
  const missingImages = context.skipImageGeneration
    ? [] // Don't generate images during refinement — queue worker will stamp the original image
    : finalVariations.filter((v) => !v.imageUrl);

  if (missingImages.length > 0) {
    if (onStatusUpdate) {
      await onStatusUpdate(
        "designing",
        "Visual Designer is filling in missing images...",
        [
          `${missingImages.length} variation(s) still need images — generating them now based on the post content...`,
        ]
      );
    }

    // Generate all missing images in parallel
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const size: "1024x1024" | "1536x1024" =
      targetPlatform === "Instagram" ? "1024x1024" : "1536x1024";

    await Promise.all(
      missingImages.map(async (variation) => {
        try {
          const imagePrompt = await buildImagePromptFromContent(
            variation.content,
            context.brandSummary,
            targetPlatform,
            context.visualProfile
          );

          console.log(
            `Generating fallback GPT Image 1 for variation ${variation.variationNumber}...`
          );

          const response = await openaiClient.images.generate({
            model: "gpt-image-1",
            prompt: imagePrompt,
            n: 1,
            size,
            quality: "medium",
          });

          const b64Data = response.data?.[0]?.b64_json;
          if (b64Data) {
            const filename = `post-${randomUUID().slice(0, 8)}-v${
              variation.variationNumber
            }.png`;
            const filepath = path.join(UPLOADS_DIR, filename);
            fs.writeFileSync(filepath, Buffer.from(b64Data, "base64"));

            variation.imageUrl = `http://localhost:8000/uploads/${filename}`;
            variation.imageDescription = imagePrompt;

            console.log(
              `Saved fallback image for variation ${variation.variationNumber}: ${filename}`
            );
          }
        } catch (error) {
          console.error(
            `Failed to generate fallback image for variation ${variation.variationNumber}:`,
            error
          );
        }
      })
    );

    if (onStatusUpdate && missingImages.length > 0) {
      await onStatusUpdate("designing", "Visual Designer finished!", [
        "All images are now generated — each one tailored to its post!",
      ]);
    }
  }

  return {
    concept,
    variations: finalVariations,
  };
}

/**
 * Use a quick LLM call to create a bold, typographic image prompt from the post content.
 * Extracts a headline and creates a full prompt for GPT Image 1.
 */
async function buildImagePromptFromContent(
  postContent: string,
  brandSummary: string,
  platform: string,
  visualProfile?: import("./types.js").BrandVisualProfile
): Promise<string> {
  const visualGuidance = visualProfile
    ? `Brand colors: ${visualProfile.colorPalette.join(", ")}. Color mood: ${
        visualProfile.colorMood
      }. Style: ${visualProfile.visualStyle}. Aesthetic: ${
        visualProfile.overallAesthetic
      }.`
    : "";

  try {
    const response = await generateText({
      model: openai("gpt-4.1-mini"),
      system: `You create image generation prompts that produce bold, typographic social media marketing graphics — the kind Lovable, Notion, Stripe, and Vercel post on LinkedIn.

These are POSTER-STYLE designs with:
- A bold headline (5-12 words) rendered as large, clean sans-serif text — this IS the design
- Dark or near-black background
- One dramatic gradient accent sweep (pinks, magentas, blues) cutting across part of the image
- Optional: small product UI or brand element as secondary visual
- Clean, generous whitespace

Output a COMPLETE image generation prompt that includes the headline text to render. The prompt should instruct the model to create the graphic with the headline as the centerpiece.`,
      prompt: `Extract the most impactful stat, claim, or hook from this post and create a full image generation prompt.

Post content:
${postContent.slice(0, 500)}

Brand context: ${brandSummary.slice(0, 500)}
${visualGuidance}
Platform: ${platform} (${
        platform === "Instagram" ? "square 1:1" : "landscape 1.91:1"
      })

Create the full prompt including: (1) the headline text to render, (2) background style, (3) gradient accent direction, (4) any supporting visual element.`,
    });

    return (
      response.text ||
      `A bold typographic marketing graphic on a dark navy background. Large, clean sans-serif headline text reading "Innovation starts here" centered on the image. A dramatic magenta-to-blue gradient accent sweeps diagonally from the bottom-right corner. Clean, minimal poster-style layout with generous whitespace. ${
        platform === "Instagram"
          ? "Square 1:1 format."
          : "Landscape 1.91:1 format."
      }`
    );
  } catch {
    return `A bold typographic marketing graphic on a dark navy background. Large, clean sans-serif headline text reading "Innovation starts here" centered on the image. A dramatic magenta-to-blue gradient accent sweeps diagonally from the bottom-right corner. Clean, minimal poster-style layout with generous whitespace. ${
      platform === "Instagram"
        ? "Square 1:1 format."
        : "Landscape 1.91:1 format."
    }`;
  }
}
