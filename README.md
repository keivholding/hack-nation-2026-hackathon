# innie — AI Social Media Agent

An AI-powered social media agent that creates on-brand LinkedIn and Instagram posts. It scrapes your website to understand your brand, generates post variations with custom graphics, runs them through a simulated focus group of AI personas, and lets you refine and schedule the winning post — all in one guided flow.

Built for the **Hack-Nation AI Social Media Challenge** (VC Track).

---

## What It Does

innie takes a company from "zero content" to "ready to post" in 8 steps:

| Step                          | What Happens                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Brand Discovery**        | Enter your website URL. The system scrapes your site (text, images, meta tags, CSS colors) and uses OpenAI Vision to analyze your visual identity.                                                                  |
| **2. Brand Profile Review**   | Review and edit the AI-generated brand profile — voice, tone, audience, value props, color palette, visual style. This becomes the foundation for all content.                                                      |
| **3. Define Your Goal**       | Describe your content plan and posting frequency. The AI builds a strategic content calendar.                                                                                                                       |
| **4. Pick a Topic**           | Choose from AI-suggested topics or enter your own.                                                                                                                                                                  |
| **5. AI Agents at Work**      | A team of specialized AI agents collaborates in real time — a Lead Strategist orchestrates a Content Writer, Visual Designer, and Engagement Expert to produce 4 post variations with custom typographic graphics.  |
| **6. Focus Group Simulation** | 25 synthetic personas (matching your target audience) react to each variation — liking, commenting, sharing, or scrolling past — with realistic engagement behavior. Visualized as a live neural network animation. |
| **7. Results Dashboard**      | Compare predicted performance across all variations. See engagement rates, breakdowns by persona, and click into any panelist to see their reactions across all posts. Pick your winner.                            |
| **8. Finalize & Schedule**    | Edit your post inline, refine it with AI feedback, or schedule it directly. Regeneration keeps your original for comparison.                                                                                        |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│         Next.js 16 · React 19 · Tailwind 4       │
│         TanStack Query · SSE Streaming            │
└──────────────────────┬──────────────────────────┘
                       │ REST + SSE
┌──────────────────────▼──────────────────────────┐
│                   Backend                        │
│           Express.js · TypeScript (ESM)           │
│                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ Auth Module  │  │ Content Mod  │  │ Queue   │ │
│  │ JWT + Cookies│  │ Calendar,    │  │ BullMQ  │ │
│  │ Onboarding  │  │ Posts, Sims  │  │ Workers │ │
│  └─────────────┘  └──────────────┘  └─────────┘ │
│                                                  │
│  ┌──────────────────────────────────────────────┐│
│  │           AI Agent Orchestrator               ││
│  │  Vercel AI SDK · OpenAI GPT-4.1              ││
│  │                                              ││
│  │  Sub-agents:                                 ││
│  │  • LinkedIn / Instagram Content Writer       ││
│  │  • Image Generator (GPT-Image-1)            ││
│  │  • Web Search                                ││
│  │  • Finalizer (Engagement Expert)             ││
│  └──────────────────────────────────────────────┘│
│                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │  Scraper    │  │  Persona   │  │ Simulation │ │
│  │  Cheerio    │  │  Generator │  │  Engine    │ │
│  │  + Vision   │  │  25 personas│  │ 2-stage   │ │
│  └────────────┘  └────────────┘  └────────────┘ │
└──────────────────────┬──────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   PostgreSQL       Redis          OpenAI
   (Drizzle ORM)   (BullMQ)     (GPT-4.1, Vision,
                                 GPT-Image-1)
