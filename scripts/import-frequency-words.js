'use strict';
/**
 * Importa ~50.000 palabras frecuentes del inglés a voc.db.
 *
 * Fuentes:
 *   - Lista de frecuencia: hermitdave/FrequencyWords en_50k.txt
 *   - IPA:                 open-dict-data/ipa-dict en_US.txt
 *   - Traducción ES:       Google Translate API v2
 *
 * CEFR por rango de frecuencia (aproximación lingüística estándar):
 *   rank 1–500   → A1
 *   rank 501–1500 → A2
 *   rank 1501–4000 → B1
 *   rank 4001–8000 → B2
 *   rank 8001–20000 → C1
 *   rank 20001–50000 → C2
 *
 * Uso: node scripts/import-frequency-words.js
 */

const path        = require('path');
const fs          = require('fs');
const https       = require('https');
const Database    = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const ENV     = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const API_KEY = ENV.match(/GOOGLE_TRANSLATION_API_KEY=(.+)/)?.[1]?.trim();

if (!API_KEY) { console.error('Sin GOOGLE_TRANSLATION_API_KEY en .env'); process.exit(1); }

// ─── CEFR por rango ───────────────────────────────────────────────────────────
function cefrByRank(rank) {
  if (rank <=   500) return 'A1';
  if (rank <=  1500) return 'A2';
  if (rank <=  4000) return 'B1';
  if (rank <=  8000) return 'B2';
  if (rank <= 20000) return 'C1';
  return 'C2';
}

// ─── Descargar URL ────────────────────────────────────────────────────────────
function download(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} – ${url}`));
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
  });
}

// ─── Traducción en lote (máx 128 palabras por petición) ──────────────────────
function translateBatch(words) {
  return new Promise((resolve, reject) => {
    const qs = words.map(w => `q=${encodeURIComponent(w)}`).join('&');
    const body = Buffer.from(
      `${qs}&target=es-ES&source=en&format=text&key=${API_KEY}`
    );
    const options = {
      hostname: 'translation.googleapis.com',
      path:     '/language/translate/v2',
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const translations = data?.data?.translations?.map(t => t.translatedText) || [];
          resolve(translations);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Categoría básica por POS / forma ────────────────────────────────────────
// Reutiliza el mismo criterio heurístico que assign-categories.js
const CAT_HINTS = {
  // sufijos típicos de adjetivos → descriptions
  able: 'descriptions', ible: 'descriptions', ful: 'descriptions',
  less: 'descriptions', ous:  'descriptions', ive: 'descriptions',
  ish:  'descriptions', ical: 'descriptions', ic:  'descriptions',
  // sufijos de adverbios → grammar
  ally: 'grammar', ily: 'grammar',
  // sufijos de sustantivos abstractos → descriptions
  ness: 'descriptions', ment: 'descriptions', tion: 'descriptions',
  sion: 'descriptions', ity:  'descriptions', ance: 'descriptions',
  ence: 'descriptions', ship: 'descriptions', hood: 'descriptions',
  // sufijos de verbos → actions
  ize:  'actions', ise:  'actions', ify:  'actions', ate:  'actions',
  // sufijos de agentes → work
  er:   'work',    or:   'work',    ist:  'work',    ian:  'work',
};

function guessCategory(word) {
  const w = word.toLowerCase();
  for (const [suffix, cat] of Object.entries(CAT_HINTS)) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) return cat;
  }
  return 'general';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Palabras ya existentes en la BD
  const existing = new Set(
    db.prepare('SELECT LOWER(word) as w FROM words').all().map(r => r.w)
  );
  console.log(`[import] Palabras ya en BD: ${existing.size}`);

  // ── Descargar lista de frecuencia ──
  console.log('[import] Descargando lista de frecuencia (50k)…');
  const freqRaw = await download(
    'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt'
  );
  const freqWords = freqRaw.split('\n')
    .map(l => l.split(' ')[0]?.trim().toLowerCase())
    .filter(w => w && /^[a-z]{2,}$/.test(w))    // solo palabras, sin números ni caracteres especiales
    .filter(w => !existing.has(w));               // excluir las que ya están

  // Eliminar duplicados y limitar a primeras 50k nuevas
  const uniqueNew = [...new Set(freqWords)].slice(0, 50000);
  console.log(`[import] Palabras nuevas a importar: ${uniqueNew.length}`);

  // ── Descargar IPA dict ──
  console.log('[import] Descargando IPA dict…');
  const ipaRaw = await download(
    'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt'
  );
  const ipaMap = {};
  for (const line of ipaRaw.split('\n')) {
    const [word, ipa] = line.split('\t');
    if (word && ipa) ipaMap[word.toLowerCase()] = ipa.split(',')[0].trim();
  }
  console.log(`[import] IPA dict cargado: ${Object.keys(ipaMap).length} entradas`);

  // ── Preparar inserción ──
  db.prepare(`
    CREATE TABLE IF NOT EXISTS words (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      word        TEXT    NOT NULL,
      level       TEXT    NOT NULL,
      category    TEXT    NOT NULL DEFAULT 'general',
      translation TEXT,
      uk_ipa      TEXT,
      us_ipa      TEXT
    )
  `).run();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO words (word, level, category, translation, uk_ipa, us_ipa)
    VALUES (@word, @level, @category, @translation, @uk_ipa, @us_ipa)
  `);

  // ── Traducir e insertar en lotes ──
  const BATCH = 100;
  let inserted = 0;
  let errors   = 0;

  for (let i = 0; i < uniqueNew.length; i += BATCH) {
    const batch = uniqueNew.slice(i, i + BATCH);
    let translations;
    try {
      translations = await translateBatch(batch);
    } catch (e) {
      console.error(`[import] Error traduciendo lote ${i}–${i + BATCH}:`, e.message);
      translations = batch.map(() => null);
      errors += batch.length;
    }

    const insertMany = db.transaction(words => {
      for (let j = 0; j < words.length; j++) {
        const word  = words[j];
        const rank  = i + j + 1;
        const level = cefrByRank(rank);
        const ipa   = ipaMap[word] || null;
        insert.run({
          word,
          level,
          category:    guessCategory(word),
          translation: translations[j] || null,
          uk_ipa:      ipa,
          us_ipa:      ipa,
        });
        inserted++;
      }
    });
    insertMany(batch);

    if ((i / BATCH) % 10 === 0) {
      const pct = Math.round((i + BATCH) / uniqueNew.length * 100);
      process.stdout.write(`\r[import] Progreso: ${Math.min(i + BATCH, uniqueNew.length)}/${uniqueNew.length} (${pct}%) – errores: ${errors}  `);
    }

    // Pequeña pausa para no saturar la API
    await new Promise(r => setTimeout(r, 60));
  }

  console.log(`\n[import] ✓ Insertadas: ${inserted} | Errores: ${errors}`);

  const total = db.prepare('SELECT COUNT(*) as n FROM words').get().n;
  console.log(`[import] Total palabras en BD: ${total}`);
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
