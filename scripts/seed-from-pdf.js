'use strict';
/**
 * Extrae palabras de un PDF de wordlist Cambridge CEFR,
 * obtiene traducciones ES vía Google Translate y las inserta en voc.db.
 *
 * Uso: node scripts/seed-from-pdf.js <pdf> <nivel> [--delay=N] [--dry-run]
 *   pdf    ruta al PDF
 *   nivel  A1 | A2 | B1 | B2 | C1 | C2
 *   --delay ms entre requests (defecto 400)
 *   --dry-run  solo muestra palabras sin insertar
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');

const DB_PATH  = path.join(__dirname, '..', 'data', 'voc.db');
const pdfPath  = process.argv[2];
const level    = (process.argv[3] || '').toUpperCase();
const DELAY_MS = parseInt(process.argv.find(a => a.startsWith('--delay='))?.split('=')[1] || '400');
const DRY_RUN  = process.argv.includes('--dry-run');

if (!pdfPath || !['A1','A2','B1','B2','C1','C2'].includes(level)) {
  console.error('Uso: node seed-from-pdf.js <pdf> <nivel> [--delay=N] [--dry-run]');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function extractText(pdf) {
  return execSync(`pdftotext "${pdf}" -`, { maxBuffer: 10 * 1024 * 1024 }).toString();
}

// ─── Detección de formato ─────────────────────────────────────────────────────
function detectFormat(text) {
  if (/alphabetic\s+vocabulary\s+list/i.test(text)) return 'a1';
  // Dictionary format (B2/C1/C2): many lines of "word /IPA/"
  const dictLines = (text.match(/^[a-zA-Z][a-zA-Z\s'-]{0,35}\s+\/[ˈˌ]?[a-zɪʊəɛɑɔæʌɒ.ˈˌ]+\//gm) || []).length;
  if (dictLines > 30) return 'dict';
  // Cambridge format (A2/B1): many "word (pos)" entries
  const cambEntries = (text.match(/\((?:adj|adv|n\b|v\b|pron|prep|det|conj|exclam|mv|av|phr)[^)]{0,30}\)/g) || []).length;
  if (cambEntries > 30) return 'cambridge';
  return 'unknown';
}

// ─── Parser A1 (Pre-A1 Starters, formato original) ───────────────────────────
const GRAM_TAGS_A1 = /\b(adj|adv|conj|det|dis|excl|int|n|pl|poss|prep|pron|s|v)\b/;
const NAMES = new Set([
  'Abdul','Anna','Beth','Charlie','Defne','Emma','Jack','Li','Lucia','Maria',
  'Matt','Mia','Mike','Pat','Sam','Tina','Tom',
]);

function parseA1(text) {
  const alphaStart = /alphabetic\s+vocabulary\s+list/i;
  const alphaEnd   = /differences between the digital/i;
  const lines = text.split('\n');
  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    if (!alphaStart.test(lines[i].trim())) continue;
    let hasContent = false;
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      if (alphaEnd.test(lines[j])) break;
      if (GRAM_TAGS_A1.test(lines[j])) { hasContent = true; break; }
    }
    if (hasContent) sections.push(i);
  }
  if (sections.length === 0) return [];

  const words = new Set();
  function processEntry(entry) {
    let w = entry
      .replace(/\(US [^)]+\)/g, '').replace(/\(UK [^)]+\)/g, '')
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/\b(adj|adv|conj|det|dis|excl|int|n|pl|poss|prep|pron|s|v)(\s*\+\s*(adj|adv|conj|det|dis|excl|int|n|pl|poss|prep|pron|s|v))*\b.*$/, '')
      .replace(/\/\w+/g, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z\s'-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!w || w.length < 2) return;
    if (/^(be|get|go|come|have got|take a|have to|look for|dress up|make |how |my |no problem|excuse|all right|would like|o clock)/.test(w)) return;
    if (w.split(' ').length > 2) return;
    const tc = w.charAt(0).toUpperCase() + w.slice(1);
    if (NAMES.has(tc)) return;
    if (/^\d/.test(w)) return;
    words.add(w);
  }
  for (const startIdx of sections) {
    let li = startIdx + 1;
    while (li < lines.length) {
      const line = lines[li].trim(); li++;
      if (alphaEnd.test(line)) break;
      if (!line || /^\d+$/.test(line) || /^[A-Z]$/.test(line)) continue;
      if (!GRAM_TAGS_A1.test(line)) continue;
      if (/grammatical|adjective|discourse|plural|singular|adverb|exclamation|possessive|conjunction|interrogative|preposition|determiner|pronoun|vocabulary list|wordlist|following words|digital/i.test(line)) continue;
      for (const entry of line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean)) processEntry(entry);
    }
  }
  return [...words].sort();
}

// ─── Parser Cambridge A2/B1 (formato "word (pos)") ───────────────────────────
function parseCambridge(text) {
  const words = new Set();
  const POS_RE = /\((?:adj|adv|n\b|v\b|pron|prep|det|conj|exclam|mv|av|phr\s*v|abbrev|sing|pl)[^)]{0,30}\)/;
  const META = /vocabulary|wordlist|cambridge|examination|appendix|introduction|abbreviated|abbreviation/i;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || META.test(line)) continue;
    if (line.startsWith('©') || line.startsWith('Page')) continue;

    // Split multi-column lines by 2+ spaces, then process each segment
    for (const seg of line.split(/\s{2,}/)) {
      const s = seg.trim();
      if (!POS_RE.test(s)) continue;
      // Remove pos tag and everything after it to get the word
      let raw = s.replace(POS_RE, '').trim();
      raw = raw.replace(/^[•·]\s*/, '').trim();
      raw = raw.split('/')[0].trim(); // "a/an" → "a"
      const w = raw.toLowerCase().replace(/[^a-z\s'-]/g, '').replace(/\s+/g, ' ').trim();
      if (!w || w.length < 2) continue;
      // Only accept single words or known 2-word compounds (no digits, no articles mid-phrase)
      const parts = w.split(' ');
      if (parts.length > 2) continue;
      if (parts.length === 2) {
        // Skip if it looks like a sentence fragment (contains numbers/articles from examples)
        if (/\d/.test(raw)) continue;
        // Skip section header artifacts like "z zebra"
        if (parts[0].length === 1) continue;
      }
      words.add(w);
    }
  }
  return [...words].sort();
}

