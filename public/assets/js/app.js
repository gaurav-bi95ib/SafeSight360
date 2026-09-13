import { calculateResults, clamp, formatTime } from './scoring.js';
import { renderModulesGrid, renderModuleProgressGrid, getModule, MODULE_TYPES } from './modules.js';
import { VRAdapter } from './vr-adapter.js';
import { initFiveWhys } from './five-whys-engine.js';
import { initCyber } from './cyber-engine.js';
import * as gamification from './gamification.js';
import { escapeHtml } from './sanitize.js';

const screens = new Map(
  [...document.querySelectorAll('[data-screen]')].map((screen) => [screen.dataset.screen, screen])
);

const state = {
  current: 'auth',
  user: null,
  csrfToken: null,
  activeModule: null,
  challengeCode: null,
  bundle: null,
  apiAvailable: true,
  vr: null,
  
  // Session tracking
  foundCodes: new Set(),
  wrongClicks: 0,
  remainingMs: 0,
  deadlineMs: 0,
  elapsedSeconds: 0,
  timerId: null,
  timerPaused: false,
  challengeEnded: false,
  
  // Quiz
  quizIndex: 0,
  quizScore: 0,
  quizAnswers: {},
  quizReview: [],
  quizLocked: false,
  interactiveReview: [],
};

function applyTheme(theme, persist = true) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  if (persist) localStorage.setItem('ss360_theme', next);

  const isDark = next === 'dark';
  const button = document.querySelector('#theme-toggle');
  const icon = document.querySelector('#theme-toggle-icon');
  const label = document.querySelector('#theme-toggle-label');
  const nextLabel = isDark ? 'light' : 'dark';
  if (button) {
    button.setAttribute('aria-label', `Switch to ${nextLabel} theme`);
    button.setAttribute('aria-pressed', String(!isDark));
    button.title = `Switch to ${nextLabel} theme`;
  }
  if (icon) icon.textContent = isDark ? '☀' : '☾';
  if (label) label.textContent = isDark ? 'Light' : 'Dark';

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDark ? '#030b14' : '#f4f7fb';
}

function setLive(message) {
  const el = document.querySelector('#live-status');
  if (!el) return;
  el.textContent = '';
  window.setTimeout(() => { el.textContent = message; }, 20);
}

