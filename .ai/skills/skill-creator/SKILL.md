---
name: skill-creator
description: Guide for creating effective skills. Use when users want to create a new skill or update an existing skill. Triggers on "create skill", "new skill", "skill for X".
---

# Skill Creator

Create effective skills following the [Agent Skills specification](https://agentskills.io/specification).

## Core Principles

### Concise is Key

Context window is shared. Only add what Claude doesn't already know. Challenge each piece: "Does this justify its token cost?"

**Prefer examples over explanations.**

### Degrees of Freedom

Match specificity to task fragility:

- **High freedom** (text instructions): Multiple valid approaches
- **Medium freedom** (pseudocode/params): Preferred pattern exists
- **Low freedom** (specific scripts): Fragile operations, consistency critical

### Progressive Disclosure

1. **Metadata** (name + description) — Always loaded (~100 tokens)
2. **SKILL.md body** — When skill activates (< 5000 tokens recommended)
3. **Resources** (scripts/, references/, assets/) — Loaded only when needed

Keep SKILL.md under 500 lines. Move detailed reference material to separate files.

## Skill Anatomy

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description, optional fields)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/      - Executable code
    ├── references/   - Docs loaded into context as needed
    └── assets/       - Files for output (templates, etc.)
```

## Creation Process

### Step 1: Understand with Examples
Ask: "What would a user say to trigger this skill?" Get concrete examples.

### Step 2: Plan Reusable Contents
Identify what would help: scripts, references, assets, templates.

### Step 3: Initialize
Create directory in `.ai/skills/<skill-name>/SKILL.md`.

### Step 4: Edit SKILL.md
Write frontmatter + body.

### Step 5: Validate
- Name matches directory
- Description is specific (not just "Helps with X")
- Body is < 500 lines

### Step 6: Sync
```bash
./.ai/sync-agents.sh
```

### Step 7: Iterate
Test with real tasks, refine.

## Frontmatter Reference

### Required fields

```yaml
---
name: my-skill-name
description: What it does and WHEN to use it. Include trigger keywords.
---
```

| Field | Constraints |
|-------|-------------|
| `name` | 1-64 chars. Lowercase, digits, hyphens. Must match directory name. |
| `description` | 1-1024 chars. Describe what AND when. |

### Optional fields

| Field | Constraints |
|-------|-------------|
| `license` | License name |
| `compatibility` | Environment requirements |
| `metadata` | Key-value mapping (author, version) |
| `allowed-tools` | Space-delimited list of pre-approved tools |

### Description tips

**Description is the trigger mechanism.** Be specific.

Good: `"Extracts text from PDFs. Use when working with PDF documents or document extraction."`
Poor: `"Helps with PDFs."`

## Constraints

- Verify skill doesn't already exist in `.ai/skills/`
- Use relative paths from project root
- Always run sync after creation
