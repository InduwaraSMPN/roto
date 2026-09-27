---
trigger: always
description: Read-only git/gh. No write or remote actions.
globs: **/*
---

# Git/GitHub: Read-Only

Inspect freely; never mutate the working tree, history, or remote.

**Allowed:** `git status|diff|log|show|branch|ls-files`; `gh pr/issue/repo view`, `gh run list`
**Forbidden:** `git add|commit|push|pull|merge|rebase|reset|tag`; `gh pr create`, `gh issue edit`, `gh label add`, `gh secret set`; anything creating a commit, altering `.git`, or touching origin/GitHub.

If a commit or PR is needed: output the exact commands and a draft message in a code block for the user to run. Never execute them.
