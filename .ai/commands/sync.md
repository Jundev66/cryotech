---
name: sync
description: Sincroniza los skills, agents y commands desde .ai/ hacia los directorios de configuración de Claude, OpenCode y Antigravity.
usage: sync
---

# Action
Ejecuta el script de bash ubicado en `.ai/sync-agents.sh`.

# Steps
1. Asegurarse de que el archivo `.ai/sync-agents.sh` tenga permisos de ejecución.
2. Ejecutar `./.ai/sync-agents.sh`.
3. Reportar al usuario el estado de la sincronización de cada herramienta.
