---
slug: testing-ai-agents-with-vibe
title: Testing AI agents with IBM VIBE
description: Script realistic conversations, run them against your agent, and inspect transcripts with similarity scores. Go from zero to your first passing test.
authors: [zvonimir]
tags: [learning, testing]
---

When you finish wiring up an AI agent and have your prompts in, tools connected,
and answers seemingly sensible... How do you actually know it works?

The most common answer is: open a chat window and try a few things. That works
once. It breaks down the fifth time you change the prompt, when a colleague
tweaks the system message, or when you swap the underlying model to cut costs.
At some point "it seems fine" stops being a testing strategy.

IBM VIBE is an open-source AI agent testing platform built to close that gap. It
lets you write conversation scripts (a.k.a. ordered sequences of user messages with
expected replies), run them against any agent endpoint, and inspect the resulting
transcripts with timing, token counts, and similarity scores. The whole workflow
is reproducible, diffable, and automatable.

In this post I'll walk through the complete quickstart: setting up a local VIBE
instance, registering an agent, writing a two-turn conversation test, running it,
and reading the results.

<!-- truncate -->

:::tip
VIBE is open source under the Apache 2.0 licence. The repository is at
[github.com/IBM/VIBE](https://github.com/IBM/VIBE).
:::

## Why conversation-level testing matters

A unit test for an AI agent asserts that a specific input produces a specific
output. That is useful but too narrow. Agent behaviour is non-deterministic and
a word-for-word match is the wrong bar. What you actually want to know is:
does the agent address what the user asked, in the right tone, without
hallucinating, across the multi-turn context a real user would experience?

VIBE uses _similarity scoring_. You write a **turn target**, the reply you
expect, and VIBE computes a 0-100 semantic similarity score between the target
and the actual reply. Set a threshold (65 is a reasonable starting point) and
the run passes or fails accordingly. Over time your conversation scripts become a
regression harness: change something, re-run, and see immediately whether the
scores held.

VIBE also supports a more deterministic scoring too if you need one.

## Prerequisites

You need:

- **Node.js 22 or later** (24 is recommended; the repo ships a `.nvmrc`)
- **npm**
- An AI agent endpoint you want to test, which can be any HTTP endpoint that
  accepts a chat message and returns a text reply, works; VIBE also supports
  CrewAI agents, if that's your vibe

That is it. There is no cloud account to create and no database to provision
separately. VIBE stores everything in a local SQLite file.

## Getting VIBE running

Clone the repository and install dependencies:

```bash
git clone https://github.com/IBM/VIBE.git
cd VIBE
npm install
```

Copy the example environment files in one shot:

```bash
cp backend/.env.example backend/.env && \
cp frontend/.env.example frontend/.env.local && \
cp agent-service-api/.env.example agent-service-api/.env
```

The defaults wire the three services together at the expected ports - no edits
needed for a first run.

Start everything:

```bash
npm run dev
```

This starts the backend, agent-service-api, and Next.js frontend together. Open
[http://localhost:3000](http://localhost:3000) and you will see the dashboard.

On a fresh install the dashboard shows a **First run checklist**.
It contains four steps that take you from zero to a scored conversation:
LLM config → agent → conversation → quick execute.
Each step links directly to the relevant page and clears itself once complete.

## Step 1: Add an LLM config

:::tip
LLM configs in VIBE are used for **similarity scoring**. They power the
service that grades how closely an agent's actual reply matches your turn target.
They do not drive the agent itself. Your agent runs independently at its own
endpoint with VIBE just calling it via HTTP.
:::

Open **LLM configs** from the sidebar and create a new entry. VIBE supports five
providers for scoring: IBM Bob, Ollama, OpenAI-compatible endpoints, watsonx, and
Anthropic.

### IBM Bob

Bob has a dedicated provider in VIBE. It uses a different authentication scheme
from OpenAI (`x-api-key` header instead of `Authorization: Bearer`, plus
required instance and team headers) so setting provider to `openai` and pointing
it at the Bob gateway will not work out of the box. Use `Bob` provider instead.

You need a **General** API key from [bob.ibm.com](https://bob.ibm.com) (navigate
to your subscription instance → API key management → create a key). Then fill in
three values from your subscription:

| What        | Where to find it                                                       |
| ----------- | ---------------------------------------------------------------------- |
| API key     | Your subscription instance → API key management → create a General key |
| Instance ID | Your subscription instance settings page                               |
| Team ID     | Your team settings page                                                |

The base URL defaults to `https://api.us-east.bob.ibm.com`. For the model,
`premium` is a good default. It offers a 200k context window and is the primary
workhorse model. Other options include `fast` (cheaper, same context), `wxO-model`
(1M context), and `granite-8b-code-instruct` (IBM Granite code model).

### Ollama (local, no API key needed)

The easiest starting point if you want everything self-contained. Set the provider
to `ollama`, the base URL to `http://localhost:11434`, and pick any model you have
pulled locally (e.g. `llama3`). No API key is required.

### watsonx

Set the provider to `watsonx` and supply three values: your IBM Cloud API key,
your watsonx project ID, and the model ID (e.g. `ibm/granite-3-8b-instruct`).
The base URL defaults to `https://us-south.ml.cloud.ibm.com`. VIBE exchanges your
API key for a short-lived IAM token automatically before each scoring request.

### OpenAI-compatible endpoints

Set the provider to `openai`, supply your API key, and set the base URL to
`https://api.openai.com/v1` (or any compatible endpoint; Azure OpenAI, Together,
Groq, and others all work here). Model defaults to `gpt-6.1-sol` if you leave it blank.

### Anthropic

Set the provider to `anthropic`, supply your API key, and choose a model. Check
[Anthropic's models overview](https://docs.anthropic.com/en/docs/about-claude/models)
for the latest available slugs.

## Step 2: Register your agent

Open **Agents** and click **New agent**. VIBE supports two agent types:

- **External API** - your agent lives at an HTTP endpoint; VIBE sends it
  messages and reads back replies (recommended)
- **CrewAI** - for agents defined as CrewAI configurations in the legacy Python
  service (not actively developed)

For most cases you want **External API**. Fill in a name and version string, then
add the endpoint URL in the settings. The version string is worth thinking about:
when you change your prompt or swap the model, create a new agent version
rather than updating the existing one. That way you can compare runs from before
and after the change.

## Step 3: Script a conversation

Open **Conversations** and click **New conversation**. Give it a name that
describes the scenario, not the agent, for example:
_"handles out-of-scope questions politely"_ or
_"returns the correct format for a date query"_.

A conversation is an ordered list of user turns. Each turn can optionally have a
**turn target**: the reply you expect the agent to produce.

Add your first user message. Something concrete works better than something
abstract:

```text
What is the return policy for online orders?
```

Then add a turn target in the form of an ideal assistant reply:

```text
Online orders can be returned within 30 days of delivery for a full refund.
Items must be unused and in their original packaging. To start a return, visit
the returns portal or contact support.
```

Set a threshold. The default of 65 means: if the actual reply scores 65 or above
on semantic similarity to this target, the turn passes. For factual questions
where precision matters, raise it to 75 or 80. For open-ended conversational
turns, 55-65 is usually appropriate.

Add a second user turn to test continuity:

```text
How long does a refund take to process?
```

With a target:

```text
Refunds are typically processed within 5-7 business days after we receive the
returned item.
```

:::tip
You do not need a target on every turn. Turns without targets still execute
and appear in the transcript. They just do not contribute a pass/fail signal.
This is useful for warm-up turns that establish context.
:::

## Step 4: Run it

Open **Quick execute** from the sidebar. Select the agent you created and the
conversation you just scripted, then click **Execute**.

VIBE enqueues a job, hands it to the agent-service-api poller, and the poller
starts sending your conversation turns to the agent endpoint one by one. The
**Jobs** page shows queue progress.

## Step 5: Inspect the session

When the job completes, open **Sessions**. The most recent session is your run.

The session page shows:

- **Turn-by-turn transcript** - the user message and the agent's actual reply,
  side by side with the turn target you wrote
- **Similarity score per turn** - a 0-100 score and a pass/fail indicator based
  on your threshold
- **Token usage** - input tokens, output tokens, and the total per turn
- **Timing** - how long each turn took to complete

Reading a session is where VIBE pays for itself. Instead of squinting at a chat
window and wondering whether the answer was "good enough", you have a concrete
score, a transcript you can compare against, and timing data that tells you
whether a latency regression crept in.

If a turn fails (i.e. the score is below threshold) you can read exactly what the
agent said, compare it to your target, and decide whether to adjust the agent
(fix a prompt or tool configuration) or adjust the target (your expected reply
was too specific).

## What to do next

Once you have one passing conversation, the natural next steps are:

- **Script more scenarios.** Cover the edge cases your agent needs to handle:
  ambiguous questions, out-of-scope requests, follow-ups that depend on earlier
  context.
- **Create a suite.** Open **Suites**, collect your conversations into a named
  group, and run them all at once. You get aggregate metrics (total passed/failed,
  average score, total tokens) in a single report. This is what you run before
  merging a prompt change.
- **Wire up the CLI.** VIBE ships a `vibe` CLI that mirrors the full UI. Install
  it from the monorepo with `npm link`, then drive everything from your terminal
  and pipe it into CI. More on that in a future post.
- **Compare agent versions.** Create a new agent version for each prompt or model
  change, run the same suite against both, and diff the scores. This is what makes
  prompt engineering feel less like guesswork.

## Conclusion

VIBE does not try to replace human judgment about whether an AI agent is good.
That's hard. What it does is make the evaluation loop fast, repeatable, and
inspectable, so decisions rest on data rather than just intuition.

The quickstart above takes about fifteen minutes end-to-end. The harder part is
writing good conversation scripts. Thinking carefully about what your agent should
say in specific situations is exactly the work that makes it reliable.

The repository is at [github.com/IBM/VIBE](https://github.com/IBM/VIBE). Issues,
PRs, and new provider integrations are all welcome.
