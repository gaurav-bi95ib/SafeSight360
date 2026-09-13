# SafeSight360 Product Requirements Document

## 13 September Requirements Baseline

SafeSight360 is a browser-based safety training platform for warehouse and operational risk awareness. The product is built for XAMPP-compatible deployment using HTML, CSS, JavaScript, Marzipano, PHP, and MySQL/MariaDB.

The approved MVP focuses on interactive learning, verified scoring, and clear assessment evidence for six training modules:

- Warehouse Hazard Hunt: 360-degree hazard spotting and knowledge check.
- Manual Handling: 360-degree TILE assessment and safe lifting awareness.
- Working at Height: 360-degree ladder, edge, and equipment safety awareness.
- 5 Whys Root Cause: interactive incident investigation puzzle.
- Unsafe Acts: 360-degree human factors and behavioural safety awareness.
- Cyber Awareness: five interactive mini-games covering phishing, home working, social engineering, mobile devices, and fundamentals.

## Goals

- Provide a professional training interface that works locally through XAMPP.
- Deliver individual module experiences rather than repeating one generic scenario.
- Store users, attempts, scores, XP, badges, leaderboard entries, and 1v1 challenges in MySQL.
- Recalculate scores on the server so trainees cannot submit forged percentages.
- Support light and dark UI modes, responsive layouts, and clear dashboard progress.
- Provide evidence-ready documentation and tests for assignment review.

## Core Requirements

- Users can sign up, log in, log out, and resume authenticated sessions.
- Registered users can access all six modules.
- Panorama modules use Marzipano for 360-degree viewing, zoom controls, hotspots, timers, feedback, quiz, and result screens.
- Interactive modules submit raw activity evidence for server-side validation.
- Dashboard shows XP, level, streak, badges, attempts, scores, and module progress.
- Leaderboard shows ranked trainee results.
- 1v1 Safety Arena allows private challenge creation, joining, one verified attempt per participant, final score comparison, and winner calculation.
- The app includes a safety disclaimer that results are training performance only, not formal certification.

## Non-Functional Requirements

- PHP 8.0 or newer with PDO MySQL.
- MySQL or MariaDB database imported from `database/schema.sql`.
- Web server document root must point to `public/`.
- Credentials must not be committed.
- Server-side CSRF protection must be used for state-changing requests.
- Output rendering must escape untrusted names and leaderboard values.
- Local quality checks must include JavaScript syntax, content/scoring/security tests, and backend integration checks.

## 13 September Scope

The 13 September milestone establishes the repository, requirements baseline, architecture, roles, contribution plan, and foundation source code needed for later role-based work.
