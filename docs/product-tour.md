# Product tour

VIBE is organized around a conversation-first evaluation loop.
The primary concepts are visible in the left navigation.

## Dashboard

The dashboard summarizes the current workspace: agents, runs, results, active jobs, recent activity, and performance signals.
In a fresh workspace, use the **First run checklist** to move through the setup path.

## LLM configs

LLM configs describe the model or provider settings available to agents. Start here when a local install has no execution configuration yet.

## Conversations

Conversations are reusable scripts for multi-turn evaluation. They represent the inputs and expected interaction shape you want an agent to handle consistently.

Use conversations when you want repeatable, inspectable scenarios instead of one-off prompts.

## Agents

Agents represent the behavior under test: prompt, role, model configuration, API target, or versioned implementation details. Create separate agent versions when you want to compare behavior across changes.

## Quick execute

Quick execute is the fastest way to run one conversation against one agent. It creates a job, hands it to the TypeScript agent-service-api poller, and stores the resulting session data when execution finishes.

Use it for local iteration before building larger suites.

## Jobs

Jobs are the execution queue. A job records whether a run is pending, running, completed, or failed. If a run does not appear in sessions, check jobs first.

## Sessions

Sessions are completed execution records. They are the main place to inspect transcripts, timing, token usage, scoring signals, and failure details.

## Suites and suite runs

Suites group scenarios for batch execution. They remain useful for larger regression sets, but the preferred building block is still a conversation.

## Data transfer

Data transfer exports and imports reusable workspace data such as agents, conversations, suites, LLM configs, request templates, and response maps. Use it to move curated evaluation assets between local instances.

## Legacy area

The legacy test, result, and run-test routes remain available for compatibility while the app continues moving to conversations, sessions, and jobs. New workflows should start with conversations.
