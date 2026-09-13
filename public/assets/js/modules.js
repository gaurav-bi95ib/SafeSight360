/**
 * SafeSight360 — Module Registry
 * Defines all 6 training modules and their routing
 */

export const MODULE_TYPES = {
  PANORAMA:    'panorama',
  INTERACTIVE: 'interactive',
  PUZZLE:      'puzzle',
};

export const MODULES = [
  {
    id: 'warehouse-hazard-hunt',
    title: 'Warehouse Hazard Hunt',
    subtitle: 'Automotive logistics · 360°',
    icon: '🏭',
    type: MODULE_TYPES.PANORAMA,
    typeLabel: '360° Panorama',
    duration: '5 min',
    description: 'Explore a live 360° automotive logistics warehouse. Spot all 8 safety hazards before the timer runs out.',
    topics: ['Hazard Perception', 'Manual Handling', 'Working at Height', 'Unsafe Acts'],
    fallbackUrl: '/assets/data/training-fallback.json',
    apiSlug: 'warehouse-hazard-hunt',
    screen: 'briefing',
    order: 1,
  },
  {
    id: 'manual-handling',
    title: 'Manual Handling',
    subtitle: 'Safe lifting & carrying',
    icon: '📦',
    type: MODULE_TYPES.PANORAMA,
    typeLabel: '360° Panorama',
    duration: '5 min',
    description: 'Master the TILE framework (Task, Individual, Load, Environment) for safe manual handling in the warehouse.',
    topics: ['Manual Handling', 'TILE Assessment', 'Ergonomics'],
    fallbackUrl: '/assets/data/manual-handling-fallback.json',
    apiSlug: 'manual-handling',
    screen: 'briefing',
    order: 2,
  },
  {
    id: 'working-at-height',
    title: 'Working at Height',
    subtitle: 'Ladder & WAH safety',
    icon: '🪜',
    type: MODULE_TYPES.PANORAMA,
    typeLabel: '360° Panorama',
    duration: '5 min',
    description: 'Identify unsafe working-at-height setups, understand the hierarchy of controls, and check equipment before climbing.',
    topics: ['Working at Height', 'Hierarchy of Controls', 'Equipment Checks'],
    fallbackUrl: '/assets/data/working-at-height-fallback.json',
    apiSlug: 'working-at-height',
    screen: 'briefing',
    order: 3,
  },
  {
    id: 'five-whys',
    title: '5 Whys — Root Cause',
    subtitle: 'Root cause analysis puzzle',
    icon: '🔍',
    type: MODULE_TYPES.PUZZLE,
    typeLabel: 'Interactive Puzzle',
    duration: '6 min',
    description: 'An incident has occurred. Drill through five layers of cause-and-effect to uncover the true root cause and prevent recurrence.',
    topics: ['Root Cause Analysis', '5 Whys', 'Incident Investigation'],
    fallbackUrl: '/assets/data/five-whys-fallback.json',
    apiSlug: 'five-whys',
    screen: 'fivewhys',
    order: 4,
  },
  {
    id: 'unsafe-acts',
    title: 'Unsafe Acts',
    subtitle: 'Human factors & LMRA',
    icon: '⚠️',
    type: MODULE_TYPES.PANORAMA,
    typeLabel: '360° Panorama',
    duration: '5 min',
    description: 'Recognise unsafe human behaviours, understand Last Minute Risk Assessment (LMRA), and challenge unsafe acts.',
    topics: ['Unsafe Acts', 'Human Factors', 'LMRA', 'Behavioural Safety'],
    fallbackUrl: '/assets/data/unsafe-acts-fallback.json',
    apiSlug: 'unsafe-acts',
    screen: 'briefing',
    order: 5,
  },
  {
    id: 'cyber-awareness',
    title: 'Cyber Awareness',
    subtitle: '5 interactive mini-games',
    icon: '🛡️',
    type: MODULE_TYPES.INTERACTIVE,
    typeLabel: 'Interactive',
    duration: '8 min',
    description: 'Five hands-on cyber challenges: spot phishing emails, secure your home working setup, defend against social engineering, and more.',
    topics: ['Cyber Fundamentals', 'Safe Home Working', 'Social Engineering', 'Mobile Devices', 'Phishing'],
    fallbackUrl: '/assets/data/cyber-awareness-fallback.json',
    apiSlug: 'cyber-awareness',
    screen: 'cyber',
    order: 6,
  },
];

export function getModule(id) {
  return MODULES.find(m => m.id === id) || null;
}

export function getModuleTypeClass(type) {
  if (type === MODULE_TYPES.INTERACTIVE) return 'type-interactive';
  if (type === MODULE_TYPES.PUZZLE) return 'type-puzzle';
  return '';
}

/** Render the full modules grid into the hub screen */
export function renderModulesGrid(containerId, userProgress = {}, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = MODULES.map(mod => {
    const progress = userProgress[mod.id] || {};
    const rating   = progress.rating?.toLowerCase() || 'not-started';
    const ratingLabel = rating === 'not-started' ? 'Not started' : rating.charAt(0).toUpperCase() + rating.slice(1);
    const badgeClass  = rating === 'not-started' ? 'not-started' : rating;
    const typeClass   = getModuleTypeClass(mod.type);

    return `
      <div class="module-card"
           role="listitem"
           id="module-card-${mod.id}"
           data-module-id="${mod.id}"
           tabindex="0"
           aria-label="${mod.title}: ${mod.description}. Duration: ${mod.duration}. Status: ${ratingLabel}">
        <span class="module-type-tag ${typeClass}" aria-hidden="true">${mod.typeLabel}</span>
        <div class="module-icon" aria-hidden="true">${mod.icon}</div>
        <h3>${mod.title}</h3>
        <p>${mod.description}</p>
        <div class="module-card-footer">
          <span class="module-duration">⏱ ${mod.duration}</span>
          <span class="module-rating-badge ${badgeClass}">${ratingLabel}</span>
        </div>
      </div>
    `;
  }).join('');

  // Attach click + keyboard handlers
  container.querySelectorAll('.module-card').forEach(card => {
    const handler = () => {
      const id = card.dataset.moduleId;
      const mod = getModule(id);
      if (mod) onSelect(mod);
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
  });
}

/** Render compact module progress cards for the dashboard. */
export function renderModuleProgressGrid(containerId, userProgress = {}, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = MODULES.map(mod => {
    const progress = userProgress[mod.id] || {};
    const rating = progress.rating || 'Not started';
    const ratingClass = rating.toLowerCase().replace(' ', '-');
    const score = progress.bestPercent ?? progress.best_percent ?? null;
    const meta = score !== null ? `${score}% best score` : mod.duration;

    return `
      <button class="module-progress-item" type="button" data-module-id="${mod.id}"
              aria-label="Open ${mod.title}. ${rating}. ${meta}">
        <span class="module-progress-icon" aria-hidden="true">${mod.icon}</span>
        <span class="module-progress-copy">
          <strong class="module-progress-name">${mod.title}</strong>
          <span class="module-progress-status">${mod.typeLabel} · ${meta}</span>
        </span>
        <span class="module-rating-badge ${ratingClass}">${rating}</span>
        <span class="module-progress-arrow" aria-hidden="true">→</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.module-progress-item').forEach(item => {
    item.addEventListener('click', () => {
      const mod = getModule(item.dataset.moduleId);
      if (mod) onSelect(mod);
    });
  });
}
