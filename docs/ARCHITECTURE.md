# SafeSight360 Architecture

## Stack

- Frontend: HTML, CSS, JavaScript modules.
- 360 viewer: Marzipano.
- Backend: PHP.
- Database: MySQL/MariaDB.
- Local runtime: XAMPP on Windows.

## Runtime Flow

```text
Browser
  -> public/index.php
  -> public/assets/js/app.js
  -> public/api/index.php
  -> src services
  -> MySQL database
```

## Main Components

- `public/index.php`: application shell, screens, dashboard, arena, leaderboard, and module containers.
- `public/assets/css/app.css`: responsive light/dark UI styling.
- `public/assets/js/app.js`: session handling, module flow, API calls, results, dashboard, leaderboard, and challenge orchestration.
- `public/assets/js/vr-adapter.js`: Marzipano panorama setup and viewer controls.
- `public/assets/js/five-whys-engine.js`: 5 Whys interactive activity.
- `public/assets/js/cyber-engine.js`: Cyber Awareness activity.
- `public/api/index.php`: JSON API router.
- `src/AuthService.php`: signup, login, logout, password hashing, login streaks.
- `src/TrainingRepository.php`: training data, attempts, dashboard, badges, leaderboard, and challenges.
- `src/AttemptService.php`: server-side scoring and result validation.
- `database/schema.sql`: database tables, module seed data, hazards, quiz content, users, attempts, badges, and challenges.

## Security Design

- Sessions use a dedicated session name.
- POST requests require CSRF tokens.
- Passwords use PHP password hashing.
- Registered result submissions are recalculated on the server.
- Interactive modules submit raw evidence rather than trusted percentages.
- Public output is escaped before HTML insertion.
- Private 1v1 challenges are limited to the challenger and accepted opponent.

## Deployment Notes

For local evaluation, run MySQL in XAMPP and serve the `public/` folder on `127.0.0.1:8080`. Production deployment must use HTTPS, secure cookies, restricted database credentials, and reviewed final safety content.
