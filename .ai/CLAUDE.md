# .ai/ — Governance & Structure

> Single Source of Truth (SSOT) para toda la configuración de agentes IA del proyecto CryoTech.

## Estructura

```
.ai/
├── AGENTS.md          ← Este archivo (governance)
├── settings.json      ← Configuración experimental
├── sync-agents.sh     ← Script de sincronización
├── agents/            ← Personas especializadas
├── skills/            ← Workflows y conocimiento especializado
└── commands/          ← Comandos ejecutables
```

## Sincronización

Las carpetas `.claude/`, `.agent/` y `.opencode/` son **enlaces** a `.ai/`, no
copias. El SSOT es siempre `.ai/`. Para regenerarlas:

```bash
./.ai/sync-agents.sh
```

Están en `.gitignore` a propósito: git sigue los enlaces de directorio de
Windows y commitearía tres copias duplicadas del contenido de `.ai/`. Quien
clone el repo las regenera con el script.

En Linux y macOS el script crea symlinks. En Windows sin modo desarrollador
`ln -s` copia en vez de enlazar, así que ahí van junctions para las carpetas y
hardlinks para los archivos sueltos.

## Reglas

1. **Nunca editar** archivos en `.claude/`, `.agent/`, `.opencode/` directamente
2. **Siempre editar** en `.ai/` y luego sincronizar
3. `CLAUDE.md` apunta siempre a `AGENTS.md`
4. Los skills siguen la especificación [agentskills.io](https://agentskills.io/specification)
5. Un agent o skill que describa un stack que el proyecto no usa es peor que no
   tenerlo: aquí no hay Supabase, ni Next.js, ni RLS

## Agents Disponibles

| Agent | Rol |
|-------|-----|
| `code-reviewer` | Revisión de código con checklist |
| `database-expert` | PostgreSQL y Prisma: esquema, migraciones, consultas |
| `domain-expert` | DDD, bounded contexts, reglas de negocio avícola |
| `qa-engineer` | Testing: Vitest, Playwright, TDD |
| `security-auditor` | OWASP Top 10, guards, aislamiento por empresa, validación |
| `product-analyst` | Especificación de features, análisis de viabilidad |
| `refactor-guide` | Refactorización segura e incremental |
| `platform-engineer` | Render, Cloudflare Workers, Docker, GitHub Actions |

## Skills Disponibles

| Skill | Propósito |
|-------|----------|
| `cryotech-domain` | Dominio avícola: lotes, registros, métricas |
| `react-frontend` | React 19 en SPA con Vite: TanStack Query, formularios |
| `pwa-offline` | PWA offline-first (diseñado, aún no implementado) |
| `testing-patterns` | Vitest + Playwright, mocking de la capa de API |
| `tailwind-shadcn-patterns` | Tailwind v4 + Shadcn/UI patterns |
| `interface-design` | Diseño de interfaces con craft y consistencia |
| `brainstorming` | Exploración de ideas antes de implementar |
| `concise-planning` | Checklists atómicos para tareas de desarrollo |
| `conversation-retrospective` | Mejora de config IA a partir de conversaciones |
| `skill-creator` | Guía para crear nuevos skills |
