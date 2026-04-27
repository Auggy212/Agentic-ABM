# Git Workflow Cheat Sheet

## Branch Strategy

- `main` - protected, always deployable, no direct pushes
- `dev` - integration branch; merge feature branches here first
- `feature/frontend/*` - frontend work such as `feature/frontend/intake-form`
- `feature/backend/*` - backend work such as `feature/backend/icp-scout-api`
- `hotfix/*` - urgent production fixes only

## Create a Feature Branch

Start from the latest `dev` branch:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/frontend/intake-form
```

Backend example:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/backend/icp-scout-api
```

## Push Your Branch

```bash
git push -u origin feature/frontend/intake-form
```

## Open a Pull Request

1. Push your feature branch to origin.
2. Open a PR targeting `dev`.
3. Add context: summary, screenshots if UI changed, test notes, and linked tasks.
4. Request the appropriate reviewers.

## Review Rules

- No direct pushes to `main`
- All changes land through PRs
- At least one reviewer approval before merge
- Resolve comments before merging
- Keep PRs focused and reasonably small
- Confirm tests or manual verification notes in the PR description

## Merge Order

1. Merge feature branches into `dev`
2. Validate integration on `dev`
3. Open a release PR from `dev` to `main`
4. Merge to `main` only when deployable

## Hotfix Flow

1. Branch from `main` using `hotfix/*`
2. Open a PR into `main`
3. After merge, back-merge the hotfix into `dev`
