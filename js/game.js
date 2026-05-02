'use strict';

const APP_VERSION = '2.2.1';

// ─── Category Names ───────────────────────────────────────────────────────────
const CATEGORY_NAMES = {
  all:                'Todas las categorías',
  verbos:             'Verbos',
  phrasal_verbs:      'Verbos compuestos',
  animals:            'Animales',
  body:               'Cuerpo humano',
  clothes:            'Ropa',
  colours:            'Colores',
  descriptions:       'Descripciones',
  family_and_friends: 'Familia y amigos',
  feelings:           'Sentimientos',
  finance_and_money:  'Finanzas y dinero',
  food_and_drink:     'Comida y bebida',
  general:            'Vocabulario general',
  grammar:            'Gramática',
  health_and_medicine:'Salud y medicina',
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
  arts:               'Arte y cultura',
  geography:          'Geografía',
  law_and_crime:      'Derecho y crimen',
  military:           'Militar',
  religion:           'Religión',
  science:            'Ciencia',
  flags:              'Banderas',
};

// ─── Web Audio API para experto (autoplay-friendly) ──────────────────────────
// Usamos AudioContext en lugar de HTMLAudioElement: una vez resumido por un
// gesto del usuario, los buffers se pueden reproducir sin restricciones aunque
// hayan pasado por timeouts/await fetch.
let _audioCtx = null;
let _audioCtxResumed = false;
let _currentSource = null;

function getAudioCtx() {
  if (!_audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
  }
  return _audioCtx;
}

// Llamar dentro de un gesto del usuario (click) para resumir el contexto.
function primeExpertAudio() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => { _audioCtxResumed = true; })
                  .catch(e => console.warn('[expert] resume falló', e));
    } else {
      _audioCtxResumed = true;
    }
  } catch (e) { console.warn('[expert] prime exception', e); }
}

// Reproduce un ArrayBuffer (mp3) y resuelve cuando termina.
async function playAudioBuffer(arrayBuffer) {
  const ctx = getAudioCtx();
  if (!ctx) throw new Error('AudioContext no disponible');
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch {}
  }
  const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  return new Promise((resolve) => {
    if (_currentSource) { try { _currentSource.stop(); } catch {} _currentSource = null; }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => { _currentSource = null; resolve(); };
    src.start();
    _currentSource = src;
  });
}

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
  const cats = [...new Set(words.map(w => w.category))]
    .filter(c => c !== 'general').sort();
  if (words.some(w => w.category === 'general')) cats.push('general');
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
    if (this.ctx.state === 'suspended') this.ctx.resume();
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
  // Toggle del botón Explicación: ascendente al armar, descendente al desarmar.
  playExplainArm() {
    this.tone(587.33, 0.08, 'triangle', 0.22);              // D5
    setTimeout(() => this.tone(880, 0.18, 'triangle', 0.22), 90);  // A5
  },
  playExplainDisarm() {
    this.tone(880, 0.08, 'triangle', 0.18);                 // A5
    setTimeout(() => this.tone(523.25, 0.18, 'triangle', 0.18), 90); // C5
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

// ─── Word Image ───────────────────────────────────────────────────────────────
let _imageTimer    = null;
let _imageStartAt  = null;
let _imageDurMs    = null;
let _imageShown    = false;
let _imageOnAdvance = null;  // callback para avanzar manualmente en modo pausa

function showWordImage(word, category, callbacks) {
  // callbacks puede ser un función (onAdvance) o un objeto { onStarted, onAdvance }
  const cb = (typeof callbacks === 'function') ? { onAdvance: callbacks } : (callbacks || {});

  const box      = document.getElementById('word-image-box');
  const img      = document.getElementById('word-image');
  const progress = document.getElementById('word-image-progress');
  const fill     = progress.querySelector('.progress-fill');
  const pctEl    = progress.querySelector('.progress-percent');

  if (_imageTimer) { cancelAnimationFrame(_imageTimer); _imageTimer = null; }
  _imageOnAdvance = cb.onAdvance || null;

  // Click en la caja avanza (útil en modo pausa, también funciona durante timer)
  box.onclick = () => {
    if (_imageOnAdvance) {
      const advCb = _imageOnAdvance;
      _imageOnAdvance = null;
      hideWordImage();
      advCb();
    }
  };

  img.onerror = () => { _imageShown = false; hideWordImage(); /* el caller hace fallback con su propio timeout */ };
  img.onload  = () => {
    _imageShown = true;
    box.classList.remove('hidden');
    if (cb.onStarted) cb.onStarted();
    const seconds = (window.userPrefs?.imageDisplaySeconds != null
      ? window.userPrefs.imageDisplaySeconds : 5);
    if (seconds === 0) {
      progress.classList.add('hidden');
      // queda visible hasta click; onAdvance lo avanzará
    } else {
      progress.classList.remove('hidden');
      _imageDurMs   = seconds * 1000;
      _imageStartAt = Date.now();
      const tick = () => {
        const elapsed   = Date.now() - _imageStartAt;
        const remaining = Math.max(0, _imageDurMs - elapsed);
        const pct       = Math.round((remaining / _imageDurMs) * 100);
        fill.style.width  = pct + '%';
        pctEl.textContent = pct + '%';
        if (remaining <= 0) {
          if (_imageOnAdvance) {
            const cb = _imageOnAdvance;
            _imageOnAdvance = null;
            hideWordImage();
            cb();
          } else {
            hideWordImage();
          }
        } else {
          _imageTimer = requestAnimationFrame(tick);
        }
      };
      tick();
    }
  };
  img.src = `/api/word-image/${encodeURIComponent(word.toLowerCase())}/${encodeURIComponent(category)}`;
}

function hideWordImage() {
  const box = document.getElementById('word-image-box');
  if (box) box.classList.add('hidden');
  if (_imageTimer) { cancelAnimationFrame(_imageTimer); _imageTimer = null; }
  _imageShown = false;
}

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
  if (p.level)                         State.level               = p.level;
  if (p.mode)                          State.mode                = p.mode;
  if (p.category)                      State.category            = p.category;
  if (p.challengeType)                 State.challengeType       = p.challengeType;
  if (p.autoPlay !== undefined)        State.autoPlay            = p.autoPlay;
  if (p.autoPlayLangs)                 State.autoPlayLangs       = p.autoPlayLangs;
  if (p.imageDisplaySeconds != null)   State.imageDisplaySeconds = p.imageDisplaySeconds;
  if (p.showImages !== undefined)      State.showImages          = !!p.showImages;
  if (p.explainArmed !== undefined)    State.explainArmed        = !!p.explainArmed;
  if (p.expertVoice !== undefined)     State.expertVoice         = !!p.expertVoice;
}

