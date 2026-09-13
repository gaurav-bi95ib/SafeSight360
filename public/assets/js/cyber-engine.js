/**
 * SafeSight360 — Cyber Awareness Interactive Engine
 * 5 mini-games covering different cyber topics
 */

import { earnSpecialBadge, showToast } from './gamification.js';

// ── Data & Config ─────────────────────────────────────────────
const TOPICS = [
  { id: 'fundamentals', title: 'Fundamentals', game: 'quiz', reviewText: 'Use unique passwords, enable MFA, and use an approved VPN on untrusted networks.' },
  { id: 'home-working', title: 'Safe Home Working', game: 'dragdrop', reviewText: 'Lock unattended screens, protect printed records, and use only approved accounts and networks.' },
  { id: 'social-engineering', title: 'Social Engineering', game: 'email', reviewText: 'Treat urgency, unusual sender domains, credential requests, and unexpected links as warning signs.' },
  { id: 'mobile', title: 'Mobile Devices', game: 'dragdrop_mobile', reviewText: 'Use a secure screen lock, install official-store apps, avoid jailbreaking, and apply updates promptly.' },
  { id: 'phishing', title: 'Phishing', game: 'phishing_rating', reviewText: 'Verify the sender, domain, request, link, and attachment before trusting an unexpected message.' },
];

const CONTENT = {
  fundamentals: [
    { q: 'Using the same password for work and personal accounts is acceptable if it is complex.', a: false, exp: 'Never reuse passwords. If one service is breached, all your accounts are at risk.' },
    { q: 'A VPN encrypts your internet traffic, keeping it safe from interception on public Wi-Fi.', a: true, exp: 'VPNs create a secure tunnel for your data.' },
    { q: 'Multi-Factor Authentication (MFA) is only needed for administrators.', a: false, exp: 'MFA should be used by everyone to protect against stolen passwords.' }
  ],
  'home-working': {
    items: [
      { id: 'h1', text: 'Lock screen when leaving desk', correct: true },
      { id: 'h2', text: 'Use personal email for work files', correct: false },
      { id: 'h3', text: 'Connect to open public Wi-Fi', correct: false },
      { id: 'h4', text: 'Store printed work documents securely', correct: true }
    ]
  },
  'social-engineering': {
    email: {
      from: 'IT Support <it-help-desk@company-update.com>',
      to: 'All Staff',
      subject: 'URGENT: Password Expiry in 2 Hours',
      body: `Hi Team,<br><br>Due to a recent security upgrade, your Office365 password will expire in 2 hours.<br><br>Please click <span class="email-suspicious" data-issue="fake-link">here</span> to update it immediately, or your account will be locked.<br><br>Regards,<br>IT Department`
    },
    issues: ['fake-link']
  },
  mobile: {
    items: [
      { id: 'm1', text: 'Use biometric unlock (Face/Touch ID)', correct: true },
      { id: 'm2', text: 'Jailbreak device for custom apps', correct: false },
      { id: 'm3', text: 'Install apps only from official stores', correct: true },
      { id: 'm4', text: 'Delay OS updates to save battery', correct: false }
    ]
  },
  phishing: [
    { sender: 'HR Dept <hr@company.com>', subject: 'New Holiday Policy', text: 'Please review the attached PDF for the updated 2026 holiday policy.', type: 'safe' },
    { sender: 'Netflix Support <support@netfiix.com>', subject: 'Payment Declined', text: 'Your recent payment was declined. Click here to update your billing details immediately.', type: 'danger' },
    { sender: 'CEO <ceo.personal@gmail.com>', subject: 'Quick favour', text: 'Are you at your desk? I need you to buy some gift cards for a client meeting. Reply ASAP.', type: 'danger' }
  ]
};

// ── State ─────────────────────────────────────────────────────
let activeTopicIndex = 0;
let scores = {}; // topicId -> score (0-100)
let activityEvidence = {}; // topicId -> learner decisions
let onCompleteCallback = null;
let startedAt = 0;

