import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { escapeHtml } from '../public/assets/js/sanitize.js';

test('untrusted names are safely encoded before HTML template insertion', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('unsafe')"> & Co`),
    '&lt;img src=x onerror=&quot;alert(&#39;unsafe&#39;)&quot;&gt; &amp; Co'
  );
});

test('escapeHtml safely handles nullish and numeric values', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(250), '250');
});

test('PHP bootstrap keeps state-changing requests behind CSRF protection and security headers', () => {
  const bootstrap = readFileSync('src/bootstrap.php', 'utf8');
  const api = readFileSync('public/api/index.php', 'utf8');
  assert.match(bootstrap, /hash_equals\(\$expected,\s*\$received\)/);
  assert.match(bootstrap, /X-Content-Type-Options/);
  assert.match(bootstrap, /Referrer-Policy/);
  assert.match(api, /requireCsrfToken\(\);/);
  assert.match(api, /\$method !== 'POST'/);
});

test('Apache policy permits the application styling without allowing inline scripts', () => {
  const config = readFileSync('public/.htaccess', 'utf8');
  assert.match(config, /style-src 'self' 'unsafe-inline'/);
  assert.match(config, /script-src 'self'/);
  assert.doesNotMatch(config, /script-src[^\r\n]*'unsafe-inline'/);
});

test('backend uses prepared statements for user supplied challenge and answer inputs', () => {
  const repository = readFileSync('src/TrainingRepository.php', 'utf8');
  const api = readFileSync('public/api/index.php', 'utf8');
  assert.match(repository, /prepare\('SELECT \* FROM challenge_attempts WHERE challenge_code = :code/);
  assert.match(repository, /normalizeChallengeCode/);
  assert.match(repository, /validateAnswerForModule/);
  assert.match(repository, /assertQuestionAssigned\(int \$userId, string \$slug/);
  assert.match(api, /moduleSlug.*questionId.*optionId/s);
  assert.match(repository, /unset\(\$question\['correctOptionId'\]/);
});

test('public onboarding requires organisational email and administrator approval', () => {
  const auth = readFileSync('src/AuthService.php', 'utf8');
  const api = readFileSync('public/api/index.php', 'utf8');
  const schema = readFileSync('database/schema.sql', 'utf8');
  assert.match(auth, /@safesight360\\\.com/);
  assert.match(auth, /function requestAccess/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS access_requests/);
  assert.match(api, /action === 'request-access'/);
  assert.match(api, /Direct account creation is disabled/);
  assert.match(api, /action === 'admin-review-access'[\s\S]*?requireAdmin\(\)/);
});

test('module content management is protected and server validated', () => {
  const api = readFileSync('public/api/index.php', 'utf8');
  const admin = readFileSync('src/AdminService.php', 'utf8');
  const schema = readFileSync('database/schema.sql', 'utf8');
  assert.match(schema, /content_json LONGTEXT/);
  assert.match(api, /action === 'admin-module-content'[\s\S]*?requireAdmin\(\)/);
  assert.match(api, /action === 'admin-save-module-content'[\s\S]*?requireAdmin\(\)/);
  assert.match(api, /action === 'admin-upload-panorama'[\s\S]*?requireAdmin\(\)/);
  assert.match(admin, /function saveModuleContent/);
  assert.match(admin, /function uploadPanorama/);
  assert.match(admin, /is_uploaded_file/);
  assert.match(admin, /2:1 equirectangular/);
  assert.match(admin, /Each question requires between 2 and 6 options/);
  assert.match(admin, /module\.content\.updated/);
});

test('role based access and learner status are enforced server side', () => {
  const auth = readFileSync('src/AuthService.php', 'utf8');
  const bootstrap = readFileSync('src/bootstrap.php', 'utf8');
  const api = readFileSync('public/api/index.php', 'utf8');
  assert.match(auth, /account_status.*active/s);
  assert.match(auth, /auth_last_seen/);
  assert.match(auth, /auth_fingerprint/);
  assert.match(bootstrap, /function requireAdmin/);
  assert.match(bootstrap, /Administrator access is required/);
  for (const action of ['admin-dashboard', 'admin-learners', 'admin-modules', 'admin-reports']) {
    const route = api.match(new RegExp(`action === '${action}'[\\s\\S]*?jsonResponse\\(`))?.[0] || '';
    assert.match(route, /requireAdmin\(\)/, `${action} is not protected by the admin role check`);
  }
});

test('training assignments and admin changes use prepared database operations', () => {
  const schema = readFileSync('database/schema.sql', 'utf8');
  const admin = readFileSync('src/AdminService.php', 'utf8');
  const repository = readFileSync('src/TrainingRepository.php', 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS training_assignments/);
  assert.match(schema, /ENUM\('not_started', 'in_progress', 'completed'\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS admin_audit_log/);
  assert.match(admin, /prepare\(/);
  assert.match(admin, /training\.assigned/);
  assert.match(repository, /assertTrainingAssigned/);
});

test('authorization failures do not fall through to offline training bundles', () => {
  const app = readFileSync('public/assets/js/app.js', 'utf8');
  assert.match(app, /error\.status = response\.status/);
  assert.match(app, /err\.status === 401 \|\| err\.status === 403/);
  assert.match(app, /Access restricted/);
});
