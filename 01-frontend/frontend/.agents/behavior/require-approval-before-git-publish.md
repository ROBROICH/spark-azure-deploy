# Require Approval Before Git Publish Actions

- Never stage, commit, push, force-push, create a branch, or open/update a merge request unless the user explicitly asks for that exact git action.
- Before changing git history or remote state, ask for confirmation in plain language and wait for the user's approval.
- It is okay to inspect git state with read-only commands such as `git status`, `git diff`, `git log`, and `git show` without asking first.
- A user saying that a change "can go", "looks good", or "could be pushed later" is not enough approval; ask before running the git command.

## Bad Example

```bash
git add src/features/project/ewms/Ewms.tsx
git commit -m "Frontend add EWMS import placeholder flow"
git push origin feature/01-ewms-nodes
```

## Good Example

```text
The change looks ready from my side. Do you want me to stage, commit, and push it to the current branch?
```