// ── Init ──────────────────────────────────────────────────────
export function initCyber(onComplete) {
  activeTopicIndex = 0;
  scores = {};
  activityEvidence = {};
  onCompleteCallback = onComplete;
  startedAt = performance.now();

  document.querySelectorAll('.cyber-topic-pill').forEach((pill, i) => {
    pill.classList.remove('is-done', 'is-active');
    pill.setAttribute('aria-selected', 'false');
    if (i === 0) {
      pill.classList.add('is-active');
      pill.setAttribute('aria-selected', 'true');
    }
    pill.onclick = () => {
      if (pill.classList.contains('is-done') || i === activeTopicIndex) {
        activeTopicIndex = i;
        updatePills();
        renderActiveGame();
      }
    };
  });

  const nextBtn = document.getElementById('cyber-next-btn');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (activeTopicIndex < TOPICS.length - 1) {
        activeTopicIndex++;
        updatePills();
        renderActiveGame();
      } else {
        finishModule();
      }
    };
  }

  renderActiveGame();
}

function updatePills() {
  document.querySelectorAll('.cyber-topic-pill').forEach((pill, i) => {
    pill.classList.remove('is-active');
    pill.setAttribute('aria-selected', 'false');
    if (i === activeTopicIndex) {
      pill.classList.add('is-active');
      pill.setAttribute('aria-selected', 'true');
    }
  });
}

function updateScore(score) {
  const topicId = TOPICS[activeTopicIndex].id;
  scores[topicId] = score;
  const scoreEl = document.getElementById('cyber-topic-score');
  if (scoreEl) scoreEl.textContent = `${score}%`;

  const pill = document.querySelector(`.cyber-topic-pill[data-topic="${topicId}"]`);
  if (pill) pill.classList.add('is-done');

  const nextBtn = document.getElementById('cyber-next-btn');
  if (nextBtn) {
    nextBtn.hidden = false;
    nextBtn.textContent = activeTopicIndex === TOPICS.length - 1 ? 'Finish Module →' : 'Next Topic →';
  }
}

function renderActiveGame() {
  const area = document.getElementById('cyber-game-area');
  const nextBtn = document.getElementById('cyber-next-btn');
  const scoreEl = document.getElementById('cyber-topic-score');
  if (!area) return;

  if (nextBtn) nextBtn.hidden = true;
  if (scoreEl) scoreEl.textContent = '—';

  const topic = TOPICS[activeTopicIndex];
  
  if (scores[topic.id] !== undefined) {
    // Already completed
    area.innerHTML = `
      <div style="text-align: center; padding: 40px; background: var(--glass); border-radius: var(--radius);">
        <div style="font-size: 3rem; margin-bottom: 20px;">✅</div>
        <h3>Topic Completed</h3>
        <p>You scored ${scores[topic.id]}% on this section.</p>
      </div>
    `;
    updateScore(scores[topic.id]);
    return;
  }

  // Render specific game
  if (topic.game === 'quiz') renderQuiz(area, CONTENT.fundamentals);
  else if (topic.game === 'dragdrop') renderDragDrop(area, CONTENT['home-working']);
  else if (topic.game === 'email') renderEmailGame(area, CONTENT['social-engineering']);
  else if (topic.game === 'dragdrop_mobile') renderDragDrop(area, CONTENT.mobile);
  else if (topic.game === 'phishing_rating') renderPhishingGame(area, CONTENT.phishing);
}

// ── Game Types ────────────────────────────────────────────────

function renderQuiz(area, data) {
  let qIdx = 0;
  let correct = 0;
  const choices = [];

  function renderQ() {
    if (qIdx >= data.length) {
      activityEvidence.fundamentals = choices;
      updateScore(Math.round((correct / data.length) * 100));
      area.innerHTML = `<div style="text-align:center; padding:40px;"><h3>Done!</h3><p>You got ${correct} out of ${data.length} right.</p></div>`;
      return;
    }
    const q = data[qIdx];
    area.innerHTML = `
      <div style="max-width: 600px; margin: 0 auto; text-align: center;">
        <h3 style="margin-bottom: 30px;">${q.q}</h3>
        <div style="display: flex; gap: 20px; justify-content: center;">
          <button class="button button-secondary button-large" id="btn-true">True</button>
          <button class="button button-secondary button-large" id="btn-false">False</button>
        </div>
        <div id="q-feedback" style="margin-top: 20px; font-weight: bold; min-height: 50px;"></div>
      </div>
    `;

    const handleAns = (ans) => {
      document.getElementById('btn-true').disabled = true;
      document.getElementById('btn-false').disabled = true;
      const isCorrect = ans === q.a;
      choices.push(ans);
      if (isCorrect) correct++;
      
      const fb = document.getElementById('q-feedback');
      fb.innerHTML = `<span style="color: ${isCorrect ? 'var(--green)' : 'var(--red)'}">${isCorrect ? 'Correct!' : 'Incorrect.'}</span> ${q.exp}`;
      
      setTimeout(() => {
        qIdx++;
        renderQ();
      }, 3000);
    };

    document.getElementById('btn-true').onclick = () => handleAns(true);
    document.getElementById('btn-false').onclick = () => handleAns(false);
  }
  
  renderQ();
}