```

---

## Key Technical Features

### Brand Intelligence Pipeline

- Multi-page web scraper with SPA fallback (probes common subpaths)
- CSS color extraction from stylesheets and inline styles
- OpenAI Vision API analyzes scraped images for brand colors, mood, and visual style
- Structured brand profile: voice, tone, audience, value props, content pillars, visual identity

### AI Agent Orchestrator

- Built on Vercel AI SDK v6 with an orchestrator pattern
- Specialized sub-agents for content writing, image generation, and engagement analysis
- Real-time activity log streamed to the frontend via `AsyncLocalStorage` context
- Dynamic "thinking out loud" — agents narrate their reasoning as they work
- Refinement mode: iterative improvements based on user feedback without restarting

### Image Generation

- GPT-Image-1 generates bold, typographic marketing graphics
- Headlines extracted from post content and rendered as the centerpiece
- Dark backgrounds with gradient accents (inspired by Lovable/Stripe/Notion aesthetics)
- Parallel generation for all 4 variations simultaneously
- Fallback prompt builder ensures every post gets a contextual image

### Simulated Focus Group

- 25 diverse synthetic personas with distinct behavior types (lurkers, casual engagers, active commenters, power sharers)
- Two-stage evaluation: scroll test (did they stop?) → engagement decision (like/comment/share)
- Probabilistic engagement gates prevent unrealistic 100% engagement rates
- Anti-sycophancy prompting ensures honest, realistic reactions
- Cross-post persona analysis — click any panelist to see how they reacted to every variation

### Human-in-the-Loop Refinement

- Inline post editing with auto-save
- SSE-streamed AI refinement based on text feedback
- Side-by-side comparison of original vs. refined versions
- Original post preserved with its simulation results during regeneration
- Schedule with date/time picker

---

## Tech Stack

| Layer    | Technology                                                       |
| -------- | ---------------------------------------------------------------- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, TanStack Query |
| Backend  | Express.js, TypeScript (ESM), Drizzle ORM                        |
| Database | PostgreSQL                                                       |
| Queue    | BullMQ + Redis                                                   |
| AI       | OpenAI GPT-4.1, GPT-4.1-mini, GPT-Image-1, Vercel AI SDK v6      |
| Scraping | Cheerio, Axios, OpenAI Vision API                                |
| Auth     | JWT (HTTP-only cookies), bcrypt                                  |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis
- OpenAI API key (with access to GPT-4.1 and GPT-Image-1)

### 1. Install Dependencies

```bash
# Clone the repo
git clone <repo-url>
cd ss

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

Create a `.env` file in the `backend/` directory:

```
DATABASE_URL=postgresql://user:password@localhost:5432/your_db
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...
JWT_SECRET=your-secret-key
PORT=8000
```

### 3. Set Up the Database

```bash
cd backend
npm run db:push   # Creates all tables in PostgreSQL
```

### 4. Start Everything

You need **3 terminals** running simultaneously:

**Terminal 1 — Redis** (required for the background job queue)

```bash
redis-server
```

**Terminal 2 — Backend + Workers** (API server + BullMQ workers run in the same process)

```bash
cd backend
npm run dev
# Starts on http://localhost:8000
# The backend server also boots the BullMQ workers automatically.
# Workers handle: brand analysis, content calendar generation,
# AI agent orchestration, persona generation, and focus group simulation.
```

**Terminal 3 — Frontend**

```bash
cd frontend
npm run dev
# Starts on http://localhost:3000
```

### 5. Use the App

1. Open http://localhost:3000
2. Register an account
3. Start the onboarding flow — enter a website URL and let the AI do its thing

---

## Challenge Coverage

| Requirement                                | Implementation                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Brand & Design Understanding**           | Multi-page scraping + Vision API image analysis + CSS color extraction → structured brand profile                           |
| **Social Media Planning Input**            | Content plan + posting frequency → AI-generated content calendar with platform-specific topics                              |
| **Automated Post Generation**              | 4 variations per topic with platform-optimized captions + GPT-Image-1 typographic graphics                                  |
| **Agentic Self-Feedback Loop**             | Orchestrator with sub-agents + Finalizer agent reviews all variations for brand consistency, clarity, and CTA effectiveness |
| **Human-in-the-Loop Editing**              | Inline editing, text-based refinement with streaming, side-by-side comparison, iterative regeneration                       |
| **Stretch: Proactive Content Suggestions** | AI-generated content calendar with strategic topic suggestions based on brand analysis                                      |
| **Stretch: Multi-Platform Adaptation**     | Platform-specific content writers (LinkedIn vs Instagram) with different tone, length, and formatting                       |

---

## Team

Built at Hack-Nation 2026.
