# SafeSight360 Contribution Plan

## 13 September - Repository Foundation and Requirements Baseline

Owner: Gaurav Yadav

Goals for the day:

- Create or confirm the GitHub repository.
- Confirm collaborator access.
- Connect the local repository to GitHub.
- Push `main`.
- Create `develop`.
- Protect `main`.
- Publish README, PRD, architecture, roles, and contribution plan.
- Create GitHub milestones and role-based issues.

## Branch Workflow

- `main`: protected stable branch for reviewed work.
- `develop`: integration branch for team work before release.
- Feature branches: use focused names such as `frontend/ui-polish`, `backend/scoring-validation`, `qa/security-checks`, and `docs/final-submission`.

## Commit Style

Use clear Conventional Commit style messages:

```text
chore(repo): initialize SafeSight360 project structure
docs(prd): publish code-aligned product requirements
docs(plan): add team ownership and release workflow
feat(backend): add secure authentication and scoring API
feat(frontend): build Marzipano training interface
test(qa): add scoring and backend integration checks
```

## Milestones

- Frontend/360 Degree Experience.
- Backend/Database Integration.
- QA/Security/Deployment.
- Final Release.

## Review Rules

- Work should be linked to an issue.
- Code must run locally on XAMPP before release.
- `main` should receive only reviewed or release-ready work.
- Security-sensitive changes must check authentication, CSRF, scoring validation, and private challenge access.
