import OpenAI from "openai";
import axios from "axios";
import type {
  ScrapedPage,
  ScrapedImage,
  SiteDesignSignals,
} from "./scraper.service.js";

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface BrandVisualProfile {
  colorPalette: string[]; // e.g. ["#1a1a2e", "#e94560", "#ffffff"]
  colorMood: string; // e.g. "Dark and bold with vibrant accents"
  visualStyle: string; // e.g. "Minimalist, high-contrast photography with muted tones"
  imageryThemes: string[]; // e.g. ["technology", "people working", "abstract patterns"]
  overallAesthetic: string; // e.g. "Premium, modern, tech-forward"
  lightOrDark: "light" | "dark" | "mixed";
}

export interface BrandProfile {
  summary: string; // Core brand summary (who they are, what they do)
  voiceAndTone: string; // How they speak (formal/casual, witty/serious, etc.)
  targetAudience: string; // Who they're talking to
  valuePropositions: string[]; // Key selling points
  contentPillars: string[]; // Main themes/topics
  languagePatterns: string; // Words/phrases they use, jargon, style quirks
  industry: string; // Industry/sector
  visualProfile: BrandVisualProfile;
}

export class OpenAIService {
  /**
   * Step 1: Analyze scraped images using GPT-4.1-mini vision.
   * Sends a batch of image URLs and asks the model to describe
   * their visual themes, colors, and mood.
   */
  async analyzeImages(
    images: ScrapedImage[],
    designSignals: SiteDesignSignals
  ): Promise<BrandVisualProfile> {
    if (images.length === 0) {
      return this.buildFallbackVisualProfile(designSignals);
    }

    // Validate images by checking actual content type via HEAD requests
    // Many CDN URLs serve AVIF/WebP without a file extension, so we can't trust URLs alone
    const validatedImages: ScrapedImage[] = [];

    for (const img of images) {
      if (validatedImages.length >= 8) break; // check a few extra in case some fail

      try {
        // Quick reject by extension
        const urlPath = new URL(img.url).pathname.toLowerCase();
        if (
          urlPath.endsWith(".avif") ||
          urlPath.endsWith(".svg") ||
          urlPath.endsWith(".tiff") ||
          urlPath.endsWith(".tif") ||
          urlPath.endsWith(".bmp") ||
          urlPath.endsWith(".ico") ||
          urlPath.endsWith(".heic") ||
          urlPath.endsWith(".heif")
        ) {
          continue;
        }

        // HEAD request to check actual content type
        const head = await axios.head(img.url, {
          timeout: 5000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "image/png, image/jpeg, image/gif, image/webp",
          },
        });

        const contentType = (head.headers["content-type"] || "").toLowerCase();
        if (SUPPORTED_MIME_TYPES.has(contentType.split(";")[0].trim())) {
          validatedImages.push(img);
        } else {
          console.log(
            `Skipping image (unsupported type: ${contentType}): ${img.url.substring(0, 80)}`
          );
        }
      } catch {
        // If HEAD fails, skip this image
        console.log(`Skipping image (HEAD failed): ${img.url.substring(0, 80)}`);
      }
    }

    // Pick up to 6 validated images
    const imagesToAnalyze = validatedImages.slice(0, 6);

    if (imagesToAnalyze.length === 0) {
      console.log(
        "No supported images found for vision analysis, using CSS-based fallback"
      );
      return this.buildFallbackVisualProfile(designSignals);
    }

    console.log(
      `Analyzing ${imagesToAnalyze.length} validated images (out of ${images.length} scraped)`
    );

    const imageContent: OpenAI.ChatCompletionContentPart[] = [];

