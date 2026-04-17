'use strict';

// ─── Category Names ───────────────────────────────────────────────────────────
const CATEGORY_NAMES = {
  all:                'Todas las categorías',
  actions:            'Acciones',
  animals:            'Animales',
  body:               'Cuerpo humano',
  clothes:            'Ropa',
  colours:            'Colores',
  descriptions:       'Descripciones',
  family_and_friends: 'Familia y amigos',
  feelings:           'Sentimientos',
  food_and_drink:     'Comida y bebida',
  general:            'General',
  grammar:            'Gramática',
  miscellaneous:      'Miscelánea',
  numbers_and_time:   'Números y tiempo',
  places:             'Lugares',
  school:             'Colegio',
  sports_and_leisure: 'Deportes y ocio',
  the_home:           'El hogar',
  toys_and_technology:'Juguetes y tecnología',
  transport:          'Transporte',
  weather_and_nature: 'Tiempo y naturaleza',
  work:               'Trabajo',
};

// ─── Words Cache ──────────────────────────────────────────────────────────────
const WordsCache = {};

async function fetchWordsForLevel(level) {
  if (WordsCache[level]) return WordsCache[level];
  const r = await fetch(`/api/words?level=${encodeURIComponent(level)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  WordsCache[level] = await r.json();
  return WordsCache[level];
}

function getWordsForLevel(level) {
  return WordsCache[level] || [];
}

function getWordsForLevelAndCategory(level, category) {
  const words = getWordsForLevel(level);
  if (category === 'all') return words;
  return words.filter(w => w.category === category);
}

function getCategoriesForLevel(level) {
  const words = getWordsForLevel(level);
  const cats = [...new Set(words.map(w => w.category))].sort();
  return ['all', ...cats];
}

// ─── Audio Engine ──────────────────────────────────────────────────────────────
const Audio = {
  ctx: null,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },
  tone(freq, dur, type = 'sine', vol = 0.25) {
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + dur);
  },
  playCorrect() {
    this.tone(523.25, 0.12); // C5
    setTimeout(() => this.tone(659.25, 0.12), 120);
    setTimeout(() => this.tone(783.99, 0.35), 240);
  },
  playWrong() {
    this.tone(220, 0.12, 'sawtooth', 0.3);
    setTimeout(() => this.tone(185, 0.4, 'sawtooth', 0.3), 130);
  },
  playLifeline() {
    this.tone(880, 0.1);
    setTimeout(() => this.tone(1046, 0.2), 120);
  },
  playTick() {
    this.tone(1200, 0.06, 'square', 0.1);
  },
  playWin() {
    const fanfare = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    fanfare.forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'sine', 0.3), i * 130));
  },
  playSafe() {
    this.tone(659.25, 0.15);
    setTimeout(() => this.tone(880, 0.15), 150);
    setTimeout(() => this.tone(1046.50, 0.4), 300);
  }
};

// ─── Cookie Helper (solo preferencias de juego) ───────────────────────────────
const Cookie = {
  get(key) {
    const m = document.cookie.match('(^| )' + key + '=([^;]+)');
    if (m) try { return JSON.parse(decodeURIComponent(m[2])); } catch { return null; }
    return null;
  },
  set(key, val, days = 365) {
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${key}=${encodeURIComponent(JSON.stringify(val))}; expires=${exp}; path=/; SameSite=Lax`;
  }
};
const COOKIE_NAME = 'voc_prefs';

function loadPrefs() {
  const p = Cookie.get(COOKIE_NAME);
  if (!p) return;
  if (p.level)         State.level         = p.level;
  if (p.mode)          State.mode          = p.mode;
  if (p.category)      State.category      = p.category;
  if (p.challengeType) State.challengeType = p.challengeType;
}

function savePrefs() {
  Cookie.set(COOKIE_NAME, {
    level:         State.level,
    mode:          State.mode,
    category:      State.category,
    challengeType: State.challengeType
  });
}

// ─── Auth (Google) ────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '766212808659-7krp4oj0n0lf2584ntalksa1m9el5iqi.apps.googleusercontent.com';

const Auth = {
  token: null,
  user:  null,
  init() {
    try {
      const stored = JSON.parse(localStorage.getItem('voc_auth') || 'null');
      if (stored?.token && stored?.user) {
        this.token = stored.token;
        this.user  = stored.user;
      }
    } catch { this.clear(); }
  },
  save(token, user) {
    this.token = token;
    this.user  = user;
    localStorage.setItem('voc_auth', JSON.stringify({ token, user }));
  },
  clear() {
    this.token = null;
    this.user  = null;
    localStorage.removeItem('voc_auth');
  },
  isLoggedIn() { return !!this.token; }
};

function initGoogleSignIn() {
  google.accounts.id.initialize({
    client_id:   GOOGLE_CLIENT_ID,
    callback:    handleGoogleLogin,
    auto_select: false,
  });
  renderGoogleButton();
}

