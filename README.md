# SafeSight360 MVP

SafeSight360 is a browser-based 360-degree safety-training platform built with HTML, CSS, JavaScript, Marzipano, PHP, and MySQL/MariaDB.

## One-command XAMPP start on Windows

Start MySQL from the XAMPP Control Panel, open PowerShell in this project directory, and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-xampp-dev.ps1
```

Then open `http://127.0.0.1:8080`. The launcher creates/imports the `safesight360` database idempotently and serves only the `public/` directory. Press `Ctrl+C` to stop it. If the local database account has a password, provide `-DatabasePassword 'your-local-password'`.

## Administrator access

Direct public account creation is disabled. A learner submits the **Request access** form using an address ending in `@safesight360.com`; the password is hashed immediately and no session or user account is created. An administrator must approve the pending request before the learner can sign in.

To create the first administrator securely:

1. Set a strong password in the `SAFESIGHT_ADMIN_PASSWORD` environment variable.
2. From the project directory, run the administrator command with an organisational email:

```powershell
$env:SAFESIGHT_ADMIN_PASSWORD = 'replace-with-a-strong-private-password'
C:\xampp\php\php.exe .\scripts\manage-admin.php admin@safesight360.com "Administrator Name"
Remove-Item Env:SAFESIGHT_ADMIN_PASSWORD
```

3. Sign in with the administrator account. It opens the role-protected Training Management dashboard.

Administrators can approve or reject access requests; add, edit, view and deactivate learners; assign existing modules; monitor Not Started, In Progress and Completed states; and review saved scores and completion history. The protected content studio also manages module copy, validated high-resolution 2:1 panorama uploads, initial 360-degree camera settings, hotspot coordinates and feedback, and MCQ questions, options, correct answers and explanations. Learner sessions receive HTTP 403 from every admin endpoint.

## Server requirements

1. Use PHP 8.0 or newer with PDO MySQL and MySQL/MariaDB.
2. Create a database and import `database/schema.sql`.
3. Point the web server document root at `public/`.
4. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` as server environment variables when the defaults are unsuitable.
5. Confirm `public/vendor/marzipano/marzipano.js` exists, then open the configured site URL.

For a default local XAMPP installation with a passwordless `root` account, set `APP_ENV=development`, `DB_USER=root`, and `DB_PASSWORD` to an empty value. Empty database passwords are rejected in every other environment.

Do not place real credentials in the repository. Production must use HTTPS, secure cookies, a restricted database user, server-managed secrets, and approved final panorama/safety content.

## Development checks

- `npm test` runs scoring, DOM contracts, role/security, panorama and content tests.
- `npm run check:js` performs JavaScript syntax checks.
- `php -l <file>` can lint each PHP file when PHP is installed locally.
- `C:\xampp\php\php.exe tests\backend.integration.php` runs rollback-safe database, score-validation, progress and private-challenge integration checks after importing the schema.
- `powershell -ExecutionPolicy Bypass -File .\scripts\qa-release-check.ps1` runs the Sep 16 QA release gate: JS checks, JS tests, PHP lint, clean MySQL schema import, and backend integration checks.

## Content replacement

The platform includes four distinct 2:1 equirectangular training scenes: Warehouse Hazard Hunt, Manual Handling, Working at Height, and Unsafe Acts. Each module has its own calibrated hotspot coordinates and subject-specific fallback bundle. Before client release, complete a competent-person safety review and final visual/hotspot sign-off.

Registered trainees can use the 1v1 Safety Arena to create an eight-character private challenge code, join the same module from another account, submit one verified attempt each, and compare the final scores. Challenge attempts are validated against the participant, module, and one-attempt rule on the server.

See `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ROLES_AND_RESPONSIBILITIES.md`, and `docs/CONTRIBUTION_PLAN.md` for the requirements baseline, architecture, ownership model, and GitHub workflow.
