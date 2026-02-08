import { Router } from "express";
import { AuthController } from "./auth.controller.js";

const router = Router();
const authController = new AuthController();

/**
 * @route   POST /auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post("/register", authController.register);

/**
 * @route   POST /auth/login
 * @desc    Login user
 * @access  Public
 */
router.post("/login", authController.login);

/**
 * @route   GET /auth/me
 * @desc    Get current user profile
 * @access  Private (requires token)
 */
router.get("/me", authController.getProfile);

/**
 * @route   POST /auth/logout
 * @desc    Logout user (clear cookie)
 * @access  Public
 */
router.post("/logout", authController.logout);

/**
 * @route   POST /auth/update-onboarding-step
 * @desc    Update user onboarding step and data
 * @access  Private (requires token)
 */
router.post("/update-onboarding-step", authController.updateOnboardingStep);

/**
 * @route   POST /auth/save-brand-profile
 * @desc    Save updated brand profile from step 3 review
 * @access  Private (requires token)
 */
router.post("/save-brand-profile", authController.saveBrandProfile);

/**
 * @route   POST /auth/complete-onboarding
 * @desc    Mark user onboarding as complete
 * @access  Private (requires token)
 */
router.post("/complete-onboarding", authController.completeOnboarding);

/**
 * @route   GET /auth/generated-posts
 * @desc    Get user's generated post variations
 * @access  Private (requires token)
 */
router.get("/generated-posts", authController.getGeneratedPosts);

/**
 * @route   POST /auth/post-feedback
 * @desc    Submit feedback for a generated post
 * @access  Private (requires token)
 */
router.post("/post-feedback", authController.submitPostFeedback);

/**
 * @route   GET /auth/content-calendar
 * @desc    Get content calendar themes for topic selection
 * @access  Private (requires token)
 */
router.get("/content-calendar", authController.getContentCalendar);

/**
 * @route   POST /auth/select-topic
 * @desc    Select a topic from the content calendar
 * @access  Private (requires token)
 */
router.post("/select-topic", authController.selectTopic);

/**
 * @route   GET /auth/simulation-results
 * @desc    Get audience simulation results
 * @access  Private (requires token)
 */
router.get("/simulation-results", authController.getSimulationResults);

/**
 * @route   POST /auth/accept-post
 * @desc    Accept a post and advance to step 8
 * @access  Private (requires token)
 */
router.post("/accept-post", authController.acceptPost);

/**
 * @route   POST /auth/schedule-post
 * @desc    Schedule a post and complete onboarding
 * @access  Private (requires token)
 */
router.post("/schedule-post", authController.schedulePost);

/**
 * @route   POST /auth/regenerate-post
 * @desc    Regenerate post variations based on user feedback
 * @access  Private (requires token)
 */
router.post("/regenerate-post", authController.regeneratePost);

/**
 * @route   POST /auth/refine-post
 * @desc    Refine a post with streaming SSE response (inline, no queue)
 * @access  Private (requires token)
 */
router.post("/refine-post", authController.refinePost);

/**
 * @route   PATCH /auth/update-post-content
 * @desc    Update a generated post's content (inline editing)
 * @access  Private (requires token)
 */
router.patch("/update-post-content", authController.updatePostContent);

export default router;