function transitionTo(nextState) {
  if (state.current === 'challenge' && nextState !== 'challenge') {
    stopTimer();
    state.pointerStart = null;
    document.body.classList.remove('is-component-dragging');
    const feedbackDialog = document.querySelector('#feedback-dialog');
    if (feedbackDialog?.open) feedbackDialog.close();
    if (state.vr) {
      state.vr.destroy();
      state.vr = null;
    }
  }
  screens.forEach((el, key) => {
    el.hidden = key !== nextState;
  });
  state.current = nextState;
  const navTarget = ['hub', 'briefing', 'challenge', 'fivewhys', 'cyber', 'quiz', 'results', 'review'].includes(nextState)
    ? 'training' : nextState;
  document.querySelectorAll('.primary-nav-link').forEach(link => {
    const active = link.dataset.destination === navTarget;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
  const heading = screens.get(nextState)?.querySelector('h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }
  return payload;
}

// ── Auth & Init ─────────────────────────────────────────────────────────────

async function init() {
  applyTheme(document.documentElement.dataset.theme, false);
  setupEventListeners();

  try {
    const session = await fetchJson('/api/index.php?action=session');
    state.csrfToken = session.csrfToken;
    if (session.authenticated && session.user) {
      handleLoginSuccess(session.user);
    } else {
      transitionTo('auth');
    }
  } catch (err) {
    console.warn('Backend API unavailable. Ready in local/offline mode.', err);
    state.apiAvailable = false;
    const serviceMode = document.querySelector('#service-mode');
    if (serviceMode) {
      serviceMode.hidden = false;
      serviceMode.textContent = 'Offline / Guest mode';
    }
    transitionTo('auth');
  }
}

function handleLoginSuccess(user) {
  state.user = user;
  
  // Header updates
  const headerUserSection = document.querySelector('#header-user-section');
  const headerUserName = document.querySelector('#header-user-name');
  const userAvatar = document.querySelector('#user-avatar');
  const headerUserLevel = document.querySelector('#header-user-level');
  
  if (headerUserSection) headerUserSection.hidden = false;
  if (headerUserName) headerUserName.textContent = user.displayName;
  if (userAvatar) userAvatar.textContent = (user.displayName || 'U').charAt(0).toUpperCase();
  
  const levelInfo = gamification.getLevel();
  if (headerUserLevel) headerUserLevel.textContent = `${levelInfo.emoji} ${levelInfo.name}`;
  
  document.body.classList.add('is-authenticated');
  
  refreshDashboard();
  transitionTo('hub');
  setLive(`Welcome, ${user.displayName}`);
}

function setupEventListeners() {
  document.querySelector('#theme-toggle')?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    setLive(`${document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light'} theme enabled.`);
  });

  document.querySelector('.brand')?.addEventListener('click', (event) => {
    if (!state.user) return;
    event.preventDefault();
    refreshDashboard();
    transitionTo('home');
  });

  // Auth tab switching
  const tabLogin = document.querySelector('#tab-login');
  const tabSignup = document.querySelector('#tab-signup');
  const panelLogin = document.querySelector('#panel-login');
  const panelSignup = document.querySelector('#panel-signup');

  tabLogin?.addEventListener('click', () => {
    tabLogin.classList.add('is-active');
    tabLogin.setAttribute('aria-selected', 'true');
    tabSignup?.classList.remove('is-active');
    tabSignup?.setAttribute('aria-selected', 'false');
    if (panelLogin) panelLogin.hidden = false;
    if (panelSignup) panelSignup.hidden = true;
  });

  tabSignup?.addEventListener('click', () => {
    tabSignup.classList.add('is-active');
    tabSignup.setAttribute('aria-selected', 'true');
    tabLogin?.classList.remove('is-active');
    tabLogin?.setAttribute('aria-selected', 'false');
    if (panelSignup) panelSignup.hidden = false;
    if (panelLogin) panelLogin.hidden = true;
  });

  // Login form submit
  const loginForm = document.querySelector('#login-form');
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginForm.email.value.trim();
    const password = loginForm.password.value;
    const submitBtn = document.querySelector('#login-submit');
    const errorBox = document.querySelector('#login-error');
    const errorMsg = document.querySelector('#login-error-msg');

    if (submitBtn) submitBtn.disabled = true;
    if (errorBox) errorBox.hidden = true;

    try {
      if (!state.apiAvailable) {
        throw new Error('Database server is offline. Click "Continue as guest" to proceed without an account.');
      }
      const res = await fetchJson('/api/index.php?action=login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      state.csrfToken = res.csrfToken;
      handleLoginSuccess(res.user);
    } catch (err) {
      if (errorBox && errorMsg) {
        errorMsg.textContent = err.message || 'Sign in failed. Check your email and password.';
        errorBox.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Signup form submit
  const signupForm = document.querySelector('#signup-form');
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = signupForm.displayName.value.trim();
    const email = signupForm.email.value.trim();
    const password = signupForm.password.value;
    const submitBtn = document.querySelector('#signup-submit');
    const errorBox = document.querySelector('#signup-error');
    const errorMsg = document.querySelector('#signup-error-msg');

    if (submitBtn) submitBtn.disabled = true;
    if (errorBox) errorBox.hidden = true;

    try {
      if (!state.apiAvailable) {
        throw new Error('Database server is offline. Click "Continue as guest" to proceed without an account.');
      }
      const res = await fetchJson('/api/index.php?action=signup', {
        method: 'POST',
        body: JSON.stringify({ displayName, email, password })
      });
      state.csrfToken = res.csrfToken;
      handleLoginSuccess(res.user);
    } catch (err) {
      if (errorBox && errorMsg) {
        errorMsg.textContent = err.message || 'Account creation failed. Please check inputs.';
        errorBox.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Guest button
  const guestBtn = document.querySelector('#guest-btn');
  guestBtn?.addEventListener('click', () => {
    const guestUser = {
      id: 0,
      displayName: 'Guest Trainee',
      email: 'guest@safesight360.local'
    };
    handleLoginSuccess(guestUser);
  });

  // Header Nav buttons
  document.querySelector('#nav-home-btn')?.addEventListener('click', () => transitionTo('home'));
  document.querySelector('#nav-training-btn')?.addEventListener('click', () => {
    refreshDashboard();
    transitionTo('hub');
  });
  document.querySelector('#nav-arena-btn')?.addEventListener('click', openArena);
  document.querySelector('#nav-leaderboard-btn')?.addEventListener('click', () => {
    loadLeaderboard('all-time');
    transitionTo('leaderboard');
  });
  document.querySelector('#nav-dashboard-btn')?.addEventListener('click', () => {
    refreshDashboard();
    transitionTo('dashboard');
  });

  document.querySelector('#nav-logout-btn')?.addEventListener('click', async () => {
    if (state.apiAvailable && state.user?.id !== 0) {
      try { await fetchJson('/api/index.php?action=logout', { method: 'POST' }); } catch (err) {}
    }
    location.reload();
  });

  // Home screen buttons
  document.querySelector('#start-training')?.addEventListener('click', () => {
    refreshDashboard();
    transitionTo('hub');
  });
  document.querySelector('#home-leaderboard-btn')?.addEventListener('click', () => {
    loadLeaderboard('all-time');
    transitionTo('leaderboard');
  });

  // Hub back button
  document.querySelector('#hub-back-btn')?.addEventListener('click', () => {
    transitionTo('home');
  });
  document.querySelector('#hub-arena-btn')?.addEventListener('click', openArena);

  // Dashboard navigation buttons
  document.querySelector('#dashboard-start-btn')?.addEventListener('click', () => {
    transitionTo('hub');
  });
  document.querySelector('#dashboard-leaderboard-btn')?.addEventListener('click', () => {
    loadLeaderboard('all-time');
    transitionTo('leaderboard');
  });
  document.querySelector('#dashboard-home-btn')?.addEventListener('click', () => {
    transitionTo('home');
  });
  document.querySelector('#dashboard-arena-btn')?.addEventListener('click', openArena);

  document.querySelector('#arena-back-btn')?.addEventListener('click', () => transitionTo('hub'));
  document.querySelector('#arena-refresh-btn')?.addEventListener('click', loadChallenges);
  document.querySelector('#arena-create-btn')?.addEventListener('click', createChallenge);
  document.querySelector('#arena-join-btn')?.addEventListener('click', joinChallenge);
  document.querySelector('#arena-copy-btn')?.addEventListener('click', copyChallengeCode);
  document.querySelector('#arena-join-code')?.addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8);
  });

  // Leaderboard navigation buttons
  document.querySelector('#leaderboard-back-btn')?.addEventListener('click', () => {
    transitionTo('hub');
  });
  document.querySelector('#daily-challenge-btn')?.addEventListener('click', () => {
    const dailyIndex = Math.floor(Date.now() / 86400000) % 3;
    const dailyModules = ['warehouse-hazard-hunt', 'manual-handling', 'working-at-height'];
    startModuleFlow(getModule(dailyModules[dailyIndex]));
  });
  document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lb-tab').forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      loadLeaderboard(tab.dataset.period || 'all-time');
    });
  });

  // Briefing screen button
  document.querySelector('#begin-challenge')?.addEventListener('click', startChallenge);

  // Panorama Controls
  document.querySelector('#zoom-in')?.addEventListener('click', () => state.vr?.zoom(-0.18));
  document.querySelector('#zoom-out')?.addEventListener('click', () => state.vr?.zoom(0.18));
  document.querySelector('#reset-view')?.addEventListener('click', () => state.vr?.resetView());
  document.querySelector('#continue-challenge')?.addEventListener('click', continueChallenge);

  // Quiz buttons
  document.querySelector('#quiz-form')?.addEventListener('submit', submitQuizAnswer);
  document.querySelector('#next-question')?.addEventListener('click', nextQuizQuestion);

  // Results & Review screen buttons
  document.querySelector('#review-mistakes')?.addEventListener('click', openReviewScreen);
  document.querySelector('#retry-training')?.addEventListener('click', retryCurrentModule);
  document.querySelector('#retry-from-review')?.addEventListener('click', retryCurrentModule);
  document.querySelector('#results-leaderboard-btn')?.addEventListener('click', () => {
    loadLeaderboard('all-time');
    transitionTo('leaderboard');
  });
  document.querySelector('#clear-best')?.addEventListener('click', clearBestPerformance);
  document.querySelector('#back-results')?.addEventListener('click', () => transitionTo('results'));
  document.querySelector('#back-to-hub')?.addEventListener('click', () => {
    refreshDashboard();
    transitionTo('hub');
  });
}

