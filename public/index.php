<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="SafeSight360 — Interactive 360° warehouse safety training with gamification, quizzes, and competitive challenges for automotive logistics.">
  <meta name="theme-color" content="#030b14">
  <title>SafeSight360 | Interactive Safety Training</title>
  <script>
    (() => {
      const saved = localStorage.getItem('ss360_theme');
      const theme = saved === 'light' || saved === 'dark'
        ? saved
        : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      document.documentElement.dataset.theme = theme;
    })();
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to training content</a>

  <!-- ── Site Header ───────────────────────────────────────── -->
  <header class="site-header" id="site-header">
    <a class="brand" href="/" aria-label="SafeSight360 home">
      <span class="brand-mark" aria-hidden="true"><span></span></span>
      <span><strong>SafeSight</strong><em>360</em></span>
    </a>

        <div class="header-right">
      <span id="service-mode" class="service-mode" hidden>Offline mode</span>
      <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch to light theme" aria-pressed="false">
        <span id="theme-toggle-icon" aria-hidden="true">☀</span>
        <span id="theme-toggle-label">Light</span>
      </button>

      <!-- Logged-in user section (hidden until authenticated) -->
      <div id="header-user-section" class="header-user" hidden>
        <nav class="primary-nav" aria-label="Primary navigation">
          <button class="primary-nav-link" id="nav-home-btn" data-destination="home" data-tooltip="Home" type="button"><span class="nav-icon" aria-hidden="true">⌂</span><span class="nav-label">Home</span></button>
          <button class="primary-nav-link" id="nav-training-btn" data-destination="training" data-tooltip="Training" type="button"><span class="nav-icon" aria-hidden="true">◈</span><span class="nav-label">Training</span></button>
          <button class="primary-nav-link" id="nav-arena-btn" data-destination="arena" data-tooltip="1v1 Arena" type="button"><span class="nav-icon" aria-hidden="true">⚔</span><span class="nav-label">1v1</span></button>
          <button class="primary-nav-link" id="nav-leaderboard-btn" data-destination="leaderboard" data-tooltip="Leaderboard" type="button"><span class="nav-icon" aria-hidden="true">♛</span><span class="nav-label">Leaders</span></button>
          <button class="primary-nav-link" id="nav-dashboard-btn" data-destination="dashboard" data-tooltip="Dashboard" type="button" aria-label="My progress dashboard"><span class="nav-icon" aria-hidden="true">▦</span><span class="nav-label">Dashboard</span></button>
        </nav>
        <div class="header-xp-bar" aria-label="XP progress">
          <div class="xp-track">
            <div id="header-xp-fill" class="xp-fill" style="width: 0%"></div>
          </div>
          <span id="header-xp-label" class="header-xp-label">0 XP</span>
        </div>
        <div class="user-avatar" id="user-avatar" aria-hidden="true">?</div>
        <div class="user-info">
          <span id="header-user-name" class="user-name">User</span>
          <span id="header-user-level" class="user-level-chip">Rookie</span>
        </div>
        <button class="header-signout" id="nav-logout-btn" type="button" aria-label="Sign out" title="Sign out"><span aria-hidden="true">↪</span></button>
      </div>
    </div>
  </header>

  <!-- Toast notification container -->
  <div id="toast-container" class="toast-container" aria-live="assertive" aria-atomic="false"></div>

  <!-- Confetti container -->
  <div id="confetti-container" class="confetti-container" aria-hidden="true"></div>

  <!-- Level-up overlay (hidden by default) -->
  <div id="level-up-overlay" class="level-up-overlay" hidden aria-live="assertive">
    <div class="level-up-card">
      <div class="level-up-emoji" id="level-up-emoji">🎉</div>
      <p class="level-up-title">Level Up!</p>
      <h2 class="level-up-name"><span class="gradient-text" id="level-up-name">Apprentice</span></h2>
      <p class="level-up-xp" id="level-up-xp">You've reached a new level</p>
      <button class="button button-primary" id="level-up-close" type="button" style="margin-top: 32px;">Continue →</button>
    </div>
  </div>

  <main id="main-content" tabindex="-1">

    <!-- ══════════════════════════════════════════════════════
         AUTH SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="auth-screen screen" data-screen="auth" aria-labelledby="auth-title">
      <!-- Left brand panel -->
      <div class="auth-brand-panel" aria-hidden="true">
        <div class="auth-brand-logo">
          <span class="brand-mark-lg"><span></span></span>
          <span><strong>SafeSight</strong><em>360</em></span>
        </div>
        <h1 class="auth-tagline">Train smarter.<br><span class="gradient-text">Stay safer.</span></h1>
        <p class="auth-sub">360-degree interactive safety training for automotive logistics. Earn XP, unlock badges, and challenge your team.</p>
        <div class="auth-feature-pills">
          <span class="auth-pill"><span class="pill-icon" aria-hidden="true">🎯</span> 360° Hazard Hunt</span>
          <span class="auth-pill"><span class="pill-icon" aria-hidden="true">🏆</span> Gamified XP System</span>
          <span class="auth-pill"><span class="pill-icon" aria-hidden="true">⚔️</span> 1v1 Challenges</span>
          <span class="auth-pill"><span class="pill-icon" aria-hidden="true">🔍</span> 5 Whys Puzzles</span>
          <span class="auth-pill"><span class="pill-icon" aria-hidden="true">🛡️</span> Cyber Awareness</span>
          <span class="auth-pill"><span class="pill-icon" aria-hidden="true">📋</span> VR-Ready</span>
        </div>
        <!-- Floating particles -->
        <div class="auth-particles" aria-hidden="true">
          <div class="auth-particle p1">!</div>
          <div class="auth-particle p2">⚠</div>
          <div class="auth-particle p3">✓</div>
        </div>
      </div>

      <!-- Right form panel -->
      <div class="auth-form-panel">
        <div class="auth-card">
          <!-- Tabs -->
          <div class="auth-tabs" role="tablist" aria-label="Sign in or create account">
            <button class="auth-tab is-active" id="tab-login" role="tab" aria-selected="true" aria-controls="panel-login" type="button">Sign in</button>
            <button class="auth-tab" id="tab-signup" role="tab" aria-selected="false" aria-controls="panel-signup" type="button">Create account</button>
          </div>

          <!-- Login panel -->
          <div id="panel-login" role="tabpanel" aria-labelledby="tab-login">
            <h2 class="auth-form-title" id="auth-title">Welcome back</h2>
            <p class="auth-form-sub">Sign in to continue your safety training journey.</p>
            <form id="login-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="login-email">Email address</label>
                <input class="form-input" id="login-email" name="email" type="email" autocomplete="email" required placeholder="you@company.com">
              </div>
              <div class="form-group">
                <label class="form-label" for="login-password">Password</label>
                <input class="form-input" id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="Your password">
              </div>
              <div id="login-error" class="form-error" hidden>
                <span aria-hidden="true">⚠</span>
                <span id="login-error-msg">An error occurred.</span>
              </div>
              <button class="button button-primary button-large auth-submit" id="login-submit" type="submit">Sign in →</button>
            </form>
            <div class="auth-divider">or</div>
            <button class="button button-ghost auth-guest-btn" id="guest-btn" type="button">Continue as guest (results won't be saved)</button>
          </div>

          <!-- Signup panel -->
          <div id="panel-signup" role="tabpanel" aria-labelledby="tab-signup" hidden>
            <h2 class="auth-form-title">Join SafeSight360</h2>
            <p class="auth-form-sub">Create your account to track progress and compete.</p>
            <form id="signup-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="signup-name">Your name</label>
                <input class="form-input" id="signup-name" name="displayName" type="text" autocomplete="name" required placeholder="e.g. Alex Johnson" minlength="2" maxlength="80">
              </div>
              <div class="form-group">
                <label class="form-label" for="signup-email">Email address</label>
                <input class="form-input" id="signup-email" name="email" type="email" autocomplete="email" required placeholder="you@company.com">
              </div>
              <div class="form-group">
                <label class="form-label" for="signup-password">Password</label>
                <input class="form-input" id="signup-password" name="password" type="password" autocomplete="new-password" required placeholder="Min. 12 characters">
                <p class="auth-password-hint">Must be 12–72 characters with uppercase, lowercase, and a number.</p>
              </div>
              <div id="signup-error" class="form-error" hidden>
                <span aria-hidden="true">⚠</span>
                <span id="signup-error-msg">An error occurred.</span>
              </div>
              <button class="button button-primary button-large auth-submit" id="signup-submit" type="submit">Create account →</button>
            </form>
          </div>
        </div>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════
         HOME SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="screen home-screen" data-screen="home" aria-labelledby="home-title" hidden>
      <div class="hero-copy">
        <!-- Welcome badge (shown when logged in) -->
        <div id="welcome-badge" class="welcome-badge" hidden aria-live="polite">
          Welcome back, <strong id="welcome-name">—</strong> &nbsp;|&nbsp; Best: <strong id="welcome-best">—</strong>
        </div>

        <p class="eyebrow">Interactive safety training</p>
        <h1 id="home-title">See the risk before it becomes an incident.</h1>
        <p class="hero-lead">Step into an automotive logistics warehouse, explore the full 360° scene, identify hazards, solve root cause puzzles, and defend against cyber threats — all in one platform.</p>
        <div class="hero-actions">
          <button class="button button-primary button-large" id="start-training" type="button">Start training <span aria-hidden="true">→</span></button>
          <button class="button button-secondary" id="home-leaderboard-btn" type="button">🏆 Leaderboard</button>
          <span class="time-note"><strong>6 modules</strong><br>XP, badges &amp; 1v1 challenges</span>
        </div>
        <section aria-labelledby="feature-list-title">
          <h2 id="feature-list-title" class="visually-hidden">Training features</h2>
          <ul class="feature-list">
            <li><span aria-hidden="true">360°</span> Explore in full panorama</li>
            <li><span aria-hidden="true">6</span> Training modules</li>
            <li><span aria-hidden="true">14</span> Achievement badges</li>
          </ul>
        </section>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="radar-orbit orbit-one"></div>
        <div class="radar-orbit orbit-two"></div>
        <div class="orbit-spinner"></div>
        <div class="hero-card hero-card-main">
          <span class="hero-card-label">Training module 01</span>
          <strong>Warehouse<br>Hazard Hunt</strong>
          <span class="hero-card-meta">Automotive logistics · 360°</span>
        </div>
        <div class="hero-card hero-card-score"><span>Best result</span><strong>Gold</strong></div>
        <div class="hazard-pulse pulse-a">!</div>
        <div class="hazard-pulse pulse-b">!</div>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════
         TRAINING HUB SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="screen hub-screen" data-screen="hub" aria-labelledby="hub-title" hidden>
      <div class="hub-header">
        <p class="eyebrow">Training platform</p>
        <h1 id="hub-title">Choose your module</h1>
        <p>Six interactive safety modules. Earn XP with every attempt, unlock achievements, and compete on the leaderboard.</p>
      </div>
      <div class="modules-grid" id="modules-grid" role="list" aria-label="Available training modules">
        <!-- Populated by JS -->
      </div>
      <div style="margin-top: 32px; display: flex; gap: 14px;">
        <button class="button button-primary" id="hub-arena-btn" type="button">⚔ 1v1 Arena</button>
        <button class="button button-ghost" id="hub-back-btn" type="button">← Back to home</button>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════
         BRIEFING SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="screen content-screen" data-screen="briefing" aria-labelledby="briefing-title" hidden>
      <div class="section-heading">
        <p class="eyebrow">Your safety briefing</p>
        <h1 id="briefing-title">Inspect carefully. Choose deliberately.</h1>
        <p id="briefing-mission">Loading the approved scenario...</p>
      </div>
      <div class="briefing-grid">
        <article class="briefing-card accent-card">
          <span class="card-number">01</span>
          <h2>Explore</h2>
          <p>Drag to look around the full warehouse. Use the zoom controls when you need a closer view.</p>
        </article>
        <article class="briefing-card">
          <span class="card-number">02</span>
          <h2>Identify</h2>
          <p>Select each genuine hazard once. A correct finding earns 100 points; a wrong selection removes 20.</p>
        </article>
        <article class="briefing-card">
          <span class="card-number">03</span>
          <h2>Learn</h2>
          <p>Read the safety feedback, then complete five questions and review anything you missed.</p>
        </article>
      </div>
      <div class="briefing-footer">
        <div class="briefing-timer">
          <span aria-hidden="true">02:00</span>
          <p><strong>Two-minute challenge</strong><br>The timer pauses while safety feedback is open.</p>
        </div>
        <button class="button button-primary button-large" id="begin-challenge" type="button">Enter the warehouse <span aria-hidden="true">→</span></button>
      </div>
      <p class="safety-note"><strong>Training note:</strong> This prototype supports learning and does not replace your organisation's site induction, procedures, or competent safety advice.</p>
    </section>

    <!-- ══════════════════════════════════════════════════════
         CHALLENGE SCREEN (360° Game)
         ══════════════════════════════════════════════════════ -->
    <section class="screen challenge-screen" data-screen="challenge" aria-labelledby="challenge-title" hidden>
      <div class="challenge-header">
        <div>
          <p class="eyebrow">Live challenge</p>
          <h1 id="challenge-title">Warehouse Hazard Hunt</h1>
        </div>
        <div class="hud" role="group" aria-label="Challenge status">
          <div class="hud-item"><span>Time</span><strong id="timer-value">02:00</strong></div>
          <div class="hud-item">
            <span>Hazards</span>
            <strong><span id="hazards-found">0</span>/8</strong>
          </div>
          <div class="hud-item"><span>Score</span><strong id="score-value">0</strong></div>
           <div class="hud" role="group" aria-label="Challenge status">
        </div>
      </div>
      <progress id="time-progress" class="time-progress" value="120" max="120"><span>120 seconds remaining</span></progress>
      <!-- Hazard pip progress -->
      <div id="hazard-pips" class="hazard-progress-ring" aria-hidden="true" style="margin-bottom: 10px;"></div>
      <div class="panorama-shell">
        <section id="pano" class="panorama" aria-label="Interactive 360-degree warehouse scene. Drag to look around and select hazard markers."></section>
        <div id="panorama-error" class="panorama-error" hidden>
          <strong>The 360-degree scene could not load.</strong>
          <p>Check that WebGL and the local Marzipano asset are available, then retry.</p>
        </div>
        <div class="pano-instruction" aria-hidden="true">Drag to look around</div>
        <div class="pano-controls" role="group" aria-label="Panorama controls">
          <button id="zoom-in" class="icon-button" type="button" aria-label="Zoom in">+</button>
          <button id="zoom-out" class="icon-button" type="button" aria-label="Zoom out">−</button>
          <button id="reset-view" class="icon-button reset-icon" type="button" aria-label="Reset panorama view">↺</button>
        </div>
      </div>
      <p class="challenge-help">Select a hazard marker only when you believe it represents a genuine risk. Incorrect scene selections reduce the challenge score.</p>
    </section>

    <!-- ══════════════════════════════════════════════════════
         5 WHYS SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="screen fivewhys-screen" data-screen="fivewhys" aria-labelledby="fivewhys-title" hidden>
      <div class="section-heading" style="margin-bottom: 32px;">
        <p class="eyebrow">Root cause analysis</p>
        <h1 id="fivewhys-title">5 Whys — Find the Root Cause</h1>
        <p>An incident has occurred. Drill down through five layers of causation to identify the true root cause.</p>
      </div>
      <div id="fivewhys-incident-box" class="fivewhys-incident">
        <h2 id="fivewhys-incident-title">Incident: Worker slipped near the forklift bay</h2>
        <p id="fivewhys-incident-desc">A warehouse operative slipped on a wet floor in the forklift operating zone and suffered a minor injury. Investigate why this happened.</p>
      </div>
      <div id="fivewhys-chain" class="fivewhys-chain" aria-live="polite"></div>
      <div id="root-cause-reveal" class="root-cause-reveal" hidden>
        <h3>✅ Root Cause Identified</h3>
        <p id="root-cause-text"></p>
        <p id="root-cause-prevention" style="margin-top: 10px; color: var(--ink-soft);"></p>
        <button class="button button-primary" id="fivewhys-to-quiz" type="button" style="margin-top: 20px;">Continue to Knowledge Check →</button>
      </div>
      <div id="fivewhys-score-bar" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--glass-border);">
        <span style="color: var(--ink-soft); font-size: 0.85rem;">Score: <strong id="fivewhys-score" style="color: var(--orange);">0</strong> / 100</span>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════
         CYBER AWARENESS SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="screen cyber-screen" data-screen="cyber" aria-labelledby="cyber-title" hidden>
      <div class="section-heading" style="margin-bottom: 32px;">
        <p class="eyebrow">Cyber awareness</p>
        <h1 id="cyber-title">Defend Against Digital Threats</h1>
        <p>Work through five interactive cyber awareness challenges. Identify threats, apply safe behaviours, and protect your organisation.</p>
      </div>
      <!-- Sub-topic navigation pills -->
      <div class="cyber-subtopics" id="cyber-subtopics" role="tablist" aria-label="Cyber awareness sub-topics">
        <button class="cyber-topic-pill is-active" data-topic="fundamentals" role="tab" aria-selected="true" type="button">🔐 Fundamentals</button>
        <button class="cyber-topic-pill" data-topic="home-working" role="tab" aria-selected="false" type="button">🏠 Safe Home Working</button>
        <button class="cyber-topic-pill" data-topic="social-engineering" role="tab" aria-selected="false" type="button">🎭 Social Engineering</button>
        <button class="cyber-topic-pill" data-topic="mobile" role="tab" aria-selected="false" type="button">📱 Mobile Devices</button>
        <button class="cyber-topic-pill" data-topic="phishing" role="tab" aria-selected="false" type="button">🎣 Phishing</button>
      </div>
      <!-- Game area — populated by cyber engine -->
      <div id="cyber-game-area" aria-live="polite"></div>
      <div style="margin-top: 24px; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: var(--ink-soft); font-size: 0.85rem;">Topic score: <strong id="cyber-topic-score" style="color: var(--orange);">—</strong></span>
        <button class="button button-primary" id="cyber-next-btn" type="button" hidden>Next topic →</button>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════
         QUIZ SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="screen content-screen quiz-screen" data-screen="quiz" aria-labelledby="quiz-title" hidden>
      <div class="quiz-layout">
        <aside class="quiz-intro">
          <p class="eyebrow">Knowledge check</p>
          <h1 id="quiz-title">Turn observations into safer choices.</h1>
          <p>Your challenge is complete. Answer five short questions based on the safety principles you just explored.</p>
          <div class="quiz-progress-copy">
            <strong id="quiz-progress-text">Question 1 of 5</strong>
            <span id="quiz-score-preview">0 correct so far</span>
          </div>
          <progress id="quiz-progress" value="1" max="5"><span>Question 1 of 5</span></progress>
        </aside>
        <div class="quiz-card">
          <form id="quiz-form">
            <fieldset id="quiz-fieldset">
              <legend id="quiz-question">Loading question...</legend>
              <div id="quiz-options" class="quiz-options"></div>
            </fieldset>
            <div id="quiz-feedback" class="quiz-feedback" tabindex="-1" hidden></div>
            <div class="quiz-actions">
              <button class="button button-primary" id="submit-answer" type="submit">Check answer</button>
              <button class="button button-primary" id="next-question" type="button" hidden>Next question <span aria-hidden="true">→</span></button>
            </div>
          </form>
        </div>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════
         RESULTS SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="screen content-screen results-screen" data-screen="results" aria-labelledby="results-title" hidden>
      <div id="new-best-banner" class="new-best-banner" hidden aria-live="polite">
        🏆 New personal best! Keep pushing for Gold.
      </div>
      <div class="results-hero">
        <div id="rating-badge" class="rating-badge"><span>Your rating</span><strong id="rating-value">—</strong></div>
        <div>
          <p class="eyebrow">Training complete</p>
          <h1 id="results-title">Your safety snapshot</h1>
          <p id="results-summary">Calculating your result...</p>
        </div>
        <div class="overall-score"><strong id="overall-percent">—</strong><span>Overall learning score</span></div>
      </div>
      <!-- XP gain widget -->
      <div id="xp-gain-widget" class="xp-gain-widget" hidden>
        <div class="xp-gain-amount" id="xp-gain-amount">+0 XP</div>
        <div class="xp-gain-bar-wrap">
          <p class="xp-gain-label" id="xp-gain-label">XP Progress</p>
          <div class="xp-gain-bar-track">
            <div class="xp-gain-bar-fill" id="xp-gain-bar" style="--xp-from: 0%; --xp-to: 0%;"></div>
          </div>
        </div>
      </div>
      <section class="metrics-grid" aria-labelledby="metrics-title">
        <h2 id="metrics-title" class="visually-hidden">Training results</h2>
        <article><span>Hazards found</span><strong id="result-hazards">—</strong><small id="result-missed">—</small></article>
        <article><span>Challenge score</span><strong id="result-challenge">—</strong><small>Points</small></article>
        <article><span>Knowledge check</span><strong id="result-quiz">—</strong><small>Correct answers</small></article>
        <article><span>Active time</span><strong id="result-time">—</strong><small>Feedback pauses excluded</small></article>
        <article class="best-metric"><span>Personal best</span><strong id="result-best">—</strong><small>This module</small></article>
      </section>
      <div class="results-actions">
        <button class="button button-primary" id="review-mistakes" type="button">Review safety content</button>
        <button class="button button-secondary" id="retry-training" type="button">Retry training</button>
        <button class="button button-secondary" id="results-leaderboard-btn" type="button">🏆 Leaderboard</button>
        <button class="button button-text" id="clear-best" type="button">Clear best performance</button>
      </div>
      <p id="persistence-note" class="persistence-note">Results indicate training performance only and are not formal safety certification.</p>
    </section>

    <!-- ══════════════════════════════════════════════════════
         REVIEW SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="screen content-screen review-screen" data-screen="review" aria-labelledby="review-title" hidden>
      <div class="section-heading review-heading">
        <p class="eyebrow">Accessible review</p>
        <h1 id="review-title">Every hazard, explained in text.</h1>
        <p>Use this list to revisit missed items or access the essential learning without relying on the spatial 360-degree view.</p>
      </div>
      <div class="review-columns">
        <div>
          <h2>Warehouse hazards</h2>
          <ol id="hazard-review-list" class="review-list"></ol>
        </div>
        <div>
          <h2>Knowledge check review</h2>
          <div id="quiz-review-list" class="quiz-review-list"></div>
        </div>
      </div>
      <div class="results-actions">
        <button class="button button-primary" id="back-results" type="button">Back to results</button>
        <button class="button button-secondary" id="retry-from-review" type="button">Retry training</button>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════
         DASHBOARD SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="screen dashboard-screen" data-screen="dashboard" aria-labelledby="dashboard-title" hidden>
      <!-- Hero -->
      <div class="dashboard-hero">
        <div class="dashboard-avatar" id="dashboard-avatar" aria-hidden="true">?</div>
        <div class="dashboard-hero-info">
          <p class="dashboard-greeting">Your progress</p>
          <h1 class="dashboard-name" id="dashboard-title"><span id="dashboard-name">Welcome back</span></h1>
          <div class="dashboard-level-row">
            <span class="level-badge" id="dashboard-level">🌱 Rookie</span>
            <span class="streak-chip" id="dashboard-streak"><span class="streak-flame">🔥</span> 0-day streak</span>
          </div>
          <div class="dashboard-xp" id="dashboard-xp-section">
            <div class="dashboard-xp-label">
              <span id="dashboard-xp-current">0 XP</span>
              <span id="dashboard-xp-next">→ 500 XP for Apprentice</span>
            </div>
            <div class="dashboard-xp-track">
              <div class="dashboard-xp-fill" id="dashboard-xp-fill" style="width: 0%"></div>
            </div>
          </div>
        </div>
        <div>
          <button class="button button-primary" id="dashboard-start-btn" type="button">Start training →</button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="dashboard-stats" role="list" aria-label="Your statistics">
        <div class="stat-card" role="listitem">
          <span class="stat-value" id="stat-attempts">0</span>
          <span class="stat-label">Total attempts</span>
        </div>
        <div class="stat-card" role="listitem">
          <span class="stat-value" id="stat-best">—</span>
          <span class="stat-label">Best score</span>
        </div>
        <div class="stat-card" role="listitem">
          <span class="stat-value" id="stat-average">—</span>
          <span class="stat-label">Average score</span>
        </div>
        <div class="stat-card" role="listitem">
          <span class="stat-value" id="stat-badges">0</span>
          <span class="stat-label">Badges earned</span>
        </div>
      </div>

      <!-- Module progress map -->
      <div class="dashboard-section">
        <p class="dashboard-section-title">Module progress</p>
        <div class="module-progress-grid" id="dashboard-module-progress">
          <!-- Populated by JS -->
        </div>
      </div>

      <!-- Badges -->
      <div class="dashboard-section">
        <p class="dashboard-section-title">Achievements</p>
        <div class="badges-grid" id="dashboard-badges-grid" role="list" aria-label="Achievement badges">
          <!-- Populated by JS -->
        </div>
      </div>

      <!-- Recent attempts -->
      <div class="dashboard-section">
        <p class="dashboard-section-title">Recent activity</p>
        <div style="background: var(--glass); border: 1px solid var(--glass-border); border-radius: var(--radius-sm); overflow: hidden;">
          <table class="attempts-table" aria-label="Recent training attempts">
            <thead>
              <tr>
                <th>Date</th>
                <th>Module</th>
                <th>Score</th>
                <th>Rating</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody id="dashboard-attempts-table">
              <tr><td colspan="5" style="text-align:center; color: var(--ink-muted); padding: 24px;">No attempts yet. Start your first training!</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="display: flex; gap: 14px; margin-top: 16px;">
        <button class="button button-primary" id="dashboard-arena-btn" type="button">⚔ 1v1 Arena</button>
        <button class="button button-ghost" id="dashboard-leaderboard-btn" type="button">🏆 View leaderboard</button>
        <button class="button button-ghost" id="dashboard-home-btn" type="button">← Home</button>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════
         LEADERBOARD SCREEN
         ══════════════════════════════════════════════════════ -->
    <section class="screen arena-screen" data-screen="arena" aria-labelledby="arena-title" hidden>
      <div class="arena-header">
        <div>
          <p class="eyebrow">Head-to-head training</p>
          <h1 id="arena-title">1v1 Safety Arena</h1>
          <p>Challenge another trainee on the same module and compare verified scores.</p>
        </div>
        <button class="button button-ghost" id="arena-back-btn" type="button">← Training hub</button>
      </div>
      <div class="arena-actions-grid">
        <article class="arena-action-card">
          <span class="arena-step">01</span><h2>Create a challenge</h2>
          <p>Choose a module, create a private code, and send it to your opponent.</p>
          <label class="form-label" for="arena-module-select">Challenge module</label>
          <select class="form-input" id="arena-module-select">
            <option value="warehouse-hazard-hunt">Warehouse Hazard Hunt</option><option value="manual-handling">Manual Handling</option>
            <option value="working-at-height">Working at Height</option><option value="five-whys">5 Whys — Root Cause</option>
            <option value="unsafe-acts">Unsafe Acts</option><option value="cyber-awareness">Cyber Awareness</option>
          </select>
          <button class="button button-primary" id="arena-create-btn" type="button">Create challenge</button>
          <div class="arena-code-result" id="arena-code-result" hidden><span>Share this code</span><strong id="arena-created-code">—</strong><button class="button button-secondary button-sm" id="arena-copy-btn" type="button">Copy code</button></div>
        </article>
        <article class="arena-action-card">
          <span class="arena-step">02</span><h2>Join a challenge</h2>
          <p>Enter the eight-character code received from another registered trainee.</p>
          <label class="form-label" for="arena-join-code">Challenge code</label>
          <input class="form-input arena-code-input" id="arena-join-code" maxlength="8" autocomplete="off" placeholder="E.g. A1B2C3D4">
          <button class="button button-primary" id="arena-join-btn" type="button">Join challenge</button>
          <p class="arena-message" id="arena-message" role="status" hidden></p>
        </article>
      </div>
      <div class="arena-list-section">
        <div class="arena-list-heading"><div><p class="eyebrow">Your matches</p><h2>Active and recent challenges</h2></div><button class="button button-ghost button-sm" id="arena-refresh-btn" type="button">Refresh</button></div>
        <div class="arena-list" id="arena-list" aria-live="polite"><p>Loading challenges…</p></div>
      </div>
    </section>

    <section class="screen leaderboard-screen" data-screen="leaderboard" aria-labelledby="leaderboard-title" hidden>
      <div class="leaderboard-header">
        <p class="eyebrow">Global rankings</p>
        <h1 id="leaderboard-title">Safety Champions</h1>
        <p>Top performers across all training modules. Sign in to see your rank.</p>
      </div>
      <!-- Period tabs -->
      <div class="leaderboard-tabs" role="tablist" aria-label="Leaderboard time period">
        <button class="lb-tab is-active" data-period="all-time" role="tab" aria-selected="true" type="button">All time</button>
        <button class="lb-tab" data-period="weekly" role="tab" aria-selected="false" type="button">This week</button>
        <button class="lb-tab" data-period="daily" role="tab" aria-selected="false" type="button">Today</button>
      </div>
      <!-- Leaderboard list -->
      <div class="leaderboard-table" id="leaderboard-list" aria-live="polite" aria-label="Leaderboard rankings">
        <div style="padding: 32px; text-align: center; color: var(--ink-muted);">Loading leaderboard...</div>
      </div>
      <!-- User rank (if logged in and not in top 10) -->
      <div id="user-rank-card" hidden style="margin-top: 16px; padding: 16px 24px; background: rgba(255,107,43,0.06); border: 1px solid rgba(255,107,43,0.2); border-radius: var(--radius-sm);">
        <span style="font-size: 0.8rem; color: var(--ink-soft);">Your rank: </span>
        <strong id="user-rank-number" style="color: var(--orange);">—</strong>
      </div>
      <!-- Daily challenge card -->
      <div class="daily-challenge-card">
        <h3>⚡ Daily Challenge</h3>
        <p style="color: var(--ink-soft); margin: 6px 0 16px; font-size: 0.9rem;">Today's challenge resets in <strong id="daily-reset-timer" style="color: var(--cyan);">—</strong>. Compete with everyone on identical conditions.</p>
        <button class="button button-primary button-sm" id="daily-challenge-btn" type="button">Take the daily challenge →</button>
      </div>
      <div style="margin-top: 24px;">
        <button class="button button-ghost" id="leaderboard-back-btn" type="button">← Back</button>
      </div>
    </section>

  </main>

  <!-- ── Feedback Dialog (hazard found) ────────────────────── -->
  <dialog id="feedback-dialog" class="feedback-dialog" aria-labelledby="feedback-title">
    <div class="feedback-icon" aria-hidden="true">✓</div>
    <p class="eyebrow">Hazard identified</p>
    <h2 id="feedback-title">Correct finding</h2>
    <p id="feedback-copy"></p>
    <button class="button button-primary" id="continue-challenge" type="button">Continue inspection →</button>
  </dialog>

  <!-- ── Live status (screen reader announcements) ─────────── -->
  <div id="live-status" role="status" aria-live="polite" aria-atomic="true"></div>

  <script src="/vendor/marzipano/marzipano.js"></script>
  <script type="module" src="/assets/js/gamification.js"></script>
  <script type="module" src="/assets/js/modules.js"></script>
  <script type="module" src="/assets/js/five-whys-engine.js"></script>
  <script type="module" src="/assets/js/cyber-engine.js"></script>
  <script type="module" src="/assets/js/app.js"></script>
</body>
</html>
