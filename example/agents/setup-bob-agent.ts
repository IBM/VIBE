#!/usr/bin/env ts-node
/**
 * examples/agents/setup-bob-agent.ts
 *
 * Registers (or updates) a Bob agent in the VIBE backend, pointing to a
 * running bob-wrapper instance.
 *
 * Usage:
 *   BACKEND_URL=http://localhost:5100 \
 *   BOB_WRAPPER_URL=http://localhost:3001 \
 *   ts-node examples/agents/setup-bob-agent.ts
 *
 * Optional env vars:
 *   AGENT_NAME        — display name for the agent (default: "Bob (local)")
 *   AGENT_VERSION     — version string (default: "1.0.0")
 *   BOB_MODE          — Bob chat mode: ask | code | plan | advanced (default: "ask")
 */

import https from "https";
import http from "http";
import { URL } from "url";

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:5100";
const BOB_WRAPPER_URL = process.env.BOB_WRAPPER_URL ?? "http://localhost:3001";
const AGENT_NAME = process.env.AGENT_NAME ?? "Bob (local)";
const AGENT_VERSION = process.env.AGENT_VERSION ?? "1.0.0";
const BOB_MODE = process.env.BOB_MODE ?? "ask";

// ─── Agent settings (VIBE external_api contract) ─────────────────────────────
//
// request_template:
//   {{input}} is replaced by the test input / conversation turn.
//   {{conversationId}} is injected by VIBE from the previous response via
//   response_mapping.variables — empty string on turn 1, which triggers the
//   bob-wrapper to create a new conversation.
//
// response_mapping:
//   output     — the field in the JSON response to use as the agent's answer.
//   variables  — extracted and re-injected on the next turn automatically.
//
// token_mapping:
//   Maps bob-wrapper's usage fields to VIBE's token tracking fields.

const agentSettings = {
  type: "external_api",
  api_endpoint: `${BOB_WRAPPER_URL}/api/v1/chat`,
  http_method: "POST",
  request_template: JSON.stringify({
    message: "{{input}}",
    conversationId: "{{conversationId}}",
    mode: BOB_MODE,
  }),
  response_mapping: JSON.stringify({
    output: "content",
    variables: {
      conversationId: "conversationId",
    },
  }),
  token_mapping: JSON.stringify({
    input_tokens: "usage.inputTokens",
    output_tokens: "usage.outputTokens",
  }),
};

const agentPrompt = `You are Bob, an IBM AI coding assistant powered by the Bob CLI.
You have access to the workspace repository and can read files, run tools, and answer questions about the codebase.
Always be precise, concise, and helpful.`;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function request(
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const payload = body ? JSON.stringify(body) : undefined;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const lib = isHttps ? https : http;
    const req = lib.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: raw });
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\nSetting up Bob agent in VIBE backend at ${BACKEND_URL}`);
  console.log(`  Bob wrapper endpoint: ${BOB_WRAPPER_URL}`);
  console.log(`  Agent name:           ${AGENT_NAME}`);
  console.log(`  Bob mode:             ${BOB_MODE}\n`);

  // 1. Check if an agent with this name already exists
  const listRes = await request("GET", `${BACKEND_URL}/api/agents`);

  if (listRes.status !== 200) {
    console.error(
      `Failed to list agents (HTTP ${listRes.status}):`,
      listRes.data
    );
    process.exit(1);
  }

  const agents = listRes.data as Array<{
    id: number;
    name: string;
    version: string;
  }>;
  const existing = agents.find((a) => a.name === AGENT_NAME);

  const agentPayload = {
    name: AGENT_NAME,
    version: AGENT_VERSION,
    prompt: agentPrompt,
    settings: JSON.stringify(agentSettings),
  };

  if (existing) {
    // Update existing agent
    console.log(
      `Agent "${AGENT_NAME}" already exists (id=${existing.id}). Updating...`
    );
    const updateRes = await request(
      "PUT",
      `${BACKEND_URL}/api/agents/${existing.id}`,
      agentPayload
    );

    if (updateRes.status !== 200) {
      console.error(
        `Failed to update agent (HTTP ${updateRes.status}):`,
        updateRes.data
      );
      process.exit(1);
    }

    console.log(`✓ Agent updated. id=${existing.id}`);
    printAgentConfig(existing.id);
  } else {
    // Create new agent
    console.log(`Creating new agent "${AGENT_NAME}"...`);
    const createRes = await request(
      "POST",
      `${BACKEND_URL}/api/agents`,
      agentPayload
    );

    if (createRes.status !== 201 && createRes.status !== 200) {
      console.error(
        `Failed to create agent (HTTP ${createRes.status}):`,
        createRes.data
      );
      process.exit(1);
    }

    const created = createRes.data as { id: number };
    console.log(`✓ Agent created. id=${created.id}`);
    printAgentConfig(created.id);
  }
}

function printAgentConfig(agentId: number): void {
  console.log(`
─────────────────────────────────────────────────────────
Agent settings reference:

  api_endpoint:     ${BOB_WRAPPER_URL}/api/v1/chat
  http_method:      POST
  type:             external_api

  request_template (send message + conversationId to bob-wrapper):
    ${JSON.stringify({ message: "{{input}}", conversationId: "{{conversationId}}", mode: BOB_MODE })}

  response_mapping (extract answer + persist conversationId):
    ${JSON.stringify({ output: "content", variables: { conversationId: "conversationId" } })}

  token_mapping:
    ${JSON.stringify({ input_tokens: "usage.inputTokens", output_tokens: "usage.outputTokens" })}

Use this agent (id=${agentId}) when creating tests or conversations in VIBE.
─────────────────────────────────────────────────────────`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
