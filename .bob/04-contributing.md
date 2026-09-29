# Contributing guide

This file documents the contribution workflow and quality gates for the VIBE project. Follow these rules on every PR to avoid CI failures.

## Branches

- Work happens on feature branches off `main`.
- Branch naming: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`.
- Never commit directly to `main`.
- When adding a feature that touches a specific area (e.g. LLM providers), create a dedicated branch for that work — do not piggyback onto an unrelated feature branch.

## Commit requirements

### DCO signoff (required on every commit)

Every commit **must** include a `Signed-off-by` trailer. The CI will reject any commit missing it.

Always use `git commit --signoff` (or `-s`). The identity used must match the repository context:

- **Public GitHub (github.com)** — use the git user identity configured locally (`git config user.name` / `git config user.email`)
- **IBM GHE (github.ibm.com)** — use the IBM email (`git config user.email` should be the `@ibm.com` address)

To add a signoff to the most recent commit after the fact:

```bash
git commit --amend --signoff --no-edit
git push --force-with-lease origin <branch>
```

### Commit message format

Use the conventional commits style: `type(scope): short description`

Types: `feat`, `fix`, `docs`, `chore`, `style`, `refactor`, `test`

## Quality gates (CI checks every PR)

All of the following must pass before merging. Run them locally before pushing.

### 1. Formatting — `npm run format:check`

Uses Prettier. **This is the most commonly forgotten check.** Always run:

```bash
npm run format:check
```

To auto-fix:

```bash
npm run format
```

Never skip this. Prettier will flag misaligned JSDoc comment indentation, trailing spaces, and other whitespace issues that are invisible in editors.

### 2. Type checking — `npm run typecheck`

```bash
npm run typecheck
```

Runs `tsc -b` across backend, frontend, and agent-service-api.

### 3. Linting — `npm run lint`

```bash
npm run lint
```

Warnings are acceptable; errors fail the build.

### 4. Tests — `npm run test:ts`

```bash
npm run test:ts
```

All tests must pass. Add tests for any new behaviour following the patterns in existing `__tests__` directories.

## Pre-push checklist

Run this sequence before every push:

```bash
npm run format          # fix formatting
npm run format:check    # verify
npm run typecheck       # type errors
npm run lint            # lint errors
npm run test:ts         # all tests pass
```

Then commit any formatting fixes with `--signoff`.

## Adding a new LLM provider

When adding a new provider to [`backend/src/services/llm-config-service.ts`](../backend/src/services/llm-config-service.ts):

1. Add a `case '<provider>'` to `makeLLMRequest()`.
2. Add a `private async call<Provider>()` method following the same pattern as existing providers.
3. Add tests in [`backend/src/services/__tests__/llm-config-service.test.ts`](../backend/src/services/__tests__/llm-config-service.test.ts) covering: correct request construction, default values, custom `base_url` if applicable, and all required-field validation errors.
4. Update [`docs/`](../docs/) if the provider has notable configuration requirements.
