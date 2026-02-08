import { AsyncLocalStorage } from "node:async_hooks";
import type { StatusUpdateCallback } from "./types.js";

interface AgentSessionStore {
  onStatusUpdate: StatusUpdateCallback;
}

/**
 * AsyncLocalStorage that lets any tool push real-time status updates
 * during execution — without needing direct access to the callback.
 *
 * The orchestrator sets this up before calling generateText(),
 * and any tool can call pushUpdate() to write to the activity log instantly.
 */
export const agentSession = new AsyncLocalStorage<AgentSessionStore>();

/**
 * Push a real-time update to the activity log from anywhere (tools, helpers, etc).
 * Safe to call even outside an agent session — it's a no-op if no session exists.
 */
export async function pushUpdate(
  status: string,
  agentMessage: string,
  logMessages?: string[]
): Promise<void> {
  const store = agentSession.getStore();
  if (store?.onStatusUpdate) {
    await store.onStatusUpdate(status, agentMessage, logMessages);
  }
}