    // Add instructions
    imageContent.push({
      type: "text",
      text: `I'm analyzing a brand's website. Below are ${imagesToAnalyze.length} images from their site, plus some design signals I extracted from their CSS/HTML.

CSS Colors found on the site: ${designSignals.cssColors.slice(0, 15).join(", ") || "none detected"}
Theme color meta tag: ${designSignals.themeColor || "not set"}
Body classes: ${designSignals.bodyClasses.join(" ") || "none"}

For each image, note the dominant colors, mood, and visual style. Then provide a consolidated analysis.`,
    });

    // Add each image
    for (const img of imagesToAnalyze) {
      imageContent.push({
        type: "image_url",
        image_url: {
          url: img.url,
          detail: "low", // low detail to save tokens/cost
        },
      });
      imageContent.push({
        type: "text",
        text: `Image context: "${img.alt || img.context || "no description"}"`,
      });
    }

    // Final instruction
    imageContent.push({
      type: "text",
      text: `Now consolidate your analysis into a JSON response with this EXACT structure:
{
  "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "colorMood": "description of the overall color feeling/mood",
  "visualStyle": "description of the photography/illustration style used",
  "imageryThemes": ["theme1", "theme2", "theme3"],
  "overallAesthetic": "one-line description of the brand's visual identity",
  "lightOrDark": "light" or "dark" or "mixed"
}

Return ONLY valid JSON. The colorPalette should be the 4-6 most prominent brand colors you see across the images and CSS data combined.`,
    });

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a visual brand analyst. You analyze website imagery and design to extract a brand's visual identity — colors, style, mood, and aesthetic patterns. You are precise with color identification and concise with descriptions.",
          },
          {
            role: "user",
            content: imageContent,
          },
        ],
        temperature: 0.3,
        max_tokens: 600,
      });

      const text = response.choices[0]?.message?.content || "";
      const cleaned = text.replace(/```json?\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned) as BrandVisualProfile;

      console.log(
        "Visual profile generated:",
        parsed.overallAesthetic
      );

      return parsed;
    } catch (error) {
      console.error("Image analysis failed, using fallback:", error);
      return this.buildFallbackVisualProfile(designSignals);
    }
  }

  /**
   * Build a basic visual profile from CSS/meta signals when vision fails.
   */
  private buildFallbackVisualProfile(
    designSignals: SiteDesignSignals
  ): BrandVisualProfile {
    const hasOnlyDarkColors = designSignals.cssColors.some(
      (c) =>
        c.startsWith("#0") ||
        c.startsWith("#1") ||
        c.startsWith("#2") ||
        c.startsWith("#3")
    );

    return {
      colorPalette: designSignals.cssColors.slice(0, 6),
      colorMood: "Unable to fully analyze — using detected CSS colors",
      visualStyle: "Modern web design",
      imageryThemes: ["professional", "branded content"],
      overallAesthetic: "Contemporary digital brand",
      lightOrDark: hasOnlyDarkColors ? "dark" : "light",
    };
  }

  /**
   * Step 2: Generate a comprehensive, structured brand profile.
   * Combines scraped text content with visual analysis for a complete picture.
   */
  async generateBrandProfile(
    scrapedPages: ScrapedPage[],
    visualProfile: BrandVisualProfile
  ): Promise<BrandProfile> {
    const combinedContent = scrapedPages
      .map((page) => `Page: ${page.title}\n${page.content}`)
      .join("\n\n");

    const truncatedContent = combinedContent.substring(0, 15000);

    const prompt = `Analyze this website content and the visual brand analysis, then create a comprehensive brand profile.

## Website Content:
${truncatedContent}

## Visual Brand Analysis:
- Color Palette: ${visualProfile.colorPalette.join(", ")}
- Color Mood: ${visualProfile.colorMood}
- Visual Style: ${visualProfile.visualStyle}
- Imagery Themes: ${visualProfile.imageryThemes.join(", ")}
- Overall Aesthetic: ${visualProfile.overallAesthetic}
- Light/Dark: ${visualProfile.lightOrDark}

Return a JSON object with this EXACT structure:
{
  "summary": "2-3 paragraph brand summary — who they are, what they do, what makes them unique",
  "voiceAndTone": "Detailed description of how the brand communicates. Are they formal or casual? Witty or serious? Technical or accessible? Inspirational or pragmatic? Include specific observations from their actual copy.",
  "targetAudience": "Who is their primary audience? Be specific about demographics, psychographics, pain points, and aspirations.",
  "valuePropositions": ["prop1", "prop2", "prop3"],
  "contentPillars": ["pillar1", "pillar2", "pillar3", "pillar4"],
  "languagePatterns": "Specific words, phrases, sentence structures, and jargon they use. Note any recurring patterns, buzzwords, or distinctive language choices. Include examples from their actual copy.",
  "industry": "Their industry or sector"
}

Be SPECIFIC and EVIDENCE-BASED — reference actual content you see. Do not make generic statements.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a senior brand strategist who creates detailed brand profiles by analyzing website content and visual identity. You are precise, specific, and always ground your analysis in actual evidence from the content. You never make generic statements — every observation is backed by what you see.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.5,
        max_tokens: 1500,
      });

      const text = response.choices[0]?.message?.content || "";
      const cleaned = text.replace(/```json?\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      const profile: BrandProfile = {
        summary: parsed.summary || "",
        voiceAndTone: parsed.voiceAndTone || "",
        targetAudience: parsed.targetAudience || "",
        valuePropositions: parsed.valuePropositions || [],
        contentPillars: parsed.contentPillars || [],
        languagePatterns: parsed.languagePatterns || "",
        industry: parsed.industry || "",
        visualProfile,
      };

      console.log(
        "Brand profile generated:",
        profile.summary.substring(0, 80) + "..."
      );

      return profile;
    } catch (error) {
      console.error("Brand profile generation failed:", error);
      // Fall back to simple summary
      const simpleSummary = await this.generateSimpleSummary(scrapedPages);
      return {
        summary: simpleSummary,
        voiceAndTone: "Professional and approachable",
        targetAudience: "General audience",
        valuePropositions: [],
        contentPillars: [],
        languagePatterns: "",
        industry: "Unknown",
        visualProfile,
      };
    }
  }

  /**
   * Fallback: Generate a simple text-only brand summary (original method).
   */
  private async generateSimpleSummary(
    scrapedPages: ScrapedPage[]
  ): Promise<string> {
    const combinedContent = scrapedPages
      .map((page) => `Page: ${page.title}\n${page.content}`)
      .join("\n\n");

    const truncatedContent = combinedContent.substring(0, 15000);

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a brand analyst expert. Analyze website content and create insightful brand summaries.",
          },
          {
            role: "user",
            content: `Analyze this website content and create a comprehensive brand summary including what the brand does, their voice, target audience, and key themes.\n\n${truncatedContent}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      console.error("Simple summary failed:", error);
      throw new Error("Failed to generate brand summary");
    }
  }

  /**
   * Serialize a BrandProfile into a rich text block that can be stored
   * and passed directly to AI agents as context.
   */
  static serializeBrandProfile(profile: BrandProfile): string {
    const vp = profile.visualProfile;

    return `## Brand Identity

${profile.summary}

## Voice & Tone
${profile.voiceAndTone}

## Target Audience
${profile.targetAudience}

## Value Propositions
${profile.valuePropositions.map((v) => `- ${v}`).join("\n")}

## Content Pillars
${profile.contentPillars.map((p) => `- ${p}`).join("\n")}

## Language Patterns
${profile.languagePatterns}

## Industry
${profile.industry}

## Visual Identity
- Color Palette: ${vp.colorPalette.join(", ")}
- Color Mood: ${vp.colorMood}
- Visual Style: ${vp.visualStyle}
- Imagery Themes: ${vp.imageryThemes.join(", ")}
- Overall Aesthetic: ${vp.overallAesthetic}
- Theme: ${vp.lightOrDark}`;
  }
}