// ── Dashboard & Hub ─────────────────────────────────────────────────────────

async function refreshDashboard() {
  gamification.updateHeaderXp();
  gamification.renderBadgesGrid('dashboard-badges-grid');
  
  const xpInfo = gamification.getXpProgress();
  const levelInfo = gamification.getLevel();

  // Dashboard Header stats
  const dashName = document.querySelector('#dashboard-name');
  const dashLevel = document.querySelector('#dashboard-level');
  const dashStreak = document.querySelector('#dashboard-streak');
  const dashXpCurrent = document.querySelector('#dashboard-xp-current');
  const dashXpNext = document.querySelector('#dashboard-xp-next');
  const dashXpFill = document.querySelector('#dashboard-xp-fill');
  const dashAvatar = document.querySelector('#dashboard-avatar');
  
  if (dashName && state.user) dashName.textContent = state.user.displayName;
  if (dashAvatar && state.user) dashAvatar.textContent = (state.user.displayName || 'U').charAt(0).toUpperCase();
  if (dashLevel) dashLevel.textContent = `${levelInfo.emoji} ${levelInfo.name}`;
  if (dashStreak) dashStreak.innerHTML = `<span class="streak-flame">🔥</span> ${gamification.getStreak()}-day streak`;
  if (dashXpCurrent) dashXpCurrent.textContent = `${xpInfo.current} XP`;
  if (dashXpNext) dashXpNext.textContent = xpInfo.next ? `→ ${xpInfo.next.minXp} XP for ${xpInfo.next.name}` : 'Max Level';
  if (dashXpFill) dashXpFill.style.width = `${xpInfo.pct}%`;

  // Stats row
  const statAttempts = document.querySelector('#stat-attempts');
  const statBest = document.querySelector('#stat-best');
  const statAverage = document.querySelector('#stat-average');
  const statBadges = document.querySelector('#stat-badges');
  
  if (statBadges) statBadges.textContent = gamification.getBadges().length;

  let progress = {};
  if (state.apiAvailable && state.user && state.user.id !== 0) {
    try {
      const data = await fetchJson('/api/index.php?action=dashboard');
      if (statAttempts) statAttempts.textContent = data.attemptsCount || 0;
      if (statBest) statBest.textContent = data.bestPercent ? `${data.bestPercent}%` : '—';
      if (statAverage) statAverage.textContent = data.averagePercent ? `${data.averagePercent}%` : '—';
      renderRecentAttemptsTable(data.recentAttempts || []);

      gamification.hydrateProgress({
        xp: data.user?.xp,
        badges: data.badges,
        streak: data.user?.streak,
      });
      gamification.updateHeaderXp();
      gamification.renderBadgesGrid('dashboard-badges-grid');
      const syncedXp = gamification.getXpProgress();
      const syncedLevel = gamification.getLevel();
      if (dashLevel) dashLevel.textContent = `${syncedLevel.emoji} ${syncedLevel.name}`;
      if (dashStreak) dashStreak.innerHTML = `<span class="streak-flame">🔥</span> ${gamification.getStreak()}-day streak`;
      if (dashXpCurrent) dashXpCurrent.textContent = `${syncedXp.current} XP`;
      if (dashXpNext) dashXpNext.textContent = syncedXp.next ? `→ ${syncedXp.next.minXp} XP for ${syncedXp.next.name}` : 'Max Level';
      if (dashXpFill) dashXpFill.style.width = `${syncedXp.pct}%`;
      if (statBadges) statBadges.textContent = gamification.getBadges().length;
      
      progress = await fetchJson('/api/index.php?action=modules');
    } catch (err) {}
  }
  
  renderModulesGrid('modules-grid', progress, startModuleFlow);
  renderModuleProgressGrid('dashboard-module-progress', progress, startModuleFlow);
}