function renderGoogleButton() {
  const container = document.getElementById('google-signin-btn');
  if (!container || typeof google === 'undefined') return;
  google.accounts.id.renderButton(container, {
    theme: 'filled_blue', size: 'large',
    text: 'sign_in_with', shape: 'rectangular', width: 280,
  });
}

function handleGoogleLogin(response) {
  fetch('/api/auth/google', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ credential: response.credential }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      Auth.save(data.token, { name: data.name, email: data.email, picture: data.picture });
      State.playerName = data.name;
      updateHomeUI();
    })
    .catch(e => alert('Error al iniciar sesión: ' + e.message));
}

function logout() {
  if (!confirm('¿Cerrar sesión?')) return;
  Auth.clear();
  State.playerName = '';
  updateHomeUI();
  renderGoogleButton();
}

function updateHomeUI() {
  const loggedIn = Auth.isLoggedIn();
  document.getElementById('home-loggedout').style.display = loggedIn ? 'none' : 'block';
  document.getElementById('home-loggedin').style.display  = loggedIn ? 'flex'  : 'none';
  document.getElementById('btn-play').style.display       = loggedIn ? ''      : 'none';
  document.getElementById('btn-profile').style.display    = loggedIn ? ''      : 'none';
  if (loggedIn) {
    document.getElementById('user-name').textContent  = Auth.user.name;
    document.getElementById('user-avatar').src        = Auth.user.picture;
    document.getElementById('user-avatar').alt        = Auth.user.name;
  }
}

// ─── Game State ────────────────────────────────────────────────────────────────
const State = {
  level: 'A1',
  mode: 'en-es',
  category: 'all',
  challengeType: '10',
  questions: [],
  currentIndex: 0,
  currentPrize: 0,
  lives: 3,
  score: 0,
  streak: 0,
  lifelines: { fifty: true, audience: true, expert: true },
  safeZonePrize: 0,
  eliminatedOptions: [],
  answering: false,
  playerName: '',
  totalCorrect: 0,
  totalAnswered: 0,
  hofFilter: 'global'
};

// Dynamic prize ladder: €10 increments per question, accumulates across phases
const SAFE_ZONES = [3, 6]; // 0-indexed positions within each phase

function getPhasePrizes(phase) {
  const base = phase * 100;
  return Array.from({ length: 10 }, (_, i) => base + (i + 1) * 10);
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showHome() { showScreen('screen-home'); }
async function showSetup() {
  try {
    const counts = await fetch('/api/levels').then(r => r.ok ? r.json() : {}).catch(() => ({}));
    document.querySelectorAll('.level-btn').forEach(btn => {
      const lvl = btn.dataset.level;
      const n = counts[lvl] || 0;
      btn.disabled = n < 10;
      btn.title = n < 10 ? 'Próximamente' : '';
      btn.innerHTML = `<span class="btn-label">${lvl}</span><span class="btn-count">${n > 0 ? n : '—'}</span>`;
    });
    if ((counts[State.level] || 0) < 10) {
      const first = Object.keys(counts).find(l => counts[l] >= 10);
      if (first) State.level = first;
    }
    await fetchWordsForLevel(State.level);
    populateCategories();
    updateSetupUI();
  } catch (e) {
    console.error('[showSetup]', e);
  }
  showScreen('screen-setup');
}
function showHallOfFame() { displayHallOfFame(); showScreen('screen-halloffame'); }

// ─── Setup ────────────────────────────────────────────────────────────────────
function setMode(mode) {
  State.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
}
async function setLevel(level) {
  State.level = level;
  document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-level="${level}"]`).classList.add('active');
  await fetchWordsForLevel(level);
  populateCategories();
  State.category = 'all';
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  const allBtn = document.querySelector('[data-cat="all"]');
  if (allBtn) allBtn.classList.add('active');
}
function setCategory(cat) {
  State.category = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-cat="${cat}"]`).classList.add('active');
}
function setChallenge(type) {
  State.challengeType = type;
  activateChallenge(type);
}

function populateCategories() {
  const cats = getCategoriesForLevel(State.level);
  const words = getWordsForLevel(State.level);
  const container = document.getElementById('cat-container');
  container.innerHTML = '';
  cats.forEach(cat => {
    const n = cat === 'all' ? words.length : words.filter(w => w.category === cat).length;
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (cat === State.category ? ' active' : '');
    btn.dataset.cat = cat;
    btn.innerHTML = `${CATEGORY_NAMES[cat] || cat} <span class="cat-count">${n}</span>`;
    btn.onclick = () => setCategory(cat);
    container.appendChild(btn);
  });
}

// IDs of the four challenge buttons — only one should ever be active
const CHALLENGE_BTN_IDS = ['ch-10', 'ch-100', 'ch-1000', 'ch-infinite'];

function activateChallenge(type) {
  CHALLENGE_BTN_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'ch-' + type) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
  console.log('[VOC] activateChallenge →', type,
    CHALLENGE_BTN_IDS.map(id => id + ':' + document.getElementById(id)?.classList.contains('active')));
}

