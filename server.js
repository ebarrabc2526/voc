require('dotenv').config();
const express    = require('express');
const compression = require('compression');
const path       = require('path');
const { OAuth2Client } = require('google-auth-library');
const jwt        = require('jsonwebtoken');
const Database   = require('better-sqlite3');
const { dictionary: cmuDict } = require('cmu-pronouncing-dictionary');

const app             = express();
const PORT            = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = '766212808659-7krp4oj0n0lf2584ntalksa1m9el5iqi.apps.googleusercontent.com';
const JWT_SECRET      = process.env.JWT_SECRET || 'voc-jwt-secret-2026';
const googleClient    = new OAuth2Client(GOOGLE_CLIENT_ID);

const DB_PATH = path.join(__dirname, 'data', 'voc.db');

if (!require('fs').existsSync(DB_PATH)) {
  console.error('[VOC] ERROR: data/voc.db no encontrada. Ejecuta: npm run setup');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Aplicar migraciones pendientes
const fs = require('fs');
const MIGRATION_002 = path.join(__dirname, 'migrations', '002_users_prefs.sql');
if (fs.existsSync(MIGRATION_002)) {
  db.exec(fs.readFileSync(MIGRATION_002, 'utf8'));
}
// Migración 005: tabla word_images + columna image_display_seconds
const MIGRATION_005 = path.join(__dirname, 'migrations', '005_word_images.sql');
if (fs.existsSync(MIGRATION_005)) {
  db.exec(fs.readFileSync(MIGRATION_005, 'utf8'));
  const cols005 = db.prepare('PRAGMA table_info(user_prefs)').all().map(r => r.name);
  if (!cols005.includes('image_display_seconds')) {
    db.prepare('ALTER TABLE user_prefs ADD COLUMN image_display_seconds INTEGER NOT NULL DEFAULT 5').run();
  }
  if (!cols005.includes('show_images')) {
    db.prepare('ALTER TABLE user_prefs ADD COLUMN show_images INTEGER NOT NULL DEFAULT 1').run();
  }
  if (!cols005.includes('expert_explain_button')) {
    db.prepare('ALTER TABLE user_prefs ADD COLUMN expert_explain_button INTEGER NOT NULL DEFAULT 0').run();
  }
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

app.use(compression());
app.use(express.json());

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Token requerido' });
  try {
    console.log('[AUTH] Intentando verificar token de Google');
    console.log('[AUTH] Client ID configurado:', GOOGLE_CLIENT_ID);
    console.log('[AUTH] Primeros 50 caracteres del token:', credential.substring(0, 50) + '...');

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    console.log('[AUTH] ✓ Token verificado correctamente. Email:', p.email);

    db.prepare(`
      INSERT INTO users (sub, email, name, picture, last_login)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(sub) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture,
        last_login = CURRENT_TIMESTAMP
    `).run(p.sub, p.email, p.name, p.picture);
    const token = jwt.sign(
      { sub: p.sub, name: p.name, email: p.email, picture: p.picture },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, name: p.name, email: p.email, picture: p.picture });
  } catch (err) {
    console.error('[AUTH] ✗ Error verificando token:', err.message);
    console.error('[AUTH] Stack:', err.stack);
    res.status(401).json({ error: 'Token de Google inválido' });
  }
});

