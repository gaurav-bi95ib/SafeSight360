export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getRating(overallPercent) {
  if (overallPercent >= 80) return 'Gold';
  if (overallPercent >= 60) return 'Silver';
  return 'Bronze';
}

export function calculateResults({
  foundCount,
  wrongClicks,
  quizScore,
  maxHazards = 8,
  quizTotal = 5,
  correctPoints = 100,
  wrongPenalty = 20,
}) {
  const safeFound = clamp(Number(foundCount) || 0, 0, maxHazards);
  const safeWrong = Math.max(0, Number(wrongClicks) || 0);
  const safeQuiz = clamp(Number(quizScore) || 0, 0, quizTotal);
  const challengeScore = Math.max(0, (safeFound * correctPoints) - (safeWrong * wrongPenalty));
  const overallPercent = Math.round((70 * safeFound / maxHazards) + (30 * safeQuiz / quizTotal));

  return {
    challengeScore,
    overallPercent,
    rating: getRating(overallPercent),
  };
}

export function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

