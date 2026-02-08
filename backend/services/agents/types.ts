export interface ContentCalendarDay {
  day: string;
  dayNumber: number;
  posts: {
    postNumber: number;
    theme: string;
    platform: string;
  }[];
}

export interface BrandVisualProfile {
  colorPalette: string[];
  colorMood: string;
  visualStyle: string;
  imageryThemes: string[];
  overallAesthetic: string;
  lightOrDark: "light" | "dark" | "mixed";
}

export interface AgentContext {
  brandSummary: string; // Full serialized brand profile (text + visual)
  platforms: string[];
  goals: string;
  contentCalendar: ContentCalendarDay[];
  website?: string;
  additionalInfo?: string;
  visualProfile?: BrandVisualProfile; // Structured visual data for image generation
  selectedTopic?: string; // User-selected topic from content calendar (step 4)
  basePost?: string; // Original post content for regeneration (step 8 refinement)
  refinementFeedback?: string; // User's feedback for how to improve the post
  skipImageGeneration?: boolean; // When true, skip DALL-E calls (reuse original image during refinement)
}

export interface PostVariation {
  variationNumber: number;
  platform: string;
  content: string;
  imageUrl?: string;
  imageDescription?: string;
}

export interface AgentResult {
  concept: string;
  variations: PostVariation[];
}

export type StatusUpdateCallback = (
  status: string,
  agentMessage: string,
  logMessages?: string[]
) => Promise<void>;
