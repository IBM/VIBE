# IBM VIBE Codebase Guide

This directory contains orientation documentation for the IBM VIBE (AI Agent Testing Suite) codebase. It is meant to help coding agents find the right files quickly, understand the big-picture architecture, and spend less context on broad discovery.

It is not a replacement for reading source before making changes. Treat these files as a map: enough to know where to look and how major pieces fit together, while source code remains the authority for exact behavior.

## Quick Navigation

- **[Project Overview](./01-project-overview.md)** - High-level understanding of what this project does
- **[Architecture](./02-architecture.md)** - System architecture and component interactions
- **[Backend Guide](./03-backend-guide.md)** - Backend structure, modules, and data flow
- **[Database Schema](./06-database-schema.md)** - Database structure and migrations
- **[Execution Flow](./09-execution-flow.md)** - How jobs are created and executed

## Maintenance Instructions

**IMPORTANT**: When making changes to the codebase, update the relevant documentation files in this directory to keep them in sync. Specifically:

1. **Database Changes**: Update [`06-database-schema.md`](./06-database-schema.md) and add migration notes
2. **New Services/Modules**: Update [`03-backend-guide.md`](./03-backend-guide.md)
3. **Architecture Changes**: Update [`02-architecture.md`](./02-architecture.md)
4. **Execution Flow Changes**: Update [`09-execution-flow.md`](./09-execution-flow.md)

## Purpose

This documentation serves as a compact knowledge base for AI coding assistants (like Bob) to:

- Quickly understand the codebase structure
- Find where specific functionality lives
- Understand data flow and execution patterns
- Follow established patterns when making changes
- Use fewer exploratory reads before landing in the relevant source

## Last Updated

Last updated: 2026-05-12