function renderRecentAttemptsTable(attempts) {
  const tbody = document.querySelector('#dashboard-attempts-table');
  if (!tbody) return;
  if (!attempts || attempts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--ink-muted); padding: 24px;">No attempts recorded yet. Start a module above!</td></tr>';
    return;
  }
  tbody.innerHTML = attempts.map(a => `
    <tr>
      <td>${a.completedAt ? a.completedAt.slice(0, 10) : 'Today'}</td>
      <td>${a.moduleTitle || 'Warehouse Hazard Hunt'}</td>
      <td><strong>${a.overallPercent}%</strong></td>
      <td><span class="module-rating-badge ${a.rating ? a.rating.toLowerCase() : 'bronze'}">${a.rating}</span></td>
      <td>${formatTime(a.elapsedSeconds || 0)}</td>
    </tr>
  `).join('');
}

// ── Module Routing ──────────────────────────────────────────────────────────

async function startModuleFlow(module, challengeCode = null) {
  state.activeModule = module;
  state.challengeCode = challengeCode;
  state.interactiveReview = [];
  const beginBtn = document.querySelector('#begin-challenge');
  if (beginBtn) {
    beginBtn.disabled = true;
    beginBtn.textContent = 'Loading scenario...';
  }
  
  try {
    if (state.apiAvailable) {
      state.bundle = await fetchJson(`/api/index.php?action=training&slug=${module.id}`);
    } else {
      throw new Error('Offline');
    }
  } catch (err) {
    try {
      const res = await fetch(module.fallbackUrl);
      state.bundle = await res.json();
    } catch (fallbackErr) {
      alert('Could not load module data.');
      return;
    }
  }
  
  transitionTo(module.screen);
  
  if (module.screen === 'briefing') {
    const bTitle = document.querySelector('#briefing-title');
    const bMission = document.querySelector('#briefing-mission');
    if (bTitle) bTitle.textContent = module.title;
    if (bMission) bMission.textContent = state.bundle.scenario.mission;
    if (beginBtn) {
      beginBtn.disabled = false;
      beginBtn.innerHTML = 'Enter the warehouse <span aria-hidden="true">→</span>';
    }
  } else if (module.screen === 'fivewhys') {
    initFiveWhys((result) => submitInteractiveResult(result));
  } else if (module.screen === 'cyber') {
    initCyber((result) => submitInteractiveResult(result));
  }
}

function retryCurrentModule() {
  if (state.activeModule) {
    startModuleFlow(state.activeModule);
  } else {
    transitionTo('hub');
  }
}

// ── Panorama Challenge (360) ────────────────────────────────────────────────

function startChallenge() {
  resetSessionState();
  transitionTo('challenge');
  const errorEl = document.querySelector('#panorama-error');
  if (errorEl) errorEl.hidden = true;
  
  if (state.vr) {
    state.vr.destroy();
  }
  
  const panoEl = document.querySelector('#pano');
  if (!panoEl) return;
  
  state.vr = new VRAdapter(panoEl, {
    imageUrl: state.bundle.scenario.panoramaUrl,
    panoramaWidth: state.bundle.scenario.panoramaWidth,
    initialView: state.bundle.scenario.initialView,
    maxFov: state.bundle.scenario.maxFov
  });
  
  state.vr.mount().then(() => {
    state.bundle.hazards.forEach(h => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hazard-hotspot';
      btn.style.setProperty('--hotspot-size', `${h.hotspotSize}px`);
      btn.innerHTML = '<span aria-hidden="true">!</span>';
      btn.onclick = (e) => handleHazard(e, h, btn);
      state.vr.addHotspot({ element: btn, yaw: h.yaw, pitch: h.pitch });
    });

    state.deadlineMs = performance.now() + state.remainingMs;
    state.timerId = window.setInterval(tickTimer, 200);
    tickTimer();
  }).catch(err => {
    if (errorEl) errorEl.hidden = false;
  });
}

function resetSessionState() {
  stopTimer();
  document.querySelector('#feedback-dialog')?.close();
  state.foundCodes = new Set();
  state.wrongClicks = 0;
  state.remainingMs = (state.bundle?.scenario?.durationSeconds || 120) * 1000;
  state.deadlineMs = 0;
  state.elapsedSeconds = 0;
  state.timerPaused = false;
  state.challengeEnded = false;
  state.quizIndex = 0;
  state.quizScore = 0;
  state.quizAnswers = {};
  state.quizReview = [];
  state.quizLocked = false;
  updateHud();
}

function handleHazard(event, hazard, button) {
  event.preventDefault();
  event.stopPropagation();
  if (state.current !== 'challenge' || state.timerPaused || state.challengeEnded) return;
  if (state.foundCodes.has(hazard.code)) return;
  
  state.foundCodes.add(hazard.code);
  button.classList.add('is-found');
  button.disabled = true;
  button.innerHTML = '<span aria-hidden="true">✓</span>';
  updateHud();
  pauseTimer();
  
  const fTitle = document.querySelector('#feedback-title');
  const fCopy = document.querySelector('#feedback-copy');
  const fDialog = document.querySelector('#feedback-dialog');
  
  if (fTitle) fTitle.textContent = hazard.title;
  if (fCopy) fCopy.textContent = hazard.feedback;
  if (fDialog) fDialog.showModal();
}

const panoContainer = document.querySelector('#pano');
panoContainer?.addEventListener('dragstart', (event) => event.preventDefault());
panoContainer?.addEventListener('pointerdown', (e) => {
  state.pointerStart = { x: e.clientX, y: e.clientY };
  document.body.classList.add('is-component-dragging');
});
panoContainer?.addEventListener('pointerup', (e) => {
  document.body.classList.remove('is-component-dragging');
  if (!state.pointerStart || e.target.closest('.hazard-hotspot')) return;
  const dist = Math.hypot(e.clientX - state.pointerStart.x, e.clientY - state.pointerStart.y);
  state.pointerStart = null;
  if (dist <= 7) handleWrongSelection();
});
panoContainer?.addEventListener('pointercancel', () => {
  state.pointerStart = null;
  document.body.classList.remove('is-component-dragging');
});
window.addEventListener('pointerup', () => document.body.classList.remove('is-component-dragging'));
window.addEventListener('blur', () => document.body.classList.remove('is-component-dragging'));

