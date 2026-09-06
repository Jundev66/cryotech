---
name: conversation-retrospective
description: Analyze the current conversation to identify improvements for AI configuration files (.ai/, AGENTS.md, CLAUDE.md)
allowed-tools:
  - Glob(*)
  - Read(*)
  - Grep(*)
  - Write(*)
  - Edit(*)
---

# Conversation Retrospective

Retrospective analysis of the current conversation to identify improvements for AI assistant configuration files. Goal: better results in fewer iterations for future similar tasks.

## Context

- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -5`
- Files modified: !`git diff --name-only HEAD~5 2>/dev/null || echo "No recent commits"`

---

## Phase 1: Conversation Analysis

Review the entire conversation and analyze:

1. **Task Understanding** — Iterations to understand intent? Avoidable questions? Wrong assumptions?
2. **Code Discovery** — Time to find files? Unnecessary searches? Undocumented patterns?
3. **Implementation** — Multiple attempts? Patterns followed correctly? Style mismatches?
4. **Errors and Corrections** — Mistakes? Root cause? Prevention strategy?
5. **Documentation Effectiveness** — Did AGENTS.md prevent mistakes? Skills triggered when needed?

---

## Phase 2: Read Current Configuration

1. Read the main CLAUDE.md at repository root
2. Read relevant AGENTS.md files
3. Check existing assets in `.ai/`

Build a mental map of what exists vs what's missing.

---

## Phase 3: Generate Recommendations

### Documentation Placement Decision

| Type | Where | Why |
|------|-------|-----|
| Framework patterns, API conventions | AGENTS.md | Passive context = 100% availability |
| Gotchas, anti-patterns, mistakes | AGENTS.md | Need before agent makes mistakes |
| Multi-step workflows | Skills | Vertical, action-specific |
| Complex procedures | Skills | Rarely needed, avoid context bloat |

**Default bias: AGENTS.md** — only use Skills when workflow is vertical and rarely invoked.

---

## Phase 4: Output Report

```markdown
# Conversation Retrospective Report

## Summary
[1-2 sentence overview]

## What Went Well
- [Bullet points]

## What Could Be Improved
- [Bullet points]

## Recommended Configuration Changes

### AGENTS.md
[Specific additions/changes with exact content]

### New .ai/ Assets
[Skills or agents to add]

## Priority
[Rank by impact: High/Medium/Low]
```

---

## Phase 5: Offer to Apply

After presenting the report, ask:
1. Which recommendations to apply
2. If they want a branch with the changes

If approved:
- Use Edit/Write to update configuration files
- Keep changes minimal and focused
- Preserve existing structure

---

## Guidelines

- Be specific: exact content and location
- Be concise: configuration files should be scannable
- Prioritize: highest-impact changes first
- Respect existing structure
- Consider frequency: document things likely to recur