function updateSetupUI() {
  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-mode="${State.mode}"]`)?.classList.add('active');

  // Level buttons
  document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-level="${State.level}"]`)?.classList.add('active');

  // Challenge buttons — uses explicit ID-based function
  activateChallenge(State.challengeType);
}

// ─── Game Init ────────────────────────────────────────────────────────────────
async function startGame() {
  Audio.init();
  savePrefs();
  await fetchWordsForLevel(State.level);
  const pool = getWordsForLevelAndCategory(State.level, State.category);
  if (pool.length < 4) {
    alert('¡No hay suficientes palabras en esta categoría y nivel! Prueba con "Todas las categorías".');
    return;
  }
  State.questions = shuffleArray([...pool]);
  State.currentIndex = 0;
  State.currentPrize = 0;
  State.totalPrize   = 0;
  State.lives = 3;
  State.score = 0;
  State.streak = 0;
  State.maxStreak = 0;
  State.lifelines = { fifty: true, audience: true, expert: true };
  State.safeZonePrize = 0;
  State.eliminatedOptions = [];
  State.answering = false;
  State.totalCorrect = 0;
  State.totalAnswered = 0;

  updateLifelineUI();
  buildPrizeLadder();
  updateLivesDisplay();
  showScreen('screen-game');
  loadQuestion();
}

// ─── Question Engine ──────────────────────────────────────────────────────────
function loadQuestion() {
  if (State.challengeType === '10' && State.currentIndex >= 10) {
    winGame(); return;
  }
  if (State.challengeType !== '10' && State.lives <= 0) {
    endGame(); return;
  }

  // Reshuffle pool if exhausted (phase modes cycle through questions)
  const qIdx = State.currentIndex % State.questions.length;
  if (qIdx === 0 && State.currentIndex > 0) {
    State.questions = shuffleArray([...getWordsForLevelAndCategory(State.level, State.category)]);
  }

  // Refresh ladder prices at start of each new phase
  if (State.challengeType !== '10' && State.currentIndex % 10 === 0) {
    refreshLadderPrizes(Math.floor(State.currentIndex / 10));
  }

  const word = State.questions[State.challengeType === '10' ? State.currentIndex : qIdx];
  State.eliminatedOptions = [];
  State.answering = false;

  const options = generateOptions(word);
  displayQuestion(word, options);
  updatePrizeLadder();
  updateQuestionCounter();
}

function generateOptions(word) {
  const needSameCat = State.category !== 'all' || word.category === 'actions';
  const allWords = getWordsForLevel(State.level).filter(w => w.word !== word.word);
  const pool = needSameCat ? allWords.filter(w => w.category === word.category) : allWords;
  const distractors = shuffleArray(pool).slice(0, 3);

  // If not enough distractors, pull from adjacent levels (same category if required)
  if (distractors.length < 3) {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    for (const lvl of levels) {
      if (lvl === State.level) continue;
      const extra = getWordsForLevel(lvl)
        .filter(w => w.word !== word.word && (!needSameCat || w.category === word.category));
      distractors.push(...shuffleArray(extra).slice(0, 3 - distractors.length));
      if (distractors.length >= 3) break;
    }
  }

  // Last resort fallback: any category
  if (distractors.length < 3) {
    const used = new Set(distractors.map(w => w.word));
    const extra = allWords.filter(w => !used.has(w.word));
    distractors.push(...shuffleArray(extra).slice(0, 3 - distractors.length));
  }

  const allOptions = [word, ...distractors.slice(0, 3)];
  const shuffled = shuffleArray(allOptions);
  const correctIndex = shuffled.findIndex(o => o.word === word.word);
  return { options: shuffled, correctIndex };
}

function displayQuestion(word, { options, correctIndex }) {
  State.currentOptions = options;
  State.currentCorrectIndex = correctIndex;

  // Word display
  const isEnToEs = State.mode === 'en-es';
  const questionText = isEnToEs ? word.word : word.translation;
  const showIPA = isEnToEs;

  document.getElementById('word-text').textContent = questionText;
  document.getElementById('ipa-uk').textContent = showIPA ? word.uk_ipa : '';
  document.getElementById('ipa-us').textContent = showIPA ? word.us_ipa : '';
  document.getElementById('ipa-row').style.display = showIPA ? 'flex' : 'none';
  document.getElementById('audio-row').style.display = showIPA ? 'flex' : 'none';
  State.currentWord = word;

  const labels = ['A', 'B', 'C', 'D'];
  const card  = document.getElementById('question-card');

  // Reset buttons — direct class reset, no opacity animation so GPU layer is never stale
  options.forEach((opt, i) => {
    const btn = document.getElementById(`answer-${labels[i]}`);
    btn.className = 'answer-btn';
    btn.disabled  = false;
    btn.querySelector('.answer-label').textContent = labels[i];
    btn.querySelector('.answer-text').textContent  = isEnToEs ? opt.translation : opt.word;
  });

  // Animate card with transform only — no opacity, no GPU compositing layer,
  // so the button reset is always visible immediately and never bleeds through
  card.getAnimations().forEach(a => a.cancel());
  card.animate(
    [{ transform: 'scale(0.96) translateY(12px)' },
     { transform: 'scale(1)    translateY(0)'    }],
    { duration: 300, easing: 'ease-out', fill: 'forwards' }
  );
}

