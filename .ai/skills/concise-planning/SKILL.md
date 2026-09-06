---
name: concise-planning
description: Generate clear, actionable, atomic checklists for coding tasks. Use when planning features, refactors, or any multi-step development work.
---

# Concise Planning

> Turn a feature request into a single, actionable plan with atomic steps.

## Workflow

### 1. Scan Context

- Read `README.md`, `AGENTS.md`, and relevant code files
- Identify constraints (NestJS, Prisma, React SPA con Vite, TypeScript)
- Understand existing patterns in the codebase

### 2. Minimal Interaction

- Ask **at most 1-2 questions** and only if truly blocking
- Make reasonable assumptions for non-blocking unknowns

### 3. Generate Plan

Use the following structure:

- **Approach**: 1-3 sentences on what and why
- **Scope**: Bullet points for "In" and "Out"
- **Action Items**: 6-10 atomic, ordered tasks (Verb-first)
- **Validation**: At least one item for testing

## Plan Template

```markdown
# Plan: [Feature Name]

## Approach
<High-level approach in 1-3 sentences>

## Scope

**In:**
- Feature X
- Component Y

**Out:**
- Feature Z (future iteration)

## Action Items

- [ ] Explore existing code
- [ ] Create Zod schema in `packages/shared-types/src/schemas/`
- [ ] Create SQL migration in `apps/api/prisma/migrations/` (a mano)
- [ ] Regenerate the client with `pnpm db:generate`
- [ ] Implement module in `apps/api/src/modules/<agregado>/` (los tres guards)
- [ ] Add API module in `apps/web/src/api/<recurso>.api.ts`
- [ ] Create form component in `apps/web/src/components/forms/`
- [ ] Add page in `apps/web/src/pages/` and route it in `App.tsx`
- [ ] Write tests in `tests/`
- [ ] Test offline behavior

## Open Questions

- <Question 1 if any>
```

## Checklist Guidelines

| Principle | Description |
|-----------|-------------|
| **Atomic** | Each step is a single logical unit of work |
| **Verb-first** | "Add...", "Create...", "Implement...", "Write..." |
| **Concrete** | Name specific files or modules |
| **Verifiable** | Each step has a clear "done" state |

## Integration with CryoTech

```
- [ ] Schema: Create/modify Zod schema in `packages/shared-types/src/schemas/`
- [ ] Database: Add migration in `apps/api/prisma/migrations/` (a mano)
- [ ] Types: Regenerate with `pnpm db:generate`
- [ ] API: Controller + service in `apps/api/src/modules/<agregado>/`
- [ ] Component: Create in `apps/web/src/components/`
- [ ] Page: Add in `apps/web/src/pages/` and route it in `App.tsx`
- [ ] Test: Add in `tests/`
```
