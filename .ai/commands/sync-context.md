---
name: sync-context
description: Crea symlinks CLAUDE.md apuntando a AGENTS.md en todo el proyecto.
usage: sync-context
---

# Action
Sincroniza los archivos de contexto creando symlinks `CLAUDE.md → AGENTS.md`.

# Steps
1. Buscar todos los archivos `AGENTS.md` en el proyecto (excluyendo node_modules y .next).
2. Para cada ubicación, verificar si existe `CLAUDE.md` como symlink.
3. Si no existe o es un archivo regular, crear el symlink.
4. Reportar los enlaces creados.

# Implementation
```bash
PROJECT_ROOT="$(pwd)"
find "$PROJECT_ROOT" -name "AGENTS.md" -not -path "*/node_modules/*" -not -path "*/.next/*" | while read agents_file; do
    dir=$(dirname "$agents_file")
    claude_file="$dir/CLAUDE.md"
    if [ ! -L "$claude_file" ]; then
        rm -f "$claude_file" 2>/dev/null
        ln -s "AGENTS.md" "$claude_file"
        echo "Created: $claude_file -> AGENTS.md"
    fi
done
```

# Notes
- Esta funcionalidad también se ejecuta automáticamente al correr `/sync`.