function selectAnswer(index) {
  if (State.answering || State.eliminatedOptions.includes(index)) return;
  State.answering = true;

  const labels = ['A', 'B', 'C', 'D'];
  const btn = document.getElementById(`answer-${labels[index]}`);
  btn.classList.add('selected');

  // Disable all
  labels.forEach(l => { const b = document.getElementById(`answer-${l}`); b.disabled = true; });

  // Dramatic pause, then reveal
  setTimeout(() => revealAnswer(index), 900);
}

function revealAnswer(selectedIndex) {
  const labels = ['A', 'B', 'C', 'D'];
  const isCorrect = selectedIndex === State.currentCorrectIndex;

  document.getElementById(`answer-${labels[State.currentCorrectIndex]}`).classList.add('correct');

  const isPhaseMode = State.challengeType !== '10';
  const pos = isPhaseMode ? State.currentIndex % 10 : State.currentIndex;

  if (isCorrect) {
    document.getElementById(`answer-${labels[selectedIndex]}`).classList.add('correct');
    Audio.playCorrect();
    State.totalCorrect++;
    State.streak++;
    if (State.streak > State.maxStreak) State.maxStreak = State.streak;

    const prizes = getPhasePrizes(Math.floor(State.currentIndex / 10));
    State.currentPrize = prizes[pos];
    if (SAFE_ZONES.includes(pos)) {
      State.safeZonePrize = State.currentPrize;
      setTimeout(() => Audio.playSafe(), 400);
    }
    updatePrizeDisplay();
    updatePrizeLadder();

    State.currentIndex++;
    State.totalAnswered++;

    if (isPhaseMode && State.currentIndex % 10 === 0) {
      // Phase complete — add full prize and start next phase
      State.totalPrize += prizes[9];
      State.safeZonePrize = 0;
      State.currentPrize  = 0;
      updateTotalPrizeDisplay();
      const phasesDone = State.currentIndex / 10;
      const maxPhases  = State.challengeType === '100' ? 10 : State.challengeType === '1000' ? 100 : Infinity;
      setTimeout(() => { if (phasesDone >= maxPhases) winGame(); else loadQuestion(); }, 1500);
    } else {
      setTimeout(() => loadQuestion(), 1500);
    }
  } else {
    document.getElementById(`answer-${labels[selectedIndex]}`).classList.add('wrong');
    Audio.playWrong();
    State.streak = 0;
    State.totalAnswered++;

    State.currentPrize = State.safeZonePrize;
    updatePrizeDisplay();
    updatePrizeLadder();

    if (!isPhaseMode) {
      setTimeout(() => endGame(), 1800);
    } else {
      // Phase fail — lock safe zone into total, move to next phase
      State.totalPrize += State.safeZonePrize;
      updateTotalPrizeDisplay();
      State.lives--;
      updateLivesDisplay();
      if (State.lives <= 0) {
        setTimeout(() => endGame(), 1800);
      } else {
        State.currentIndex  = (Math.floor(State.currentIndex / 10) + 1) * 10;
        State.safeZonePrize = 0;
        State.currentPrize  = 0;
        setTimeout(() => loadQuestion(), 1800);
      }
    }
  }
}

// ─── Lifelines ────────────────────────────────────────────────────────────────
function useLifeline(type) {
  if (!State.lifelines[type] || State.answering) return;
  State.lifelines[type] = false;
  Audio.playLifeline();
  updateLifelineUI();

  if (type === 'fifty') useFiftyFifty();
  else if (type === 'audience') useAudience();
  else if (type === 'expert') useExpert();
}

function useFiftyFifty() {
  const labels = ['A', 'B', 'C', 'D'];
  const wrongIndices = [0, 1, 2, 3].filter(i => i !== State.currentCorrectIndex);
  const toEliminate = shuffleArray(wrongIndices).slice(0, 2);
  toEliminate.forEach(i => {
    State.eliminatedOptions.push(i);
    const btn = document.getElementById(`answer-${labels[i]}`);
    btn.classList.add('eliminated');
    btn.disabled = true;
  });
}

function useAudience() {
  const percentages = generateAudienceData(State.currentCorrectIndex);
  const labels = ['A', 'B', 'C', 'D'];
  const modal = document.getElementById('modal-audience');
  const chart = document.getElementById('audience-chart');
  chart.innerHTML = '';
  labels.forEach((l, i) => {
    const bar = document.createElement('div');
    bar.className = 'audience-bar-wrap';
    bar.innerHTML = `
      <span class="audience-label">${l}</span>
      <div class="audience-bar">
        <div class="audience-fill" style="--pct:${percentages[i]}%"></div>
      </div>
      <span class="audience-pct">${percentages[i]}%</span>`;
    chart.appendChild(bar);
  });
  // Animate bars after a tick
  setTimeout(() => {
    chart.querySelectorAll('.audience-fill').forEach(f => f.classList.add('animated'));
  }, 100);
  openModal('modal-audience');
}

