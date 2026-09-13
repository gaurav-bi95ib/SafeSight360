/**
 * SafeSight360 Gamification Engine
 * XP, Levels, 14 Achievement Badges, Streaks, Celebrations
 */

// ── XP & Level Config ────────────────────────────────────────
export const LEVELS = [
  { name: 'Rookie',      emoji: '🌱', minXp: 0,    color: '#8ca3b8' },
  { name: 'Apprentice',  emoji: '📚', minXp: 500,  color: '#00e5a0' },
  { name: 'Specialist',  emoji: '🔍', minXp: 1500, color: '#00d4ff' },
  { name: 'Expert',      emoji: '⭐', minXp: 3500, color: '#ff6b2b' },
  { name: 'Master',      emoji: '👑', minXp: 7000, color: '#ffd700' },
];

export const BADGES = [
  // Safety Foundations
  { id: 'first_responder',  emoji: '🎯', name: 'First Responder',     desc: 'Complete any training module', category: 'foundation' },
  { id: 'safety_repeat',   emoji: '🔄', name: 'Safety Repeat',        desc: 'Complete the same module twice', category: 'foundation' },
  { id: 'scholar',         emoji: '📚', name: 'Scholar',              desc: 'Complete all 6 modules at least once', category: 'foundation' },
  { id: 'all_rounder',     emoji: '🌟', name: 'All-Rounder',          desc: 'Score Silver+ in all 6 modules', category: 'foundation' },
  // Performance
  { id: 'gold_standard',   emoji: '🏆', name: 'Gold Standard',        desc: 'Score Gold in any module', category: 'performance' },
  { id: 'triple_crown',    emoji: '👑', name: 'Triple Crown',          desc: 'Score Gold in 3 different modules', category: 'performance' },
  { id: 'eagle_eye',       emoji: '👁️', name: 'Eagle Eye',            desc: 'All hazards, zero wrong clicks', category: 'performance' },
  { id: 'speed_demon',     emoji: '⚡', name: 'Speed Demon',           desc: 'All hazards with 60+ seconds remaining', category: 'performance' },
  { id: 'perfect_scholar', emoji: '🎓', name: 'Perfect Scholar',       desc: '5/5 quiz score', category: 'performance' },
  // Engagement
  { id: 'on_fire',         emoji: '🔥', name: 'On Fire',              desc: 'Complete 3 modules in one day', category: 'engagement' },
  { id: 'week_warrior',    emoji: '📅', name: 'Week Warrior',          desc: '7-day login streak', category: 'engagement' },
  { id: 'comeback_kid',    emoji: '💪', name: 'Comeback Kid',          desc: 'Improve score by 20%+ on retry', category: 'engagement' },
  // Special
  { id: 'root_cause',      emoji: '🔍', name: 'Root Cause Detective',  desc: 'Complete 5 Whys with a perfect chain', category: 'special' },
  { id: 'cyber_guardian',  emoji: '🛡️', name: 'Cyber Guardian',       desc: 'Score 80%+ in all Cyber sub-topics', category: 'special' },
];

// ── Storage Keys ─────────────────────────────────────────────
const STORAGE = {
  XP:            'ss360_xp',
  BADGES:        'ss360_badges',
  STREAK:        'ss360_streak',
  STREAK_DATE:   'ss360_streak_date',
  MODULE_COUNTS: 'ss360_module_counts',
  DAILY_COUNT:   'ss360_daily_count',
  DAILY_DATE:    'ss360_daily_date',
  PREV_SCORES:   'ss360_prev_scores',
};

// ── Read / Write helpers ──────────────────────────────────────
function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

// ── Public API ───────────────────────────────────────────────

export function getXP()    { return read(STORAGE.XP, 0); }
export function getBadges(){ return read(STORAGE.BADGES, []); }
export function getStreak(){ return read(STORAGE.STREAK, 0); }

/** Synchronise registered-user progress returned by the server. */
export function hydrateProgress({ xp = 0, badges = [], streak = 0 } = {}) {
  write(STORAGE.XP, Math.max(0, Number(xp) || 0));
  write(STORAGE.BADGES, Array.isArray(badges) ? badges : []);
  write(STORAGE.STREAK, Math.max(0, Number(streak) || 0));
}

export function getLevel(xp = getXP()) {
  let level = LEVELS[0];
  for (const l of LEVELS) { if (xp >= l.minXp) level = l; }
  return level;
}