// Debug endpoint para inspeccionar tokens (solo para desarrollo)
app.post('/api/auth/debug', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Token requerido' });

  try {
    // Decodificar sin verificar para inspeccionar (SOLO PARA DEBUG)
    const parts = credential.split('.');
    if (parts.length !== 3) {
      return res.json({ error: 'Token tiene formato inválido (no es JWT)' });
    }

    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log('[DEBUG] Token decodificado:', JSON.stringify(decoded, null, 2));

    res.json({
      message: 'Token decodificado (sin verificación de firma)',
      audience: decoded.aud,
      issuer: decoded.iss,
      expires_at: new Date(decoded.exp * 1000),
      email: decoded.email,
      name: decoded.name,
      sub: decoded.sub,
      clientIdEsperado: GOOGLE_CLIENT_ID,
      audienciaCoincide: decoded.aud === GOOGLE_CLIENT_ID,
    });
  } catch (err) {
    console.error('[DEBUG] Error decodificando:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─── Words ────────────────────────────────────────────────────────────────────
const LEVEL_ORDER = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

function deduplicateAll(rows) {
  const best = new Map();
  for (const row of rows) {
    const existing = best.get(row.word);
    if (!existing || LEVEL_ORDER[row.level] < LEVEL_ORDER[existing.level]) {
      best.set(row.word, row);
    }
  }
  return [...best.values()].map(({ level, ...rest }) => rest);
}

app.get('/api/words', (req, res) => {
  const { level, category } = req.query;
  if (!level) return res.status(400).json({ error: 'level requerido' });

  const cols = 'word, translation, category, uk_ipa, us_ipa, level';
  let rows;
  if (level === 'ALL') {
    const all = db.prepare(`SELECT ${cols} FROM words`).all();
    const deduped = deduplicateAll(all);
    if (!category || category === 'all') {
      rows = deduped;
    } else {
      rows = deduped.filter(w => w.category === category);
    }
  } else if (!category || category === 'all') {
    rows = db.prepare(`SELECT ${cols} FROM words WHERE level = ?`).all(level);
  } else {
    rows = db.prepare(`SELECT ${cols} FROM words WHERE level = ? AND category = ?`).all(level, category);
  }
  res.json(rows);
});

app.get('/api/categories', (req, res) => {
  const { level } = req.query;
  if (!level) return res.status(400).json({ error: 'level requerido' });
  const rows = db.prepare('SELECT DISTINCT category FROM words WHERE level = ? ORDER BY category').all(level);
  res.json(['all', ...rows.map(r => r.category)]);
});

app.get('/api/levels', (_req, res) => {
  const rows = db.prepare('SELECT level, COUNT(*) as count FROM words GROUP BY level').all();
  const counts = {};
  for (const r of rows) counts[r.level] = r.count;
  counts['ALL'] = db.prepare('SELECT COUNT(DISTINCT word) as c FROM words').get().c;
  res.json(counts);
});

// ─── Hall of Fame ─────────────────────────────────────────────────────────────
app.get('/api/hof', (_req, res) => {
  const rows = db.prepare('SELECT name, level, mode, challenge, category, score, correct, total, date FROM hof ORDER BY score DESC LIMIT 500').all();
  res.json(rows);
});

app.post('/api/hof', requireAuth, (req, res) => {
  const entry = req.body;
  db.prepare(`
    INSERT INTO hof (name, level, mode, challenge, category, score, correct, total, date)
    VALUES (@name, @level, @mode, @challenge, @category, @score, @correct, @total, @date)
  `).run({
    name:      req.user.name,
    level:     String(entry.level     || ''),
    mode:      String(entry.mode      || ''),
    challenge: String(entry.challenge || ''),
    category:  String(entry.category  || ''),
    score:     Number(entry.score)    || 0,
    correct:   Number(entry.correct)  || 0,
    total:     Number(entry.total)    || 0,
    date:      new Date().toLocaleDateString('es-ES'),
  });
  res.json({ ok: true });
});

// ─── Stats ────────────────────────────────────────────────────────────────────
app.post('/api/stats', requireAuth, (req, res) => {
  const { level, mode, challenge, category, prize, correct, total, max_streak } = req.body;
  db.prepare(`
    INSERT INTO game_sessions (user_email,level,mode,challenge,category,prize,correct,total,max_streak,date)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(req.user.email, level||'', mode||'', challenge||'', category||'',
         Number(prize)||0, Number(correct)||0, Number(total)||0, Number(max_streak)||0,
         new Date().toISOString());
  res.json({ ok: true });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const sessions = db.prepare(`
    SELECT level,mode,challenge,category,prize,correct,total,max_streak,date
    FROM game_sessions WHERE user_email = ? ORDER BY date ASC
  `).all(req.user.email);
  const catRows = db.prepare(`SELECT category, COUNT(*) as n FROM words GROUP BY category`).all();
  const categoryCounts = {};
  for (const r of catRows) categoryCounts[r.category] = r.n;
  res.json({ sessions, categoryCounts });
});

// ─── User Preferences ─────────────────────────────────────────────────────────
app.get('/api/prefs', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM user_prefs WHERE sub = ?').get(req.user.sub);
  if (!row) return res.json(null);
  res.json({
    level:               row.level,
    mode:                row.mode,
    category:            row.category,
    challengeType:       row.challenge_type,
    autoPlay:            !!row.auto_play,
    autoPlayLangs:       JSON.parse(row.auto_play_langs),
    imageDisplaySeconds: row.image_display_seconds != null ? row.image_display_seconds : 5,
    showImages:          row.show_images == null ? true : !!row.show_images,
    expertExplainButton: !!row.expert_explain_button,
  });
});

app.put('/api/prefs', requireAuth, (req, res) => {
  const { level, mode, category, challengeType, autoPlay, autoPlayLangs, imageDisplaySeconds, showImages, expertExplainButton } = req.body;
  // Validar imageDisplaySeconds: entero 0-30
  let imgSecs = 5;
  if (imageDisplaySeconds !== undefined) {
    const parsed = parseInt(imageDisplaySeconds, 10);
    imgSecs = (!isNaN(parsed) && parsed >= 0 && parsed <= 30) ? parsed : 5;
  }
  const showImg = (showImages === undefined || showImages === null) ? 1 : (showImages ? 1 : 0);
  const explainBtn = expertExplainButton ? 1 : 0;
  db.prepare(`
    INSERT INTO user_prefs (sub, level, mode, category, challenge_type, auto_play, auto_play_langs, image_display_seconds, show_images, expert_explain_button)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sub) DO UPDATE SET
      level = excluded.level,
      mode = excluded.mode,
      category = excluded.category,
      challenge_type = excluded.challenge_type,
      auto_play = excluded.auto_play,
      auto_play_langs = excluded.auto_play_langs,
      image_display_seconds = excluded.image_display_seconds,
      show_images = excluded.show_images,
      expert_explain_button = excluded.expert_explain_button
  `).run(req.user.sub, level||'A1', mode||'en-es', category||'all',
         challengeType||'10', autoPlay ? 1 : 0,
         JSON.stringify(autoPlayLangs || ['uk','us']),
         imgSecs, showImg, explainBtn);
  res.json({ ok: true });
});

// ─── TTS Expert ───────────────────────────────────────────────────────────────

// Convierte una palabra inglesa a phoneme tag de Fish Audio (Arpabet CMU)
function enPhoneme(word) {
  const phones = cmuDict[word.toLowerCase()];
  return phones ? `<|phoneme_start|>${phones}<|phoneme_end|>` : word;
}

// Reemplaza todas las ocurrencias de una palabra inglesa en un texto
// con su phoneme tag para que Fish Audio la pronuncie correctamente
function injectPhonemes(text, word) {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  return text.replace(re, enPhoneme(word));
}

async function fishTTS(text, key, voiceId, normalize = true) {
  const r = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text, reference_id: voiceId, format: 'mp3',
      mp3_bitrate: 128, sample_rate: 44100,
      temperature: 0.88, top_p: 0.92, latency: 'normal',
      chunk_length: 300, normalize,
    }),
  });
  if (!r.ok) throw new Error(`Fish Audio ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

app.post('/api/tts-expert', requireAuth, async (req, res) => {
  const { word, answer, correctLabel, mode, context } = req.body || {};
  if (!word || !answer || !correctLabel) return res.status(400).json({ error: 'missing params' });
  // context:
  //   'lifeline'      — duda y responde (comodín manual)
  //   'auto-correct'  — afirma directo (auto tras acierto)
  //   'auto-wrong'    — lamenta y explica (auto tras fallo)
  //   'explain'       — solo la explicación, sin comentar acierto/fallo
  const ctx = ['auto-correct', 'auto-wrong', 'explain'].includes(context) ? context : 'lifeline';

  const fishKey    = process.env.FISH_AUDIO_API_KEY;
  const voiceId    = process.env.FISH_AUDIO_VOICE_ID;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!fishKey || !voiceId) return res.status(503).json({ error: 'TTS not configured' });

  // 1. Explicación via Claude Haiku.
  //    - Modo banderas: SIGNIFICADO/ORIGEN de colores y símbolos + dato curioso del país (NO etimología).
  //    - Resto: etimología/curiosidad de la palabra inglesa.
  const isFlagMode = mode === 'flag-to-es' || mode === 'es-to-flag';
  let explanation = '';
  if (anthropicKey) {
    try {
      const systemPrompt = `Eres Jarvis, un asistente con personalidad. Hablas en castellano de España, primera persona, tono firme, afirmativo y directo al grano. NUNCA empiezas con muletillas, dudas, interjecciones de pensamiento ni frases de relleno (prohibido: "Mmm", "Hmm", "Ehh", "Ahh", "Uff", "A ver", "Vamos a ver", "Déjame ver", "Déjame pensar", "Déjame contarte", "Pues", "Pues mira", "Bueno", "Mira", "Sabes", "Verás", "Fíjate", "Te cuento", "Curiosamente", "Interesante", "Resulta que", "Pues bien"). Tu primera palabra debe ser un sustantivo, verbo, artículo o preposición que forme parte de la afirmación. Sin comillas, sin listas, sin titulares.`;
      const userPrompt = isFlagMode
        ? `Tema: la BANDERA de ${answer} y el país. Máximo 70 palabras. Explica el SIGNIFICADO y ORIGEN de sus colores y símbolos, y cierra con un dato curioso del país. PROHIBIDO hablar de etimología de la palabra "${answer}" o del idioma; céntrate solo en la bandera y el país. Texto corrido, una o dos frases, en castellano.`
        : `Tema: la palabra inglesa "${word}". Máximo 25 palabras. Cuenta su origen, etimología o una curiosidad sobre ella. Texto corrido, en castellano.`;
      const llmRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: isFlagMode ? 320 : 120,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      const llmData = await llmRes.json();
      explanation = llmData.content?.[0]?.text?.trim() || '';
      // Saneador agresivo: recorta repetidamente muletillas iniciales aunque vayan
      // encadenadas ("Pues mira, a ver, ..." → "...").
      const fillerRegex = /^[\s,.\-—:;¡!¿?"«»'`´·]*(?:mmm+|hmm+|ehh+|ahh+|uff+|pues(?:\s+(?:mira|bien))?|bueno|a\s+ver|vamos\s+a\s+ver|déjame(?:\s+(?:pensar|contarte|ver))?|mira|sabes|verás|curiosamente|interesante|resulta\s+que|te\s+cuento|fíjate|ostras|vaya|ah|oh|eh)\b[\s,.\-—:;¡!¿?]*/i;
      let prev;
      do { prev = explanation; explanation = explanation.replace(fillerRegex, '').trim(); } while (explanation && explanation !== prev);
      if (explanation) explanation = explanation.charAt(0).toUpperCase() + explanation.slice(1);
    } catch { /* opcional */ }
  }
  // Mantener nombre `etymology` para no tocar el resto del flujo.
  const etymology = explanation;

  // 2. Construir segmentos de audio según contexto
  const labelSpoken = { A: 'la a', B: 'la be', C: 'la ce', D: 'la de' }[correctLabel] || correctLabel;
  const fallbackTail = etymology || answer;

  // Lamentos para auto-wrong (sin "la a:"... entra directo al lamento + explicación)
  const wrongLaments = [
    '¡Oh, no! Casi rozas la gloria.',
    'Ay madre, esa se te ha resbalado entre los dedos.',
    'Vaya por Dios, qué cerca y qué lejos.',
    'Uy, error de cálculo.',
    'Ains, no era esa.',
    'Tropezón clásico.',
    'Así se aprende.',
  ];

  const html = `<strong>${correctLabel}: "${answer}"</strong>`
             + (etymology ? `<br><small style="opacity:.8">📖 ${etymology}</small>` : '');

  // 3. Construir texto hablado según contexto
  try {
    let spoken;
    const useEnPhonemes = !isFlagMode && mode === 'es-en';

    if (ctx === 'auto-correct' || ctx === 'explain') {
      // Directo a la explicación, sin "la a:", sin "por cierto",
      // sin afirmaciones tipo "¡eso es!" ni comentarios sobre acierto/fallo.
      // 'explain' lo invoca el botón manual; 'auto-correct' lo dispara el sistema tras acertar.
      if (etymology) {
        spoken = useEnPhonemes ? injectPhonemes(etymology, answer) : etymology;
      } else {
        // Sin etimología → fallback mínimo: solo la respuesta
        spoken = useEnPhonemes ? enPhoneme(answer) : answer;
      }
    } else if (ctx === 'auto-wrong') {
      // Fallo: lamento original + explicación directa
      const lament = wrongLaments[Math.floor(Math.random() * wrongLaments.length)];
      const correctPhrase = `Era ${labelSpoken}: ${useEnPhonemes ? enPhoneme(answer) : answer}.`;
      const tail = etymology ? (useEnPhonemes ? injectPhonemes(etymology, answer) : etymology) : '';
      spoken = `${lament} ${correctPhrase} ${tail}`.trim();
    } else {
      // Lifeline (comodín manual): duda y responde
      const dudaTemplates = [
        [`Mmm... a ver... sí, lo tengo. ${labelSpoken}:`, `. `],
        [`Uf, déjame pensar... ${labelSpoken}:`, `. `],
        [`Hmm... creo que ${labelSpoken}:`, `. Sí, eso es. `],
        [`A ver... esto lo sé... ${labelSpoken}:`, `. Estoy seguro. `],
      ];
      const [prefix, suffix] = dudaTemplates[Math.floor(Math.random() * dudaTemplates.length)];
      if (useEnPhonemes) {
        const answerTag = enPhoneme(answer);
        const close = etymology ? `${suffix}Por cierto, ${injectPhonemes(etymology, answer)}` : suffix.trim();
        spoken = `${prefix} ${answerTag}${close}`;
      } else {
        spoken = etymology
          ? `${prefix} ${answer}${suffix}Por cierto, ${etymology}`
          : `${prefix} ${answer}${suffix.trim()}`;
      }
    }

    const audioBuf = await fishTTS(spoken, fishKey, voiceId, useEnPhonemes);
    res.json({ audio: audioBuf.toString('base64'), html });
  } catch (e) {
    res.status(500).json({ error: e.message, html });
  }
});

// ─── Word Images ─────────────────────────────────────────────────────────────

// GET /api/word-image/:word/:category → SVG desde fichero (o BLOB legacy si path es NULL)
app.get('/api/word-image/:word/:category', (req, res) => {
  const row = db.prepare(
    'SELECT path, image_data, image_mime FROM word_images WHERE word_lower=? AND category=?'
  ).get(req.params.word.toLowerCase(), req.params.category);
  if (!row) return res.status(404).json({ error: 'image not found' });

  res.set('Cache-Control', 'public, max-age=86400, immutable');

  if (row.path) {
    const abs = path.join(__dirname, 'data', 'images', row.path);
    const fs = require('fs');
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'image file missing' });
    res.set('Content-Type', row.image_mime);
    return res.sendFile(abs);
  }

  // Compat: BLOB legacy (path IS NULL)
  if (row.image_data && row.image_data.length > 0) {
    res.set('Content-Type', row.image_mime);
    return res.send(Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data));
  }

  return res.status(404).json({ error: 'image not found' });
});

// GET /api/word-image-meta/:word/:category → JSON metadata
app.get('/api/word-image-meta/:word/:category', (req, res) => {
  const row = db.prepare(
    'SELECT source, metadata, generated_at FROM word_images WHERE word_lower=? AND category=?'
  ).get(req.params.word.toLowerCase(), req.params.category);
  if (!row) return res.status(404).json({ error: 'image not found' });
  res.json({
    source:       row.source,
    metadata:     row.metadata ? JSON.parse(row.metadata) : null,
    generated_at: row.generated_at,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[VOC] API en http://127.0.0.1:${PORT}`);
});