function useExpert() {
  const labels = ['A', 'B', 'C', 'D'];
  const correctLabel = labels[State.currentCorrectIndex];
  const correctText = State.currentOptions[State.currentCorrectIndex];
  const answer = State.mode === 'en-es' ? correctText.translation : correctText.word;
  const msgs = [
    `Mmm, déjame pensar... Yo diría que la respuesta es la <strong>${correctLabel}: "${answer}"</strong>. Estoy bastante seguro.`,
    `¡Claro! Conozco esta. Es la <strong>${correctLabel}: "${answer}"</strong>, sin ninguna duda.`,
    `A ver... creo que es la <strong>${correctLabel}: "${answer}"</strong>. Sí, eso es lo que recuerdo.`,
    `Esta es buena. La respuesta correcta es <strong>${correctLabel}: "${answer}"</strong>. ¡Confía en mí!`
  ];
  document.getElementById('expert-message').innerHTML = msgs[Math.floor(Math.random() * msgs.length)];
  openModal('modal-expert');
}

function generateAudienceData(correctIndex) {
  const pct = Array(4).fill(0);
  const correctPct = 55 + Math.floor(Math.random() * 30); // 55-85%
  pct[correctIndex] = correctPct;
  const remaining = 100 - correctPct;
  const others = [0, 1, 2, 3].filter(i => i !== correctIndex);
  const a = Math.floor(Math.random() * (remaining - 2)) + 1;
  const b = Math.floor(Math.random() * (remaining - a - 1)) + 1;
  const c = remaining - a - b;
  [a, b, c].sort((x, y) => y - x).forEach((v, i) => { pct[others[i]] = v; });
  // Normalise
  const total = pct.reduce((s, v) => s + v, 0);
  pct[correctIndex] += 100 - total;
  return pct;
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById('overlay').classList.add('active');
  document.getElementById(id).classList.add('active');
}
function closeModal() {
  document.getElementById('overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// ─── Prize Ladder ─────────────────────────────────────────────────────────────
function buildLadderItems(container, prizes) {
  const reversed = prizes.slice().reverse();
  reversed.forEach((prize, i) => {
    const idx = prizes.length - 1 - i;
    const div = document.createElement('div');
    div.className = 'ladder-item';
    div.id = `ladder-${idx}`;
    if (SAFE_ZONES.includes(idx)) div.classList.add('safe');
    div.innerHTML = `<span class="ladder-num">${idx + 1}</span><span class="ladder-prize">${formatPrize(prize)}</span>`;
    container.appendChild(div);
  });
}

function refreshLadderPrizes(phase) {
  const prizes = getPhasePrizes(phase);
  prizes.forEach((prize, i) => {
    const el = document.getElementById(`ladder-${i}`);
    if (el) el.querySelector('.ladder-prize').textContent = formatPrize(prize);
  });
}

function buildPrizeLadder() {
  const ladder = document.getElementById('prize-ladder');
  ladder.innerHTML = '';
  ladder.classList.remove('has-phases');

  if (State.challengeType !== '10') {
    ladder.classList.add('has-phases');
    const header = document.createElement('div');
    header.className = 'score-panel phase-score';
    header.innerHTML = `
      <div class="score-label">FASE <span id="phase-number">1</span></div>
      <div id="lives-row" class="lives-row"></div>
      <div class="score-label" style="margin-top:6px">TOTAL</div>
      <div id="total-prize-value" class="score-value" style="font-size:1.1rem">€0</div>`;
    ladder.appendChild(header);
    const divider = document.createElement('div');
    divider.className = 'phase-divider';
    ladder.appendChild(divider);
    buildLadderItems(ladder, getPhasePrizes(0));
    updateLivesDisplay();
    return;
  }

  buildLadderItems(ladder, getPhasePrizes(0));
}

function updatePrizeLadder() {
  const pos = State.challengeType === '10' ? State.currentIndex : State.currentIndex % 10;
  for (let i = 0; i < 10; i++) {
    const el = document.getElementById(`ladder-${i}`);
    if (!el) continue;
    el.classList.remove('current', 'reached');
    if (i < pos) el.classList.add('reached');
    if (i === pos) el.classList.add('current');
  }
  updatePrizeDisplay();
  if (State.challengeType !== '10') {
    const phaseEl = document.getElementById('phase-number');
    if (phaseEl) phaseEl.textContent = Math.floor(State.currentIndex / 10) + 1;
  }
}

function updateTotalPrizeDisplay() {
  const el = document.getElementById('total-prize-value');
  if (el) el.textContent = formatPrize(State.totalPrize);
}

function updatePrizeDisplay() {
  const el = document.getElementById('current-prize');
  if (el) el.textContent = formatPrize(State.currentPrize);
}

function updateScoreDisplay() {
  const el = document.getElementById('score-value');
  if (el) el.textContent = State.score.toLocaleString('es-ES');
  const streakEl = document.getElementById('streak-count');
  if (streakEl) streakEl.textContent = State.streak;
}

function updateLivesDisplay() {
  const el = document.getElementById('lives-row');
  if (!el) return;
  el.innerHTML = '❤️'.repeat(State.lives) + '🖤'.repeat(3 - State.lives);
}

function updateQuestionCounter() {
  const el = document.getElementById('question-number');
  if (!el) return;
  if (State.challengeType === '10') {
    el.textContent = `Pregunta ${State.currentIndex + 1} de 10`;
  } else {
    const phase    = Math.floor(State.currentIndex / 10) + 1;
    const posLabel = (State.currentIndex % 10) + 1;
    const totalLabel = State.challengeType === '100' ? '/10' : State.challengeType === '1000' ? '/100' : '';
    el.textContent = `Fase ${phase}${totalLabel} · Pregunta ${posLabel}/10`;
  }
}

function updateLifelineUI() {
  const map = { fifty: 'lifeline-fifty', audience: 'lifeline-audience', expert: 'lifeline-expert' };
  Object.entries(map).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('used', !State.lifelines[key]);
  });
}