export function getXpProgress(xp = getXP()) {
  const level = getLevel(xp);
  const idx   = LEVELS.indexOf(level);
  const next  = LEVELS[idx + 1];
  if (!next) return { level, next: null, pct: 100, current: xp, needed: 0 };
  const pct = Math.round(((xp - level.minXp) / (next.minXp - level.minXp)) * 100);
  return { level, next, pct, current: xp, needed: next.minXp - xp };
}

/** Call this after every completed attempt to process XP, badges, etc. */
export function processAttempt(result, moduleSlug = 'warehouse-hazard-hunt') {
  const xp = Number.isFinite(Number(result.xpEarned))
    ? Math.max(0, Number(result.xpEarned))
    : computeXp(result, moduleSlug);
  const prevXp = getXP();
  const newXp  = prevXp + xp;
  write(STORAGE.XP, newXp);

  // Update module completion counts
  const counts = read(STORAGE.MODULE_COUNTS, {});
  counts[moduleSlug] = (counts[moduleSlug] || 0) + 1;
  write(STORAGE.MODULE_COUNTS, counts);

  // Daily count
  const today = new Date().toISOString().slice(0, 10);
  const dd    = read(STORAGE.DAILY_DATE, null);
  let daily   = dd === today ? read(STORAGE.DAILY_COUNT, 0) : 0;
  daily++;
  write(STORAGE.DAILY_COUNT, daily);
  write(STORAGE.DAILY_DATE, today);

  // Previous scores per module
  const prevScores = read(STORAGE.PREV_SCORES, {});
  const prevScore  = prevScores[moduleSlug] || 0;
  prevScores[moduleSlug] = Math.max(prevScore, result.overallPercent);
  write(STORAGE.PREV_SCORES, prevScores);

  // Check level up
  const prevLevel = getLevel(prevXp);
  const newLevel  = getLevel(newXp);
  const didLevelUp = newLevel.name !== prevLevel.name;

  // Check badges
  const newBadges = checkBadges(result, moduleSlug, daily, counts, prevScore);

  // Update streak
  updateStreak();

  return { xp, totalXp: newXp, didLevelUp, newLevel, newBadges };
}

function computeXp(result, moduleSlug) {
  let xp = result.overallPercent * 10;
  const counts = read(STORAGE.MODULE_COUNTS, {});
  if ((counts[moduleSlug] || 0) === 0) xp += 200; // First time bonus
  if (result.rating === 'Gold') xp += 100;
  if (result.quizScore === 5) xp += 50;
  if (result.foundCount === 8 && result.wrongClicks === 0) xp += 75;
  return xp;
}

function checkBadges(result, moduleSlug, dailyCount, moduleCounts, prevScore) {
  const earned  = new Set(read(STORAGE.BADGES, []));
  const newOnes = [];

  function earn(id) {
    if (!earned.has(id)) { earned.add(id); newOnes.push(id); }
  }

  // First Responder
  earn('first_responder');

  // Safety Repeat
  if ((moduleCounts[moduleSlug] || 0) >= 2) earn('safety_repeat');

  // Scholar (all 6 modules)
  const allModules = ['warehouse-hazard-hunt','manual-handling','working-at-height','five-whys','unsafe-acts','cyber-awareness'];
  if (allModules.every(m => (moduleCounts[m] || 0) >= 1)) earn('scholar');

  // Gold Standard
  if (result.rating === 'Gold') earn('gold_standard');

  // Triple Crown — check scores
  const prevScores = read(STORAGE.PREV_SCORES, {});
  const goldCount = allModules.filter(m => (prevScores[m] || 0) >= 80).length;
  if (goldCount >= 3) earn('triple_crown');

  // Eagle Eye (only 360° modules)
  if (result.foundCount === 8 && result.wrongClicks === 0) earn('eagle_eye');

  // Speed Demon
  if (result.foundCount === 8 && result.elapsedSeconds !== undefined) {
    const duration = 120;
    const remainingSeconds = duration - result.elapsedSeconds;
    if (remainingSeconds >= 60) earn('speed_demon');
  }

  // Perfect Scholar
  if (result.quizScore === 5) earn('perfect_scholar');

  // On Fire
  if (dailyCount >= 3) earn('on_fire');

  // Week Warrior
  if (getStreak() >= 7) earn('week_warrior');

  // Comeback Kid — improved by 20%+
  if (prevScore > 0 && result.overallPercent - prevScore >= 20) earn('comeback_kid');

  // 5 Whys and Cyber — handled by their engines
  // Those engines call earnSpecialBadge() directly

  write(STORAGE.BADGES, [...earned]);
  return newOnes;
}