function renderDragDrop(area, data) {
  area.innerHTML = `
    <div class="drag-drop-area">
      <div class="drag-source" id="drag-source">
        <h4 style="margin: 0 0 16px; color: var(--ink-soft);">Available Practices</h4>
        ${data.items.map(i => `<button type="button" class="drag-item" draggable="true" id="${i.id}" data-correct="${i.correct}" aria-label="Move ${i.text}">${i.text}</button>`).join('')}
      </div>
      <div class="drag-target" id="drag-target">
        <h4 style="margin: 0 0 16px; color: var(--green);">Safe Practices (Drop Here)</h4>
      </div>
    </div>
    <div style="text-align: center; margin-top: 20px;">
      <button class="button button-primary" id="check-drag">Check Answers</button>
    </div>
  `;

  let draggedItem = null;

  document.querySelectorAll('.drag-item').forEach(item => {
    item.addEventListener('dragstart', () => {
      draggedItem = item;
      document.body.classList.add('is-component-dragging');
      setTimeout(() => item.style.opacity = '0.5', 0);
    });
    item.addEventListener('dragend', () => {
      draggedItem = null;
      item.style.opacity = '1';
      document.body.classList.remove('is-component-dragging');
    });
    item.addEventListener('click', () => {
      const destination = item.parentElement === target ? source : target;
      destination.appendChild(item);
      item.focus();
    });
  });

  const target = document.getElementById('drag-target');
  const source = document.getElementById('drag-source');

  [target, source].forEach(box => {
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('is-over'); });
    box.addEventListener('dragleave', () => box.classList.remove('is-over'));
    box.addEventListener('drop', e => {
      e.preventDefault();
      box.classList.remove('is-over');
      if (draggedItem) box.appendChild(draggedItem);
      document.body.classList.remove('is-component-dragging');
    });
  });

  document.getElementById('check-drag').onclick = () => {
    const dropped = Array.from(target.querySelectorAll('.drag-item'));
    activityEvidence[TOPICS[activeTopicIndex].id] = dropped.map(item => item.id);
    let correctPoints = 0;
    
    // Check if they put correct ones in target, and left incorrect ones in source
    const correctTotal = data.items.filter(i => i.correct).length;
    
    dropped.forEach(item => {
      if (item.dataset.correct === 'true') {
        item.style.backgroundColor = 'rgba(0,229,160,0.2)';
        item.style.borderColor = 'var(--green)';
        correctPoints++;
      } else {
        item.style.backgroundColor = 'rgba(255,71,87,0.2)';
        item.style.borderColor = 'var(--red)';
        correctPoints--;
      }
    });

    // Punish for missing correct ones
    const sourceItems = Array.from(source.querySelectorAll('.drag-item'));
    sourceItems.forEach(item => {
       if(item.dataset.correct === 'true') {
          item.style.backgroundColor = 'rgba(255,177,31,0.2)';
          item.style.borderColor = 'var(--amber)';
       }
    });

    const score = Math.max(0, Math.round((correctPoints / correctTotal) * 100));
    updateScore(score);
    document.getElementById('check-drag').disabled = true;
  };
}