function handleWrongSelection() {
  if (state.current !== 'challenge' || state.timerPaused || state.challengeEnded) return;
  state.wrongClicks++;
  updateHud();
  if (panoContainer) {
    panoContainer.classList.remove('wrong-flash');
    window.requestAnimationFrame(() => panoContainer.classList.add('wrong-flash'));
  }
}

function currentChallengeScore() {
  return calculateResults({
    foundCount: state.foundCodes.size,
    wrongClicks: state.wrongClicks,
    quizScore: 0,
    maxHazards: state.bundle?.scenario?.maxHazards || 8,
    correctPoints: state.bundle?.scenario?.correctPoints || 100,
    wrongPenalty: state.bundle?.scenario?.wrongPenalty || 20,
  }).challengeScore;
}

function updateHud() {
  if (!state.bundle) return;
  const timerVal = document.querySelector('#timer-value');
  const timeProg = document.querySelector('#time-progress');
  const hazardsF = document.querySelector('#hazards-found');
  const scoreVal = document.querySelector('#score-value');

  const remainingSeconds = Math.ceil(state.remainingMs / 1000);
  if (timerVal) timerVal.textContent = formatTime(remainingSeconds);
  if (timeProg) {
    timeProg.max = state.bundle.scenario.durationSeconds;
    timeProg.value = remainingSeconds;
  }
  if (hazardsF) hazardsF.textContent = state.foundCodes.size;
  if (scoreVal) scoreVal.textContent = currentChallengeScore();
}

function tickTimer() {
  if (state.timerPaused || state.challengeEnded) return;
  state.remainingMs = Math.max(0, state.deadlineMs - performance.now());
  updateHud();
  if (state.remainingMs <= 0) finishChallenge('time');
}

function pauseTimer() {
  state.remainingMs = Math.max(0, state.deadlineMs - performance.now());
  state.timerPaused = true;
  stopTimer();
}

function resumeTimer() {
  state.timerPaused = false;
  state.deadlineMs = performance.now() + state.remainingMs;
  state.timerId = window.setInterval(tickTimer, 200);
}

function stopTimer() {
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = null;
}

function continueChallenge() {
  document.querySelector('#feedback-dialog')?.close();
  if (state.foundCodes.size === (state.bundle?.scenario?.maxHazards || 8)) {
    finishChallenge('all-found');
  } else {
    resumeTimer();
  }
}

function finishChallenge(reason) {
  if (state.challengeEnded) return;
  state.challengeEnded = true;
  stopTimer();
  state.elapsedSeconds = (state.bundle?.scenario?.durationSeconds || 120) - Math.ceil(state.remainingMs / 1000);
  if (state.bundle?.questions && state.bundle.questions.length > 0) {
    transitionTo('quiz');
    renderQuestion();
  } else {
    submitInteractiveResult({ moduleType: 'panorama', overallPercent: 100 });
  }
}

// ── Quiz ────────────────────────────────────────────────────────────────────

function renderQuestion() {
  const q = state.bundle.questions[state.quizIndex];
  state.quizLocked = false;
  
  const qTitle = document.querySelector('#quiz-question');
  const qOptions = document.querySelector('#quiz-options');
  const qFeedback = document.querySelector('#quiz-feedback');
  const btnSubmit = document.querySelector('#submit-answer');
  const btnNext = document.querySelector('#next-question');
  const fieldset = document.querySelector('#quiz-fieldset');
  const progressVal = document.querySelector('#quiz-progress');
  const progressText = document.querySelector('#quiz-progress-text');
  const scorePreview = document.querySelector('#quiz-score-preview');
  
  if (qTitle) qTitle.textContent = q.prompt;
  if (qOptions) qOptions.replaceChildren();
  if (qFeedback) { qFeedback.hidden = true; qFeedback.textContent = ''; }
  if (btnSubmit) { btnSubmit.hidden = false; btnSubmit.disabled = false; }
  if (btnNext) btnNext.hidden = true;
  if (fieldset) fieldset.disabled = false;
  
  if (progressVal) progressVal.value = state.quizIndex + 1;
  if (progressText) progressText.textContent = `Question ${state.quizIndex + 1} of ${state.bundle.questions.length}`;
  if (scorePreview) scorePreview.textContent = `${state.quizScore} correct so far`;

  q.options.forEach((opt, i) => {
    const lbl = document.createElement('label');
    lbl.className = 'quiz-option';
    lbl.innerHTML = `<input type="radio" name="quiz-option" value="${opt.id}" required><span class="option-marker">${String.fromCharCode(65+i)}</span><span>${opt.label}</span>`;
    qOptions?.append(lbl);
  });
}

