import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { ToolLoopAgent, pipeAgentUIStreamToResponse, UIMessage, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { systemPrompt } from "./prompt.js";
import { agentTools } from "./tools.js";
import * as metabase from "./metabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const PORT = parseInt(process.env.SERVER_PORT || "4011");

// Verify required env vars
const requiredEnvVars = ["METABASE_INSTANCE_URL", "METABASE_JWT_SHARED_SECRET", "METABASE_USER_EMAIL", "ANTHROPIC_API_KEY"];
for (const v of requiredEnvVars) {
  if (!process.env[v]) {
    console.error(`Missing required environment variable: ${v}`);
    process.exit(1);
  }
}

const agent = new ToolLoopAgent({
  model: anthropic("claude-sonnet-4-20250514"),
  instructions: systemPrompt,
  tools: agentTools,
  stopWhen: stepCountIs(15),
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

/** Public Metabase URL for the browser (embed.js, `window.metabaseConfig`). Same source as server-side API calls. */
app.get("/api/config", (_req, res) => {
  const url = process.env.METABASE_INSTANCE_URL!.trim().replace(/\/$/, "");
  res.json({ metabaseInstanceUrl: url });
});

/** JWT for modular embedding (`embed.js` / `<metabase-browser>`). Returns `{ jwt }` per Metabase SDK docs. */
app.get("/api/embed-token", (_req, res) => {
  try {
    res.json({ jwt: metabase.signJwt() });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "Missing 'messages' array" });
    return;
  }

  await pipeAgentUIStreamToResponse({
    response: res,
    agent,
    uiMessages: messages as UIMessage[],
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
