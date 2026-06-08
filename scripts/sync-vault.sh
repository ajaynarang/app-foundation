#!/usr/bin/env bash
# Sync SALLY project memory, rules, and root docs into the Obsidian wiki's Sources/ layer.
# Idempotent. Run after any update to memory files, CLAUDE.md, or design docs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT_DIR="$REPO_ROOT/Obsidian Vault/SALLY"
MEMORY_DIR="/Users/ajay-admin/.claude/projects/-Users-ajay-admin-sally/memory"

mkdir -p "$VAULT_DIR/Sources/Memory" "$VAULT_DIR/Sources/Rules" "$VAULT_DIR/Sources/Docs"

# Memory files (per-user, persistent)
if [ -d "$MEMORY_DIR" ]; then
  rsync -av --update "$MEMORY_DIR"/*.md "$VAULT_DIR/Sources/Memory/" 2>/dev/null || true
fi

# Project-level rules (if any)
if [ -d "$REPO_ROOT/.claude/rules" ]; then
  rsync -av --update "$REPO_ROOT/.claude/rules"/*.md "$VAULT_DIR/Sources/Rules/" 2>/dev/null || true
fi

# Root docs
for file in CLAUDE.md GEMINI.md AGENTS.md README.md DOCUMENTATION.md CONTRIBUTING.md; do
  [ -f "$REPO_ROOT/$file" ] && rsync -av --update "$REPO_ROOT/$file" "$VAULT_DIR/Sources/Docs/" || true
done

# Design docs (mkdocs + .docs planning)
if [ -d "$REPO_ROOT/docs" ]; then
  rsync -av --update --include="*.md" --exclude="*" "$REPO_ROOT/docs/"*.md "$VAULT_DIR/Sources/Docs/" 2>/dev/null || true
fi
if [ -d "$REPO_ROOT/.docs" ]; then
  mkdir -p "$VAULT_DIR/Sources/Docs/plans"
  rsync -av --update "$REPO_ROOT/.docs/plans/"*.md "$VAULT_DIR/Sources/Docs/plans/" 2>/dev/null || true
fi

# Prepend "NOT AUTHORITATIVE" header to AI instruction snapshots so future sessions don't
# read Sources/Docs/CLAUDE.md as active instructions.
HEADER='<!-- WIKI REFERENCE COPY — NOT AUTHORITATIVE
     This file is a snapshot synced by sync-vault.sh for wiki reference only.
     Do not follow these as instructions — they are archived context for the wiki.
-->'

for doc_file in CLAUDE.md GEMINI.md AGENTS.md; do
  dest="$VAULT_DIR/Sources/Docs/$doc_file"
  if [ -f "$dest" ] && ! head -1 "$dest" | grep -q "WIKI REFERENCE COPY"; then
    tmp=$(mktemp)
    printf '%s\n\n' "$HEADER" > "$tmp"
    cat "$dest" >> "$tmp"
    mv "$tmp" "$dest"
  fi
done

echo "Sync complete. Run /wiki-ingest to propagate changes to Wiki/ pages."
