import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateResults, formatTime, getRating } from '../public/assets/js/scoring.js';

test('scoring-v1 returns 100 percent for a perfect result', () => {
  assert.deepEqual(
    calculateResults({ foundCount: 8, wrongClicks: 0, quizScore: 5 }),
    { challengeScore: 800, overallPercent: 100, rating: 'Gold' }
  );
});

test('wrong-click penalties never create a negative challenge score', () => {
  const result = calculateResults({ foundCount: 1, wrongClicks: 10, quizScore: 0 });
  assert.equal(result.challengeScore, 0);
  assert.equal(result.overallPercent, 9);
});

test('wrong-click penalties do not change the overall learning percentage', () => {
  const clean = calculateResults({ foundCount: 6, wrongClicks: 0, quizScore: 4 });
  const penalized = calculateResults({ foundCount: 6, wrongClicks: 12, quizScore: 4 });
  assert.equal(clean.overallPercent, penalized.overallPercent);
  assert.ok(clean.challengeScore > penalized.challengeScore);
});

test('rating boundaries match the PRD', () => {
  assert.equal(getRating(59), 'Bronze');
  assert.equal(getRating(60), 'Silver');
  assert.equal(getRating(79), 'Silver');
  assert.equal(getRating(80), 'Gold');
});

test('time formatting is deterministic and non-negative', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(-3), '00:00');
});