function savePrefs() {
  Cookie.set(COOKIE_NAME, {
    level:               State.level,
    mode:                State.mode,
    category:            State.category,
    challengeType:       State.challengeType,
    autoPlay:            State.autoPlay,
    autoPlayLangs:       State.autoPlayLangs,
    imageDisplaySeconds: State.imageDisplaySeconds,
    showImages:          State.showImages,
    explainArmed:        State.explainArmed,
    expertVoice:         State.expertVoice,
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

function applyServerPrefs(prefs) {
  if (!prefs) return;
  if (prefs.level)                        State.level               = prefs.level;
  if (prefs.mode)                         State.mode                = prefs.mode;
  if (prefs.category)                     State.category            = prefs.category;
  if (prefs.challengeType)                State.challengeType       = prefs.challengeType;
  if (prefs.autoPlay !== undefined)       State.autoPlay            = prefs.autoPlay;
  if (prefs.autoPlayLangs)                State.autoPlayLangs       = prefs.autoPlayLangs;
  if (prefs.imageDisplaySeconds != null)  State.imageDisplaySeconds = prefs.imageDisplaySeconds;
  if (prefs.showImages !== undefined)     State.showImages          = !!prefs.showImages;
  if (prefs.expertExplainButton !== undefined) State.explainArmed   = !!prefs.expertExplainButton;
  if (prefs.expertVoice !== undefined)    State.expertVoice         = !!prefs.expertVoice;
  window.userPrefs.imageDisplaySeconds = State.imageDisplaySeconds;
  window.userPrefs.showImages          = State.showImages;
  savePrefs();
}

function fetchServerPrefs(token) {
  return fetch('/api/prefs', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.ok ? r.json() : null)
    .then(applyServerPrefs)
    .catch(e => console.error('[prefs] fetch error', e));
}

function handleGoogleLogin(response) {
  console.log('[FRONTEND] Token recibido de Google');
  fetch('/api/auth/google', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ credential: response.credential }),
  })
    .then(r => {
      console.log('[FRONTEND] Respuesta del servidor:', r.status);
      return r.json();
    })
    .then(data => {
      if (data.error) {
        console.error('[FRONTEND] Error del servidor:', data.error);
        throw new Error(data.error);
      }
      console.log('[FRONTEND] ✓ Autenticación exitosa');
      Auth.save(data.token, { name: data.name, email: data.email, picture: data.picture });
      State.playerName = data.name;
      updateHomeUI();
      return fetchServerPrefs(data.token);
    })
    .catch(e => {
      console.error('[FRONTEND] Error completo:', e);
      alert('Error al iniciar sesión: ' + e.message + '\n\nRevisa la consola (F12) para más detalles.');
    });
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
  autoPlay: false,
  autoPlayLangs: ['uk', 'us'],
  imageDisplaySeconds: 5,
  showImages: true,
  expertVoice: true,
  expertUsedThisQuestion: false,
  explainArmed: false,
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
  hofFilter: 'global',
  poolExhaustedWarned: false
};