async function submitQuizAnswer(e) {
  e.preventDefault();
  if (state.quizLocked) return;
  
  const sel = document.querySelector('input[name="quiz-option"]:checked');
  if (!sel) return;
  
  state.quizLocked = true;
  const btnSubmit = document.querySelector('#submit-answer');
  const btnNext = document.querySelector('#next-question');
  const qFeedback = document.querySelector('#quiz-feedback');
  const fieldset = document.querySelector('#quiz-fieldset');
  
  if (btnSubmit) btnSubmit.disabled = true;
  const q = state.bundle.questions[state.quizIndex];
  const optId = Number(sel.value);
  
  let val;
  if (state.apiAvailable) {
    try {
      val = await fetchJson('/api/index.php?action=answer', { method: 'POST', body: JSON.stringify({ questionId: q.id, optionId: optId }) });
    } catch (err) {
      val = fallbackAnswerCheck(q, optId);
    }
  } else {
    val = fallbackAnswerCheck(q, optId);
  }
  
  state.quizAnswers[q.id] = optId;
  if (val.correct) state.quizScore++;
  
  state.quizReview.push({
    code: q.code, prompt: q.prompt,
    selectedLabel: q.options.find(o => o.id === optId)?.label,
    correctLabel: q.options.find(o => o.id === val.correctOptionId)?.label,
    correct: val.correct, explanation: val.explanation
  });
  
  if (fieldset) fieldset.disabled = true;
  document.querySelectorAll('.quiz-option').forEach(l => {
    const input = l.querySelector('input');
    if (Number(input.value) === val.correctOptionId) l.classList.add('is-correct');
    if (input.checked && !val.correct) l.classList.add('is-wrong');
  });
  
  if (qFeedback) {
    qFeedback.hidden = false;
    qFeedback.className = `quiz-feedback ${val.correct ? 'is-correct' : 'is-wrong'}`;
    qFeedback.innerHTML = `<strong>${val.correct ? 'Correct' : 'Not quite'}.</strong> <span>${val.explanation}</span>`;
  }
  
  if (btnSubmit) btnSubmit.hidden = true;
  if (btnNext) {
    btnNext.hidden = false;
    btnNext.textContent = state.quizIndex === state.bundle.questions.length - 1 ? 'View results →' : 'Next question →';
  }
}

function fallbackAnswerCheck(q, optId) {
  const correctOpt = q.options.find(o => o.is_correct || o.id === (q.correctOptionId || q.options[0].id));
  return {
    correct: optId === (correctOpt?.id || q.options[0].id),
    correctOptionId: correctOpt?.id || q.options[0].id,
    explanation: q.explanation || 'Review the training material for details.'
  };
}

function nextQuizQuestion() {
  if (state.quizIndex < state.bundle.questions.length - 1) {
    state.quizIndex++;
    renderQuestion();
  } else {
    completeAttempt();
  }
}

// ── Completion & Results ────────────────────────────────────────────────────

async function submitInteractiveResult(interactiveResult) {
  state.elapsedSeconds = interactiveResult.elapsedSeconds || 0;
  state.foundCodes = new Set();
  state.wrongClicks = interactiveResult.wrongClicks || 0;
  state.quizScore = interactiveResult.quizScore || 0;
  state.interactiveReview = Array.isArray(interactiveResult.reviewItems) ? interactiveResult.reviewItems : [];
  
  const payload = {
    moduleSlug: state.activeModule ? state.activeModule.id : 'five-whys',
    hazardCodes: [],
    wrongClicks: state.wrongClicks,
    elapsedSeconds: state.elapsedSeconds,
    quizAnswers: {},
    interactiveEvidence: interactiveResult.interactiveEvidence,
    localOverallPercent: interactiveResult.overallPercent,
    ...(state.challengeCode ? { challengeCode: state.challengeCode } : {}),
  };
  await finishAndRender(payload);
}

async function completeAttempt() {
  const payload = {
    moduleSlug: state.activeModule ? state.activeModule.id : 'warehouse-hazard-hunt',
    hazardCodes: [...state.foundCodes],
    wrongClicks: state.wrongClicks,
    elapsedSeconds: state.elapsedSeconds,
    quizAnswers: state.quizAnswers,
    ...(state.challengeCode ? { challengeCode: state.challengeCode } : {}),
  };
  await finishAndRender(payload);
}

async function finishAndRender(payload) {
  transitionTo('results');
  const summaryEl = document.querySelector('#results-summary');
  if (summaryEl) summaryEl.textContent = 'Calculating score...';
  
  let result;
  if (state.apiAvailable && state.user && state.user.id !== 0) {
    try {
      result = await fetchJson('/api/index.php?action=complete', { method: 'POST', body: JSON.stringify(payload) });
    } catch(err) {
      if (summaryEl) summaryEl.textContent = `Your result could not be securely saved: ${err.message}`;
      setLive('The training result could not be saved. Please retry the module.');
      return;
    }
  } else {
    result = fallbackCalculation(payload);
  }
  
  renderResults(result);
  if (result.challenge) {
    const challenge = result.challenge;
    const summary = challenge.status === 'completed'
      ? `1v1 complete: ${challenge.challengerScore}% vs ${challenge.opponentScore}%.`
      : 'Your 1v1 score is locked. Waiting for your opponent.';
    gamification.showToast({ emoji: '⚔️', title: '1v1 score submitted', desc: summary, duration: 6000 });
  }
  state.challengeCode = null;
  
  // Gamification Engine
  const moduleSlug = state.activeModule ? state.activeModule.id : 'warehouse-hazard-hunt';
  const { totalXp, didLevelUp, newLevel, newBadges } = gamification.processAttempt(result, moduleSlug);
  gamification.updateHeaderXp();
  
  if (didLevelUp) gamification.showLevelUp(newLevel);
  if (newBadges.length > 0) gamification.showBadgeToasts(newBadges, result.xpEarned);
  if (result.rating === 'Gold') gamification.fireConfetti();
}

