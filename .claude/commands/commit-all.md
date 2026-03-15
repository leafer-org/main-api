# Commit All Repositories

Commit changes across all monorepo projects with detailed commit messages.

Repositories to process (in order):
1. `d:/projects/leafer/mono/http-contracts` — HTTP contracts (OpenAPI specs)
2. `d:/projects/leafer/mono/main-api` — Backend API
3. `d:/projects/leafer/mono/admin` — Admin panel (React)
4. `d:/projects/leafer/mono/mobile` — Mobile app (React Native)

## Instructions

For each repository above, do the following:

### 1. Check for changes
Run `git status` and `git diff` (staged + unstaged) in the repo directory. If there are no changes, skip this repo and move to the next one.

### 2. Analyze changes
- Read the diffs carefully to understand what was changed and why
- Group related changes logically
- Look at recent `git log --oneline -5` to follow the repo's commit message style

### 3. Stage and commit
- Stage only the relevant changed files by name (do NOT use `git add -A` or `git add .`)
- Do NOT stage files that look like secrets (.env, credentials, etc.)
- Write a detailed commit message in the conventional commits style:
  - First line: `type(scope): short summary` (under 72 chars)
  - Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`
  - Blank line, then bullet-point body describing the key changes and motivation
  - !!!NOT END with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Use a HEREDOC to pass the commit message

### 4. Report
After processing all repos, output a summary table:

| Repo | Status | Commit |
|------|--------|--------|
| http-contracts | committed / skipped | short message or — |
| main-api | committed / skipped | short message or — |
| admin | committed / skipped | short message or — |
| mobile | committed / skipped | short message or — |

Do NOT push to remote. Only commit locally.