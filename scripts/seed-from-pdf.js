'use strict';
/**
 * Extrae palabras de un PDF de wordlist Cambridge CEFR,
 * obtiene traducciones ES vía MyMemory API y las inserta en voc.db.
 *
 * Uso: node scripts/seed-from-pdf.js <pdf> <nivel> [--delay=N]
 *   pdf    ruta al PDF
 *   nivel  A1 | A2 | B1 | B2 | C1 | C2
 *   --delay ms entre requests (defecto 600)
 *   --dry-run  solo muestra palabras sin insertar
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');

const DB_PATH  = path.join(__dirname, '..', 'data', 'voc.db');
const pdfPath  = process.argv[2];
const level    = (process.argv[3] || '').toUpperCase();
const DELAY_MS = parseInt(process.argv.find(a => a.startsWith('--delay='))?.split('=')[1] || '600');
const DRY_RUN  = process.argv.includes('--dry-run');

if (!pdfPath || !['A1','A2','B1','B2','C1','C2'].includes(level)) {
  console.error('Uso: node seed-from-pdf.js <pdf> <nivel> [--delay=N] [--dry-run]');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── PDF → texto ─────────────────────────────────────────────────────────────
function extractText(pdf) {
  return execSync(`pdftotext "${pdf}" -`, { maxBuffer: 10 * 1024 * 1024 }).toString();
}

// ─── Parser de wordlist alphabética ──────────────────────────────────────────
const GRAM_TAGS = /\b(adj|adv|conj|det|dis|excl|int|n|pl|poss|prep|pron|s|v)\b/;
const SKIP_PHRASES = ['be going to', 'be called', 'there is', 'there are'];
const NAMES = new Set([
  'Abdul','Anna','Beth','Charlie','Defne','Emma','Jack','Li','Lucia','Maria',
  'Matt','Mia','Mike','Pat','Sam','Tina','Tom',
]);

function parseWords(text) {
  const alphaStart = /alphabetic\s+vocabulary\s+list/i;
  const alphaEnd   = /differences between the digital/i;

  const lines = text.split('\n');

  // Collect words from ALL alphabetic sections with content
  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    if (!alphaStart.test(lines[i].trim())) continue;
    let hasContent = false;
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      if (alphaEnd.test(lines[j])) break;
      if (GRAM_TAGS.test(lines[j])) { hasContent = true; break; }
    }
    if (hasContent) sections.push(i);
  }
  if (sections.length === 0) { console.error('[seed] No se encontró sección alfabética con contenido'); return []; }
  console.log(`[seed] Secciones con contenido: ${sections.length} (líneas ${sections.join(', ')})`);

  const words = new Set();

  function processEntry(entry) {
    let cleaned = entry
      .replace(/\(US [^)]+\)/g, '')
      .replace(/\(UK [^)]+\)/g, '')
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/\b(adj|adv|conj|det|dis|excl|int|n|pl|poss|prep|pron|s|v)(\s*\+\s*(adj|adv|conj|det|dis|excl|int|n|pl|poss|prep|pron|s|v))*\b.*$/, '')
      .replace(/\/\w+/g, '')
      // Normalize accented chars to ASCII (é→e, ó→o, etc.)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (!cleaned || cleaned.length < 2) return;
    // Skip phrasal verbs / function phrases
    if (/^(be|get|go|come|have got|take a|have to|look for|dress up|make |how |my |no problem|excuse|all right|would like|o clock)/.test(cleaned)) return;
    const wordCount = cleaned.split(' ').length;
    if (wordCount > 2) return;
    const titleCase = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    if (NAMES.has(titleCase)) return;
    // Skip likely proper names (short words starting capital in original, now lowercase)
    if (/^[a-z]+(son|ez|ov|ova|ak|ik)$/.test(cleaned) && cleaned.length < 6) return;
    if (/^\d/.test(cleaned)) return;
    words.add(cleaned);
  }

  for (const startIdx of sections) {
    let li = startIdx + 1;
    while (li < lines.length) {
      const line = lines[li].trim();
      li++;
      if (alphaEnd.test(line)) break;
      if (!line || /^\d+$/.test(line) || /^[A-Z]$/.test(line)) continue;
      if (!GRAM_TAGS.test(line)) continue;
      if (/grammatical|adjective|discourse|plural|singular|adverb|exclamation|possessive|conjunction|interrogative|preposition|determiner|pronoun|vocabulary list|wordlist|following words|digital/i.test(line)) continue;

      const entries = line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
      for (const entry of entries) processEntry(entry);
    }
  }

  return [...words].sort();
}

// ─── Traducción vía Google Cloud Translation ──────────────────────────────────
const GOOGLE_API_KEY = (() => {
  try {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    return env.match(/GOOGLE_TRANSLATION_API_KEY=(.+)/)?.[1]?.trim();
  } catch { return null; }
})();

function translateWord(word) {
  return new Promise((resolve) => {
    if (!GOOGLE_API_KEY) return resolve(null);
    const body = JSON.stringify({ q: word, source: 'en', target: 'es', format: 'text' });
    const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`;
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const t = data?.data?.translations?.[0]?.translatedText;
          if (!t || t.toLowerCase() === word.toLowerCase()) return resolve(null);
          if (t.length > 80 || /[<>]/.test(t)) return resolve(null);
          resolve(t.toLowerCase());
        } catch { resolve(null); }
      });
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[seed] Leyendo PDF: ${pdfPath}`);
  const text  = extractText(pdfPath);
  const words = parseWords(text);
  console.log(`[seed] Palabras extraídas: ${words.length}`);

  if (DRY_RUN) {
    console.log(words.join('\n'));
    return;
  }

  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO words (word, translation, level, category) VALUES (?, ?, ?, ?)'
  );
  const exists = db.prepare('SELECT 1 FROM words WHERE word = ? AND level = ?');

  let inserted = 0, skipped = 0, noTrans = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    process.stdout.write(`\r[seed] ${i+1}/${words.length} (${Math.round((i+1)/words.length*100)}%) — ${word.padEnd(20)}`);

    if (exists.get(word, level)) { skipped++; continue; }

    const translation = await translateWord(word);
    if (!translation) { noTrans++; await sleep(DELAY_MS); continue; }

    insert.run(word, translation, level, 'general');
    inserted++;
    await sleep(DELAY_MS);
  }

  db.close();
  console.log(`\n[seed] Insertadas: ${inserted} | Ya existían: ${skipped} | Sin traducción: ${noTrans}`);
}

main().catch(err => { console.error(err); process.exit(1); });
