---
trigger: always
description: Kebab-case file and folder names only.
globs: **/*
---

# Kebab-Case Names Only

Use kebab-case for every file and folder: lowercase `a-z`, `0-9`, single hyphens only.

**Allowed:** `my-folder/`, `user-profile-card.tsx`, `the-best-tech-stack-for-2026.md`
**Forbidden:** spaces, uppercase, `_`, parens; `My Folder/`, `UserProfile.ts`, `user_profile.ts`, `My Doc (Final).md`

Convert violations to kebab-case (lowercase, spaces/`_` to `-`, drop special chars, keep lowercase extension) and rename with plain `mv`; never create the raw name. Keep `AGENTS.md`, dotfiles (`.agents/`, `.gitignore`), and tool-required configs (`package.json`, `opencode.json`) as-is.

If a user proposes a bad name: create the kebab-case version and reply `Renamed "<original>" -> "<kebab>" per kebab-case-names rule.`