function renderEmailGame(area, data) {
  area.innerHTML = `
    <div style="max-width: 600px; margin: 0 auto;">
      <p style="margin-bottom: 16px; color: var(--ink-soft);">Click on any suspicious elements in this email.</p>
      <div class="email-card">
        <div class="email-field"><span class="email-field-label">From:</span> <span class="email-field-value email-suspicious" data-issue="fake-sender">${data.email.from.replace('<', '&lt;').replace('>', '&gt;')}</span></div>
        <div class="email-field"><span class="email-field-label">To:</span> <span class="email-field-value">${data.email.to}</span></div>
        <div class="email-field"><span class="email-field-label">Subject:</span> <span class="email-field-value email-suspicious" data-issue="urgent">${data.email.subject}</span></div>
        <div class="email-body">
          ${data.email.body}
        </div>
      </div>
    </div>
  `;

  let found = 0;
  const selectedIssues = [];
  const issues = data.issues.length + 2; // +2 for sender and subject which are always issues in this specific game

  document.querySelectorAll('.email-suspicious').forEach(el => {
    el.onclick = () => {
      if (!el.classList.contains('is-found')) {
        el.classList.add('is-found');
        selectedIssues.push(el.dataset.issue);
        activityEvidence['social-engineering'] = [...selectedIssues];
        found++;
        if (found >= issues) {
          updateScore(100);
          showToast({ emoji: '🕵️', title: 'Good eye!', desc: 'You spotted all the red flags.' });
        }
      }
    };
  });
}

function renderPhishingGame(area, data) {
  let qIdx = 0;
  let correct = 0;
  const choices = [];

  function renderQ() {
    if (qIdx >= data.length) {
      activityEvidence.phishing = choices;
      updateScore(Math.round((correct / data.length) * 100));
      area.innerHTML = `<div style="text-align:center; padding:40px;"><h3>Done!</h3><p>You got ${correct} out of ${data.length} right.</p></div>`;
      return;
    }
    const email = data[qIdx];
    area.innerHTML = `
      <div class="phishing-card">
        <div class="email-card" style="margin-bottom: 20px;">
          <div class="email-field"><span class="email-field-label">From:</span> <span class="email-field-value">${email.sender.replace('<', '&lt;').replace('>', '&gt;')}</span></div>
          <div class="email-field"><span class="email-field-label">Subject:</span> <span class="email-field-value">${email.subject}</span></div>
          <div class="email-body">${email.text}</div>
        </div>
        <h4 style="text-align: center; margin-bottom: 10px;">How would you rate this email?</h4>
        <div class="phishing-rating-buttons">
          <button class="phishing-btn safe" data-type="safe">✅ Safe</button>
          <button class="phishing-btn suspect" data-type="suspect">⚠️ Suspicious</button>
          <button class="phishing-btn danger" data-type="danger">🚨 Danger</button>
        </div>
      </div>
    `;

    document.querySelectorAll('.phishing-btn').forEach(btn => {
      btn.onclick = () => {
        const type = btn.dataset.type;
        choices.push(type);
        // Simplified check: we consider 'danger' and 'suspect' both as wrong if it's safe, etc.
        // But for this prototype, we'll just require exact match
        if (type === email.type || (type === 'suspect' && email.type === 'danger') || (type === 'danger' && email.type === 'suspect')) {
           // Allow suspect/danger interchangeably for bad emails
           if(email.type !== 'safe') correct++;
           else if(type === 'safe') correct++;
        } else {
           if(type === 'safe' && email.type === 'safe') correct++;
        }

        qIdx++;
        renderQ();
      };
    });
  }
  
  renderQ();
}

function finishModule() {
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) / TOPICS.length;
  
  if (totalScore >= 80) {
    const isNew = earnSpecialBadge('cyber_guardian');
    if (isNew) {
      showToast({
        emoji: '🛡️',
        title: 'Badge Unlocked: Cyber Guardian',
        desc: 'You proved your cyber security awareness!',
        duration: 5000,
      });
    }
  }

  const result = {
    overallPercent: Math.round(totalScore),
    rating: totalScore >= 80 ? 'Gold' : totalScore >= 60 ? 'Silver' : 'Bronze',
    quizScore: 0,
    foundCount: 0,
    wrongClicks: 0,
    elapsedSeconds: Math.max(1, Math.round((performance.now() - startedAt) / 1000)),
    moduleType: 'interactive',
    interactiveEvidence: { answers: { ...activityEvidence } },
    reviewItems: TOPICS.map(topic => ({
      title: topic.title,
      status: `${scores[topic.id]}%`,
      text: topic.reviewText,
    })),
  };

  if (onCompleteCallback) onCompleteCallback(result);
}
