const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const { OAuth2Client } = require('google-auth-library');
const jwt        = require('jsonwebtoken');

const app             = express();
const PORT            = process.env.PORT || 3000;
const HOF_FILE        = path.join(__dirname, 'data', 'hof.json');
const GOOGLE_CLIENT_ID = '766212808659-7krp4oj0n0lf2584ntalksa1m9el5iqi.apps.googleusercontent.com';
const JWT_SECRET      = process.env.JWT_SECRET || 'voc-jwt-secret-2026';
const googleClient    = new OAuth2Client(GOOGLE_CLIENT_ID);

fs.mkdirSync(path.dirname(HOF_FILE), { recursive: true });
if (!fs.existsSync(HOF_FILE)) fs.writeFileSync(HOF_FILE, '[]', 'utf8');

function readHof() {
  try { return JSON.parse(fs.readFileSync(HOF_FILE, 'utf8')); }
  catch { return []; }
}
function writeHof(data) {
  fs.writeFileSync(HOF_FILE, JSON.stringify(data, null, 2), 'utf8');
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

app.use(express.json());

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Token requerido' });
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    const token = jwt.sign(
      { sub: p.sub, name: p.name, email: p.email, picture: p.picture },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, name: p.name, email: p.email, picture: p.picture });
  } catch {
    res.status(401).json({ error: 'Token de Google inválido' });
  }
});

// ─── Hall of Fame ─────────────────────────────────────────────────────────────
app.get('/api/hof', (_req, res) => {
  res.json(readHof());
});

app.post('/api/hof', requireAuth, (req, res) => {
  const entry = req.body;
  const clean = {
    name:      req.user.name,   // siempre del token Google
    level:     String(entry.level     || ''),
    mode:      String(entry.mode      || ''),
    challenge: String(entry.challenge || ''),
    category:  String(entry.category  || ''),
    score:     Number(entry.score)    || 0,
    correct:   Number(entry.correct)  || 0,
    total:     Number(entry.total)    || 0,
    date:      new Date().toLocaleDateString('es-ES'),
  };

  const hof = readHof();
  hof.push(clean);
  hof.sort((a, b) => b.score - a.score);
  hof.splice(500);
  writeHof(hof);
  res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[VOC] API en http://127.0.0.1:${PORT}`);
});
