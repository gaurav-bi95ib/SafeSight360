import { calculateResults, clamp, formatTime } from './scoring.js';
import { renderModulesGrid, renderModuleProgressGrid, getModule, MODULE_TYPES } from './modules.js';
import { VRAdapter } from './vr-adapter.js';
import { initFiveWhys } from './five-whys-engine.js';
import { initCyber } from './cyber-engine.js';
import * as gamification from './gamification.js';
import { escapeHtml } from './sanitize.js';

const appBaseUrl = (document.querySelector('meta[name="app-base-url"]')?.content || '').replace(/\/+$/, '');

function appUrl(path) {
  const value = String(path || '');
  if (/^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  return `${appBaseUrl}/${value.replace(/^\/+/, '')}`;
}

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
  adminLearners: [],
  adminAllLearners: [],
  adminModules: [],
  adminAccessRequests: [],
  adminContent: null,
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
    button.setAttribute('aria-pressed', String(isDark));
    button.dataset.activeTheme = next;
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
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(appUrl(url), {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
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
  const isAdmin = user.role === 'admin';
  
  // Header updates
  const headerUserSection = document.querySelector('#header-user-section');
  const headerUserName = document.querySelector('#header-user-name');
  const userAvatar = document.querySelector('#user-avatar');
  const headerUserLevel = document.querySelector('#header-user-level');
  
  if (headerUserSection) headerUserSection.hidden = false;
  if (headerUserName) headerUserName.textContent = user.displayName;
  if (userAvatar) userAvatar.textContent = (user.displayName || 'U').charAt(0).toUpperCase();
  
  const levelInfo = gamification.getLevel();
  if (headerUserLevel) headerUserLevel.textContent = isAdmin ? '🛡 Administrator' : `${levelInfo.emoji} ${levelInfo.name}`;

  const adminButton = document.querySelector('#nav-admin-btn');
  if (adminButton) adminButton.hidden = !isAdmin;
  ['nav-home-btn', 'nav-training-btn', 'nav-arena-btn', 'nav-leaderboard-btn', 'nav-dashboard-btn'].forEach(id => {
    const learnerNavigation = document.querySelector(`#${id}`);
    if (learnerNavigation) learnerNavigation.hidden = isAdmin;
  });
  document.querySelector('.header-xp-bar')?.toggleAttribute('hidden', isAdmin);
  document.body.classList.toggle('is-admin', isAdmin);
  
  document.body.classList.add('is-authenticated');
  
  if (isAdmin) {
    loadAdminWorkspace();
    transitionTo('admin');
  } else {
    refreshDashboard();
    transitionTo('hub');
  }
  setLive(`Welcome, ${user.displayName}`);
}

function setupEventListeners() {
  updateDailyResetTimer();
  window.setInterval(updateDailyResetTimer, 1000);

  document.querySelector('#theme-toggle')?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    setLive(`${document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light'} theme enabled.`);
  });

  document.querySelector('.brand')?.addEventListener('click', (event) => {
    if (!state.user) return;
    event.preventDefault();
    if (state.user.role === 'admin') {
      loadAdminWorkspace();
      transitionTo('admin');
      return;
    }
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
    const notice = document.querySelector('#login-notice');

    if (submitBtn) submitBtn.disabled = true;
    if (errorBox) errorBox.hidden = true;
    if (notice) notice.hidden = true;

    try {
      if (!state.apiAvailable) {
        throw new Error('The secure training service is offline. Contact an administrator.');
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
        throw new Error('The secure training service is offline. Contact an administrator.');
      }
      const res = await fetchJson('/api/index.php?action=request-access', {
        method: 'POST',
        body: JSON.stringify({ displayName, email, password })
      });
      signupForm.reset();
      tabLogin?.click();
      const notice = document.querySelector('#login-notice');
      if (notice) {
        notice.textContent = res.message || 'Your request is awaiting administrator approval.';
        notice.hidden = false;
      }
    } catch (err) {
      if (errorBox && errorMsg) {
        errorMsg.textContent = err.message || 'Access request failed. Please check your details.';
        errorBox.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
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
  document.querySelector('#nav-admin-btn')?.addEventListener('click', () => {
    if (state.user?.role !== 'admin') return;
    loadAdminWorkspace();
    transitionTo('admin');
  });

  document.querySelector('#nav-logout-btn')?.addEventListener('click', async (event) => {
    const logoutButton = event.currentTarget;
    if (logoutButton) logoutButton.disabled = true;

    try {
      if (state.apiAvailable && state.user?.id !== 0) {
        await fetchJson('/api/index.php?action=logout', {
          method: 'POST',
          body: JSON.stringify({}),
        });
      }
      window.location.assign(appUrl('/'));
    } catch (err) {
      if (logoutButton) logoutButton.disabled = false;
      gamification.showToast({
        emoji: '⚠️',
        title: 'Sign out failed',
        desc: err.message || 'Refresh the page and try again.',
      });
    }
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

  document.querySelector('#admin-refresh-btn')?.addEventListener('click', loadAdminWorkspace);
  document.querySelector('#admin-add-learner-btn')?.addEventListener('click', () => openLearnerDialog());
  document.querySelector('#admin-dialog-cancel')?.addEventListener('click', () => document.querySelector('#admin-learner-dialog')?.close());
  document.querySelector('#admin-learner-form')?.addEventListener('submit', saveLearner);
  document.querySelector('#admin-assignment-form')?.addEventListener('submit', assignTraining);
  document.querySelector('#admin-report-filter')?.addEventListener('change', loadAdminReports);
  document.querySelector('#admin-content-module')?.addEventListener('change', loadAdminModuleContent);
  document.querySelector('#admin-content-form')?.addEventListener('submit', saveAdminModuleContent);
  document.querySelector('#admin-add-hotspot')?.addEventListener('click', () => addAdminHotspot());
  document.querySelector('#admin-add-question')?.addEventListener('click', () => addAdminQuestion());
  document.querySelector('#admin-upload-panorama')?.addEventListener('click', uploadAdminPanorama);
  let learnerSearchTimer = null;
  document.querySelector('#admin-learner-search')?.addEventListener('input', () => {
    window.clearTimeout(learnerSearchTimer);
    learnerSearchTimer = window.setTimeout(loadAdminLearners, 250);
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
  
  const assignedOnly = Boolean(state.apiAvailable && state.user?.id && state.user.role === 'learner');
  renderModulesGrid('modules-grid', progress, startModuleFlow, assignedOnly);
  renderModuleProgressGrid('dashboard-module-progress', progress, startModuleFlow, assignedOnly);
}

async function loadAdminWorkspace() {
  if (state.user?.role !== 'admin' || !state.apiAvailable) return;
  try {
    const [summary, modules, accessRequests] = await Promise.all([
      fetchJson('/api/index.php?action=admin-dashboard'),
      fetchJson('/api/index.php?action=admin-modules'),
      fetchJson('/api/index.php?action=admin-access-requests'),
    ]);
    state.adminModules = modules;
    state.adminAccessRequests = accessRequests;
    renderAdminSummary(summary);
    renderAdminModuleOptions();
    renderAdminAccessRequests();
    renderAdminContentModuleSelect();
    await Promise.all([loadAdminLearners(), loadAdminReports()]);
  } catch (error) {
    gamification.showToast({ emoji: '⚠️', title: 'Admin data unavailable', desc: error.message });
  }
}

function renderAdminSummary(summary) {
  const values = {
    '#admin-active-learners': summary.learnersActive,
    '#admin-pending-requests': summary.pendingRequests,
    '#admin-total-assignments': summary.assignmentsTotal,
    '#admin-in-progress': summary.inProgress,
    '#admin-completion-rate': `${summary.completionRate}%`,
  };
  Object.entries(values).forEach(([selector, value]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value ?? 0;
  });

  const moduleSummary = document.querySelector('#admin-module-summary');
  if (!moduleSummary) return;
  if (!summary.modules?.length) {
    moduleSummary.innerHTML = '<p class="admin-empty">No active modules are available.</p>';
    return;
  }
  moduleSummary.innerHTML = summary.modules.map(module => {
    const rate = module.assignedCount > 0
      ? Math.round(100 * module.completedCount / module.assignedCount)
      : 0;
    return `<article class="admin-module-stat">
      <strong>${escapeHtml(module.title)}</strong>
      <p>Assigned <span>${module.assignedCount}</span></p>
      <p>Completed <span>${module.completedCount} · ${rate}%</span></p>
      <p>Average score <span>${module.averageScore}%</span></p>
    </article>`;
  }).join('');
}

function renderAdminAccessRequests() {
  const table = document.querySelector('#admin-requests-table');
  if (!table) return;
  if (!state.adminAccessRequests.length) {
    table.innerHTML = '<tr><td colspan="5" class="admin-empty">No access requests have been submitted.</td></tr>';
    return;
  }
  table.innerHTML = state.adminAccessRequests.map(request => `
    <tr>
      <td><div class="admin-learner-cell"><strong>${escapeHtml(request.displayName)}</strong><span>${escapeHtml(request.email)}</span></div></td>
      <td>${escapeHtml(formatAdminDate(request.createdAt))}</td>
      <td><span class="admin-status ${escapeHtml(request.status)}">${escapeHtml(request.status)}</span></td>
      <td>${escapeHtml(request.reviewerName || '—')}</td>
      <td><div class="admin-row-actions">
        ${request.status === 'pending' ? `
          <button class="button button-primary admin-row-action admin-approve-request" data-request-id="${request.id}" type="button">Approve</button>
          <button class="button button-ghost admin-row-action admin-reject-request" data-request-id="${request.id}" type="button">Reject</button>
        ` : '<span class="admin-panel-hint">Review complete</span>'}
      </div></td>
    </tr>`).join('');
  table.querySelectorAll('.admin-approve-request').forEach(button => button.addEventListener('click', () => {
    reviewAccessRequest(Number(button.dataset.requestId), 'approve');
  }));
  table.querySelectorAll('.admin-reject-request').forEach(button => button.addEventListener('click', () => {
    reviewAccessRequest(Number(button.dataset.requestId), 'reject');
  }));
}

async function reviewAccessRequest(requestId, decision) {
  const request = state.adminAccessRequests.find(item => item.id === requestId);
  if (!request) return;
  const message = decision === 'approve'
    ? `Approve ${request.displayName}? Their learner account will become active.`
    : `Reject the access request from ${request.displayName}?`;
  if (!window.confirm(message)) return;
  try {
    await fetchJson('/api/index.php?action=admin-review-access', {
      method: 'POST',
      body: JSON.stringify({ requestId, decision, note: '' }),
    });
    gamification.showToast({
      emoji: decision === 'approve' ? '✅' : '🛑',
      title: decision === 'approve' ? 'Access approved' : 'Request rejected',
      desc: decision === 'approve' ? 'The learner can now sign in with their requested password.' : 'No learner account was created.',
    });
    await loadAdminWorkspace();
  } catch (error) {
    gamification.showToast({ emoji: '⚠️', title: 'Review failed', desc: error.message });
  }
}

async function loadAdminLearners() {
  if (state.user?.role !== 'admin') return;
  const table = document.querySelector('#admin-learners-table');
  const search = document.querySelector('#admin-learner-search')?.value.trim() || '';
  if (table) table.innerHTML = '<tr><td colspan="6" class="admin-empty">Loading learners…</td></tr>';
  try {
    state.adminLearners = await fetchJson(`/api/index.php?action=admin-learners&search=${encodeURIComponent(search)}`);
    state.adminAllLearners = search
      ? await fetchJson('/api/index.php?action=admin-learners')
      : state.adminLearners;
    renderAdminLearners();
    refreshAdminLearnerSelects();
  } catch (error) {
    if (table) table.innerHTML = `<tr><td colspan="6" class="admin-empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderAdminLearners() {
  const table = document.querySelector('#admin-learners-table');
  if (!table) return;
  if (!state.adminLearners.length) {
    table.innerHTML = '<tr><td colspan="6" class="admin-empty">No learners match this search.</td></tr>';
    return;
  }
  table.innerHTML = state.adminLearners.map(learner => `
    <tr>
      <td><div class="admin-learner-cell"><strong>${escapeHtml(learner.displayName)}</strong><span>${escapeHtml(learner.email)}</span></div></td>
      <td><span class="admin-status ${learner.status === 'inactive' ? 'inactive' : ''}">${escapeHtml(learner.status)}</span></td>
      <td><span class="admin-progress-copy">${learner.completedCount}/${learner.assignedCount} complete · ${learner.inProgressCount} active</span></td>
      <td><strong>${learner.bestScore}%</strong></td>
      <td>${escapeHtml(formatAdminDate(learner.lastLoginAt))}</td>
      <td><div class="admin-row-actions">
        <button class="button button-ghost admin-row-action admin-view-results" data-learner-id="${learner.id}" type="button">Results</button>
        <button class="button button-secondary admin-row-action admin-edit-learner" data-learner-id="${learner.id}" type="button">Edit</button>
        ${learner.status === 'active' ? `<button class="button button-ghost admin-row-action admin-deactivate-learner" data-learner-id="${learner.id}" type="button">Deactivate</button>` : ''}
      </div></td>
    </tr>`).join('');

  table.querySelectorAll('.admin-edit-learner').forEach(button => button.addEventListener('click', () => {
    const learner = state.adminLearners.find(item => item.id === Number(button.dataset.learnerId));
    if (learner) openLearnerDialog(learner);
  }));
  table.querySelectorAll('.admin-deactivate-learner').forEach(button => button.addEventListener('click', () => {
    deactivateLearner(Number(button.dataset.learnerId));
  }));
  table.querySelectorAll('.admin-view-results').forEach(button => button.addEventListener('click', () => {
    const filter = document.querySelector('#admin-report-filter');
    if (filter) filter.value = button.dataset.learnerId;
    loadAdminReports();
    document.querySelector('.admin-report-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function refreshAdminLearnerSelects() {
  const selects = [
    { element: document.querySelector('#admin-assignment-learner'), first: 'Select learner', activeOnly: true },
    { element: document.querySelector('#admin-report-filter'), first: 'All learners', activeOnly: false },
  ];
  selects.forEach(({ element, first, activeOnly }) => {
    if (!element) return;
    const previous = element.value;
    const learners = activeOnly
      ? state.adminAllLearners.filter(learner => learner.status === 'active')
      : state.adminAllLearners;
    element.innerHTML = `<option value="">${first}</option>${learners.map(learner =>
      `<option value="${learner.id}">${escapeHtml(learner.displayName)} · ${escapeHtml(learner.email)}</option>`
    ).join('')}`;
    if ([...element.options].some(option => option.value === previous)) element.value = previous;
  });
}

function renderAdminModuleOptions() {
  const container = document.querySelector('#admin-module-options');
  if (!container) return;
  container.innerHTML = state.adminModules.map(module => `
    <label class="admin-module-option">
      <input type="checkbox" name="moduleSlug" value="${escapeHtml(module.slug)}">
      <span>${escapeHtml(module.title)}</span>
    </label>`).join('');
}

function renderAdminContentModuleSelect() {
  const select = document.querySelector('#admin-content-module');
  if (!select) return;
  const previous = select.value;
  select.innerHTML = `<option value="">Select a module</option>${state.adminModules.map(module =>
    `<option value="${escapeHtml(module.slug)}">${escapeHtml(module.title)} · ${escapeHtml(module.type)}</option>`
  ).join('')}`;
  if (state.adminModules.some(module => module.slug === previous)) select.value = previous;
}

async function loadAdminModuleContent() {
  const slug = document.querySelector('#admin-content-module')?.value || '';
  const form = document.querySelector('#admin-content-form');
  if (!slug) {
    state.adminContent = null;
    if (form) form.hidden = true;
    return;
  }
  setAdminFormMessage('#admin-content-message', 'Loading module content…', false);
  try {
    const content = await fetchJson(`/api/index.php?action=admin-module-content&slug=${encodeURIComponent(slug)}`);
    state.adminContent = content;
    const scenario = content.scenario || {};
    document.querySelector('#admin-content-title-input').value = scenario.title || '';
    document.querySelector('#admin-content-duration').value = scenario.durationSeconds || 120;
    document.querySelector('#admin-content-summary').value = scenario.summary || '';
    document.querySelector('#admin-content-mission').value = scenario.mission || '';
    document.querySelector('#admin-content-panorama').value = scenario.panoramaUrl || '';
    document.querySelector('#admin-content-width').value = scenario.panoramaWidth || 2048;
    document.querySelector('#admin-content-yaw').value = scenario.initialView?.yaw ?? 0;
    document.querySelector('#admin-content-pitch').value = scenario.initialView?.pitch ?? 0;
    document.querySelector('#admin-content-fov').value = scenario.initialView?.fov ?? 1.57;
    const isPanorama = scenario.moduleType === 'panorama';
    document.querySelector('#admin-panorama-settings')?.toggleAttribute('hidden', !isPanorama);
    document.querySelector('#admin-hotspot-section')?.toggleAttribute('hidden', !isPanorama);
    document.querySelector('#admin-question-section')?.toggleAttribute('hidden', !isPanorama);
    renderAdminHotspots(content.hazards || []);
    renderAdminQuestions((content.questions || []).map(question => ({
      ...question,
      correctIndex: Math.max(0, (question.options || []).findIndex(option => Number(option.id) === Number(question.correctOptionId))),
    })));
    if (form) form.hidden = false;
    setAdminFormMessage('#admin-content-message', '', false, true);
  } catch (error) {
    if (form) form.hidden = true;
    gamification.showToast({ emoji: '⚠️', title: 'Content unavailable', desc: error.message });
  }
}

function renderAdminHotspots(hazards) {
  const container = document.querySelector('#admin-hotspot-list');
  if (!container) return;
  container.innerHTML = hazards.length ? hazards.map((hazard, index) => `
    <article class="admin-editor-card admin-hotspot-card" data-index="${index}">
      <div class="admin-editor-card-heading"><strong>Hotspot ${index + 1}</strong><button class="button button-ghost button-sm admin-remove-hotspot" type="button">Remove</button></div>
      <div class="admin-editor-grid">
        <label><span class="form-label">Code</span><input class="form-input" data-field="code" maxlength="8" value="${escapeHtml(hazard.code || '')}" required></label>
        <label class="span-2"><span class="form-label">Title</span><input class="form-input" data-field="title" maxlength="160" value="${escapeHtml(hazard.title || '')}" required></label>
        <label><span class="form-label">Topic</span><input class="form-input" data-field="topic" maxlength="120" value="${escapeHtml(hazard.topic || '')}" required></label>
        <label><span class="form-label">Yaw</span><input class="form-input" data-field="yaw" type="number" min="-3.142" max="3.142" step="0.001" value="${Number(hazard.yaw || 0)}" required></label>
        <label><span class="form-label">Pitch</span><input class="form-input" data-field="pitch" type="number" min="-1.571" max="1.571" step="0.001" value="${Number(hazard.pitch || 0)}" required></label>
        <label><span class="form-label">Marker size</span><input class="form-input" data-field="hotspotSize" type="number" min="28" max="100" value="${Number(hazard.hotspotSize || 52)}" required></label>
        <label class="span-all"><span class="form-label">Correct-selection feedback</span><textarea class="form-input admin-textarea" data-field="feedback" maxlength="3000" required>${escapeHtml(hazard.feedback || '')}</textarea></label>
        <label class="span-all"><span class="form-label">Review guidance</span><textarea class="form-input admin-textarea" data-field="reviewText" maxlength="3000" required>${escapeHtml(hazard.reviewText || '')}</textarea></label>
      </div>
    </article>`).join('') : '<p class="admin-empty">No hotspots configured.</p>';
  container.querySelectorAll('.admin-remove-hotspot').forEach((button, index) => button.addEventListener('click', () => {
    const current = readAdminHotspots();
    current.splice(index, 1);
    renderAdminHotspots(current);
  }));
}

function readAdminHotspots() {
  return [...document.querySelectorAll('.admin-hotspot-card')].map(card => ({
    code: card.querySelector('[data-field="code"]')?.value.trim() || '',
    title: card.querySelector('[data-field="title"]')?.value.trim() || '',
    topic: card.querySelector('[data-field="topic"]')?.value.trim() || '',
    yaw: Number(card.querySelector('[data-field="yaw"]')?.value || 0),
    pitch: Number(card.querySelector('[data-field="pitch"]')?.value || 0),
    hotspotSize: Number(card.querySelector('[data-field="hotspotSize"]')?.value || 52),
    feedback: card.querySelector('[data-field="feedback"]')?.value.trim() || '',
    reviewText: card.querySelector('[data-field="reviewText"]')?.value.trim() || '',
  }));
}

function addAdminHotspot() {
  const hazards = readAdminHotspots();
  hazards.push({ code: `H${hazards.length + 1}`, title: '', topic: 'Safety', yaw: 0, pitch: 0, hotspotSize: 52, feedback: '', reviewText: '' });
  renderAdminHotspots(hazards);
}

function renderAdminQuestions(questions) {
  const container = document.querySelector('#admin-question-list');
  if (!container) return;
  container.innerHTML = questions.length ? questions.map((question, questionIndex) => `
    <article class="admin-editor-card admin-question-card" data-index="${questionIndex}">
      <div class="admin-editor-card-heading"><strong>Question ${questionIndex + 1}</strong><button class="button button-ghost button-sm admin-remove-question" type="button">Remove</button></div>
      <div class="admin-editor-grid">
        <label class="span-all"><span class="form-label">Question</span><textarea class="form-input admin-textarea" data-field="prompt" maxlength="3000" required>${escapeHtml(question.prompt || '')}</textarea></label>
        <label class="span-all"><span class="form-label">Explanation shown after answering</span><textarea class="form-input admin-textarea" data-field="explanation" maxlength="3000" required>${escapeHtml(question.explanation || '')}</textarea></label>
      </div>
      <div class="admin-option-list">
        ${(question.options || []).map((option, optionIndex) => `
          <div class="admin-option-row">
            <input type="radio" name="admin-correct-${questionIndex}" value="${optionIndex}" aria-label="Mark option ${optionIndex + 1} correct" ${optionIndex === Number(question.correctIndex || 0) ? 'checked' : ''}>
            <input class="form-input" data-option-label maxlength="255" value="${escapeHtml(option.label || '')}" required aria-label="Option ${optionIndex + 1}">
            <button class="button button-ghost button-sm admin-remove-option" data-option-index="${optionIndex}" type="button" aria-label="Remove option ${optionIndex + 1}">×</button>
          </div>`).join('')}
      </div>
      <button class="button button-ghost button-sm admin-add-option" type="button">Add answer option</button>
    </article>`).join('') : '<p class="admin-empty">No questions configured.</p>';

  container.querySelectorAll('.admin-remove-question').forEach((button, index) => button.addEventListener('click', () => {
    const current = readAdminQuestions();
    current.splice(index, 1);
    renderAdminQuestions(current);
  }));
  container.querySelectorAll('.admin-add-option').forEach((button, questionIndex) => button.addEventListener('click', () => {
    const current = readAdminQuestions();
    if (current[questionIndex].options.length >= 6) return;
    current[questionIndex].options.push({ label: '' });
    renderAdminQuestions(current);
  }));
  container.querySelectorAll('.admin-remove-option').forEach(button => button.addEventListener('click', () => {
    const card = button.closest('.admin-question-card');
    const questionIndex = Number(card?.dataset.index || 0);
    const optionIndex = Number(button.dataset.optionIndex || 0);
    const current = readAdminQuestions();
    if (current[questionIndex].options.length <= 2) return;
    current[questionIndex].options.splice(optionIndex, 1);
    current[questionIndex].correctIndex = Math.min(current[questionIndex].correctIndex, current[questionIndex].options.length - 1);
    renderAdminQuestions(current);
  }));
}

function readAdminQuestions() {
  return [...document.querySelectorAll('.admin-question-card')].map(card => {
    const checked = card.querySelector('input[type="radio"]:checked');
    return {
      prompt: card.querySelector('[data-field="prompt"]')?.value.trim() || '',
      explanation: card.querySelector('[data-field="explanation"]')?.value.trim() || '',
      correctIndex: Number(checked?.value || 0),
      options: [...card.querySelectorAll('[data-option-label]')].map(input => ({ label: input.value.trim() })),
    };
  });
}

function addAdminQuestion() {
  const questions = readAdminQuestions();
  questions.push({ prompt: '', explanation: '', correctIndex: 0, options: [{ label: '' }, { label: '' }, { label: '' }, { label: '' }] });
  renderAdminQuestions(questions);
}

async function uploadAdminPanorama() {
  const input = document.querySelector('#admin-panorama-file');
  const button = document.querySelector('#admin-upload-panorama');
  const message = document.querySelector('#admin-upload-message');
  const file = input?.files?.[0];
  if (!file) {
    if (message) message.textContent = 'Choose a panorama image first.';
    return;
  }
  const formData = new FormData();
  formData.append('panorama', file);
  if (button) button.disabled = true;
  if (message) message.textContent = 'Validating and uploading panorama…';
  try {
    const result = await fetchJson('/api/index.php?action=admin-upload-panorama', {
      method: 'POST',
      body: formData,
    });
    document.querySelector('#admin-content-panorama').value = result.url;
    document.querySelector('#admin-content-width').value = result.width;
    if (message) message.textContent = `Uploaded ${result.width}×${result.height}. Save module content to publish it.`;
    if (input) input.value = '';
  } catch (error) {
    if (message) message.textContent = error.message;
  } finally {
    if (button) button.disabled = false;
  }
}

async function saveAdminModuleContent(event) {
  event.preventDefault();
  const slug = document.querySelector('#admin-content-module')?.value || '';
  const module = state.adminModules.find(item => item.slug === slug);
  if (!slug || !module) return;
  const panorama = module.type === 'panorama';
  const payload = {
    slug,
    content: {
      scenario: {
        title: document.querySelector('#admin-content-title-input')?.value.trim(),
        summary: document.querySelector('#admin-content-summary')?.value.trim(),
        mission: document.querySelector('#admin-content-mission')?.value.trim(),
        durationSeconds: Number(document.querySelector('#admin-content-duration')?.value || 0),
        panoramaUrl: document.querySelector('#admin-content-panorama')?.value.trim() || '',
        panoramaWidth: Number(document.querySelector('#admin-content-width')?.value || 2048),
        initialView: {
          yaw: Number(document.querySelector('#admin-content-yaw')?.value || 0),
          pitch: Number(document.querySelector('#admin-content-pitch')?.value || 0),
          fov: Number(document.querySelector('#admin-content-fov')?.value || 1.57),
        },
      },
      hazards: panorama ? readAdminHotspots() : [],
      questions: panorama ? readAdminQuestions() : [],
    },
  };
  const button = document.querySelector('#admin-save-content');
  if (button) button.disabled = true;
  setAdminFormMessage('#admin-content-message', 'Validating and saving…');
  try {
    state.adminContent = await fetchJson('/api/index.php?action=admin-save-module-content', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAdminFormMessage('#admin-content-message', 'Module content saved successfully.');
    gamification.showToast({ emoji: '✅', title: 'Content published', desc: `${module.title} now uses the updated approved content.` });
    await loadAdminWorkspace();
  } catch (error) {
    setAdminFormMessage('#admin-content-message', error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

function openLearnerDialog(learner = null) {
  const dialog = document.querySelector('#admin-learner-dialog');
  const form = document.querySelector('#admin-learner-form');
  if (!dialog || !form) return;
  form.reset();
  document.querySelector('#admin-learner-id').value = learner?.id || '';
  document.querySelector('#admin-learner-name').value = learner?.displayName || '';
  document.querySelector('#admin-learner-email').value = learner?.email || '';
  document.querySelector('#admin-learner-status').value = learner?.status || 'active';
  document.querySelector('#admin-learner-status').disabled = !learner;
  document.querySelector('#admin-learner-password').required = !learner;
  document.querySelector('#admin-password-help').textContent = learner ? '(leave blank to keep current)' : '(required)';
  document.querySelector('#admin-dialog-title').textContent = learner ? 'Edit learner' : 'Add learner';
  const message = document.querySelector('#admin-learner-message');
  if (message) message.hidden = true;
  dialog.showModal();
}

async function saveLearner(event) {
  event.preventDefault();
  const learnerId = Number(document.querySelector('#admin-learner-id')?.value || 0);
  const payload = {
    displayName: document.querySelector('#admin-learner-name')?.value.trim(),
    email: document.querySelector('#admin-learner-email')?.value.trim(),
    password: document.querySelector('#admin-learner-password')?.value || '',
    status: document.querySelector('#admin-learner-status')?.value || 'active',
  };
  if (learnerId) payload.learnerId = learnerId;
  const button = document.querySelector('#admin-save-learner');
  if (button) button.disabled = true;
  setAdminFormMessage('#admin-learner-message', '', false, true);
  try {
    await fetchJson(`/api/index.php?action=${learnerId ? 'admin-update-learner' : 'admin-create-learner'}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    document.querySelector('#admin-learner-dialog')?.close();
    gamification.showToast({ emoji: '✅', title: learnerId ? 'Learner updated' : 'Learner added', desc: 'The account is ready.' });
    await loadAdminWorkspace();
  } catch (error) {
    setAdminFormMessage('#admin-learner-message', error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function deactivateLearner(learnerId) {
  const learner = state.adminLearners.find(item => item.id === learnerId);
  if (!learner || !window.confirm(`Deactivate ${learner.displayName}? They will be signed out and unable to access training.`)) return;
  try {
    await fetchJson('/api/index.php?action=admin-deactivate-learner', {
      method: 'POST',
      body: JSON.stringify({ learnerId }),
    });
    gamification.showToast({ emoji: '🔒', title: 'Learner deactivated', desc: `${learner.displayName} can no longer sign in.` });
    await loadAdminWorkspace();
  } catch (error) {
    gamification.showToast({ emoji: '⚠️', title: 'Update failed', desc: error.message });
  }
}

async function assignTraining(event) {
  event.preventDefault();
  const learnerId = Number(document.querySelector('#admin-assignment-learner')?.value || 0);
  const moduleSlugs = [...document.querySelectorAll('#admin-module-options input:checked')].map(input => input.value);
  const button = document.querySelector('#admin-assign-btn');
  if (!learnerId || !moduleSlugs.length) {
    setAdminFormMessage('#admin-assignment-message', 'Choose a learner and at least one module.', true);
    return;
  }
  if (button) button.disabled = true;
  try {
    const result = await fetchJson('/api/index.php?action=admin-assign-training', {
      method: 'POST',
      body: JSON.stringify({ learnerId, moduleSlugs }),
    });
    document.querySelector('#admin-assignment-form')?.reset();
    setAdminFormMessage('#admin-assignment-message', `${result.assigned} training assignment(s) saved.`);
    await loadAdminWorkspace();
  } catch (error) {
    setAdminFormMessage('#admin-assignment-message', error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadAdminReports() {
  if (state.user?.role !== 'admin') return;
  const table = document.querySelector('#admin-reports-table');
  const learnerId = document.querySelector('#admin-report-filter')?.value || '';
  if (table) table.innerHTML = '<tr><td colspan="6" class="admin-empty">Loading results…</td></tr>';
  try {
    const query = learnerId ? `&learnerId=${encodeURIComponent(learnerId)}` : '';
    const reports = await fetchJson(`/api/index.php?action=admin-reports${query}`);
    if (!table) return;
    if (!reports.length) {
      table.innerHTML = '<tr><td colspan="6" class="admin-empty">No completed training results found.</td></tr>';
      return;
    }
    table.innerHTML = reports.map(report => `<tr>
      <td>${escapeHtml(formatAdminDate(report.completedAt))}</td>
      <td><div class="admin-learner-cell"><strong>${escapeHtml(report.learnerName)}</strong><span>${escapeHtml(report.email)}</span></div></td>
      <td>${escapeHtml(report.moduleTitle)}</td>
      <td><strong>${report.score}%</strong></td>
      <td><span class="module-rating-badge ${escapeHtml(report.rating.toLowerCase())}">${escapeHtml(report.rating)}</span></td>
      <td>${report.xpEarned}</td>
    </tr>`).join('');
  } catch (error) {
    if (table) table.innerHTML = `<tr><td colspan="6" class="admin-empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

function setAdminFormMessage(selector, message, isError = false, hidden = false) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.hidden = hidden;
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function formatAdminDate(value) {
  if (!value) return 'Never';
  const parsed = new Date(String(value).replace(' ', 'T') + 'Z');
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toLocaleDateString();
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
      <td>${escapeHtml(a.completedAt ? a.completedAt.slice(0, 10) : 'Today')}</td>
      <td>${escapeHtml(a.moduleTitle || 'Warehouse Hazard Hunt')}</td>
      <td><strong>${a.overallPercent}%</strong></td>
      <td><span class="module-rating-badge ${a.rating ? a.rating.toLowerCase() : 'bronze'}">${escapeHtml(a.rating || 'Bronze')}</span></td>
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
      if (state.user?.id && state.user.role === 'learner') {
        await fetchJson('/api/index.php?action=start-training', {
          method: 'POST',
          body: JSON.stringify({ moduleSlug: module.id }),
        });
      }
    } else {
      throw new Error('Offline');
    }
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      if (beginBtn) {
        beginBtn.disabled = false;
        beginBtn.textContent = 'Training unavailable';
      }
      gamification.showToast({ emoji: '🔒', title: 'Access restricted', desc: err.message });
      return;
    }
    try {
      const res = await fetch(appUrl(module.fallbackUrl));
      if (!res.ok) throw new Error(`Fallback request failed with status ${res.status}.`);
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
      beginBtn.innerHTML = `Enter ${escapeHtml(module.title)} <span aria-hidden="true">→</span>`;
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

  const challengeTitle = document.querySelector('#challenge-title');
  if (challengeTitle) challengeTitle.textContent = state.activeModule?.title || state.bundle.scenario.title;
  
  if (state.vr) {
    state.vr.destroy();
  }
  
  const panoEl = document.querySelector('#pano');
  if (!panoEl) return;
  
  const scenario = state.bundle.scenario;
  const createViewer = (imageUrl, initialView) => new VRAdapter(panoEl, {
    imageUrl,
    panoramaWidth: scenario.panoramaWidth,
    initialView,
    minFov: scenario.minFov,
    maxFov: scenario.maxFov
  });
  const primaryUrl = appUrl(scenario.panoramaUrl);
  const rollbackUrl = scenario.rollbackPanoramaUrl ? appUrl(scenario.rollbackPanoramaUrl) : null;

  state.vr = createViewer(primaryUrl, scenario.initialView);
  let mountViewer = state.vr.mount();
  if (rollbackUrl && rollbackUrl !== primaryUrl) {
    mountViewer = mountViewer.catch((primaryError) => {
      console.warn('Primary panorama failed; loading the rollback scene.', primaryError);
      state.vr = createViewer(rollbackUrl, scenario.rollbackInitialView || scenario.initialView);
      return state.vr.mount();
    });
  }

  mountViewer.then(() => {
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
    console.error('Panorama start failed:', err);
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
  renderHazardPips();
  updateHud();
}

function renderHazardPips() {
  const container = document.querySelector('#hazard-pips');
  if (!container) return;
  const total = state.bundle?.scenario?.maxHazards || state.bundle?.hazards?.length || 0;
  container.replaceChildren();
  for (let index = 0; index < total; index += 1) {
    const pip = document.createElement('span');
    pip.className = 'hazard-pip';
    container.append(pip);
  }
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
  if (state.current !== 'challenge') return;
  if (e.target.closest('.hazard-hotspot')) {
    state.pointerStart = null;
    return;
  }
  state.pointerStart = { x: e.clientX, y: e.clientY };
  document.body.classList.add('is-component-dragging');
});
panoContainer?.addEventListener('pointerup', (e) => {
  document.body.classList.remove('is-component-dragging');
  if (e.target.closest('.hazard-hotspot')) {
    state.pointerStart = null;
    return;
  }
  if (!state.pointerStart) return;
  const dist = Math.hypot(e.clientX - state.pointerStart.x, e.clientY - state.pointerStart.y);
  state.pointerStart = null;
  if (dist <= 7) handleWrongSelection();
});
panoContainer?.addEventListener('pointercancel', () => {
  state.pointerStart = null;
  document.body.classList.remove('is-component-dragging');
});
window.addEventListener('pointerup', () => {
  state.pointerStart = null;
  document.body.classList.remove('is-component-dragging');
});
window.addEventListener('blur', () => {
  state.pointerStart = null;
  document.body.classList.remove('is-component-dragging');
});

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
  const hazardsTotal = document.querySelector('#hazards-total');
  const scoreVal = document.querySelector('#score-value');
  const maxHazards = state.bundle.scenario.maxHazards || state.bundle.hazards?.length || 0;

  const remainingSeconds = Math.ceil(state.remainingMs / 1000);
  if (timerVal) timerVal.textContent = formatTime(remainingSeconds);
  if (timeProg) {
    timeProg.max = state.bundle.scenario.durationSeconds;
    timeProg.value = remainingSeconds;
  }
  if (hazardsF) hazardsF.textContent = state.foundCodes.size;
  if (hazardsTotal) hazardsTotal.textContent = maxHazards;
  if (scoreVal) scoreVal.textContent = currentChallengeScore();
  document.querySelectorAll('#hazard-pips .hazard-pip').forEach((pip, index) => {
    pip.classList.toggle('found', index < state.foundCodes.size);
  });
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
      val = await fetchJson('/api/index.php?action=answer', {
        method: 'POST',
        body: JSON.stringify({ moduleSlug: state.activeModule, questionId: q.id, optionId: optId })
      });
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
  
  const moduleSlug = state.activeModule ? state.activeModule.id : 'warehouse-hazard-hunt';
  const progress = gamification.processAttempt(result, moduleSlug);
  renderResults(result, progress);
  if (result.challenge) {
    const challenge = result.challenge;
    const summary = challenge.status === 'completed'
      ? `1v1 complete: ${challenge.challengerScore}% vs ${challenge.opponentScore}%.`
      : 'Your 1v1 score is locked. Waiting for your opponent.';
    gamification.showToast({ emoji: '⚔️', title: '1v1 score submitted', desc: summary, duration: 6000 });
  }
  state.challengeCode = null;
  
  // Gamification Engine
  const { didLevelUp, newLevel, newBadges } = progress;
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

function renderResults(result, progress) {
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
  const newBestBanner = document.querySelector('#new-best-banner');
  const xpWidget = document.querySelector('#xp-gain-widget');
  const xpAmount = document.querySelector('#xp-gain-amount');
  const xpLabel = document.querySelector('#xp-gain-label');
  const xpBar = document.querySelector('#xp-gain-bar');
  const clearBest = document.querySelector('#clear-best');

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
  const personalBest = Math.max(progress.previousBest || 0, result.overallPercent);
  if (rBest) rBest.textContent = `${personalBest}%`;
  if (newBestBanner) newBestBanner.hidden = result.overallPercent <= (progress.previousBest || 0);
  if (xpWidget) xpWidget.hidden = false;
  if (xpAmount) xpAmount.textContent = `+${progress.xp} XP`;
  if (xpLabel) xpLabel.textContent = `${progress.newLevel.name} · ${progress.totalXp} total XP`;
  if (xpBar) {
    const previousLevel = gamification.getLevel(progress.previousXp);
    const previousProgress = gamification.getXpProgress(progress.previousXp);
    const currentProgress = gamification.getXpProgress(progress.totalXp);
    const start = previousLevel.name === currentProgress.level.name ? previousProgress.pct : 0;
    xpBar.style.setProperty('--xp-from', `${start}%`);
    xpBar.style.setProperty('--xp-to', `${currentProgress.pct}%`);
  }
  if (clearBest) clearBest.hidden = Boolean(state.user?.id);
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
    const userRankCard = document.querySelector('#user-rank-card');
    const userRankNumber = document.querySelector('#user-rank-number');
    if (!data || data.length === 0) {
      if (userRankCard) userRankCard.hidden = true;
      lbList.innerHTML = '<div style="padding:32px; text-align:center; color:var(--ink-muted);">No rankings recorded yet. Be the first!</div>';
      return;
    }
    const userRank = data.findIndex(row => String(row.id) === String(state.user?.id));
    if (userRankCard) userRankCard.hidden = userRank < 0;
    if (userRankNumber && userRank >= 0) userRankNumber.textContent = `#${userRank + 1}`;
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
    const userRankCard = document.querySelector('#user-rank-card');
    if (userRankCard) userRankCard.hidden = true;
    lbList.innerHTML = '<div style="padding:32px; text-align:center; color:var(--ink-muted);">Unable to load leaderboard.</div>';
  }
}

function updateDailyResetTimer() {
  const timer = document.querySelector('#daily-reset-timer');
  if (!timer) return;
  const now = new Date();
  const nextReset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const remaining = Math.max(0, Math.floor((nextReset - now.getTime()) / 1000));
  const hours = String(Math.floor(remaining / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  timer.textContent = `${hours}:${minutes}:${seconds}`;
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
