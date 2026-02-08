import { Queue, Worker } from "bullmq";
import { WebScraperService } from "./scraper.service.js";
import { OpenAIService } from "./openai.service.js";
import { ContentCalendarService } from "./contentCalendar.service.js";
import { PersonaService } from "./persona.service.js";
import { SimulationService } from "./simulation.service.js";
import { runContentAgent } from "./agents/orchestrator.js";
import type { AgentContext, ContentCalendarDay } from "./agents/types.js";
import { AuthRepository } from "../modules/auth/auth.repository.js";
import { ContentCalendarRepository } from "../modules/content/content.repository.js";
import { GeneratedPostsRepository } from "../modules/content/generatedPosts.repository.js";
import { PersonaRepository } from "../modules/content/persona.repository.js";
import { SimulationRepository } from "../modules/content/simulation.repository.js";

const connection = {
  host: "localhost",
  port: 6379,
};

export const brandAnalysisQueue = new Queue("brand-analysis", { connection });
export const contentCalendarQueue = new Queue("content-calendar", { connection });
export const postGenerationQueue = new Queue("post-generation", { connection });
export const personaGenerationQueue = new Queue("persona-generation", { connection });
export const simulationQueue = new Queue("audience-simulation", { connection });

interface BrandAnalysisJob {
  userId: string;
  website: string;
}

interface ContentCalendarJob {
  userId: string;
}

interface PostGenerationJob {
  userId: string;
  basePost?: string;
  basePostPlatform?: string;
  refinementFeedback?: string;
  originalImageUrl?: string;
  originalImageDescription?: string;
}

interface PersonaGenerationJob {
  userId: string;
}

interface SimulationJob {
  userId: string;
}

// Worker to process brand analysis jobs
export const startBrandAnalysisWorker = () => {
  const scraperService = new WebScraperService();
  const openaiService = new OpenAIService();
  const authRepository = new AuthRepository();

  const worker = new Worker<BrandAnalysisJob>(
    "brand-analysis",
    async (job) => {
      const { userId, website } = job.data;

      console.log(`Processing brand analysis for user ${userId}`);

      try {
        // Stage 1: Discovering the website
        await authRepository.updateUser(userId, {
          brandAnalysisStatus: "discovering",
        });
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Stage 2: Scraping pages + images
        await authRepository.updateUser(userId, {
          brandAnalysisStatus: "exploring",
        });

        const scrapeResult = await scraperService.scrapeWebsite(website);

        if (scrapeResult.pages.length === 0) {
          throw new Error("Failed to scrape website");
        }

        console.log(
          `Scraped ${scrapeResult.pages.length} pages, ${scrapeResult.images.length} images, ${scrapeResult.designSignals.cssColors.length} CSS colors`
        );

        // Stage 3: Analyzing visual identity (images + colors)
        await authRepository.updateUser(userId, {
          brandAnalysisStatus: "scanning_visuals",
        });

        const visualProfile = await openaiService.analyzeImages(
          scrapeResult.images,
          scrapeResult.designSignals
        );

        console.log(
          `Visual profile: ${visualProfile.overallAesthetic} (${visualProfile.lightOrDark})`
        );

        // Stage 4: Building comprehensive brand profile
        await authRepository.updateUser(userId, {
          brandAnalysisStatus: "analyzing_identity",
        });

        const brandProfile = await openaiService.generateBrandProfile(
          scrapeResult.pages,
          visualProfile
        );

        // Stage 5: Crafting final summary
        await authRepository.updateUser(userId, {
          brandAnalysisStatus: "crafting",
        });
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Serialize the full brand profile into the rich text format agents consume
        const serializedProfile =
          OpenAIService.serializeBrandProfile(brandProfile);

        await authRepository.updateUser(userId, {
          aiBrandSummary: serializedProfile,
          brandVisualProfile: JSON.stringify(visualProfile),
          brandAnalysisStatus: "complete",
          onboardingStep: 2,
        });

        console.log(`Completed brand analysis for user ${userId}`);
        console.log(`  Industry: ${brandProfile.industry}`);
        console.log(`  Voice: ${brandProfile.voiceAndTone.substring(0, 80)}...`);
        console.log(`  Colors: ${visualProfile.colorPalette.join(", ")}`);
      } catch (error) {
        console.error(`Brand analysis failed for user ${userId}:`, error);

        await authRepository.updateUser(userId, {
          brandAnalysisStatus: "error",
          // Don't advance step on error - keep at step 1
        });

        throw error;
      }
    },
    { connection }
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.log(`Job ${job?.id} failed:`, err);
  });

  return worker;
};