function fallbackCalculation(payload) {
  const foundCount = payload.hazardCodes.length;
  const max = state.bundle?.scenario?.maxHazards || 8;
  const qTotal = state.bundle?.questions?.length || 5;
  const pct = payload.localOverallPercent ?? Math.round(70 * (foundCount/max) + 30 * (state.quizScore/qTotal));
  return {
    foundCount, wrongClicks: payload.wrongClicks,
    quizScore: state.quizScore, quizTotal: qTotal,
    elapsedSeconds: payload.elapsedSeconds,
    overallPercent: pct,
    rating: pct >= 80 ? 'Gold' : pct >= 60 ? 'Silver' : 'Bronze',
    missedCodes: [], challengeScore: 0, xpEarned: pct * 10
  };
}

function renderResults(result) {
  const rBadge = document.querySelector('#rating-badge');
  const rVal = document.querySelector('#rating-value');
  const oPct = document.querySelector('#overall-percent');
  const rHazards = document.querySelector('#result-hazards');
  const rMissed = document.querySelector('#result-missed');
  const rChallenge = document.querySelector('#result-challenge');
  const rQuiz = document.querySelector('#result-quiz');
  const rTime = document.querySelector('#result-time');
  const rSummary = document.querySelector('#results-summary');
  const rBest = document.querySelector('#result-best');
  const persistenceNote = document.querySelector('#persistence-note');

  if (rBadge) rBadge.dataset.rating = result.rating.toLowerCase();
  if (rVal) rVal.textContent = result.rating;
  if (oPct) oPct.textContent = `${result.overallPercent}%`;
  
  const isInteractive = state.activeModule && state.activeModule.type !== MODULE_TYPES.PANORAMA;
  if (rHazards && rHazards.parentElement) rHazards.parentElement.hidden = isInteractive;
  if (rMissed && rMissed.parentElement) rMissed.parentElement.hidden = isInteractive;
  if (rChallenge && rChallenge.parentElement) rChallenge.parentElement.hidden = isInteractive;
  
  if (!isInteractive && rHazards && rMissed) {
    rHazards.textContent = `${result.foundCount}/${state.bundle?.scenario?.maxHazards || 8}`;
    rMissed.textContent = `${result.missedCodes?.length || 0} missed`;
  }
  
  if (rChallenge) rChallenge.textContent = result.challengeScore || '-';
  if (rQuiz) rQuiz.textContent = `${result.quizScore}/${result.quizTotal}`;
  if (rTime) rTime.textContent = formatTime(result.elapsedSeconds);
  if (rSummary) rSummary.textContent = `Great job! You earned +${result.xpEarned} XP.`;
  if (rBest) rBest.textContent = `${result.overallPercent}%`;
  if (persistenceNote) {
    const storageText = state.user?.id
      ? 'This verified attempt is saved to your training account.'
      : 'Guest results are temporary and are not saved.';
    persistenceNote.textContent = `${storageText} Results indicate training performance only and are not formal safety certification.`;
  }
}

function openReviewScreen() {
  const hazardList = document.querySelector('#hazard-review-list');
  const quizList = document.querySelector('#quiz-review-list');
  const reviewTitle = document.querySelector('#review-title');
  const reviewIntro = document.querySelector('.review-heading > p:last-child');
  const hazardHeading = hazardList?.previousElementSibling;
  const quizColumn = quizList?.parentElement;
  const isInteractive = state.activeModule && state.activeModule.type !== MODULE_TYPES.PANORAMA;

  if (reviewTitle) reviewTitle.textContent = isInteractive ? `${state.activeModule.title}: learning review` : 'Every hazard, explained in text.';
  if (reviewIntro) reviewIntro.textContent = isInteractive
    ? 'Review the key learning from each activity before retrying or choosing another module.'
    : 'Use this list to revisit missed items or access the essential learning without relying on the spatial 360-degree view.';
  if (hazardHeading) hazardHeading.textContent = isInteractive ? 'Activity review' : 'Warehouse hazards';
  if (quizColumn) quizColumn.hidden = isInteractive;
  
  if (isInteractive && hazardList) {
    hazardList.innerHTML = state.interactiveReview.map(item => `
      <li class="was-found">
        <span class="review-status">${escapeHtml(item.status)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.text)}</p>
      </li>
    `).join('');
  } else if (hazardList && state.bundle?.hazards) {
    hazardList.innerHTML = state.bundle.hazards.map(h => {
      const found = state.foundCodes.has(h.code);
      return `
        <li class="${found ? 'was-found' : 'was-missed'}">
          <span class="review-status">${found ? 'Found' : 'Missed'}</span>
          <h3>${h.code} — ${h.title}</h3>
          <span class="review-topic">${h.topic}</span>
          <p>${h.reviewText}</p>
        </li>
      `;
    }).join('');
  }

  if (quizList) {
    quizList.innerHTML = state.quizReview.map(r => `
      <article class="quiz-review ${r.correct ? 'was-correct' : 'was-wrong'}">
        <span class="review-status">${r.correct ? 'Correct' : 'Review'}</span>
        <h3>${r.code} — ${r.prompt}</h3>
        <p>Your answer: ${r.selectedLabel}</p>
        <p>Correct answer: ${r.correctLabel}</p>
        <p class="review-explanation">${r.explanation}</p>
      </article>
    `).join('');
  }

  transitionTo('review');
}

function clearBestPerformance() {
  try {
    localStorage.removeItem('ss360_xp');
    localStorage.removeItem('ss360_badges');
    localStorage.removeItem('ss360_prev_scores');
    gamification.updateHeaderXp();
    const rBest = document.querySelector('#result-best');
    if (rBest) rBest.textContent = '—';
    setLive('Performance cleared.');
  } catch (err) {}
}

