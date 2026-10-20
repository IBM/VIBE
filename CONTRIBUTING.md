# Contributing to IBM VIBE

Thanks for your interest in contributing to IBM VIBE (Validation & Insights for Behavioral Evaluation).

By participating in this project, you agree to follow our [Code of conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- Report bugs and propose improvements via GitHub Issues
- Improve documentation
- Submit pull requests with fixes or new features

## Development setup

IBM VIBE is a monorepo managed with npm workspaces.

### Prerequisites

- Node.js (see the repository `README.md` for the supported version range)
- npm

### Install

From the repository root:

```bash
npm install
```

### Run the stack (development)

From the repository root:

```bash
npm run dev
```

### Quality gates

Before opening a pull request, please run:

```bash
npm run lint
npm run typecheck
npm run test:ts
```

### Repository hygiene

Please do not commit local artifacts such as:

- `env.instance*` files (use `env.instance1.example` as a template)
- `E2E*_LOG.md` files
- `.pytest_cache/` directories

If your changes affect formatting, you can format supported files with:

```bash
npm run format
```

You can also run checks per workspace:

```bash
npm run lint -w backend
npm run lint -w frontend
npm run lint -w agent-service-api
```

## Submitting a pull request

1. Fork the repository and create a feature branch.
2. Make your changes with appropriate tests.
3. Run the quality gates above.
4. Open a pull request and fill out the template.

## Website and blog

The project site (landing page, docs and blog) lives in [`website/`](website) and is built with Docusaurus and the Carbon Design System. It is published to GitHub Pages by `.github/workflows/pages.yml` on every merge to `main`.

- **Docs** are read directly from [`docs/`](docs). Edit the Markdown there. To publish a new page, add it to `include` in `website/docusaurus.config.ts` and to `website/sidebars.ts`.
- **Blog posts** are Markdown files named `website/blog/YYYY-MM-DD-slug.md`. Use the `news` or `learning` tag and an author from `website/blog/authors.yml`, and add `<!-- truncate -->` after the intro paragraph.
- **Preview locally** with `cd website && npm install && npm start`.

## Testing philosophy

When changing behavior, prefer test-driven development:

1. Add or update a test that fails for the current behavior.
2. Implement the fix/change until the test passes.
3. Refactor while keeping tests green.

## Legal (DCO sign-off)

This project uses a Developer Certificate of Origin (DCO). All commits must include a `Signed-off-by` line.

- Read: [`DCO.md`](DCO.md)
- Sign off commits by using:

```bash
git commit -s
```

Our CI checks will fail if commits in a pull request are missing the sign-off.