export function earnSpecialBadge(id) {
  const earned = new Set(read(STORAGE.BADGES, []));
  if (earned.has(id)) return false;
  earned.add(id);
  write(STORAGE.BADGES, [...earned]);
  return true;
}

function updateStreak() {
  const today    = new Date().toISOString().slice(0, 10);
  const lastDate = read(STORAGE.STREAK_DATE, null);
  const streak   = read(STORAGE.STREAK, 0);

  if (lastDate === today) return; // Already updated today
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = lastDate === yesterday ? streak + 1 : 1;
  write(STORAGE.STREAK, newStreak);
  write(STORAGE.STREAK_DATE, today);
}

// ── UI Helpers ───────────────────────────────────────────────

/** Show an animated toast notification */
export function showToast({ emoji = '🎯', title, desc, xp = null, duration = 4000 }) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-badge-icon" aria-hidden="true">${emoji}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-desc">${desc}</div>
    </div>
    ${xp !== null ? `<div class="toast-xp">+${xp} XP</div>` : ''}
  `;

  container.appendChild(toast);

  const remove = () => {
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  setTimeout(remove, duration);
  toast.addEventListener('click', remove);
}

/** Show all newly unlocked badge toasts */
export function showBadgeToasts(newBadgeIds, xpGained) {
  if (!newBadgeIds.length && !xpGained) return;

  // XP toast first
  if (xpGained) {
    showToast({ emoji: '⚡', title: `+${xpGained} XP earned!`, desc: 'Keep training to level up', xp: null });
  }

  // Badge toasts with stagger
  newBadgeIds.forEach((id, i) => {
    const badge = BADGES.find(b => b.id === id);
    if (!badge) return;
    setTimeout(() => {
      showToast({ emoji: badge.emoji, title: `Badge Unlocked: ${badge.name}`, desc: badge.desc, duration: 5000 });
    }, 600 + i * 800);
  });
}

/** Show level-up overlay */
export function showLevelUp(newLevel) {
  const overlay = document.getElementById('level-up-overlay');
  const emoji   = document.getElementById('level-up-emoji');
  const name    = document.getElementById('level-up-name');
  const xpText  = document.getElementById('level-up-xp');
  if (!overlay) return;

  emoji.textContent  = newLevel.emoji;
  name.textContent   = newLevel.name;
  xpText.textContent = `You've reached ${newLevel.minXp} XP`;
  overlay.hidden = false;

  document.getElementById('level-up-close')?.addEventListener('click', () => {
    overlay.hidden = true;
  }, { once: true });
}

/** Fire CSS confetti burst */
export function fireConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  container.innerHTML = '';

  const colors = ['#ff6b2b','#ffb11f','#00e5a0','#00d4ff','#a855f7','#ffd700','#ff4757'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    Object.assign(piece.style, {
      left: `${Math.random() * 100}%`,
      backgroundColor: colors[Math.floor(Math.random() * colors.length)],
      '--duration': `${2 + Math.random() * 2}s`,
      '--delay':    `${Math.random() * 0.8}s`,
      transform:    `rotate(${Math.random() * 360}deg)`,
      width:        `${8 + Math.random() * 8}px`,
      height:       `${10 + Math.random() * 10}px`,
    });
    container.appendChild(piece);
  }

  setTimeout(() => { container.innerHTML = ''; }, 4000);
}

/** Update the header XP bar */
export function updateHeaderXp() {
  const { pct, current } = getXpProgress();
  const fill  = document.getElementById('header-xp-fill');
  const label = document.getElementById('header-xp-label');
  if (fill)  fill.style.width = `${pct}%`;
  if (label) label.textContent = `${current} XP`;
}

/** Render the full badges grid on the dashboard */
export function renderBadgesGrid(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const earned = new Set(read(STORAGE.BADGES, []));
  container.innerHTML = BADGES.map(b => `
    <div class="badge-item ${earned.has(b.id) ? 'is-earned' : 'is-locked'}"
         role="listitem"
         aria-label="${b.name}: ${b.desc}${earned.has(b.id) ? ' (earned)' : ' (locked)'}">
      <span class="badge-emoji" aria-hidden="true">${b.emoji}</span>
      <span class="badge-name">${b.name}</span>
    </div>
  `).join('');
}
