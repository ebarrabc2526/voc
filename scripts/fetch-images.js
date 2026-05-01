'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { searchAndFetch } = require('./lib/image-fetchers/pexels');
const { safeFilename } = require('./lib/image-storage');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const API_KEY = process.env.PEXELS_API_KEY;

if (!API_KEY) {
  console.error('PEXELS_API_KEY no está en .env'); process.exit(1);
}

// Lista de palabras de la Fase 1 (hardcoded por ahora)
const FASE1_WORDS = ['hand','foot','eye','ear','nose','mouth','head','leg','arm','hair'];
const CATEGORY = 'body';

const db = new Database(DB_PATH);

async function processOne(word) {
  // ¿Existe ya imagen para (word, category)?
  const existing = db.prepare(
    "SELECT word_lower FROM word_images WHERE word_lower=? AND category=?"
  ).get(word.toLowerCase(), CATEGORY);
  if (existing) {
    return { word, status: 'skipped_existing' };
  }

  try {
    const res = await searchAndFetch(word, API_KEY);
    if (!res) return { word, status: 'no_results' };

    // Guardar archivo
    const rel = `${CATEGORY}/${safeFilename(word)}.jpg`;
    const abs = path.join(__dirname, '..', 'data', 'images', rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, res.buffer);

    // INSERT en BD (image_data = X'' empty)
    const metadata = JSON.stringify({
      query: res.query,
      attribution: {
        photographer: res.photographer,
        photographer_url: res.photographer_url,
        photo_url: res.photo_url,
        license: 'Pexels License (free use, attribution appreciated)',
      },
      photo_id: res.photo_id,
      src_url: res.src_url,
      bytes: res.buffer.length,
    });
    db.prepare(`
      INSERT INTO word_images (word_lower, category, image_data, image_mime, source, metadata, path)
      VALUES (?, ?, X'', ?, 'pexels', ?, ?)
    `).run(word.toLowerCase(), CATEGORY, res.mime, metadata, rel);

    return { word, status: 'ok', path: rel, bytes: res.buffer.length, attribution: res.photographer };
  } catch (e) {
    return { word, status: 'error', error: e.message };
  }
}

(async () => {
  console.log(`[fetch-images] Fase 1 — ${FASE1_WORDS.length} palabras de ${CATEGORY}`);
  const report = [];
  for (const w of FASE1_WORDS) {
    const r = await processOne(w);
    console.log(`  ${w.padEnd(10)} ${r.status}${r.attribution ? ' · '+r.attribution : ''}${r.error ? ' · '+r.error : ''}`);
    report.push(r);
    // Throttle 5s para no agotar rate limit
    await new Promise(res => setTimeout(res, 5000));
  }
  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'images-body-fase1-report.json'),
    JSON.stringify(report, null, 2)
  );
  const ok = report.filter(r => r.status === 'ok').length;
  console.log(`\n[fetch-images] Resumen: ${ok}/${FASE1_WORDS.length} ok, ${report.filter(r=>r.status!=='ok').length} fallidas/saltadas`);
  db.close();
})();