// Alias global usado por showWordImage
window.userPrefs = { imageDisplaySeconds: 5, showImages: true };

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
  window.scrollTo(0, 0);
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
      const label = lvl === 'ALL' ? 'TODOS' : lvl;
      btn.innerHTML = `<span class="btn-label">${label}</span><span class="btn-count">${n > 0 ? n : '—'}</span>`;
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
async function setMode(mode) {
  State.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
  // En modos de banderas/capitales, fijar categoría a 'flags' y nivel ALL
  if (isFlagMode(mode) || isCapitalMode(mode)) {
    State.level = 'ALL';
    State.category = 'flags';
    await fetchWordsForLevel('ALL');
    if (isCapitalMode(mode)) await loadCapitals();
    populateCategories();
    document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-level="ALL"]')?.classList.add('active');
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-cat="flags"]')?.classList.add('active');
  }
  updateLangSectionsVisibility();
}

// Nivel y Categoría solo aplican a modos de idiomas (en-es / es-en).
function updateLangSectionsVisibility() {
  const isLang = !isFlagMode(State.mode) && !isCapitalMode(State.mode);
  const lvl = document.getElementById('setup-level');
  const cat = document.getElementById('setup-category');
  if (lvl) lvl.style.display = isLang ? '' : 'none';
  if (cat) cat.style.display = isLang ? '' : 'none';
}

function isFlagMode(m)    { return m === 'flag-to-es' || m === 'es-to-flag'; }
function isCapitalMode(m) { return m === 'es-to-capital' || m === 'capital-to-es'; }