// ─── Audio Pronunciation ──────────────────────────────────────────────────────
function playAudio(dialect) {
  if (!State.currentWord) return;
  const lang = dialect === 'uk' ? 'en-GB' : 'en-US';
  const utterance = new SpeechSynthesisUtterance(State.currentWord.word);
  utterance.lang = lang;
  utterance.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

// ─── Game Over / Win ──────────────────────────────────────────────────────────
function winGame() {
  Audio.playWin();
  launchConfetti();
  if (State.challengeType === '10') {
    State.currentPrize = getPhasePrizes(0)[9];
    showResultScreen(true, '🏆 ¡GANASTE!', `¡Increíble! Has completado el reto.`, State.currentPrize);
  } else {
    const phases = State.currentIndex / 10;
    showResultScreen(true, '🏆 ¡GANASTE!', `¡Has completado las ${phases} fases!`, State.totalPrize);
  }
}

function endGame() {
  let title, msg, prize;
  if (State.challengeType === '10') {
    const reached = State.safeZonePrize;
    title = reached > 0 ? '💔 ¡Fallaste!' : '💔 ¡Lo siento!';
    msg = reached > 0
      ? `Has fallado, pero te llevas ${formatPrize(reached)} de zona segura.`
      : 'Has fallado antes de llegar a una zona segura. Te vas con cero.';
    prize = reached;
  } else {
    title = State.lives <= 0 ? '💔 ¡Sin vidas!' : '🏁 ¡Reto completado!';
    const phases = Math.floor(State.currentIndex / 10);
    msg = `${phases} fase${phases !== 1 ? 's' : ''} completada${phases !== 1 ? 's' : ''} · ${State.totalCorrect}/${State.totalAnswered} correctas`;
    prize = State.totalPrize;
  }
  showResultScreen(false, title, msg, prize);
}

function saveGameStats(prize) {
  if (!Auth.isLoggedIn()) return;
  fetch('/api/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Auth.token}` },
    body: JSON.stringify({
      level:      State.level,
      mode:       State.mode === 'en-es' ? 'EN→ES' : 'ES→EN',
      challenge:  `Reto ${State.challengeType === 'infinite' ? '∞' : State.challengeType}`,
      category:   State.category,
      prize:      prize,
      correct:    State.totalCorrect,
      total:      State.totalAnswered,
      max_streak: State.maxStreak,
    }),
  }).catch(e => console.error('[stats]', e));
}

function showResultScreen(won, title, msg, prize) {
  saveGameStats(prize);
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-message').textContent = msg;
  document.getElementById('result-score').textContent = `Premio: ${formatPrize(prize)}`;

  const saveSection = document.getElementById('hof-save-section');
  const saveInfo    = document.getElementById('hof-save-info');
  const saveBtn     = saveSection.querySelector('.btn-primary');
  saveBtn.disabled    = false;
  saveBtn.textContent = '🏆 Guardar en Hall of Fame';

  if (Auth.isLoggedIn()) {
    saveInfo.textContent      = `Como: ${Auth.user.name}`;
    saveSection.style.display = 'block';
  } else {
    saveSection.style.display = 'none';
  }
  showScreen('screen-result');
}

function saveToHallOfFame() {
  if (!Auth.isLoggedIn()) { alert('Inicia sesión con Google para guardar'); return; }

  const entry = {
    level:     State.level,
    mode:      State.mode === 'en-es' ? 'EN→ES' : 'ES→EN',
    challenge: `Reto ${State.challengeType === 'infinite' ? '∞' : State.challengeType}`,
    category:  CATEGORY_NAMES[State.category] || State.category,
    score:     State.challengeType === '10' ? State.currentPrize : State.totalPrize,
    correct:   State.totalCorrect,
    total:     State.totalAnswered,
  };

  const btn = document.querySelector('#hof-save-section .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  fetch('/api/hof', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${Auth.token}`,
    },
    body: JSON.stringify(entry),
  })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(() => {
      document.getElementById('hof-save-section').style.display = 'none';
      alert(`¡Puntuación guardada en el Hall of Fame!`);
    })
    .catch(err => {
      console.error('[HOF] Error al guardar:', err);
      alert('No se pudo guardar. Inténtalo de nuevo.');
      if (btn) { btn.disabled = false; btn.textContent = '🏆 Guardar en Hall of Fame'; }
    });
}

