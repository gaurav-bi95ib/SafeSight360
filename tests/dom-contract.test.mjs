import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../public/assets/js/app.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../public/index.php', import.meta.url), 'utf8');

test('all statically referenced app controls exist in the page', () => {
  const referencedIds = new Set(
    [...app.matchAll(/document\.querySelector(?:All)?\(\s*['"]#([A-Za-z][\w-]*)/g)]
      .map((match) => match[1])
  );
  const pageIds = new Set(
    [...page.matchAll(/\bid=['"]([A-Za-z][\w-]*)['"]/g)]
      .map((match) => match[1])
  );
  const missing = [...referencedIds].filter((id) => !pageIds.has(id));
  assert.deepEqual(missing, []);
});

test('all statically requested screen transitions have a matching screen', () => {
  const transitions = new Set(
    [...app.matchAll(/transitionTo\(['"]([A-Za-z][\w-]*)['"]\)/g)]
      .map((match) => match[1])
  );
  const screens = new Set(
    [...page.matchAll(/\bdata-screen=['"]([A-Za-z][\w-]*)['"]/g)]
      .map((match) => match[1])
  );
  const missing = [...transitions].filter((screen) => !screens.has(screen));
  assert.deepEqual(missing, []);
});

test('challenge markup contains one closed HUD before the panorama shell', () => {
  const challenge = page.match(/data-screen="challenge"[\s\S]*?<\/section>/)?.[0] || '';
  assert.equal((challenge.match(/class="hud"/g) || []).length, 1);
  assert.ok(challenge.indexOf('class="hud"') < challenge.indexOf('class="panorama-shell"'));
  assert.match(challenge, /id="hazards-total"/);
});

test('panorama touch tracking does not capture or swallow hazard taps', () => {
  assert.doesNotMatch(app, /panoContainer\.setPointerCapture/);
  assert.match(app, /pointerdown[\s\S]*?target\.closest\('\.hazard-hotspot'\)/);
  assert.match(app, /pointerup[\s\S]*?target\.closest\('\.hazard-hotspot'\)/);
});

test('logout sends the JSON request required by the protected API', () => {
  const logoutHandler = app.match(/#nav-logout-btn[\s\S]*?window\.location\.assign\(appUrl\('\/'\)\);/)?.[0] || '';
  assert.match(logoutHandler, /action=logout/);
  assert.match(logoutHandler, /method:\s*'POST'/);
  assert.match(logoutHandler, /body:\s*JSON\.stringify\(\{\}\)/);
});
