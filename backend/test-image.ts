import "dotenv/config";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testImageGeneration() {
  console.log("Testing GPT Image 1...\n");

  try {
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: `Create a bold, typographic social media marketing graphic for LinkedIn in landscape format.

THE DESIGN MUST INCLUDE THIS HEADLINE TEXT (render it large and bold):
"Ship 10x faster with AI-powered workflows"

LAYOUT:
- Dark navy/charcoal background
- The headline text is the centerpiece — big, bold, clean sans-serif font
- A small category label above the headline reading "Product Update" in a smaller, lighter font
- A dramatic gradient accent — a sweeping magenta-to-blue gradient stripe cutting diagonally from the bottom-right corner
- Optional: a small, subtle product UI screenshot below the headline showing an abstracted dashboard
- Generous whitespace — let the design breathe
- Clean, minimal poster-style layout
- The overall feel should be: premium, bold, confident, modern tech company
- Make it look like it was designed by a professional design team at a top startup like Lovable, Notion, or Stripe`,
      n: 1,
      size: "1536x1024",
      quality: "high",
    });

    const b64 = response.data?.[0]?.b64_json;

    if (!b64) {
      console.error("No b64_json in response. Full response:");
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = "test-gpt-image-1.png";
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, Buffer.from(b64, "base64"));

    console.log(`Image saved to: ${filepath}`);
    console.log(`View at: http://localhost:8000/uploads/${filename}`);
    console.log("\nToken usage:", JSON.stringify(response.usage, null, 2));
  } catch (error: unknown) {
    console.error("Image generation failed:\n");
    if (error && typeof error === "object" && "error" in error) {
      console.error(
        JSON.stringify((error as Record<string, unknown>).error, null, 2)
      );
    } else {
      console.error(error);
    }
  }
}

testImageGeneration();