// ─── Profile ──────────────────────────────────────────────────────────────────
const _charts = {};

function destroyCharts() {
  Object.keys(_charts).forEach(k => { _charts[k].destroy(); delete _charts[k]; });
}

async function showProfile() {
  if (!Auth.isLoggedIn()) return;
  document.getElementById('profile-name').textContent   = Auth.user.name;
  document.getElementById('profile-avatar').src         = Auth.user.picture;
  showScreen('screen-profile');

  const { sessions = [], categoryCounts = {} } = await fetch('/api/stats', {
    headers: { 'Authorization': `Bearer ${Auth.token}` }
  }).then(r => r.json()).catch(() => ({}));

  renderProfileStats(sessions);
  destroyCharts();
  renderChartHistory(sessions);
  renderChartCategories(sessions, categoryCounts);
  renderChartLevels(sessions);
}

function renderProfileStats(sessions) {
  const total   = sessions.length;
  const best    = total ? Math.max(...sessions.map(s => s.prize)) : 0;
  const correct = sessions.reduce((a, s) => a + s.correct, 0);
  const answered= sessions.reduce((a, s) => a + s.total,   0);
  const streak  = total ? Math.max(...sessions.map(s => s.max_streak)) : 0;

  document.getElementById('stat-games').textContent  = total;
  document.getElementById('stat-best').textContent   = formatPrize(best);
  document.getElementById('stat-streak').textContent = streak;
}

function chartDefaults() {
  return {
    color: '#aaaaaa',
    plugins: { legend: { labels: { color: '#aaaaaa', font: { size: 11 } } } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#888' } },
      y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#888' } },
    },
  };
}

function renderChartHistory(sessions) {
  const last = sessions.slice(-30);
  const labels = last.map((_, i) => `#${sessions.length - last.length + i + 1}`);
  const data   = last.map(s => s.prize);
  const ctx    = document.getElementById('chart-history').getContext('2d');
  const grad   = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, 'rgba(255,215,0,0.35)');
  grad.addColorStop(1, 'rgba(255,215,0,0)');
  _charts.history = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Premio (€)',
        data,
        borderColor: '#FFD700',
        backgroundColor: grad,
        borderWidth: 2,
        pointBackgroundColor: '#FFD700',
        pointRadius: 3,
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      ...chartDefaults(),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Premio: ${formatPrize(ctx.raw)}`,
            afterLabel: ctx => {
              const s = last[ctx.dataIndex];
              return `${s.level} · ${s.challenge} · ${s.correct}/${s.total} correctas`;
            },
          },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#888', maxTicksLimit: 10 } },
        y: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#888', callback: v => formatPrize(v) },
          beginAtZero: true,
        },
      },
    },
  });
}

function renderChartCategories(sessions, categoryCounts) {
  // Only count sessions with a specific category (not 'all')
  const map = {};
  for (const s of sessions) {
    if (!s.category || s.category === 'all') continue;
    if (!map[s.category]) map[s.category] = 0;
    map[s.category] += s.correct;
  }

  const entries = Object.entries(map)
    .map(([key, correct]) => {
      const dbTotal = categoryCounts[key] || 1;
      const pct = Math.min(100, Math.round(correct / dbTotal * 100));
      return { key, label: CATEGORY_NAMES[key] || key, pct, correct, dbTotal };
    })
    .sort((a, b) => b.pct - a.pct);

  if (!entries.length) return;

  const labels = entries.map(e => e.label);
  const data   = entries.map(e => e.pct);
  const colors = data.map(v =>
    v >= 80 ? 'rgba(0,230,118,0.75)' : v >= 55 ? 'rgba(100,100,255,0.75)' : 'rgba(255,90,90,0.75)'
  );

  const ctx = document.getElementById('chart-categories').getContext('2d');
  _charts.categories = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderRadius: 4 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => {
              const e = entries[c.dataIndex];
              return ` ${e.correct} correctas de ${e.dbTotal} palabras (${e.pct}%)`;
            },
          },
        },
      },
      scales: {
        x: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#888', callback: v => `${v}%` } },
        y: { grid: { display: false }, ticks: { color: '#ccc', font: { size: 11 } } },
      },
    },
  });
}

function renderChartLevels(sessions) {
  const map = { A1:0, A2:0, B1:0, B2:0, C1:0, C2:0 };
  for (const s of sessions) if (s.level in map) map[s.level]++;
  const labels = Object.keys(map).filter(k => map[k] > 0);
  const data   = labels.map(k => map[k]);
  const palette = {
    A1:'rgba(100,149,255,0.85)', A2:'rgba(0,210,210,0.85)',
    B1:'rgba(0,210,120,0.85)',   B2:'rgba(255,215,0,0.85)',
    C1:'rgba(255,145,0,0.85)',   C2:'rgba(255,80,80,0.85)',
  };
  const ctx = document.getElementById('chart-levels').getContext('2d');
  _charts.levels = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: labels.map(l => palette[l]), borderWidth: 2, borderColor: '#0a0a1a' }],
    },
    options: {
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#aaa', padding: 14, font: { size: 12 } } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} partida${c.raw !== 1 ? 's' : ''}` } },
      },
    },
  });
}

