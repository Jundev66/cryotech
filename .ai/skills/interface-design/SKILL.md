---
name: interface-design
description: Interface design for dashboards, admin panels, and SaaS apps. Craft-focused design with domain exploration, signature elements, and anti-default thinking. Use when designing new pages or UI components.
---

# Interface Design

Build interface design with craft and consistency.

## Scope

**Use for:** Dashboard, batch management, analytics, settings, data interfaces.
**Not for:** Landing pages, marketing sites.

---

## Intent First

Before touching code, answer these:

**Who is this human?**
A poultry farmer — possibly in a barn with one hand free, phone screen dusty, internet spotty. Needs to log data fast and see what matters.

**What must they accomplish?**
Register daily weight, mortality, and feed consumption. See if the batch is on track. Know if they're making money.

**What should this feel like?**
Clean like a field notebook. Warm but professional. Green tones from the agricultural world. Dense enough to show data, spacious enough to not overwhelm.

## Domain Exploration

**Domain concepts:** Barn, batch, growth curve, feed sack, scale/weight, sunrise routine, field notebook, veterinary chart, harvest.

**Color world:** Green (pasture, feed), warm earth (barn wood, soil), sky blue (open air), cream/parchment (notebook), amber (warning/heat lamp).

**Signature:** Growth curve visualization as the hero element — it's the heartbeat of every batch.

**Defaults to avoid:**
1. Generic dashboard grid → Use batch-centric layout with timeline
2. Blue accent color → Use agricultural green
3. Standard metric boxes → Use contextual indicators (on track/behind/ahead)

## Design Principles

| Principle | CryoTech Application |
|-----------|---------------------|
| **Spacing** | 4px base unit, multiples of 4 |
| **Depth** | Subtle borders, minimal shadows |
| **Radius** | Medium (8px) — friendly but professional |
| **Typography** | Inter for UI, mono for data/numbers |
| **Color** | Green primary, zinc neutrals, semantic colors |
| **Animation** | Fast micro-interactions (~150ms) |
| **States** | Every element: default, hover, active, focus, disabled |

## Checks Before Presenting

- **Swap test:** Would swapping to a generic template feel different?
- **Squint test:** Can you perceive hierarchy with blurred eyes?
- **Signature test:** Can you point to 5 elements that reflect the agricultural domain?
- **Token test:** Do CSS variables sound like they belong to a farm management app?

## After Completing a Task

Always offer to save patterns to `.interface-design/system.md` for consistency across sessions.

## Deep Dives

For full methodology, see the original interface-design skill in poultry-track.
