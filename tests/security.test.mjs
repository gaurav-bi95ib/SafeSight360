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

test('backend uses prepared statements for user supplied challenge and answer inputs', () => {
  const repository = readFileSync('src/TrainingRepository.php', 'utf8');
  const api = readFileSync('public/api/index.php', 'utf8');
  assert.match(repository, /prepare\('SELECT \* FROM challenge_attempts WHERE challenge_code = :code/);
  assert.match(repository, /normalizeChallengeCode/);
  assert.match(repository, /prepare\(\s*'SELECT q\.explanation/);
  assert.match(api, /questionId.*optionId/s);
});