// ─── Hall of Fame ─────────────────────────────────────────────────────────────
function displayHallOfFame() {
  const list   = document.getElementById('hof-list');
  const filter = State.hofFilter;

  if (window.location.protocol === 'file:') {
    list.innerHTML = '<p class="hof-empty">Abre la app desde el servidor.</p>';
    return;
  }

  list.innerHTML = '<p class="hof-empty">Cargando…</p>';

  fetch('/api/hof')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then(text => {
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Respuesta no válida: ' + text.slice(0, 200));
      }
    })
    .then(hof => {
      const subset = filter === 'global' ? hof : hof.filter(e => e.level === filter);

      const players = {};
      subset.forEach(e => {
        const key = e.name.toLowerCase();
        if (!players[key]) players[key] = { name: e.name, correct: 0, games: 0, levels: new Set() };
        players[key].correct += (e.correct || 0);
        players[key].games++;
        if (filter === 'global' && (e.correct || 0) > 0) players[key].levels.add(e.level);
      });

      const top10 = Object.values(players)
        .sort((a, b) => b.correct - a.correct)
        .slice(0, 10)
        .map(p => ({ ...p, levels: p.levels ? [...p.levels].sort() : [] }));

      renderHofList(list, top10, filter);
    })
    .catch(err => {
      console.error('[HOF] Error al cargar:', err);
      list.innerHTML = `<p class="hof-empty">Error al cargar el Hall of Fame.<br><small>${err.message}</small></p>`;
    });
}

function renderHofList(list, entries, filter) {
  if (entries.length === 0) {
    list.innerHTML = '<p class="hof-empty">Aún no hay puntuaciones. ¡Sé el primero!</p>';
    return;
  }
  const crowns = [
    '<span class="crown crown-gold">👑</span>',
    '<span class="crown crown-silver">👑</span>',
    '<span class="crown crown-bronze">👑</span>'
  ];
  const levelLabel = filter === 'global' ? 'todos los niveles' : `nivel ${filter}`;
  list.innerHTML = '';
  entries.forEach((entry, i) => {
    const rank      = i < 3 ? `${i + 1}` : `${i + 1}`;
    const crownHtml = i < 3 ? crowns[i] : '';
    const div       = document.createElement('div');
    div.className   = 'hof-entry' + (i < 3 ? ` hof-top${i + 1}` : '');
    const levelsHtml = (filter === 'global' && entry.levels?.length)
      ? `<div class="hof-levels">${entry.levels.map(l => `<span class="hof-level-badge">${l}</span>`).join('')}</div>`
      : '';
    div.innerHTML = `
      <div class="hof-rank">${rank}</div>
      <div class="hof-info">
        <div class="hof-name">${crownHtml}${escapeHtml(entry.name)}</div>
        <div class="hof-meta">${entry.games} partida${entry.games !== 1 ? 's' : ''} · ${levelLabel}</div>
        ${levelsHtml}
      </div>
      <div class="hof-score-wrap">
        <div class="hof-score">${entry.correct.toLocaleString('es-ES')}</div>
        <div class="hof-score-label">aciertos</div>
      </div>`;
    list.appendChild(div);
  });
}

function filterHof(filter) {
  State.hofFilter = filter;
  document.querySelectorAll('.hof-filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-hof="${filter}"]`).classList.add('active');
  displayHallOfFame();
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function launchConfetti() {
  const container = document.getElementById('confetti-container');
  container.innerHTML = '';
  const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96e6a1', '#f9ca24', '#ff9ff3'];
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.8}s;
      width: ${6 + Math.random() * 10}px;
      height: ${6 + Math.random() * 10}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
    `;
    container.appendChild(piece);
  }
  setTimeout(() => { container.innerHTML = ''; }, 5000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatPrize(n) {
  if (!n) return '€0';
  const fmt = (v, s) => `€${parseFloat(v.toFixed(3).replace(/\.?0+$/, ''))}${s}`;
  const a = Math.abs(n);
  if (a >= 1e12) return fmt(n / 1e12, 'T');
  if (a >= 1e9)  return fmt(n / 1e9,  'G');
  if (a >= 1e6)  return fmt(n / 1e6,  'M');
  if (a >= 1e3)  return fmt(n / 1e3,  'K');
  return `€${n}`;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
  loadPrefs();
  updateHomeUI();
  showHome();
});