// ─── Parser diccionario B2/C1/C2 (formato "word /IPA/") ──────────────────────
function parseDict(text) {
  const words = new Set();
  const lines = text.split('\n');
  // Lines of the form: word /IPA/   (the word is on its own line before the IPA)
  const re = /^([a-zA-Z][a-zA-Z\s'-]{0,35}?)\s+\/[ˈˌ]?[^\s/]{2,}\//;
  for (const line of lines) {
    const m = line.trim().match(re);
    if (!m) continue;
    const w = m[1].trim().toLowerCase().replace(/[^a-z\s'-]/g, '').replace(/\s+/g, ' ').trim();
    if (!w || w.length < 2 || w.split(' ').length > 3) continue;
    // Skip meta words that appear in abbreviations section
    if (/^(abbreviation|adjective|adverb|conjunction|determiner|exclamation|modal|noun|phrasal|plural|preposition|pronoun|singular|verb|auxiliary|literary|formal|informal|written|countable|uncountable|intransitive|transitive|approving|disapproving|specialized|symbol|before|often)$/.test(w)) continue;
    words.add(w);
  }
  return [...words].sort();
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
function parseWords(text) {
  const fmt = detectFormat(text);
  console.log(`[seed] Formato detectado: ${fmt}`);
  if (fmt === 'a1')        return parseA1(text);
  if (fmt === 'cambridge') return parseCambridge(text);
  if (fmt === 'dict')      return parseDict(text);
  console.error('[seed] Formato desconocido, no se pueden extraer palabras');
  return [];
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
    const body = JSON.stringify({ q: word, source: 'en', target: 'es-ES', format: 'text' });
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

  if (words.length === 0) process.exit(1);

  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO words (word, translation, level, category) VALUES (?, ?, ?, ?)'
  );
  const exists = db.prepare('SELECT 1 FROM words WHERE word = ? AND level = ?');

  let inserted = 0, skipped = 0, noTrans = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    process.stdout.write(`\r[seed] ${i+1}/${words.length} (${Math.round((i+1)/words.length*100)}%) — ${word.padEnd(25)}`);

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
