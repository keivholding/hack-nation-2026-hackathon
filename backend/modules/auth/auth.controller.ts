import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { AuthRepository } from "./auth.repository.js";
import { brandAnalysisQueue, contentCalendarQueue, postGenerationQueue, personaGenerationQueue } from "../../services/queue.service.js";
import { GeneratedPostsRepository } from "../content/generatedPosts.repository.js";
import { ContentCalendarRepository } from "../content/content.repository.js";
import { PersonaRepository } from "../content/persona.repository.js";
import { SimulationRepository } from "../content/simulation.repository.js";

export class AuthController {
  private authService: AuthService;
  private authRepository: AuthRepository;
  private generatedPostsRepository: GeneratedPostsRepository;
  private calendarRepository: ContentCalendarRepository;
  private personaRepository: PersonaRepository;
  private simulationRepository: SimulationRepository;

  constructor() {
    this.authService = new AuthService();
    this.authRepository = new AuthRepository();
    this.generatedPostsRepository = new GeneratedPostsRepository();
    this.calendarRepository = new ContentCalendarRepository();
    this.personaRepository = new PersonaRepository();
    this.simulationRepository = new SimulationRepository();
  }

  /**
   * Register a new user
   * POST /auth/register
   */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, confirmPassword } = req.body;

      // Validate input
      if (!email || !password || !confirmPassword) {
        res.status(400).json({
          success: false,
          message: "Email, password, and confirm password are required",
        });
        return;
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          message: "Invalid email format",
        });
        return;
      }

      // Password validation (min 6 characters)
      if (password.length < 6) {
        res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters long",
        });
        return;
      }

      const result = await this.authService.register({
        email,
        password,
        confirmPassword,
      });

      // Set HTTP-only cookie
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "User with this email already exists") {
          res.status(409).json({
            success: false,
            message: error.message,
          });
          return;
        }
        if (error.message === "Passwords do not match") {
          res.status(400).json({
            success: false,
            message: error.message,
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Login user
   * POST /auth/login
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: "Email and password are required",
        });
        return;
      }

      const result = await this.authService.login({ email, password });

      // Set HTTP-only cookie
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Invalid email or password") {
          res.status(401).json({
            success: false,
            message: error.message,
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get current user profile
   * GET /auth/me
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      // Get token from cookie or Authorization header
      let token = req.cookies.token;

      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        res.status(401).json({
          success: false,
          message: "No token provided",
        });
        return;
      }

      // Verify token and get user ID
      const { userId } = this.authService.verifyToken(token);

      // Get user profile
      const user = await this.authService.getUserProfile(userId);

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Invalid or expired token") {
          res.status(401).json({
            success: false,
            message: error.message,
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Update onboarding step
   * POST /auth/update-onboarding-step
   */
  updateOnboardingStep = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;

      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        res.status(401).json({
          success: false,
          message: "No token provided",
        });
        return;
      }

      const { userId } = this.authService.verifyToken(token);
      const { step, data } = req.body;

      if (!step || step < 1 || step > 8) {
        res.status(400).json({
          success: false,
          message: "Invalid step number",
        });
        return;
      }

      // Update user with step data
      const updateData: any = {
        onboardingStep: step,
        ...data,
      };

      // If step 1 and website provided, queue brand analysis job
      if (step === 1 && data?.website) {
        updateData.brandAnalysisStatus = "thinking";

        await this.authRepository.updateUser(userId, updateData);

        await brandAnalysisQueue.add("analyze-brand", {
          userId,
          website: data.website,
        });

        console.log(`Queued brand analysis job for user ${userId}`);

        const user = await this.authRepository.findUserById(userId);
        if (!user) {
          res.status(404).json({
            success: false,
            message: "User not found",
          });
          return;
        }

        const { password, ...userWithoutPassword } = user;

        res.status(200).json({
          success: true,
          message: "Onboarding step updated, brand analysis started",
          data: { user: userWithoutPassword },
        });
        return;
      }

      // Step 2: brand review — data saved via /auth/save-brand-profile endpoint

      // If step 3, queue content calendar generation
      if (step === 3) {
        updateData.calendarGenerationStatus = "pending";

        await this.authRepository.updateUser(userId, updateData);

        await contentCalendarQueue.add("generate-calendar", {
          userId,
        });

        console.log(`Queued content calendar job for user ${userId}`);

        const user = await this.authRepository.findUserById(userId);
        if (!user) {
          res.status(404).json({
            success: false,
            message: "User not found",
          });
          return;
        }

        const { password, ...userWithoutPassword } = user;

        res.status(200).json({
          success: true,
          message: "Content calendar generation started",
          data: { user: userWithoutPassword },
        });
        return;
      }

      // Step 4: topic selection — handled by /auth/select-topic endpoint

      // If step 5, queue AI agent post generation
      if (step === 5) {
        updateData.postGenerationStatus = "orchestrating";
        updateData.currentAgent = "Lead Strategist is getting ready...";
        updateData.agentActivityLog = JSON.stringify([]);

        await this.authRepository.updateUser(userId, updateData);

        await postGenerationQueue.add("generate-posts", {
          userId,
        });

        console.log(`Queued post generation job for user ${userId}`);

        const user = await this.authRepository.findUserById(userId);
        if (!user) {
          res.status(404).json({
            success: false,
            message: "User not found",
          });
          return;
        }

        const { password, ...userWithoutPassword } = user;

        res.status(200).json({
          success: true,
          message: "AI agents started generating posts",
          data: { user: userWithoutPassword },
        });
        return;
      }

      const user = await this.authRepository.updateUser(userId, updateData);

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      const { password, ...userWithoutPassword } = user;

      res.status(200).json({
        success: true,
        message: "Onboarding step updated",
        data: { user: userWithoutPassword },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Save updated brand profile (from step 3 review)
   * POST /auth/save-brand-profile
   */
  saveBrandProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;

      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        res.status(401).json({
          success: false,
          message: "No token provided",
        });
        return;
      }

      const { userId } = this.authService.verifyToken(token);
      const { brandSummary, visualProfile } = req.body;

      const updateData: Record<string, unknown> = {};

      if (brandSummary !== undefined) {
        updateData.aiBrandSummary = brandSummary;
      }

      if (visualProfile !== undefined) {
        updateData.brandVisualProfile = JSON.stringify(visualProfile);
      }

      // Advance to step 3 (content plan)
      updateData.onboardingStep = 3;

      const user = await this.authRepository.updateUser(userId, updateData);

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Trigger persona generation in the background
      await personaGenerationQueue.add("generate-personas", { userId });
      console.log(`Queued persona generation for user ${userId}`);

      const { password, ...userWithoutPassword } = user;

      res.status(200).json({
        success: true,
        message: "Brand profile updated",
        data: { user: userWithoutPassword },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Complete onboarding
   * POST /auth/complete-onboarding
   */
  completeOnboarding = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;

      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        res.status(401).json({
          success: false,
          message: "No token provided",
        });
        return;
      }

      const { userId } = this.authService.verifyToken(token);

      const user = await this.authRepository.updateUser(userId, {
        onboardingCompleted: true,
        onboardingStep: 8,
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      const { password, ...userWithoutPassword } = user;

      res.status(200).json({
        success: true,
        message: "Onboarding completed successfully",
        data: { user: userWithoutPassword },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get generated posts for current user
   * GET /auth/generated-posts
   */
  getGeneratedPosts = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;

      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        res.status(401).json({
          success: false,
          message: "No token provided",
        });
        return;
      }

      const { userId } = this.authService.verifyToken(token);

      const posts = await this.generatedPostsRepository.getByUserId(userId);

      res.status(200).json({
        success: true,
        data: { posts },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Submit feedback for a generated post
   * POST /auth/post-feedback
   */
  submitPostFeedback = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;

      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        res.status(401).json({
          success: false,
          message: "No token provided",
        });
        return;
      }

      // Verify token (ensures user is authenticated)
      this.authService.verifyToken(token);

      const { postId, feedback } = req.body;

      if (!postId) {
        res.status(400).json({
          success: false,
          message: "Post ID is required",
        });
        return;
      }

      if (feedback !== "up" && feedback !== "down" && feedback !== null) {
        res.status(400).json({
          success: false,
          message: "Feedback must be 'up', 'down', or null",
        });
        return;
      }

      const post = await this.generatedPostsRepository.updateFeedback(
        postId,
        feedback
      );

      if (!post) {
        res.status(404).json({
          success: false,
          message: "Post not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: { post },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get content calendar themes for topic selection (step 4)
   * GET /auth/content-calendar
   */
  getContentCalendar = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
      }

      const { userId } = this.authService.verifyToken(token);
      const calendarRows = await this.calendarRepository.getUserCalendar(userId);

      // Group by day
      const calendarByDay = new Map<
        number,
        { day: string; dayNumber: number; posts: { postNumber: number; theme: string; platform: string }[] }
      >();

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

      const calendar = Array.from(calendarByDay.values()).sort(
        (a, b) => a.dayNumber - b.dayNumber
      );

      res.status(200).json({
        success: true,
        data: { calendar },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Select a topic from the content calendar (step 4 -> step 5)
   * POST /auth/select-topic
   */
  selectTopic = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
      }

      const { userId } = this.authService.verifyToken(token);
      const { topic } = req.body;

      if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: "Topic is required",
        });
        return;
      }

      const user = await this.authRepository.updateUser(userId, {
        selectedTopic: topic.trim(),
        onboardingStep: 5,
      });

      if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const { password, ...userWithoutPassword } = user;

      res.status(200).json({
        success: true,
        message: "Topic selected",
        data: { user: userWithoutPassword },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get audience simulation results (step 7)
   * GET /auth/simulation-results
   */
  getSimulationResults = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
      }

      const { userId } = this.authService.verifyToken(token);

      // Get posts
      const posts = await this.generatedPostsRepository.getByUserId(userId);

      // Get engagement summaries
      const engagementSummaries =
        await this.simulationRepository.getEngagementByUserId(userId);

      // Get detailed simulations per post
      const postResults = await Promise.all(
        posts.map(async (post) => {
          const simulations = await this.simulationRepository.getByPostId(
            post.id
          );
          const engagement = engagementSummaries.find(
            (e) => e.postId === post.id
          );

          return {
            post,
            simulations,
            engagement: engagement || {
              postId: post.id,
              totalLikes: 0,
              totalShares: 0,
              totalComments: 0,
              totalEngagementScore: 0,
              simulationCount: 0,
            },
          };
        })
      );

      // Sort by engagement rate (highest first) — this is the metric users see
      // Engagement rate = percentage of personas who interacted (liked, commented, or shared)
      postResults.sort((a, b) => {
        const aTotal = a.simulations.length || 1;
        const bTotal = b.simulations.length || 1;
        const aScrolled = a.simulations.filter(
          (s) => !s.liked && !s.shared && !s.commented
        ).length;
        const bScrolled = b.simulations.filter(
          (s) => !s.liked && !s.shared && !s.commented
        ).length;
        const aEngRate = (aTotal - aScrolled) / aTotal;
        const bEngRate = (bTotal - bScrolled) / bTotal;

        // Primary sort: engagement rate. Tie-breaker: weighted engagement score.
        if (bEngRate !== aEngRate) return bEngRate - aEngRate;
        return b.engagement.totalEngagementScore - a.engagement.totalEngagementScore;
      });

      res.status(200).json({
        success: true,
        data: { results: postResults },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Accept a post and complete onboarding (step 7)
   * POST /auth/accept-post
   */
  acceptPost = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
      }

      const { userId } = this.authService.verifyToken(token);
      const { postId } = req.body;

      // Mark the selected post as the accepted one (using feedback field)
      if (postId) {
        await this.generatedPostsRepository.updateFeedback(postId, "up");
      }

      // Advance to step 8 (post refinement & scheduling)
      const user = await this.authRepository.updateUser(userId, {
        selectedPostId: postId || null,
        onboardingStep: 8,
      });

      if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const { password, ...userWithoutPassword } = user;

      res.status(200).json({
        success: true,
        message: "Post selected — proceed to scheduling",
        data: { user: userWithoutPassword },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Schedule a post and complete onboarding
   * POST /auth/schedule-post
   */
  schedulePost = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
      }

      const { userId } = this.authService.verifyToken(token);
      const { postId, scheduledAt } = req.body;

      if (!scheduledAt) {
        res.status(400).json({ success: false, message: "scheduledAt is required" });
        return;
      }

      const user = await this.authRepository.updateUser(userId, {
        selectedPostId: postId || undefined,
        scheduledAt: new Date(scheduledAt),
        onboardingCompleted: true,
        onboardingStep: 8,
      });

      if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const { password, ...userWithoutPassword } = user;

      res.status(200).json({
        success: true,
        message: "Post scheduled — onboarding complete!",
        data: { user: userWithoutPassword },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Regenerate post variations based on user feedback
   * POST /auth/regenerate-post
   */
  regeneratePost = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
      }

      const { userId } = this.authService.verifyToken(token);
      const { feedback } = req.body;

      if (!feedback || !feedback.trim()) {
        res.status(400).json({ success: false, message: "Feedback is required" });
        return;
      }

      // Get the current user to find the selected post
      const currentUser = await this.authRepository.findUserById(userId);
      if (!currentUser) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      // Get the selected post content and save its data for reinsertion
      let basePostContent = "";
      let basePostPlatform = "";
      let originalImageUrl = "";
      let originalImageDescription = "";
      let originalPostData: { concept: string; content: string; platform: string; imageUrl: string | null; imageDescription: string | null } | null = null;
      let originalPostSimulations: Array<{
        personaId: string;
        liked: boolean;
        shared: boolean;
        commented: boolean;
        commentText: string | null;
        reasoning: string | null;
        engagementScore: number;
      }> = [];

      if (currentUser.selectedPostId) {
        const posts = await this.generatedPostsRepository.getByUserId(userId);
        const selectedPost = posts.find((p) => p.id === currentUser.selectedPostId);
        if (selectedPost) {
          basePostContent = selectedPost.content;
          basePostPlatform = selectedPost.platform;
          originalImageUrl = selectedPost.imageUrl || "";
          originalImageDescription = selectedPost.imageDescription || "";
          originalPostData = {
            concept: selectedPost.concept,
            content: selectedPost.content,
            platform: selectedPost.platform,
            imageUrl: selectedPost.imageUrl || null,
            imageDescription: selectedPost.imageDescription || null,
          };

          // Preserve the original post's simulation results
          const sims = await this.simulationRepository.getByPostId(currentUser.selectedPostId);
          originalPostSimulations = sims.map((s) => ({
            personaId: s.personaId,
            liked: s.liked,
            shared: s.shared,
            commented: s.commented,
            commentText: s.commentText,
            reasoning: s.reasoning,
            engagementScore: s.engagementScore,
          }));
        }
      }

      // Clean slate: delete old generated posts and simulation results
      await this.simulationRepository.deleteByUserId(userId);
      await this.generatedPostsRepository.deleteByUserId(userId);

      // Re-insert the original post as Variation 1 so the user can compare
      let reinsertedPostId: string | null = null;
      if (originalPostData) {
        const reinserted = await this.generatedPostsRepository.create({
          userId,
          concept: originalPostData.concept,
          variationNumber: 1,
          platform: originalPostData.platform,
          content: originalPostData.content,
          imageUrl: originalPostData.imageUrl,
          imageDescription: originalPostData.imageDescription,
        });
        reinsertedPostId = reinserted.id;
      }

      // Re-insert the original post's simulation results (so it won't be re-simulated)
      if (reinsertedPostId && originalPostSimulations.length > 0) {
        const simsToReinsert = originalPostSimulations.map((s) => ({
          postId: reinsertedPostId!,
          personaId: s.personaId,
          liked: s.liked,
          shared: s.shared,
          commented: s.commented,
          commentText: s.commentText,
          reasoning: s.reasoning || "",
          engagementScore: s.engagementScore,
        }));
        await this.simulationRepository.createBulk(simsToReinsert);
      }

      // Reset statuses and go back to step 5
      const user = await this.authRepository.updateUser(userId, {
        postGenerationStatus: "orchestrating",
        currentAgent: "Lead Strategist is getting ready...",
        agentActivityLog: JSON.stringify([]),
        simulationStatus: "pending",
        simulationActivityLog: JSON.stringify([]),
        selectedPostId: null,
        onboardingStep: 5,
      });

      // Queue a new post generation job with base post + feedback + original image
      await postGenerationQueue.add("generate-posts", {
        userId,
        basePost: basePostContent,
        basePostPlatform,
        refinementFeedback: feedback.trim(),
        originalImageUrl,
        originalImageDescription,
      });

      console.log(`Queued regeneration job for user ${userId} with feedback: ${feedback.trim()}`);

      if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const { password, ...userWithoutPassword } = user;

      res.status(200).json({
        success: true,
        message: "Regeneration started — creating new variations",
        data: { user: userWithoutPassword },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Refine a post with streaming SSE response
   * POST /auth/refine-post
   */
  refinePost = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
      }

      const { userId } = this.authService.verifyToken(token);
      const { feedback } = req.body;

      if (!feedback || !feedback.trim()) {
        res.status(400).json({ success: false, message: "Feedback is required" });
        return;
      }

      const currentUser = await this.authRepository.findUserById(userId);
      if (!currentUser) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      // Find the selected post
      let basePostContent = "";
      let basePostPlatform = "";
      let basePostConcept = "";
      let basePostImageUrl: string | null = null;
      let basePostImageDescription: string | null = null;

      if (currentUser.selectedPostId) {
        const post = await this.generatedPostsRepository.getById(currentUser.selectedPostId);
        if (post) {
          basePostContent = post.content;
          basePostPlatform = post.platform;
          basePostConcept = post.concept;
          basePostImageUrl = post.imageUrl || null;
          basePostImageDescription = post.imageDescription || null;
        }
      }

      if (!basePostContent) {
        res.status(400).json({ success: false, message: "No selected post to refine" });
        return;
      }

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Use streamText from Vercel AI SDK
      const { streamText } = await import("ai");
      const { openai } = await import("@ai-sdk/openai");

      const brandContext = currentUser.aiBrandSummary || "";

      const result = streamText({
        model: openai("gpt-4.1-mini"),
        system: `You are refining a social media post for a specific brand. You must keep the same core topic, angle, and structure. Apply the user's feedback as targeted adjustments — you are fine-tuning, not rewriting from scratch.

Output ONLY the refined post text. No explanations, no labels, no "Here's the refined version:" prefix. Just the post content ready to publish.

Brand context:
${brandContext.slice(0, 2000)}`,
        prompt: `Here is the original ${basePostPlatform} post the user liked:

---
${basePostContent}
---

The user's feedback: "${feedback.trim()}"

Write ONE refined version of this post that addresses the feedback while keeping the same core message, topic, and general structure. The reader should recognize it as the same post, just improved.`,
      });

      // Stream tokens to the client
      let fullText = "";
      const textStream = (await result).textStream;

      for await (const chunk of textStream) {
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
      }

      // Save the refined post to DB
      const refinedPost = await this.generatedPostsRepository.create({
        userId,
        concept: basePostConcept,
        variationNumber: 99, // special number for inline refinement
        platform: basePostPlatform,
        content: fullText,
        imageUrl: basePostImageUrl,
        imageDescription: basePostImageDescription,
      });

      // Send done event with the new post ID
      res.write(`data: ${JSON.stringify({ done: true, postId: refinedPost.id })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Refine post streaming error:", error);
      // If headers already sent, try to send error via SSE
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  };

  /**
   * Update a generated post's content (inline editing)
   * PATCH /auth/update-post-content
   */
  updatePostContent = async (req: Request, res: Response): Promise<void> => {
    try {
      let token = req.cookies.token;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      if (!token) {
        res.status(401).json({ success: false, message: "No token provided" });
        return;
      }

      const { userId } = this.authService.verifyToken(token);
      const { postId, content } = req.body;

      if (!postId || typeof content !== "string") {
        res.status(400).json({ success: false, message: "postId and content are required" });
        return;
      }

      // Verify the post belongs to this user
      const post = await this.generatedPostsRepository.getById(postId);
      if (!post || post.userId !== userId) {
        res.status(404).json({ success: false, message: "Post not found" });
        return;
      }

      const updated = await this.generatedPostsRepository.updateContent(postId, content);

      res.status(200).json({
        success: true,
        message: "Post content updated",
        data: { post: updated },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Logout user
   * POST /auth/logout
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  };
}
