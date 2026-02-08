import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ContentCalendarDay {
  day: string;
  dayNumber: number;
  posts: Array<{
    postNumber: number;
    theme: string;
    platform: string;
  }>;
}

export class ContentCalendarService {
  async generateContentCalendar(
    brandSummary: string,
    platforms: string[],
    goals: string,
    contentPlan: string,
    postsPerWeek: number
  ): Promise<ContentCalendarDay[]> {
    const prompt = `You are a social media content strategist. Create a 7-day content calendar based on the following information:

Brand Summary: ${brandSummary}

Available Platforms: ${platforms.join(", ")}
Goals: ${goals || "Increase brand awareness and engagement"}
Content Plan: ${contentPlan || "General brand content"}
Posts Per Week: ${postsPerWeek}

Requirements:
1. Distribute ${postsPerWeek} posts across 7 days (Monday-Sunday)
2. Each post should have a BROAD, EVERGREEN theme (not specific events or products)
3. Themes should be general content buckets like:
   - "Behind the scenes"
   - "Customer story"
   - "Product education"
   - "Industry insight"
   - "Brand values"
   - "Tips & advice"
   - "Team spotlight"
   - "User-generated content"
   - "How-to guide"
   - "Motivation & inspiration"
4. Alternate between platforms when possible
5. Consider posting on different days based on platform best practices

Return ONLY a valid JSON array (no markdown, no explanation) with this exact structure:
[
  {
    "day": "Monday",
    "dayNumber": 1,
    "posts": [
      {"postNumber": 1, "theme": "Behind the scenes", "platform": "LinkedIn"}
    ]
  },
  ...
]

Keep themes BROAD, EVERGREEN, and REUSABLE!`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a social media content strategist. Return ONLY valid JSON, no markdown formatting.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content || "";

      // Clean up any markdown code blocks
      const cleanedContent = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const calendar = JSON.parse(cleanedContent);
      console.log("Generated content calendar:", calendar.length, "days");
      return calendar;
    } catch (error) {
      console.error("OpenAI API error:", error);
      throw new Error("Failed to generate content calendar");
    }
  }
}
