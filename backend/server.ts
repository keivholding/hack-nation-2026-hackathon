import app from "./app.js";
import { ENV } from "./config/env.js";
import { startBrandAnalysisWorker, startContentCalendarWorker, startPostGenerationWorker, startPersonaGenerationWorker, startSimulationWorker } from "./services/queue.service.js";

const HOST = "127.0.0.1";

// Start background workers
startBrandAnalysisWorker();
startContentCalendarWorker();
startPostGenerationWorker();
startPersonaGenerationWorker();
startSimulationWorker();
console.log("✅ Workers started (brand analysis, content calendar, post generation, persona generation, audience simulation)");

app.listen(ENV.PORT, HOST, () => {
  console.log(`🚀 Server is running on http://localhost:${ENV.PORT}`);
  console.log(`📍 Available routes:`);
  console.log(`   GET http://localhost:${ENV.PORT}/`);
  console.log(`   GET http://localhost:${ENV.PORT}/health`);
  console.log(`   POST http://localhost:${ENV.PORT}/auth/register`);
  console.log(`   POST http://localhost:${ENV.PORT}/auth/login`);
  console.log(`   GET http://localhost:${ENV.PORT}/auth/me`);
});
