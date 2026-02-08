import { tool } from "ai";
import { z } from "zod";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { pushUpdate } from "../agentContext.js";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Generate a single image with GPT Image 1 and save it locally.
 * GPT Image 1 returns base64 data directly (no temp URL to download).
 */
async function generateSingleImage(
  concept: { variationNumber: number; description: string; headline: string },
  size: "1024x1024" | "1536x1024",
  platform: string,
  brandStyle: string
): Promise<{ variationNumber: number; imageUrl: string; description: string }> {
  const fullPrompt = `Create a bold, typographic social media marketing graphic for ${platform}.

REFERENCE STYLE: Look at how companies like Lovable, Notion, Linear, Stripe, and Vercel design their LinkedIn and Instagram post graphics. These are bold, clean, graphic-design-forward visuals — NOT 3D renders, NOT abstract art, NOT stock photography.

THE DESIGN MUST INCLUDE THIS HEADLINE TEXT (render it large and bold):
"${concept.headline}"

LAYOUT & COMPOSITION:
- The headline text IS the centerpiece — big, bold, clean sans-serif font (like Inter, SF Pro, or Geist)
- Dark or very dark background (deep navy, near-black, charcoal) OR clean white/light background
- One dramatic gradient accent — a sweeping gradient stripe or glow (pinks, magentas, blues, purples) that cuts across part of the image diagonally or from an edge. NOT the entire background — just an accent element
- Optional: a small category label above the headline (e.g. "Customer Stories", "Product Update", "Introducing") in a smaller, lighter font
- Optional: a subtle product UI screenshot, device mockup, or brand element placed below or beside the headline — but the TEXT dominates
- Generous whitespace — let the design breathe
- Company logo or brand mark can appear small at the bottom

VISUAL DIRECTION: ${concept.description}

BRAND CONTEXT: ${brandStyle}

CRITICAL RULES:
- The headline text MUST be crisp, perfectly spelled, and clearly readable
- Use a clean sans-serif typeface — bold weight for the headline
- The gradient accent should feel energetic and premium — think neon pink-to-blue or magenta-to-purple sweeps
- Keep the layout simple — this is a designed poster, not a collage
- The overall feel should be: premium, bold, confident, modern tech company
- ${platform === "Instagram" ? "Square (1:1) format" : "Landscape (1.91:1) format — headline on the left, any visual element on the right"}
- The image should look like it was made by a professional design team, not AI`;

  try {
    console.log(
      `Generating GPT Image 1 image for variation ${concept.variationNumber}...`
    );

    ensureUploadsDir();

    const response = await openaiClient.images.generate({
      model: "gpt-image-1",
      prompt: fullPrompt,
      n: 1,
      size,
      quality: "medium",
    });

    const b64Data = response.data?.[0]?.b64_json;
    if (!b64Data) {
      throw new Error("No image data returned from GPT Image 1");
    }

    const filename = `post-${randomUUID().slice(0, 8)}-v${
      concept.variationNumber
    }.png`;
    const filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(b64Data, "base64"));

    const localUrl = `http://localhost:8000/uploads/${filename}`;

    console.log(
      `Saved image for variation ${concept.variationNumber}: ${filename}`
    );

    return {
      variationNumber: concept.variationNumber,
      imageUrl: localUrl,
      description: concept.description,
    };
  } catch (error) {
    console.error(
      `Failed to generate image for variation ${concept.variationNumber}:`,
      error
    );

    return {
      variationNumber: concept.variationNumber,
      imageUrl: `https://placehold.co/${
        platform === "Instagram" ? "1080x1080" : "1200x627"
      }/6366f1/ffffff?text=V${concept.variationNumber}`,
      description: concept.description,
    };
  }
}

export const imageGenerator = tool({
  description:
    "Generate bold, typographic marketing graphics for social media posts using GPT Image 1. These should look like the kind of visuals Lovable, Notion, Stripe, or Vercel post on LinkedIn — bold headline text on dark backgrounds with dramatic gradient accents. NOT abstract art, NOT 3D renders, NOT stock photos. You MUST pass exactly 4 concepts — one per variation.",
  inputSchema: z.object({
    concepts: z
      .array(
        z.object({
          variationNumber: z
            .number()
            .describe("Which variation this image is for (1-4)"),
          headline: z
            .string()
            .describe(
              "A short, punchy headline (5-12 words max) that will be rendered as large bold text on the graphic. This is the centerpiece of the design. Extract the key message or stat from the post content. Examples: 'Ship 10x faster with AI', 'We just hit 1M users', '$2M+ saved annually in SaaS costs'. Make it bold and attention-grabbing."
            ),
          description: z
            .string()
            .describe(
              "Additional visual direction for the graphic. Describe: (1) background style — dark/light, (2) gradient accent colors and placement, (3) any optional supporting element — a small product screenshot, device mockup, stat callout, or brand element. Keep it simple — the headline text is the star."
            ),
        })
      )
      .describe("Array of exactly 4 image concepts — one for each variation"),
    platform: z
      .string()
      .describe(
        "Target platform - Instagram (square 1:1) or LinkedIn (landscape 1.91:1)"
      ),
    brandVoice: z
      .string()
      .describe(
        "The FULL brand summary/analysis — pass the complete brand context to ensure images match the brand's visual identity"
      ),
  }),
  execute: async ({ concepts, platform, brandVoice }) => {
    const size: "1024x1024" | "1536x1024" =
      platform === "Instagram" ? "1024x1024" : "1536x1024";

    const brandStyle = brandVoice.slice(0, 500);

    await pushUpdate(
      "designing",
      "Visual Designer is generating brand-aligned images...",
      [
        `Generating ${concepts.length} images in parallel — this usually takes about 15 seconds...`,
      ]
    );

    console.log(
      `Generating ${concepts.length} GPT Image 1 images in parallel...`
    );

    let completedCount = 0;

    // Generate all images in parallel instead of sequentially
    const results = await Promise.all(
      concepts.map(async (concept) => {
        const result = await generateSingleImage(
          concept,
          size,
          platform,
          brandStyle
        );
        completedCount++;
        // Push progress update as each image finishes
        await pushUpdate(
          "designing",
          `Visual Designer: ${completedCount}/${concepts.length} images ready...`,
          [
            `Image ${completedCount} of ${concepts.length} is done — ${
              result.imageUrl.includes("placehold")
                ? "used a placeholder for this one"
                : "looking good!"
            }`,
          ]
        );
        return result;
      })
    );

    // Sort by variation number to maintain order
    const images = results.sort(
      (a, b) => a.variationNumber - b.variationNumber
    );

    console.log(`All ${images.length} images generated.`);

    return { images };
  },
});