async function loadLeaderboard(period) {
  const lbList = document.querySelector('#leaderboard-list');
  if (!lbList) return;
  
  lbList.innerHTML = '<div style="padding:32px; text-align:center; color:var(--ink-muted);">Loading leaderboard...</div>';
  
  if (!state.apiAvailable) {
    lbList.innerHTML = `
      <div style="padding:32px; text-align:center; color:var(--ink-soft);">
        <p style="font-size: 1.1rem; font-weight:700; margin-bottom:8px;">Guest / Local Mode Active</p>
        <p>Connect a MySQL database to enable real-time multi-user global leaderboards.</p>
      </div>
    `;
    return;
  }
  
  try {
    const data = await fetchJson(`/api/index.php?action=leaderboard&period=${period}`);
    if (!data || data.length === 0) {
      lbList.innerHTML = '<div style="padding:32px; text-align:center; color:var(--ink-muted);">No rankings recorded yet. Be the first!</div>';
      return;
    }
    lbList.innerHTML = `
      <table class="attempts-table" style="width:100%;">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Trainee</th>
            <th>Best Score</th>
            <th>XP</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((row, i) => `
            <tr class="${row.id == state.user?.id ? 'is-me' : ''}">
              <td><strong>#${i + 1}</strong></td>
              <td>${escapeHtml(row.display_name)}</td>
              <td>${escapeHtml(row.best_score)}%</td>
              <td><strong style="color:var(--orange);">${escapeHtml(row.total_xp)} XP</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    lbList.innerHTML = '<div style="padding:32px; text-align:center; color:var(--ink-muted);">Unable to load leaderboard.</div>';
  }
}

async function openArena() {
  if (!state.apiAvailable || !state.user || state.user.id === 0) {
    gamification.showToast({ emoji: '🔐', title: 'Account required', desc: 'Sign in with a registered account to use 1v1 challenges.' });
    return;
  }
  transitionTo('arena');
  await loadChallenges();
}

function setArenaMessage(message, isError = false) {
  const el = document.querySelector('#arena-message');
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('is-error', isError);
}

async function createChallenge() {
  const button = document.querySelector('#arena-create-btn');
  const moduleSlug = document.querySelector('#arena-module-select')?.value;
  if (!moduleSlug) return;
  if (button) button.disabled = true;
  try {
    const data = await fetchJson('/api/index.php?action=create-challenge', {
      method: 'POST', body: JSON.stringify({ moduleSlug })
    });
    const code = document.querySelector('#arena-created-code');
    const box = document.querySelector('#arena-code-result');
    if (code) code.textContent = data.challengeCode;
    if (box) box.hidden = false;
    await loadChallenges();
  } catch (error) {
    setArenaMessage(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function joinChallenge() {
  const input = document.querySelector('#arena-join-code');
  const code = input?.value.trim().toUpperCase();
  if (!code || code.length !== 8) return setArenaMessage('Enter the complete 8-character code.', true);
  try {
    await fetchJson('/api/index.php?action=join-challenge', {
      method: 'POST', body: JSON.stringify({ challengeCode: code })
    });
    if (input) input.value = '';
    setArenaMessage('Challenge joined. You can play it below.');
    await loadChallenges();
  } catch (error) {
    setArenaMessage(error.message, true);
  }
}

async function copyChallengeCode() {
  const code = document.querySelector('#arena-created-code')?.textContent;
  if (!code || code === '—') return;
  try { await navigator.clipboard.writeText(code); setArenaMessage('Challenge code copied.'); }
  catch { setArenaMessage(`Challenge code: ${code}`); }
}

async function loadChallenges() {
  const list = document.querySelector('#arena-list');
  if (!list) return;
  list.innerHTML = '<p class="arena-empty">Loading challenges…</p>';
  try {
    const rows = await fetchJson('/api/index.php?action=challenges');
    if (!rows.length) {
      list.innerHTML = '<p class="arena-empty">No challenges yet. Create one and share its code with another trainee.</p>';
      return;
    }
    list.innerHTML = rows.map(challenge => {
      const mine = challenge.role === 'challenger' ? challenge.challengerScore : challenge.opponentScore;
      const theirs = challenge.role === 'challenger' ? challenge.opponentScore : challenge.challengerScore;
      const opponent = challenge.role === 'challenger' ? (challenge.opponentName || 'Waiting for opponent') : challenge.challengerName;
      const canPlay = !challenge.myCompleted && (challenge.status === 'accepted' || challenge.role === 'challenger');
      return `<article class="arena-match-card">
        <div class="arena-match-main"><span class="arena-status status-${escapeHtml(challenge.status)}">${escapeHtml(challenge.status)}</span><h3>${escapeHtml(challenge.moduleTitle)}</h3><p>vs ${escapeHtml(opponent)} · Code <strong>${escapeHtml(challenge.code)}</strong></p></div>
        <div class="arena-score"><span>You</span><strong>${escapeHtml(mine ?? '—')}${mine !== null ? '%' : ''}</strong></div>
        <div class="arena-score"><span>Opponent</span><strong>${escapeHtml(theirs ?? '—')}${theirs !== null ? '%' : ''}</strong></div>
        ${canPlay ? `<button class="button button-primary button-sm arena-play-btn" data-code="${escapeHtml(challenge.code)}" data-module="${escapeHtml(challenge.moduleSlug)}" type="button">Play now →</button>` : '<span class="arena-waiting">' + (challenge.status === 'completed' ? 'Completed' : 'Waiting') + '</span>'}
      </article>`;
    }).join('');
    list.querySelectorAll('.arena-play-btn').forEach(button => button.addEventListener('click', () => {
      const module = getModule(button.dataset.module);
      if (!module) return;
      startModuleFlow(module, button.dataset.code);
    }));
  } catch (error) {
    list.innerHTML = `<p class="arena-empty is-error">${escapeHtml(error.message)}</p>`;
  }
}

// Boot
init();
