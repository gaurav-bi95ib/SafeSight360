import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
