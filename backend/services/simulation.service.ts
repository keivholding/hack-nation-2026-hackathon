import OpenAI from "openai";
import type { Persona } from "../infra/db/schemas/personas.js";
import type { GeneratedPost } from "../infra/db/schemas/generatedPosts.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface SimulationResult {
  personaId: string;
  postId: string;
  liked: boolean;
  shared: boolean;
  commented: boolean;
  commentText: string | null;
  reasoning: string;
  engagementScore: number;
}

/**
 * Prompt-level engagement descriptions (shown to LLM for qualitative reasoning).
 * These guide the LLM's thinking but don't enforce rates — the probabilistic
 * gate below handles that.
 */
const ENGAGEMENT_CONTEXT: Record<
  string,
  { scrollPastRate: string; likeRate: string; commentRate: string; shareRate: string }
> = {
  lurker: {
    scrollPastRate: "most content",
    likeRate: "rarely — only standout posts",
    commentRate: "almost never",
    shareRate: "never",
  },
  casual_engager: {
    scrollPastRate: "most content",
    likeRate: "occasionally when something resonates",
    commentRate: "rarely — only strong reactions",
    shareRate: "very rarely",
  },
  active_commenter: {
    scrollPastRate: "generic content",
    likeRate: "regularly when relevant",
    commentRate: "when you have something to add",
    shareRate: "occasionally for valuable content",
  },
  power_sharer: {
    scrollPastRate: "irrelevant content",
    likeRate: "most relevant content",
    commentRate: "frequently to build visibility",
    shareRate: "when content provides real value",
  },
};

/**
 * Probabilistic engagement gates per behavior type.
 *
 * Even when the LLM says "liked: true", we apply a random probability
 * check to enforce realistic aggregate rates. This solves LLM sycophancy —
 * the model provides qualitative signal (WHY they'd engage), and we enforce
 * quantitative realism (HOW OFTEN they actually do).
 *
 * The LLM's "yes" still matters: a post that gets more LLM "yes" answers
 * passes through more probability gates → higher aggregate engagement.
 * So better posts still outperform weaker ones.
 *
 * Calibrated for a 25-persona panel (10L, 8C, 5A, 2P) × 4 posts:
 *   Expected per post:  ~7-10 likes, ~2-3 comments, ~0-1 shares
 *   Expected total:     ~30-40 likes, ~8-12 comments, ~2-4 shares
 *   Engagement rate:    ~28-40% per post (with differentiation)
 */
const PROBABILITY_GATES: Record<
  string,
  { stopRate: number; likeRate: number; commentRate: number; shareRate: number }
> = {
  lurker:           { stopRate: 0.30, likeRate: 0.50, commentRate: 0.08, shareRate: 0.02 },
  casual_engager:   { stopRate: 0.50, likeRate: 0.60, commentRate: 0.18, shareRate: 0.06 },
  active_commenter: { stopRate: 0.70, likeRate: 0.75, commentRate: 0.35, shareRate: 0.12 },
  power_sharer:     { stopRate: 0.85, likeRate: 0.85, commentRate: 0.45, shareRate: 0.22 },
};

