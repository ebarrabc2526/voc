require('dotenv').config();
const express    = require('express');
const compression = require('compression');
const path       = require('path');
const { OAuth2Client } = require('google-auth-library');
const jwt        = require('jsonwebtoken');
const Database   = require('better-sqlite3');

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
    level:         row.level,
    mode:          row.mode,
    category:      row.category,
    challengeType: row.challenge_type,
    autoPlay:      !!row.auto_play,
    autoPlayLangs: JSON.parse(row.auto_play_langs),
  });
});

app.put('/api/prefs', requireAuth, (req, res) => {
  const { level, mode, category, challengeType, autoPlay, autoPlayLangs } = req.body;
  db.prepare(`
    INSERT INTO user_prefs (sub, level, mode, category, challenge_type, auto_play, auto_play_langs)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sub) DO UPDATE SET
      level = excluded.level,
      mode = excluded.mode,
      category = excluded.category,
      challenge_type = excluded.challenge_type,
      auto_play = excluded.auto_play,
      auto_play_langs = excluded.auto_play_langs
  `).run(req.user.sub, level||'A1', mode||'en-es', category||'all',
         challengeType||'10', autoPlay ? 1 : 0,
         JSON.stringify(autoPlayLangs || ['uk','us']));
  res.json({ ok: true });
});

// ─── TTS Expert ───────────────────────────────────────────────────────────────
app.post('/api/tts-expert', requireAuth, async (req, res) => {
  const { word, answer, correctLabel } = req.body || {};
  if (!word || !answer || !correctLabel) return res.status(400).json({ error: 'missing params' });

  const fishKey    = process.env.FISH_AUDIO_API_KEY;
  const voiceId    = process.env.FISH_AUDIO_VOICE_ID;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!fishKey || !voiceId) return res.status(503).json({ error: 'TTS not configured' });

  // 1. Etimología via Claude Haiku
  let etymology = '';
  if (anthropicKey) {
    try {
      const llmRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 100,
          messages: [{ role: 'user', content: `Eres Jarvis, un asistente con personalidad. Haz UN comentario curioso o anecdótico (máximo 25 palabras) sobre el origen de la palabra inglesa "${word}". Habla en primera persona, con naturalidad, como si lo contaras de pasada. Nada de definiciones secas. Solo el comentario, sin comillas.` }],
        }),
      });
      const llmData = await llmRes.json();
      etymology = llmData.content?.[0]?.text?.trim() || '';
    } catch { /* opcional */ }
  }

  // 2. Construir guión: hesitación + respuesta + etimología
  const hes = [
    `Mmm... a ver... sí, lo tengo. La ${correctLabel}: "${answer}".`,
    `Uf, déjame pensar... la ${correctLabel}: "${answer}".`,
    `Hmm... creo que la ${correctLabel}: "${answer}". Sí, eso es.`,
    `A ver... esto lo sé... la ${correctLabel}: "${answer}". Estoy seguro.`,
  ][Math.floor(Math.random() * 4)];

  const spoken = etymology ? `${hes} Por cierto, ${etymology}` : hes;
  const html   = `<strong>${correctLabel}: "${answer}"</strong>`
               + (etymology ? `<br><small style="opacity:.8">📖 ${etymology}</small>` : '');

  // 3. TTS Fish Audio → base64
  try {
    const r = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${fishKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: spoken, reference_id: voiceId, format: 'mp3',
        mp3_bitrate: 128, sample_rate: 44100,
        temperature: 0.88, top_p: 0.92, latency: 'normal',
        chunk_length: 300, normalize: true,
      }),
    });
    if (!r.ok) throw new Error(`Fish Audio ${r.status}`);
    const buf = await r.arrayBuffer();
    res.json({ audio: Buffer.from(buf).toString('base64'), html });
  } catch (e) {
    res.status(500).json({ error: e.message, html });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[VOC] API en http://127.0.0.1:${PORT}`);
});