// Worker to process content calendar generation
export const startContentCalendarWorker = () => {
  const calendarService = new ContentCalendarService();
  const authRepository = new AuthRepository();
  const calendarRepository = new ContentCalendarRepository();

  const worker = new Worker<ContentCalendarJob>(
    "content-calendar",
    async (job) => {
      const { userId } = job.data;

      console.log(`Processing content calendar for user ${userId}`);

      try {
        const user = await authRepository.findUserById(userId);
        if (!user) {
          throw new Error("User not found");
        }

        await authRepository.updateUser(userId, {
          calendarGenerationStatus: "planning",
        });
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const platforms = user.platforms
          ? JSON.parse(user.platforms)
          : ["Instagram", "LinkedIn"];
        const postsPerWeek = parseInt(user.postingFrequency || "3");

        await authRepository.updateUser(userId, {
          calendarGenerationStatus: "organizing",
        });

        const calendar = await calendarService.generateContentCalendar(
          user.aiBrandSummary || "",
          platforms,
          user.goals || "",
          user.contentPlan || "",
          postsPerWeek
        );

        await authRepository.updateUser(userId, {
          calendarGenerationStatus: "finalizing",
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await calendarRepository.deleteUserCalendar(userId);

        const postsToCreate = calendar.flatMap((day) =>
          day.posts.map((post) => ({
            userId,
            dayOfWeek: day.day,
            dayNumber: day.dayNumber,
            postNumber: post.postNumber,
            theme: post.theme,
            platform: post.platform,
          }))
        );

        await calendarRepository.createBulk(postsToCreate);

        await authRepository.updateUser(userId, {
          calendarGenerationStatus: "complete",
          onboardingStep: 4,
        });

        console.log(`Completed content calendar for user ${userId}`);
      } catch (error) {
        console.error(
          `Content calendar generation failed for user ${userId}:`,
          error
        );

        await authRepository.updateUser(userId, {
          calendarGenerationStatus: "error",
          // Don't advance step on error - keep at step 2
        });

        throw error;
      }
    },
    { connection }
  );

  worker.on("completed", (job) => {
    console.log(`Calendar job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.log(`Calendar job ${job?.id} failed:`, err);
  });

  return worker;
};

// Worker to process post generation via AI agent orchestrator
export const startPostGenerationWorker = () => {
  const authRepository = new AuthRepository();
  const calendarRepository = new ContentCalendarRepository();
  const generatedPostsRepository = new GeneratedPostsRepository();

  const worker = new Worker<PostGenerationJob>(
    "post-generation",
    async (job) => {
      const { userId, basePost, basePostPlatform, refinementFeedback, originalImageUrl, originalImageDescription } = job.data;

      console.log(`Processing post generation for user ${userId}${refinementFeedback ? ` (refinement: ${refinementFeedback})` : ""}`);

      try {
        const user = await authRepository.findUserById(userId);
        if (!user) {
          throw new Error("User not found");
        }

        // Reset activity log for a fresh run
        await authRepository.updateUser(userId, {
          postGenerationStatus: "orchestrating",
          currentAgent: "Lead Strategist is analyzing your brand...",
          agentActivityLog: JSON.stringify([]),
        });

        // Build the content calendar from DB
        const calendarRows = await calendarRepository.getUserCalendar(userId);
        const calendarByDay = new Map<number, ContentCalendarDay>();

        for (const row of calendarRows) {
          if (!calendarByDay.has(row.dayNumber)) {
            calendarByDay.set(row.dayNumber, {
              day: row.dayOfWeek,
              dayNumber: row.dayNumber,
              posts: [],
            });
          }
          calendarByDay.get(row.dayNumber)!.posts.push({
            postNumber: row.postNumber,
            theme: row.theme,
            platform: row.platform,
          });
        }

        const contentCalendar = Array.from(calendarByDay.values()).sort(
          (a, b) => a.dayNumber - b.dayNumber
        );

        const platforms: string[] = user.platforms
          ? JSON.parse(user.platforms)
          : ["Instagram", "LinkedIn"];

        // Parse visual profile if available
        let visualProfile;
        try {
          visualProfile = user.brandVisualProfile
            ? JSON.parse(user.brandVisualProfile)
            : undefined;
        } catch {
          visualProfile = undefined;
        }

        // When regenerating, force the platform to match the original post
        const effectivePlatforms = basePostPlatform ? [basePostPlatform] : platforms;

        const context: AgentContext = {
          brandSummary: user.aiBrandSummary || "",
          platforms: effectivePlatforms,
          goals: user.goals || "",
          contentCalendar,
          website: user.website || undefined,
          additionalInfo: user.additionalInfo || undefined,
          visualProfile,
          selectedTopic: user.selectedTopic || undefined,
          basePost: basePost || undefined,
          refinementFeedback: refinementFeedback || undefined,
          skipImageGeneration: Boolean(basePost), // Reuse original image during refinement
        };

        // Run the orchestrator with status + activity log callback
        const agentResult = await runContentAgent(
          context,
          async (status: string, agentMessage: string, logMessages?: string[]) => {
            // Read current log, append new messages, and save
            const currentUser = await authRepository.findUserById(userId);
            const existingLog: string[] = currentUser?.agentActivityLog
              ? JSON.parse(currentUser.agentActivityLog)
              : [];
            const updatedLog = [...existingLog, ...(logMessages || [])];

            await authRepository.updateUser(userId, {
              postGenerationStatus: status,
              currentAgent: agentMessage,
              agentActivityLog: JSON.stringify(updatedLog),
            });
          }
        );

        // In regeneration mode, the original post is already saved as Variation 1
        // by the controller. We only delete posts that aren't the original.
        const isRegeneration = Boolean(basePost);

        if (!isRegeneration) {
          // Fresh generation: clear all old posts
          await generatedPostsRepository.deleteByUserId(userId);
        }

        // Save the new variations (offset to 2-5 if regenerating, since 1 is the original)
        const variationOffset = isRegeneration ? 1 : 0;
        const postsToCreate = agentResult.variations.map((v) => ({
          userId,
          concept: agentResult.concept,
          variationNumber: v.variationNumber + variationOffset,
          platform: v.platform,
          content: v.content,
          // In regeneration mode, reuse the original post's image (text-only refinement)
          imageUrl: isRegeneration ? (originalImageUrl || v.imageUrl || null) : (v.imageUrl || null),
          imageDescription: isRegeneration ? (originalImageDescription || v.imageDescription || null) : (v.imageDescription || null),
        }));

        await generatedPostsRepository.createBulk(postsToCreate);

        // Append final message to the activity log
        const finalUser = await authRepository.findUserById(userId);
        const finalLog: string[] = finalUser?.agentActivityLog
          ? JSON.parse(finalUser.agentActivityLog)
          : [];
        finalLog.push(
          isRegeneration
            ? "4 refined variations ready alongside your original! Let's test them with your focus group..."
            : "All 4 variations are ready! Now let's see how your audience reacts..."
        );

        await authRepository.updateUser(userId, {
          postGenerationStatus: "complete",
          currentAgent: "All agents have finished! Your posts are ready.",
          agentActivityLog: JSON.stringify(finalLog),
          onboardingStep: 6,
        });

        // Auto-queue the audience simulation
        await simulationQueue.add("simulate-audience", { userId });
        console.log(`Queued audience simulation for user ${userId}`);

        console.log(`Completed post generation for user ${userId}`);
      } catch (error) {
        console.error(
          `Post generation failed for user ${userId}:`,
          error
        );

        await authRepository.updateUser(userId, {
          postGenerationStatus: "error",
          currentAgent: "Something went wrong. Please try again.",
          // Don't advance step on error
        });

        throw error;
      }
    },
    { connection }
  );

  worker.on("completed", (job) => {
    console.log(`Post generation job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.log(`Post generation job ${job?.id} failed:`, err);
  });

  return worker;
};

// Worker to generate lookalike audience personas
export const startPersonaGenerationWorker = () => {
  const personaService = new PersonaService();
  const authRepository = new AuthRepository();
  const personaRepository = new PersonaRepository();

  const worker = new Worker<PersonaGenerationJob>(
    "persona-generation",
    async (job) => {
      const { userId } = job.data;
      console.log(`Processing persona generation for user ${userId}`);

      try {
        await authRepository.updateUser(userId, {
          personaGenerationStatus: "generating",
        });

        const user = await authRepository.findUserById(userId);
        if (!user) throw new Error("User not found");

        // Parse brand info for persona generation
        const platforms: string[] = user.platforms
          ? JSON.parse(user.platforms)
          : ["Instagram", "LinkedIn"];

        const generatedPersonas = await personaService.generatePersonas(
          user.aiBrandSummary || "",
          "", // target audience is embedded in the brand summary
          "", // industry is embedded in the brand summary
          user.goals || "",
          platforms
        );

        // Clear old personas and insert new ones
        await personaRepository.deleteByUserId(userId);

        const personasToCreate = generatedPersonas.map((p) => ({
          userId,
          name: p.name,
          title: p.title,
          company: p.company,
          industry: p.industry,
          ageRange: p.ageRange,
          bio: p.bio,
          interests: JSON.stringify(p.interests),
          painPoints: JSON.stringify(p.painPoints),
          contentPreferences: p.contentPreferences,
          socialBehavior: p.socialBehavior,
          platform: p.platform,
        }));

        await personaRepository.createBulk(personasToCreate);

        await authRepository.updateUser(userId, {
          personaGenerationStatus: "complete",
        });

        console.log(
          `Generated ${generatedPersonas.length} personas for user ${userId}`
        );
      } catch (error) {
        console.error(
          `Persona generation failed for user ${userId}:`,
          error
        );
        await authRepository.updateUser(userId, {
          personaGenerationStatus: "error",
        });
        throw error;
      }
    },
    { connection }
  );

  worker.on("completed", (job) => {
    console.log(`Persona generation job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.log(`Persona generation job ${job?.id} failed:`, err);
  });

  return worker;
};

// Worker to run audience simulation (each persona evaluates each post)
export const startSimulationWorker = () => {
  const simulationService = new SimulationService();
  const authRepository = new AuthRepository();
  const personaRepository = new PersonaRepository();
  const generatedPostsRepository = new GeneratedPostsRepository();
  const simulationRepository = new SimulationRepository();

  const worker = new Worker<SimulationJob>(
    "audience-simulation",
    async (job) => {
      const { userId } = job.data;
      console.log(`Processing audience simulation for user ${userId}`);

      try {
        await authRepository.updateUser(userId, {
          simulationStatus: "simulating",
          simulationActivityLog: JSON.stringify([
            "Assembling focus group panel...",
          ]),
        });

        // Get personas and posts
        const personaList = await personaRepository.getByUserId(userId);
        const allPosts = await generatedPostsRepository.getByUserId(userId);

        if (personaList.length === 0) {
          throw new Error("No personas found — persona generation may not have completed");
        }

        if (allPosts.length === 0) {
          throw new Error("No generated posts found");
        }

        // Filter out posts that already have simulation results (e.g. the original post during regeneration)
        const postsNeedingSimulation = [];
        const postsAlreadySimulated = [];
        for (const post of allPosts) {
          const existingSims = await simulationRepository.getByPostId(post.id);
          if (existingSims.length > 0) {
            postsAlreadySimulated.push(post);
          } else {
            postsNeedingSimulation.push(post);
          }
        }

        // Only use posts that need simulation for the simulation run
        const posts = postsNeedingSimulation;

        const updateLog = async (message: string) => {
          const currentUser = await authRepository.findUserById(userId);
          const existingLog: string[] = currentUser?.simulationActivityLog
            ? JSON.parse(currentUser.simulationActivityLog)
            : [];
          existingLog.push(message);
          await authRepository.updateUser(userId, {
            simulationActivityLog: JSON.stringify(existingLog),
          });
        };

        if (posts.length > 0) {
          if (postsAlreadySimulated.length > 0) {
            await updateLog(
              `${postsAlreadySimulated.length} post(s) already tested (original) — simulating ${posts.length} new variation(s) with ${personaList.length} panelists`
            );
          } else {
            await updateLog(
              `Focus group ready — ${personaList.length} panelists will review ${posts.length} post variations`
            );
          }

          // Run the full simulation on posts that need it
          const results = await simulationService.runFullSimulation(
            personaList,
            posts,
            async (message: string) => {
              await updateLog(message);
            }
          );

          // Save new simulation results to the database
          const simsToCreate = results.map((r) => ({
            postId: r.postId,
            personaId: r.personaId,
            liked: r.liked,
            shared: r.shared,
            commented: r.commented,
            commentText: r.commentText,
            reasoning: r.reasoning,
            engagementScore: r.engagementScore,
          }));

          await simulationRepository.createBulk(simsToCreate);
        } else {
          await updateLog("All posts already have focus group results — skipping to summary.");
        }

        // Calculate and log final summary (include ALL posts for complete picture)
        const allSimResults = [];
        for (const post of allPosts) {
          const sims = await simulationRepository.getByPostId(post.id);
          for (const s of sims) {
            allSimResults.push(s);
          }
        }

        const postScores = new Map<string, number>();
        for (const r of allSimResults) {
          postScores.set(r.postId, (postScores.get(r.postId) || 0) + r.engagementScore);
        }

        const totalLikes = allSimResults.filter((r) => r.liked).length;
        const totalShares = allSimResults.filter((r) => r.shared).length;
        const totalComments = allSimResults.filter((r) => r.commented).length;

        const totalScrolled = allSimResults.filter((r) => !r.liked && !r.shared && !r.commented).length;
        const totalReactions = allSimResults.length;
        const engRate = totalReactions > 0 ? Math.round(((totalReactions - totalScrolled) / totalReactions) * 100) : 0;
        await updateLog(
          `Focus group complete — ${engRate}% overall engagement rate (${totalLikes} likes, ${totalComments} comments, ${totalShares} shares)`
        );

        // Find winning post (across ALL posts including original)
        let winningPostId = "";
        let highestScore = -1;
        for (const [postId, score] of postScores) {
          if (score > highestScore) {
            highestScore = score;
            winningPostId = postId;
          }
        }

        const winningPost = allPosts.find((p) => p.id === winningPostId);
        if (winningPost) {
          const label = winningPost.variationNumber === 1 && postsAlreadySimulated.length > 0
            ? "Your original post"
            : `Variation ${winningPost.variationNumber}`;
          await updateLog(
            `${label} is the top performer — highest engagement from the panel`
          );
        }

        await authRepository.updateUser(userId, {
          simulationStatus: "complete",
          onboardingStep: 7,
        });

        console.log(`Completed audience simulation for user ${userId}`);
      } catch (error) {
        console.error(
          `Audience simulation failed for user ${userId}:`,
          error
        );
        await authRepository.updateUser(userId, {
          simulationStatus: "error",
        });
        throw error;
      }
    },
    { connection }
  );

  worker.on("completed", (job) => {
    console.log(`Simulation job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.log(`Simulation job ${job?.id} failed:`, err);
  });

  return worker;
};
