import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const content = JSON.parse(await readFile(new URL('../public/assets/data/training-fallback.json', import.meta.url), 'utf8'));

test('locked MVP contains exactly eight uniquely coded hazards', () => {
  assert.equal(content.hazards.length, 8);
  assert.equal(new Set(content.hazards.map(({ code }) => code)).size, 8);
  assert.deepEqual(content.hazards.map(({ code }) => code), ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8']);
});

test('knowledge check contains five questions with one valid correct option each', () => {
  assert.equal(content.questions.length, 5);
  for (const question of content.questions) {
    assert.equal(question.options.length, 4);
    assert.ok(question.options.some(({ id }) => id === question.correctOptionId));
    assert.ok(question.explanation.length > 20);
  }
});

test('scenario locks the PRD timing and scoring version', () => {
  assert.equal(content.scenario.durationSeconds, 120);
  assert.equal(content.scenario.maxHazards, 8);
  assert.equal(content.scenario.scoringFormulaVersion, 'scoring-v1');
});

test('all six fallback bundles declare the correct module type', async () => {
  const expected = {
    'training-fallback.json': 'panorama',
    'manual-handling-fallback.json': 'panorama',
    'working-at-height-fallback.json': 'panorama',
    'unsafe-acts-fallback.json': 'panorama',
    'five-whys-fallback.json': 'puzzle',
    'cyber-awareness-fallback.json': 'interactive',
  };

  for (const [file, moduleType] of Object.entries(expected)) {
    const bundle = JSON.parse(await readFile(new URL(`../public/assets/data/${file}`, import.meta.url), 'utf8'));
    assert.equal(bundle.scenario.moduleType, moduleType, file);
  }
});

test('every panorama bundle points to a valid 2:1 PNG with matching width metadata', async () => {
  const files = [
    'training-fallback.json',
    'manual-handling-fallback.json',
    'working-at-height-fallback.json',
    'unsafe-acts-fallback.json',
  ];

  for (const file of files) {
    const bundle = JSON.parse(await readFile(new URL(`../public/assets/data/${file}`, import.meta.url), 'utf8'));
    const panoramaPath = bundle.scenario.panoramaUrl.replace(/^\/+/, '');
    const panoramaUrl = new URL(`../public/${panoramaPath}`, import.meta.url);
    await access(panoramaUrl);

    const png = await readFile(panoramaUrl);
    assert.equal(png.toString('ascii', 1, 4), 'PNG', `${file} must reference a PNG image`);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.equal(width, bundle.scenario.panoramaWidth, `${file} width metadata`);
    assert.equal(width, height * 2, `${file} must reference a 2:1 equirectangular image`);

    assert.ok(bundle.scenario.rollbackPanoramaUrl, `${file} must declare a rollback panorama`);
    const rollbackPath = bundle.scenario.rollbackPanoramaUrl.replace(/^\/+/, '');
    const rollbackUrl = new URL(`../public/${rollbackPath}`, import.meta.url);
    await access(rollbackUrl);
    const rollbackPng = await readFile(rollbackUrl);
    const rollbackWidth = rollbackPng.readUInt32BE(16);
    const rollbackHeight = rollbackPng.readUInt32BE(20);
    assert.equal(rollbackWidth, rollbackHeight * 2, `${file} rollback must be a 2:1 image`);
  }
});
