/**
 * SafeSight360 — 5 Whys Interactive Puzzle Engine
 * Root Cause Analysis training module
 */

import { earnSpecialBadge, showToast } from './gamification.js';

// ── Scenario Data ─────────────────────────────────────────────
const SCENARIO = {
  incident: {
    title: 'Incident: Worker slipped near the forklift bay',
    description: 'A warehouse operative slipped on a wet floor in the forklift operating zone and suffered a minor injury. Investigate why this happened using the 5 Whys technique.',
  },
  whys: [
    {
      question: 'Why 1: Why did the worker slip?',
      correctId: 'a',
      options: [
        { id: 'a', text: 'The floor was wet and slippery in the forklift area', correct: true },
        { id: 'b', text: 'The worker was not paying attention', correct: false },
        { id: 'c', text: 'The worker was running through the warehouse', correct: false },
        { id: 'd', text: 'The footwear was the wrong size', correct: false },
      ],
      explanation: 'The immediate cause was the wet, slippery floor. We must now investigate why the floor was wet.',
    },
    {
      question: 'Why 2: Why was the floor wet?',
      correctId: 'b',
      options: [
        { id: 'a', text: 'It had been raining heavily outside', correct: false },
        { id: 'b', text: 'A hydraulic fluid leak from the forklift was not reported or cleaned', correct: true },
        { id: 'c', text: 'The cleaning team spilled water', correct: false },
        { id: 'd', text: 'A drink had been left on the floor', correct: false },
      ],
      explanation: 'An unreported hydraulic fluid leak caused the wet floor. Why wasn\'t the leak reported?',
    },
    {
      question: 'Why 3: Why was the leak not reported or cleaned?',
      correctId: 'c',
      options: [
        { id: 'a', text: 'Workers did not know there was a leak', correct: false },
        { id: 'b', text: 'The reporting system had crashed that day', correct: false },
        { id: 'c', text: 'Workers were unsure of the reporting procedure and feared they would be blamed', correct: true },
        { id: 'd', text: 'No one was in the area to notice', correct: false },
      ],
      explanation: 'A culture of blame and unclear reporting procedures stopped workers from raising the issue. Why did this culture exist?',
    },
    {
      question: 'Why 4: Why did workers fear blame for reporting issues?',
      correctId: 'a',
      options: [
        { id: 'a', text: 'Previous reporters had faced negative consequences and there was no clear near-miss reporting system', correct: true },
        { id: 'b', text: 'Workers had not received induction training', correct: false },
        { id: 'c', text: 'Management was not present in the warehouse', correct: false },
        { id: 'd', text: 'Workers were new to the company', correct: false },
      ],
      explanation: 'There was no psychological safety for reporting hazards. Why had this not been addressed?',
    },
    {
      question: 'Why 5: Why had the reporting culture not been addressed?',
      correctId: 'd',
      options: [
        { id: 'a', text: 'The company was too small to have a safety culture', correct: false },
        { id: 'b', text: 'Near-miss events were considered normal and acceptable', correct: false },
        { id: 'c', text: 'Safety training was only provided to new starters', correct: false },
        { id: 'd', text: 'Senior leadership had not prioritised a just culture and near-miss reporting had no formal process or review', correct: true },
      ],
      explanation: 'Root cause found: Lack of leadership commitment to a just culture and absence of a near-miss reporting process.',
    },
  ],
  rootCause: 'Senior leadership had not established a just culture or near-miss reporting process. This meant a hydraulic leak went unreported, creating a slip hazard.',
  prevention: 'Countermeasures: Implement a no-blame near-miss reporting system, conduct leadership safety walks, provide clear reporting procedures, and track near-miss data in regular safety reviews.',
};

// ── State ─────────────────────────────────────────────────────
let currentWhy    = 0;
let score         = 0;
let answers       = [];
let isComplete    = false;
let onCompleteCallback = null;
let startedAt     = 0;

// ── Initialise ────────────────────────────────────────────────
export function initFiveWhys(onComplete) {
  currentWhy = 0;
  score      = 0;
  answers    = [];
  isComplete = false;
  onCompleteCallback = onComplete;
  startedAt = performance.now();

  renderIncident();
  renderChain();
  updateScore();
}

function renderIncident() {
  const titleEl = document.getElementById('fivewhys-incident-title');
  const descEl  = document.getElementById('fivewhys-incident-desc');
  if (titleEl) titleEl.textContent = SCENARIO.incident.title;
  if (descEl)  descEl.textContent  = SCENARIO.incident.description;
}

