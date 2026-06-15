---
name: code-review
description: |
  Code review for local changes. Reviews branch diffs against origin/dev, staged changes,
  or uncommitted changes. Uses multiple parallel agents to check for bugs, security issues,
  logic errors, and CLAUDE.md compliance.

  IMPORTANT: Before doing anything, you MUST ask the user what they want reviewed using AskUserQuestion.
  Do NOT skip this step. Do NOT assume the review mode.
---

# Code Review Skill

Automated code review using multiple specialized agents. Works locally with git — no GitHub/Gitea API required.

## IMPORTANT: Always ask first

Before starting any review, you MUST use AskUserQuestion to ask the user what they want reviewed. Do NOT skip this step. Do NOT assume a default. The options are:

1. **Branch diff against origin/dev (Recommended)** — Review all changes on the current branch compared to `origin/dev`
2. **Staged changes** — Review only `git diff --staged`
3. **Uncommitted changes** — Review all uncommitted changes
4. **Custom** — Let the user specify a custom diff target

Only skip asking if the user already specified what to review in their message.