export class SimulationService {
  /**
   * Simulate a single persona's reaction to a single post.
   *
   * Three-stage approach:
   * 1. LLM EVALUATION — qualitative assessment (would they WANT to engage?)
   * 2. SCROLL GATE — probabilistic check on stopping (enforces realistic stop rates)
   * 3. ENGAGEMENT GATE — probabilistic check on each action (enforces realistic like/comment/share rates)
   *
   * The LLM provides the "signal" (which posts are better), and the probability
   * gates provide the "noise" (real-world randomness). Better posts get more
   * LLM "yes" answers → more chances to pass the gate → higher aggregate scores.
   */
  async simulateReaction(
    persona: Persona,
    post: GeneratedPost
  ): Promise<SimulationResult> {
    const interests = (() => {
      try {
        return JSON.parse(persona.interests);
      } catch {
        return [persona.interests];
      }
    })();

    const painPoints = (() => {
      try {
        return JSON.parse(persona.painPoints);
      } catch {
        return [persona.painPoints];
      }
    })();

    const rates = ENGAGEMENT_CONTEXT[persona.socialBehavior] || ENGAGEMENT_CONTEXT.casual_engager;

    const systemPrompt = `You are simulating a REALISTIC social media user. Your goal is ACCURACY, not positivity or negativity.

## WHO YOU ARE:
Name: ${persona.name}
Age: ${persona.ageRange}
Title: ${persona.title} at ${persona.company}
Industry: ${persona.industry}

Bio: ${persona.bio}

Interests: ${Array.isArray(interests) ? interests.join(", ") : interests}
Pain points: ${Array.isArray(painPoints) ? painPoints.join(", ") : painPoints}
Content triggers: ${persona.contentPreferences}
Behavior type: ${persona.socialBehavior}

## YOUR ENGAGEMENT PROFILE (for content from brands you follow):
- You scroll past ${rates.scrollPastRate} of content
- You like ${rates.likeRate}
- You comment on ${rates.commentRate}
- You share/repost ${rates.shareRate}

## CONTEXT:
- You are scrolling through ${post.platform}
- This is from a brand in your industry / area of interest — you follow them
- You spend about 2 seconds deciding whether to stop on a given post

## DECISION FRAMEWORK:
1. Liking is LOW effort — a quick double-tap. You do it when content catches your eye and feels relevant. Not every post, but it's not a high bar either.
2. Commenting takes REAL effort (30+ seconds). You need a genuine reaction: a question, disagreement, personal story, or strong agreement.
3. Sharing is the HIGHEST bar — you're endorsing this to your network. Only for truly valuable or impressive content.
4. Scrolling past is the DEFAULT for content that's fine but not specifically compelling to YOU.
5. Be SPECIFIC — reference actual words/phrases from the post in your reasoning.
6. Content must be relevant to YOUR specific interests, not just generally good.
7. Your behavior type matters: ${persona.socialBehavior === "lurker" ? "you almost never engage publicly" : persona.socialBehavior === "casual_engager" ? "you engage occasionally when something stands out" : persona.socialBehavior === "active_commenter" ? "you enjoy engaging when you have something to add" : "you actively engage and share content that adds value"}.`;

    const userPrompt = `You see this ${post.platform} post from a brand you follow:

---
${post.content}
---

Evaluate in two steps:

1. SCROLL TEST: Does the opening hook or topic make you pause? Is it relevant to YOUR interests?
2. ENGAGEMENT: If you stopped, do you like it? Comment? Share? Or just read and move on?

Remember: you're a "${persona.socialBehavior}" — you scroll past ${rates.scrollPastRate} of posts. But when content IS relevant and well-crafted, you DO engage according to your rates above.

Return ONLY valid JSON:
{
  "stoppedScrolling": true/false,
  "liked": true/false,
  "shared": true/false,
  "commented": true/false,
  "commentText": "your exact comment if you commented, or null",
  "reasoning": "First person, 1-2 sentences. Be specific about what did or didn't work for you."
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 300,
      });

      const text = response.choices[0]?.message?.content || "";
      const cleaned = text.replace(/```json?\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      const gates = PROBABILITY_GATES[persona.socialBehavior] || PROBABILITY_GATES.casual_engager;

      // Stage 1: LLM says whether they'd WANT to stop/engage (qualitative signal)
      const llmStopped = Boolean(parsed.stoppedScrolling);
      const llmLiked = Boolean(parsed.liked);
      const llmCommented = Boolean(parsed.commented);
      const llmShared = Boolean(parsed.shared);

      // Stage 2: Probabilistic scroll gate — even if LLM says "stopped", apply real-world probability
      const stopped = llmStopped && Math.random() < gates.stopRate;

      // Stage 3: Probabilistic engagement gates — each action must pass its own probability check
      const liked = stopped && llmLiked && Math.random() < gates.likeRate;
      const commented = stopped && llmCommented && Math.random() < gates.commentRate;
      const shared = stopped && llmShared && Math.random() < gates.shareRate;

      // Calculate weighted engagement score: like=1, comment=3, share=5
      let score = 0;
      if (liked) score += 1;
      if (commented) score += 3;
      if (shared) score += 5;

      // Build reasoning — include gate info for transparency
      let reasoning = parsed.reasoning || "Scrolled past without noticing";
      if (llmStopped && !stopped) {
        reasoning = `Glanced at it but kept scrolling — ${reasoning}`;
      }

      return {
        personaId: persona.id,
        postId: post.id,
        liked,
        shared,
        commented,
        commentText: commented ? (parsed.commentText || null) : null,
        reasoning,
        engagementScore: score,
      };
    } catch (error) {
      console.error(
        `Simulation failed for persona ${persona.name} on post ${post.id}:`,
        error
      );

      return {
        personaId: persona.id,
        postId: post.id,
        liked: false,
        shared: false,
        commented: false,
        commentText: null,
        reasoning: "Simulation could not be completed",
        engagementScore: 0,
      };
    }
  }

  /**
   * Run simulation for all personas against all posts, in parallel batches.
   */
  async runFullSimulation(
    personaList: Persona[],
    posts: GeneratedPost[],
    onProgress?: (message: string) => Promise<void>
  ): Promise<SimulationResult[]> {
    const allResults: SimulationResult[] = [];
    const BATCH_SIZE = 8;

    // Build all (persona, post) pairs
    const pairs: { persona: Persona; post: GeneratedPost }[] = [];
    for (const persona of personaList) {
      for (const post of posts) {
        pairs.push({ persona, post });
      }
    }

    // Process in batches
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);

      if (onProgress) {
        const personaNames = [...new Set(batch.map((p) => p.persona.name))];
        const personaDetails = personaNames
          .map((name) => {
            const p = personaList.find((pl) => pl.name === name);
            return p ? `${name} (${p.title})` : name;
          })
          .join(", ");
        await onProgress(`${personaDetails} scrolling through the feed...`);
      }

      const batchResults = await Promise.all(
        batch.map(({ persona, post }) => this.simulateReaction(persona, post))
      );

      allResults.push(...batchResults);

      // Log interesting reactions
      if (onProgress) {
        const engaged = batchResults.filter((r) => r.liked || r.commented || r.shared);
        const scrolledPast = batchResults.filter((r) => !r.liked && !r.commented && !r.shared);

        if (scrolledPast.length > 0 && engaged.length === 0) {
          await onProgress(`All ${scrolledPast.length} scrolled past — no engagement on these`);
        } else if (engaged.length > 0) {
          for (const r of engaged) {
            const persona = personaList.find((p) => p.id === r.personaId);
            const post = posts.find((p) => p.id === r.postId);
            const actions: string[] = [];
            if (r.liked) actions.push("liked");
            if (r.commented) actions.push("commented");
            if (r.shared) actions.push("shared");
            await onProgress(
              `${persona?.name || "Someone"} ${actions.join(" & ")} Variation ${post?.variationNumber || "?"}`
            );
          }
        }

        const completed = Math.min(i + BATCH_SIZE, pairs.length);
        const total = pairs.length;
        const pct = Math.round((completed / total) * 100);
        await onProgress(`${completed}/${total} reactions simulated (${pct}%)`);
      }
    }

    return allResults;
  }
}