// ─── Capitals (capital en castellano por país, indexado por word EN en minúsculas)
const Capitals = {};
let _capitalsLoaded = false;
async function loadCapitals() {
  if (_capitalsLoaded) return;
  try {
    const r = await fetch('/data/flags-iso.json');
    const arr = await r.json();
    arr.forEach(x => { if (x.en && x.capital) Capitals[x.en.toLowerCase()] = x.capital; });
    _capitalsLoaded = true;
  } catch (e) { console.warn('[capitals] load failed', e); }
}
function getCapital(word) {
  return word && word.word ? (Capitals[word.word.toLowerCase()] || '') : '';
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
  // Si la categoría guardada ya no existe en este nivel, vuelve a 'all'.
  if (!cats.includes(State.category)) State.category = 'all';
  const container = document.getElementById('cat-container');
  container.innerHTML = '';
  let activeMarked = false;
  cats.forEach(cat => {
    const n = cat === 'all' ? words.length : words.filter(w => w.category === cat).length;
    const btn = document.createElement('button');
    const isActive = !activeMarked && cat === State.category;
    if (isActive) activeMarked = true;
    btn.className = 'cat-btn' + (isActive ? ' active' : '');
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

  updateLangSectionsVisibility();
}

// ─── Game Init ────────────────────────────────────────────────────────────────
async function startGame() {
  try { Audio.init(); } catch (e) { console.warn('[startGame] Audio.init', e); }
  try { primeExpertAudio(); } catch (e) { console.warn('[startGame] primeExpertAudio', e); }
  savePrefs();
  await fetchWordsForLevel(State.level);
  const pool = getWordsForLevelAndCategory(State.level, State.category);
  if (pool.length < 1) {
    alert('¡No hay palabras en esta categoría y nivel! Prueba con "Todas las categorías".');
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
  State.poolExhaustedWarned = false;

  updateLifelineUI();
  buildPrizeLadder();
  updateLivesDisplay();
  showScreen('screen-game');
  loadQuestion();
}

// ─── Question Engine ──────────────────────────────────────────────────────────
function loadQuestion() {
  hideWordImage();

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
    if (!State.poolExhaustedWarned) {
      State.poolExhaustedWarned = true;
      openModal('modal-pool-exhausted');
      return;
    }
  }

  // Refresh ladder prices at start of each new phase
  if (State.challengeType !== '10' && State.currentIndex % 10 === 0) {
    refreshLadderPrizes(Math.floor(State.currentIndex / 10));
  }

  const word = State.questions[qIdx];
  State.eliminatedOptions = [];
  State.answering = false;
  State.expertUsedThisQuestion = false;

  const options = generateOptions(word);
  displayQuestion(word, options);
  updatePrizeLadder();
  updateQuestionCounter();
}

function isProperNoun(w) {
  const c = w.translation.charAt(0);
  return c === c.toUpperCase() && c !== c.toLowerCase();
}

function generateOptions(word) {
  const wordIsPN = isProperNoun(word);
  const compatible = w => wordIsPN || !isProperNoun(w);

  const allWords = getWordsForLevel(State.level)
    .filter(w => w.word !== word.word && compatible(w));
  const sameCat = allWords.filter(w => w.category === word.category);
  const distractors = shuffleArray(sameCat).slice(0, 3);

  // If not enough same-category distractors, pull from adjacent levels
  if (distractors.length < 3 && State.level !== 'ALL') {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    for (const lvl of levels) {
      if (lvl === State.level) continue;
      const extra = getWordsForLevel(lvl)
        .filter(w => w.word !== word.word && compatible(w) && w.category === word.category);
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

  const mode = State.mode;
  const isEnToEs = mode === 'en-es';
  const flagMode = isFlagMode(mode);
  const flagQ    = mode === 'flag-to-es';
  const flagOpt  = mode === 'es-to-flag';
  const capMode  = isCapitalMode(mode);
  const esToCap  = mode === 'es-to-capital';
  const capToEs  = mode === 'capital-to-es';

  // Helper: span con nombre del país + miniatura de bandera a la derecha
  const renderCountryWithFlag = (country, enWord) => {
    const wrap = document.createElement('span');
    wrap.className = 'country-with-flag';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'country-name';
    nameSpan.textContent = country;
    const flagThumb = document.createElement('img');
    flagThumb.className = 'flag-thumb';
    flagThumb.src = `/api/word-image/${encodeURIComponent(enWord.toLowerCase())}/flags`;
    flagThumb.alt = '';
    wrap.append(nameSpan, flagThumb);
    return wrap;
  };

  // Pregunta principal
  const wordTextEl = document.getElementById('word-text');
  if (flagQ) {
    wordTextEl.textContent = '';                // se muestra solo bandera
  } else if (flagOpt) {
    // Nombre del país en español + icono GPS que abre Google Maps en nueva pestaña.
    const country = word.translation;
    const mapsUrl = `https://www.google.com/maps/place/${encodeURIComponent(country)}`;
    wordTextEl.innerHTML = '';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'country-name';
    nameSpan.textContent = country;
    const gpsLink = document.createElement('a');
    gpsLink.className = 'country-gps';
    gpsLink.href = mapsUrl;
    gpsLink.target = '_blank';
    gpsLink.rel = 'noopener noreferrer';
    gpsLink.title = `Ver ${country} en Google Maps`;
    gpsLink.setAttribute('aria-label', `Ver ${country} en Google Maps`);
    gpsLink.textContent = '📍';
    wordTextEl.append(nameSpan, gpsLink);
  } else if (esToCap) {
    // País en español + bandera mini a la derecha → adivinar capital
    wordTextEl.innerHTML = '';
    wordTextEl.append(renderCountryWithFlag(word.translation, word.word));
  } else if (capToEs) {
    // Capital → adivinar país (sin bandera en pregunta)
    wordTextEl.textContent = getCapital(word);
  } else {
    wordTextEl.textContent = isEnToEs ? word.word : word.translation;
  }

  // Bandera de pregunta (modo flag-to-es)
  const flagBox = document.getElementById('question-flag');
  const flagImg = document.getElementById('question-flag-img');
  if (flagQ) {
    flagImg.src = `/api/word-image/${encodeURIComponent(word.word.toLowerCase())}/flags`;
    flagBox.classList.remove('hidden');
  } else {
    flagBox.classList.add('hidden');
    flagImg.src = '';
  }

  // IPA / audio: solo en modos de palabra
  const showIPA = isEnToEs && !flagMode && !capMode;
  document.getElementById('ipa-uk').textContent = showIPA ? word.uk_ipa : '';
  document.getElementById('ipa-us').textContent = showIPA ? word.us_ipa : '';
  document.getElementById('ipa-row').style.display = showIPA ? 'flex' : 'none';
  document.getElementById('audio-row').style.display = (isEnToEs || mode === 'es-en') && !flagMode && !capMode ? 'flex' : 'none';
  State.currentWord = word;
  if (!flagMode && !capMode) autoPlayWord();

  const labels = ['A', 'B', 'C', 'D'];
  const card  = document.getElementById('question-card');

  // Reset buttons — direct class reset, no opacity animation so GPU layer is never stale
  options.forEach((opt, i) => {
    const btn = document.getElementById(`answer-${labels[i]}`);
    btn.className = 'answer-btn' + (flagOpt ? ' flag-option' : '');
    btn.disabled  = false;
    btn.querySelector('.answer-label').textContent = labels[i];
    const textEl = btn.querySelector('.answer-text');
    if (flagOpt) {
      textEl.innerHTML = `<img src="/api/word-image/${encodeURIComponent(opt.word.toLowerCase())}/flags" alt="${opt.translation}">`;
    } else if (flagQ) {
      textEl.textContent = opt.translation;  // nombre español del país
    } else if (esToCap) {
      // Opciones = capitales (texto)
      textEl.textContent = getCapital(opt);
    } else if (capToEs) {
      // Opciones = países en español + bandera mini a la derecha
      textEl.innerHTML = '';
      textEl.append(renderCountryWithFlag(opt.translation, opt.word));
    } else {
      textEl.textContent = isEnToEs ? opt.translation : opt.word;
    }
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
  // Re-priming en cada click — gesto fresco del usuario para mantener
  // el audio del experto desbloqueado en navegadores estrictos (iOS).
  try { primeExpertAudio(); } catch (e) { console.warn('[selectAnswer] prime', e); }

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

  // Determina el destino tras esta pregunta y muta el estado ya
  let nextAction = null;  // 'load' | 'win' | 'end'

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
      State.totalPrize += prizes[9];
      State.safeZonePrize = 0;
      State.currentPrize  = 0;
      updateTotalPrizeDisplay();
      const phasesDone = State.currentIndex / 10;
      const maxPhases  = State.challengeType === '100' ? 10 : State.challengeType === '1000' ? 100 : Infinity;
      nextAction = phasesDone >= maxPhases ? 'win' : 'load';
    } else {
      nextAction = 'load';
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
      nextAction = 'end';
    } else {
      State.totalPrize += State.safeZonePrize;
      updateTotalPrizeDisplay();
      State.lives--;
      updateLivesDisplay();
      if (State.lives <= 0) {
        nextAction = 'end';
      } else {
        State.safeZonePrize = 0;
        State.currentPrize  = 0;
        State.currentIndex++;
        const phasesDone = State.currentIndex / 10;
        const maxPhases  = State.challengeType === '100' ? 10 : State.challengeType === '1000' ? 100 : Infinity;
        if (State.currentIndex % 10 === 0) {
          nextAction = phasesDone >= maxPhases ? 'end' : 'load';
        } else {
          nextAction = 'load';
        }
      }
    }
  }

  // Callback de avance (idempotente)
  let advanced = false;
  const advance = () => {
    if (advanced) return;
    advanced = true;
    if (nextAction === 'win')      winGame();
    else if (nextAction === 'end') endGame();
    else                            loadQuestion();
  };

  // Mostrar imagen y sincronizar el avance con su timer/click.
  // Lógica: arrancamos un fallback timer de fallbackMs por si la imagen no
  // carga (categoría sin imagen). Si la imagen SÍ carga, onStarted cancela
  // ese fallback y el avance vendrá de onAdvance (al cumplirse el timer
  // de imagen, o al click en modo pausa).
  const fallbackMs = isCorrect ? 1500 : 1800;

  // Auto-experto tras responder: dispara si el usuario armó el botón 💡
  // para esta pregunta. No se repite si ya se usó el comodín del experto.
  const autoExpert = State.explainArmed && !State.expertUsedThisQuestion;
  const expertCtx  = isCorrect ? 'auto-correct' : 'auto-wrong';

  const showImg = State.currentWord && State.showImages !== false && !isFlagMode(State.mode);

  if (autoExpert && showImg) {
    // Ambos activos: imagen y experto en paralelo. Avanzamos cuando los dos terminen.
    let pending = 2;
    const tryAdvance = () => { if (--pending <= 0) advance(); };
    setTimeout(() => useExpert(tryAdvance, expertCtx), 600);
    const fallbackTimer = setTimeout(tryAdvance, fallbackMs);
    showWordImage(State.currentWord.word, State.currentWord.category, {
      onStarted: () => clearTimeout(fallbackTimer),
      onAdvance: tryAdvance,
    });
  } else if (autoExpert) {
    // Pequeña pausa para mostrar la respuesta correcta antes del experto
    setTimeout(() => useExpert(advance, expertCtx), 600);
  } else if (showImg) {
    // En modos de banderas, la bandera ya está visible — no abrir el word-image-box
    const fallbackTimer = setTimeout(advance, fallbackMs);
    showWordImage(State.currentWord.word, State.currentWord.category, {
      onStarted: () => clearTimeout(fallbackTimer),
      onAdvance: advance,
    });
  } else {
    setTimeout(advance, fallbackMs);
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
  else if (type === 'expert') {
    State.expertUsedThisQuestion = true;
    try { primeExpertAudio(); } catch {}
    useExpert();
  }
}

// Botón "Explicación tras responder": toggle persistente por usuario.
// Si está armado al responder, el experto da la explicación post-respuesta
// (auto-correct si aciertas, auto-wrong si fallas). Persiste en cookie y BD
// (user_prefs.expert_explain_button) — sobrevive a recargas y otros dispositivos.
function useExplainButton() {
  if (State.answering) return;
  State.explainArmed = !State.explainArmed;
  try { primeExpertAudio(); } catch {}
  if (State.explainArmed) Audio.playExplainArm();
  else                    Audio.playExplainDisarm();
  updateLifelineUI();
  savePrefs();
  if (Auth.isLoggedIn()) {
    fetch('/api/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Auth.token}` },
      body: JSON.stringify({
        level:               State.level,
        mode:                State.mode,
        category:            State.category,
        challengeType:       State.challengeType,
        autoPlay:            State.autoPlay,
        autoPlayLangs:       State.autoPlayLangs,
        imageDisplaySeconds: State.imageDisplaySeconds,
        showImages:          State.showImages,
        expertExplainButton: State.explainArmed,
        expertVoice:         State.expertVoice,
      }),
    }).catch(() => {});
  }
}
window.useExplainButton = useExplainButton;

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

async function useExpert(onFinished, context = 'lifeline') {
  const labels = ['A', 'B', 'C', 'D'];
  const correctLabel = labels[State.currentCorrectIndex];
  const correctText  = State.currentOptions[State.currentCorrectIndex];
  const flagMode     = isFlagMode(State.mode);
  const capMode      = isCapitalMode(State.mode);
  const showFlag     = flagMode || capMode;
  // En banderas/capitales la respuesta hablada depende del modo;
  // 'word' pasa siempre el nombre en inglés del país al backend.
  let answer;
  if (State.mode === 'es-to-capital')      answer = getCapital(correctText);
  else if (State.mode === 'capital-to-es') answer = correctText.translation;
  else if (flagMode)                       answer = correctText.translation;
  else                                     answer = (State.mode === 'en-es' ? correctText.translation : correctText.word);
  const word         = correctText.word;
  const country      = correctText.translation;
  const capital      = capMode ? getCapital(correctText) : '';
  const fallbackHtml = `<strong>${correctLabel}: "${answer}"</strong>`;
  const useMini      = context !== 'lifeline';

  const msgEl = document.getElementById('expert-message');
  const flagWrap = document.getElementById('expert-flag-wrap');
  const miniEl = document.getElementById('expert-mini');

  const showUI = () => {
    if (useMini) {
      miniEl?.classList.remove('hidden');
    } else {
      msgEl.innerHTML = '🎧 <em>Consultando al experto...</em>';
      if (flagWrap) {
        if (flagMode) {
          flagWrap.innerHTML = `<img class="expert-flag" src="/api/word-image/${encodeURIComponent(word.toLowerCase())}/flags" alt="">`;
          flagWrap.classList.remove('hidden');
        } else {
          flagWrap.innerHTML = '';
          flagWrap.classList.add('hidden');
        }
      }
      openModal('modal-expert');
    }
  };
  const hideUI = () => {
    if (useMini) miniEl?.classList.add('hidden');
  };
  const finish = (() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      hideUI();
      if (onFinished) onFinished();
    };
  })();

  showUI();

  if (!Auth.isLoggedIn()) {
    if (!useMini) msgEl.innerHTML = fallbackHtml;
    setTimeout(finish, 1200);
    return;
  }

  try {
    const r = await fetch('/api/tts-expert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Auth.token}` },
      body: JSON.stringify({ word, answer, country, capital, correctLabel, mode: State.mode, context }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!useMini) msgEl.innerHTML = data.html || fallbackHtml;

    if (!data.audio) {
      // Sin audio: voz del experto desactivada o TTS falló.
      // En modo auto (useMini), abrimos el modal para mostrar el texto y
      // damos tiempo proporcional al largo para leerlo antes de avanzar.
      if (useMini) {
        miniEl?.classList.add('hidden');
        if (flagWrap) {
          if (showFlag) {
            flagWrap.innerHTML = `<img class="expert-flag" src="/api/word-image/${encodeURIComponent(word.toLowerCase())}/flags" alt="">`;
            flagWrap.classList.remove('hidden');
          } else {
            flagWrap.innerHTML = '';
            flagWrap.classList.add('hidden');
          }
        }
        msgEl.innerHTML = data.html || fallbackHtml;
        openModal('modal-expert');
        const textLen = (msgEl.textContent || '').length;
        const readMs = Math.min(12000, Math.max(3500, textLen * 60));
        setTimeout(() => { closeModal(); finish(); }, readMs);
      } else {
        // Lifeline: el modal ya está abierto. El usuario cierra con "Colgar".
        setTimeout(finish, 1200);
      }
      return;
    }

    const bytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
    console.log('[expert] play()', { context, useMini, ctxResumed: _audioCtxResumed, audioBytes: bytes.length });

    // Safety timer en caso de que el play cuelgue
    const safetyTimer = setTimeout(() => {
      console.warn('[expert] safety timeout — forzando avance');
      finish();
    }, 60000);

    try {
      await playAudioBuffer(bytes.buffer);
      clearTimeout(safetyTimer);
      finish();
    } catch (e) {
      console.warn('[expert] play falló', e);
      clearTimeout(safetyTimer);
      setTimeout(finish, 800);
    }
  } catch (e) {
    console.warn('[expert] fetch error', e);
    if (!useMini) msgEl.innerHTML = fallbackHtml;
    setTimeout(finish, 1200);
  }
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
function onPoolExhaustedEnd() {
  closeModal();
  endGame(true);
}
function onPoolExhaustedContinue() {
  closeModal();
  loadQuestion();
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
  // Botón de explicación: siempre visible. Marca 'armed' cuando el usuario
  // lo ha activado para esta pregunta (el experto explicará tras responder).
  const explainBtn = document.getElementById('lifeline-explain');
  if (explainBtn) {
    explainBtn.classList.toggle('armed', !!State.explainArmed);
  }
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

function autoPlayWord() {
  if (!State.autoPlay || !State.currentWord) return;
  const langs = State.autoPlayLangs || [];
  if (!langs.length) return;

  const queue = [];
  if (langs.includes('uk')) queue.push({ text: State.currentWord.word,        lang: 'en-GB' });
  if (langs.includes('us')) queue.push({ text: State.currentWord.word,        lang: 'en-US' });
  if (langs.includes('es')) queue.push({ text: State.currentWord.translation, lang: 'es-ES' });

  if (!queue.length) return;
  speechSynthesis.cancel();
  function playNext(i) {
    if (i >= queue.length) return;
    const u = new SpeechSynthesisUtterance(queue[i].text);
    u.lang  = queue[i].lang;
    u.rate  = 0.9;
    u.onend = () => playNext(i + 1);
    speechSynthesis.speak(u);
  }
  playNext(0);
}

function saveOptions() {
  State.autoPlay      = document.getElementById('opt-autoplay').checked;
  State.autoPlayLangs = ['uk', 'us', 'es'].filter(l => document.getElementById(`opt-lang-${l}`).checked);
  document.getElementById('opt-langs-wrap').style.display = State.autoPlay ? '' : 'none';

  const showImgEl = document.getElementById('opt-show-images');
  if (showImgEl) {
    State.showImages = showImgEl.checked;
    window.userPrefs.showImages = State.showImages;
    const wrap = document.getElementById('opt-image-seconds-wrap');
    if (wrap) wrap.style.display = State.showImages ? '' : 'none';
  }

  const imgEl = document.getElementById('opt-image-seconds');
  if (imgEl) {
    const v = parseInt(imgEl.value, 10);
    State.imageDisplaySeconds = (!isNaN(v) && v >= 0 && v <= 30) ? v : 5;
    window.userPrefs.imageDisplaySeconds = State.imageDisplaySeconds;
  }

  const voiceEl = document.getElementById('opt-expert-voice');
  if (voiceEl) State.expertVoice = voiceEl.checked;

  savePrefs();
  // Guardar al servidor si está autenticado
  if (Auth.isLoggedIn()) {
    fetch('/api/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Auth.token}` },
      body: JSON.stringify({
        level:               State.level,
        mode:                State.mode,
        category:            State.category,
        challengeType:       State.challengeType,
        autoPlay:            State.autoPlay,
        autoPlayLangs:       State.autoPlayLangs,
        imageDisplaySeconds: State.imageDisplaySeconds,
        showImages:          State.showImages,
        expertExplainButton: State.explainArmed,
        expertVoice:         State.expertVoice,
      }),
    }).catch(() => {});
  }
}

function showProfileTab(tab) {
  document.getElementById('profile-tab-stats').style.display   = tab === 'stats'   ? '' : 'none';
  document.getElementById('profile-tab-options').style.display = tab === 'options' ? '' : 'none';
  document.querySelectorAll('.profile-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
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

function endGame(voluntary = false) {
  let title, msg, prize;
  if (voluntary) {
    title = '🏁 ¡Partida completada!';
    if (State.challengeType === '10') {
      msg = `Has respondido todas las palabras únicas · ${State.totalCorrect}/${State.totalAnswered} correctas`;
      prize = State.safeZonePrize;
    } else {
      const phases = Math.floor(State.currentIndex / 10);
      msg = `${phases} fase${phases !== 1 ? 's' : ''} completada${phases !== 1 ? 's' : ''} · ${State.totalCorrect}/${State.totalAnswered} correctas`;
      prize = State.totalPrize;
    }
  } else if (State.challengeType === '10') {
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
      mode:       modeLabel(State.mode),
      challenge:  `Reto ${State.challengeType === 'infinite' ? '∞' : State.challengeType}`,
      category:   State.category,
      prize:      prize,
      correct:    State.totalCorrect,
      total:      State.totalAnswered,
      max_streak: State.maxStreak,
    }),
  }).catch(e => console.error('[stats]', e));
}

function modeLabel(m) {
  switch (m) {
    case 'en-es':       return 'EN→ES';
    case 'es-en':       return 'ES→EN';
    case 'flag-to-es':    return 'BAND→ES';
    case 'es-to-flag':    return 'ES→BAND';
    case 'es-to-capital': return 'PAÍS→CAP';
    case 'capital-to-es': return 'CAP→PAÍS';
    default:            return m;
  }
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
  document.getElementById('hof-saved-ok').style.display = 'none';

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
    mode:      modeLabel(State.mode),
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
      const ok = document.getElementById('hof-saved-ok');
      ok.style.display = 'block';
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

  // Init options tab UI from current state
  document.getElementById('opt-autoplay').checked  = State.autoPlay;
  document.getElementById('opt-lang-uk').checked   = State.autoPlayLangs.includes('uk');
  document.getElementById('opt-lang-us').checked   = State.autoPlayLangs.includes('us');
  document.getElementById('opt-lang-es').checked   = State.autoPlayLangs.includes('es');
  document.getElementById('opt-langs-wrap').style.display = State.autoPlay ? '' : 'none';
  const imgSecEl = document.getElementById('opt-image-seconds');
  if (imgSecEl) imgSecEl.value = State.imageDisplaySeconds != null ? State.imageDisplaySeconds : 5;
  const showImgEl = document.getElementById('opt-show-images');
  if (showImgEl) showImgEl.checked = State.showImages !== false;
  const imgSecWrap = document.getElementById('opt-image-seconds-wrap');
  if (imgSecWrap) imgSecWrap.style.display = (State.showImages !== false) ? '' : 'none';
  const voiceEl = document.getElementById('opt-expert-voice');
  if (voiceEl) voiceEl.checked = State.expertVoice !== false;

  showScreen('screen-profile');
  showProfileTab('stats');

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

  const canvas = document.getElementById('chart-categories');
  const wrap = canvas.parentElement;
  wrap.style.height = Math.max(200, entries.length * 30) + 'px';

  const ctx = canvas.getContext('2d');
  _charts.categories = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderRadius: 4 }],
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
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
        y: { grid: { display: false }, ticks: { color: '#ccc', font: { size: 11 }, autoSkip: false } },
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
      let subset;
      if (filter === 'global')      subset = hof;
      else if (filter === 'flags')  subset = hof.filter(e => e.mode === 'BAND→ES' || e.mode === 'ES→BAND');
      else                          subset = hof.filter(e => e.level === filter && e.mode !== 'BAND→ES' && e.mode !== 'ES→BAND');

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
  const levelLabel = filter === 'global' ? 'todos los niveles'
                   : filter === 'flags'  ? 'banderas'
                   : `nivel ${filter}`;
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

function displayAppVersion() {
  const versionEl = document.getElementById('app-version');
  if (versionEl) {
    versionEl.textContent = `v${APP_VERSION}`;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
  loadPrefs();
  window.userPrefs.imageDisplaySeconds = State.imageDisplaySeconds != null ? State.imageDisplaySeconds : 5;
  displayAppVersion();
  updateHomeUI();
  showHome();
  if (Auth.isLoggedIn()) fetchServerPrefs(Auth.token);
  loadCapitals();
});