function renderChain() {
  const chain = document.getElementById('fivewhys-chain');
  if (!chain) return;

  chain.innerHTML = SCENARIO.whys.map((why, i) => {
    const isActive = i === currentWhy;
    const isDone   = i < currentWhy;
    const answer   = answers[i];

    return `
      <div class="why-step ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}"
           id="why-step-${i}"
           aria-label="Why ${i + 1}${isDone ? ': answered' : isActive ? ': current question' : ': locked'}">
        <div class="why-connector">
          <div class="why-number">${i + 1}</div>
          ${i < SCENARIO.whys.length - 1 ? '<div class="why-line"></div>' : ''}
        </div>
        <div class="why-content">
          <p class="why-question">${why.question}</p>
          ${isDone && answer ? renderAnswered(answer, why) : ''}
          ${isActive ? renderOptions(why, i) : ''}
        </div>
      </div>
    `;
  }).join('');

  // Attach option handlers for the active step
  chain.querySelectorAll('.why-option').forEach(btn => {
    btn.addEventListener('click', () => handleAnswer(parseInt(btn.dataset.why), btn.dataset.optionId));
  });

  // Scroll active step into view
  const activeEl = chain.querySelector('.is-active');
  if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderAnswered(answer, why) {
  return `
    <div class="why-selected-answer" aria-live="polite">
      ${answer.correct ? '✅' : '❌'} ${answer.text}
    </div>
    <p style="font-size: 0.82rem; color: var(--ink-soft); margin: 8px 0 0; padding-left: 4px;">${why.explanation}</p>
  `;
}

function renderOptions(why, whyIndex) {
  return `
    <div class="why-options" role="group" aria-label="Select the most likely reason">
      ${why.options.map(opt => `
        <button class="why-option"
                type="button"
                data-why="${whyIndex}"
                data-option-id="${opt.id}"
                aria-label="${opt.text}">
          ${opt.text}
        </button>
      `).join('')}
    </div>
  `;
}

function handleAnswer(whyIndex, optionId) {
  if (whyIndex !== currentWhy || isComplete) return;

  const why    = SCENARIO.whys[whyIndex];
  const option = why.options.find(o => o.id === optionId);
  if (!option) return;

  const correct = option.id === why.correctId;
  answers[whyIndex] = { optionId: option.id, text: option.text, correct };

  if (correct) {
    score += 20;
  }

  updateScore();

  currentWhy++;

  if (currentWhy >= SCENARIO.whys.length) {
    completeModule();
  } else {
    renderChain();
  }
}

function completeModule() {
  isComplete = true;
  renderChain();

  // Show root cause reveal
  const reveal = document.getElementById('root-cause-reveal');
  const rcText = document.getElementById('root-cause-text');
  const rcPrev = document.getElementById('root-cause-prevention');
  if (reveal) {
    rcText.textContent = SCENARIO.rootCause;
    rcPrev.textContent = SCENARIO.prevention;
    reveal.hidden = false;
    reveal.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Perfect chain badge
  const allCorrect = answers.every(a => a.correct);
  if (allCorrect) {
    const isNew = earnSpecialBadge('root_cause');
    if (isNew) {
      showToast({
        emoji: '🔍',
        title: 'Badge Unlocked: Root Cause Detective',
        desc: 'You identified the complete 5 Whys chain correctly!',
        duration: 5000,
      });
    }
  }

  // Build result object for quiz/completion
  const result = {
    overallPercent: score,
    rating: score >= 80 ? 'Gold' : score >= 60 ? 'Silver' : 'Bronze',
    quizScore: 0, // Will be updated after quiz
    foundCount: answers.filter(a => a.correct).length,
    wrongClicks: answers.filter(a => !a.correct).length,
    elapsedSeconds: Math.max(1, Math.round((performance.now() - startedAt) / 1000)),
    moduleType: 'puzzle',
    interactiveEvidence: { answers: answers.map(answer => answer.optionId) },
    reviewItems: SCENARIO.whys.map((why, index) => ({
      title: why.question,
      status: answers[index].correct ? 'Correct' : 'Review',
      text: why.explanation,
    })),
  };

  // Wire "Continue to quiz" button
  const toQuizBtn = document.getElementById('fivewhys-to-quiz');
  if (toQuizBtn && onCompleteCallback) {
    toQuizBtn.addEventListener('click', () => onCompleteCallback(result), { once: true });
  }
}

function updateScore() {
  const el = document.getElementById('fivewhys-score');
  if (el) el.textContent = score;
}
