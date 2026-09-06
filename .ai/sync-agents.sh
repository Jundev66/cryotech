#!/bin/bash

# ==========================================
# CryoTech - Sync Script for AI Artifacts
# Descripción: Sincroniza skills, agents y commands desde el SSOT (.ai)
#              hacia Claude Code, OpenCode y Antigravity.
# ==========================================

# Autogestión de permisos
chmod +x "$0" 2>/dev/null

# 1. Definimos el "Single Source of Truth" (Tu carpeta .ai actual)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IA_ROOT="$SCRIPT_DIR"
PROJECT_ROOT="$(dirname "$IA_ROOT")"

# Carpetas que vamos a sincronizar (Arrays en bash)
DIRS_TO_SYNC=("skills" "agents" "commands")

# Archivos individuales a sincronizar
FILES_TO_SYNC=("settings.json")

# 2. Definimos los targets DENTRO del proyecto (no en $HOME)
TOOL_KEYS=("claude_code" "opencode" "antigravity")
TOOL_DISPLAY=("Claude Code" "OpenCode" "Antigravity")
TOOL_DIRS=("$PROJECT_ROOT/.claude" "$PROJECT_ROOT/.opencode" "$PROJECT_ROOT/.agent")

echo "Iniciando sincronizacion del Cerebro Digital (.ai/)..."
echo "Origen: $IA_ROOT"
echo "---------------------------------------------------"

# 3. Loop Maestro: Herramientas -> Carpetas
for i in "${!TOOL_KEYS[@]}"; do
    TOOL_NAME="${TOOL_DISPLAY[$i]}"
    TARGET_BASE_DIR="${TOOL_DIRS[$i]}"

    echo "Configurando: $TOOL_NAME ($TARGET_BASE_DIR)"

    # Crear directorio base si no existe
    if [ ! -d "$TARGET_BASE_DIR" ]; then
        echo "   Creando directorio base..."
        mkdir -p "$TARGET_BASE_DIR"
    fi

    # Iterar sobre skills, agents, commands
    for DIR in "${DIRS_TO_SYNC[@]}"; do
        SOURCE_DIR="$IA_ROOT/$DIR"
        TARGET_LINK="$TARGET_BASE_DIR/$DIR"

        # Solo sincronizamos si la carpeta origen existe en .ai/
        if [ -d "$SOURCE_DIR" ]; then
            # Limpieza: Si existe un link o carpeta vieja, la volamos para actualizar
            if [ -d "$TARGET_LINK" ] || [ -L "$TARGET_LINK" ]; then
                rm -rf "$TARGET_LINK"
            fi

            # Creación del Symlink (ruta relativa para portabilidad)
            ln -s "../.ai/$DIR" "$TARGET_LINK"

            if [ $? -eq 0 ]; then
                echo "   OK $DIR enlazado -> $TARGET_LINK"
            else
                echo "   ERROR enlazando $DIR"
            fi
        else
            echo "   Saltando $DIR (No existe en .ai/)"
        fi
    done
    # Sincronizar archivos individuales
    for FILE in "${FILES_TO_SYNC[@]}"; do
        SOURCE_FILE="$IA_ROOT/$FILE"
        TARGET_LINK="$TARGET_BASE_DIR/$FILE"

        if [ -f "$SOURCE_FILE" ]; then
            if [ -f "$TARGET_LINK" ] || [ -L "$TARGET_LINK" ]; then
                rm -f "$TARGET_LINK"
            fi

            ln -s "../.ai/$FILE" "$TARGET_LINK"

            if [ $? -eq 0 ]; then
                echo "   OK $FILE enlazado -> $TARGET_LINK"
            else
                echo "   ERROR enlazando $FILE"
            fi
        fi
    done
    echo "---------------------------------------------------"
done

# 4. Sincronizar AGENTS.md → CLAUDE.md (symlinks)
echo "Sincronizando AGENTS.md -> CLAUDE.md..."
find "$PROJECT_ROOT" -name "AGENTS.md" -not -path "*/node_modules/*" -not -path "*/.next/*" | while read agents_file; do
    dir=$(dirname "$agents_file")
    claude_file="$dir/CLAUDE.md"

    if [ ! -L "$claude_file" ]; then
        rm -f "$claude_file" 2>/dev/null
        ln -s "AGENTS.md" "$claude_file"
        echo "   OK $(basename "$dir")/CLAUDE.md -> AGENTS.md"
    fi
done
echo "---------------------------------------------------"

echo "Todo listo! Dale play."
