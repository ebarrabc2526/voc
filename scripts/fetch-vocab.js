'use strict';
/**
 * Descarga ~10.000 palabras clasificadas por nivel CEFR con traducciones al español
 * e IPA UK/US, y guarda el resultado en data/vocabulary-full.json
 *
 * Fuentes:
 *   - CEFR-J (A1-B2): CC BY-SA 4.0
 *   - Words-CEFR-Dataset (C1-C2): MIT
 *   - IPA-dict (en_US, en_UK): MIT
 *   - Wiktionary API (traducciones): CC BY-SA 3.0
 *
 * Uso: node scripts/fetch-vocab.js
 *   --concurrency N  (defecto: 3)
 *   --delay N        (ms entre requests Wiktionary, defecto: 400)
 *   --limit N        (defecto: sin límite, para pruebas)
 *   --levels A1,B1   (defecto: A1,A2,B1,B2,C1,C2)
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

// ─── Config ───────────────────────────────────────────────────────────────────
const CACHE_DIR  = path.join(__dirname, '..', 'data', 'wikt-cache');
const OUTPUT     = path.join(__dirname, '..', 'data', 'vocabulary-full.json');
const CONCURRENCY  = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3');
const DELAY_MS     = parseInt(process.argv.find(a => a.startsWith('--delay='))?.split('=')[1] || '400');
const LIMIT        = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');
const LEVEL_FILTER = (process.argv.find(a => a.startsWith('--levels='))?.split('=')[1] || 'A1,A2,B1,B2,C1,C2').split(',');

const CEFR_LEVEL_MAP = { 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1', 6: 'C2' };

const SOURCES = {
  cefrj:  'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv',
  ipaUS:  'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt',
  ipaUK:  'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_UK.txt',
  cefrWords: 'https://raw.githubusercontent.com/Maximax67/Words-CEFR-Dataset/main/csv/words.csv',
  cefrPos:   'https://raw.githubusercontent.com/Maximax67/Words-CEFR-Dataset/main/csv/word_pos.csv',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function fetchText(url, retries = 5, backoff = 2000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const body = await new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        lib.get(url, { headers: { 'User-Agent': 'VOC-vocab-builder/1.0 (bot-traffic@wikimedia.org)' } }, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fetchText(res.headers.location, retries - attempt, backoff).then(resolve).catch(reject);
            res.resume();
            return;
          }
          if (res.statusCode === 429) {
            res.resume();
            return reject(Object.assign(new Error('rate-limited'), { code: 429 }));
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          res.on('error', reject);
        }).on('error', reject);
      });
      return body;
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = err.code === 429 ? backoff * Math.pow(2, attempt) : 1000;
      if (err.code === 429) process.stderr.write(`\r[rate-limit] esperando ${(wait/1000).toFixed(0)}s...   `);
      await sleep(wait);
    }
  }
}

// ─── IPA parser ───────────────────────────────────────────────────────────────
function buildIpaMap(text) {
  const map = {};
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const word = line.slice(0, tab).toLowerCase();
    const ipa  = line.slice(tab + 1).trim();
    // Keep only first IPA if multiple (separated by comma)
    map[word] = ipa.split(',')[0].trim();
  }
  return map;
}

// ─── CEFR-J parser (A1-B2) ───────────────────────────────────────────────────
function parseCefrj(csv) {
  const words = {};
  for (const line of csv.split('\n').slice(1)) {
    const cols = line.split(',');
    if (cols.length < 3) continue;
    const raw  = cols[0].replace(/"/g, '').trim().toLowerCase();
    const cefr = cols[2].replace(/"/g, '').trim();
    if (!raw || !['A1','A2','B1','B2'].includes(cefr)) continue;
    // Take first variant for entries like "a.m./AM/am"
    const word = raw.split('/')[0].replace(/[^a-z'-]/g, '');
    if (word.length >= 2 && !words[word]) words[word] = cefr;
  }
  return words;
}

// ─── Words-CEFR-Dataset parser (C1/C2 only, top by frequency) ────────────────
const MAX_C1C2 = 3000; // keep top N most frequent C1/C2 words

function parseWordsCefr(wordsCsv, posCsv) {
  const idToWord = {};
  for (const line of wordsCsv.split('\n').slice(1)) {
    const m = line.match(/"(\d+)","([^"]+)"/);
    if (!m) continue;
    idToWord[m[1]] = m[2].toLowerCase();
  }

  // Collect all C1/C2 words with their max frequency
  const byWord = {};
  for (const line of posCsv.split('\n').slice(1)) {
    const cols = line.replace(/"/g, '').split(',');
    if (cols.length < 6) continue;
    const wordId = cols[1];
    const freq   = parseInt(cols[4]) || 0;
    const level  = parseInt(cols[5]);
    if (level !== 5 && level !== 6) continue;
    const word = idToWord[wordId];
    if (!word || word.length < 2 || /[^a-z'-]/.test(word)) continue;
    const cefrLevel = CEFR_LEVEL_MAP[level];
    if (!byWord[word] || byWord[word].freq < freq) {
      byWord[word] = { level: cefrLevel, freq };
    }
  }

  // Sort by frequency descending and keep top MAX_C1C2
  const sorted = Object.entries(byWord)
    .sort((a, b) => b[1].freq - a[1].freq)
    .slice(0, MAX_C1C2);

  const out = {};
  for (const [word, { level }] of sorted) out[word] = level;
  return out;
}

// ─── Wiktionary translation ───────────────────────────────────────────────────
function extractSpanishFromWikitext(wt) {
  // Handle both {{t+|es|...}} and {{tt+|es|...}} (subpage templates use tt)
  // Look for Spanish section and get first non-qualified translation
  const spanishLine = wt.match(/\*\s*Spanish:\s*([^\n]+)/);
  if (spanishLine) {
    // Find first {{tt?+?|es|word...}} not immediately followed by {{qualifier
    const entries = [...spanishLine[1].matchAll(/\{\{tt?\+?\|es\|([^}|,]+)[^}]*\}\}(\s*\{\{qualifier)?/g)];
    for (const e of entries) {
      if (!e[2]) { // no qualifier
        const t = e[1].trim();
        if (t.length >= 2 && t.length <= 60 && !/[[\]{}]/.test(t)) return t;
      }
    }
    // Fallback: take first match even with qualifier
    if (entries.length) {
      const t = entries[0][1].trim();
      if (t.length >= 2 && t.length <= 60 && !/[[\]{}]/.test(t)) return t;
    }
  }
  return null;
}

async function getSpanishTranslation(word) {
  const cacheFile = path.join(CACHE_DIR, word.replace(/[^a-z'-]/g, '_') + '.json');
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8')).t;
  }
  let translation = null;
  try {
    const apiBase = `https://en.wiktionary.org/w/api.php?action=parse&prop=wikitext&format=json&page=`;

    // 1. Try main page
    const raw = await fetchText(apiBase + encodeURIComponent(word));
    const json = JSON.parse(raw);
    const wt = json?.parse?.wikitext?.['*'] || '';

    if (wt.includes('see translation subpage')) {
      // 2. Fetch the /translations subpage
      const raw2 = await fetchText(apiBase + encodeURIComponent(word + '/translations'));
      const json2 = JSON.parse(raw2);
      const wt2 = json2?.parse?.wikitext?.['*'] || '';
      translation = extractSpanishFromWikitext(wt2);
    } else {
      translation = extractSpanishFromWikitext(wt);
    }
  } catch {
    // Network error — don't cache, will retry on next run
    return null;
  }
  // Cache result (including null = no translation found)
  fs.writeFileSync(cacheFile, JSON.stringify({ t: translation }));
  return translation;
}

// ─── Concurrency pool ────────────────────────────────────────────────────────
async function runPool(tasks, concurrency, delayMs, onProgress) {
  const results = new Array(tasks.length);
  let idx = 0;
  let done = 0;
  const worker = async () => {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
      done++;
      if (onProgress) onProgress(done, tasks.length);
      if (delayMs > 0 && idx < tasks.length) await sleep(delayMs);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  console.log('[fetch] Descargando CEFR-J (A1-B2)...');
  const cefrjWords = parseCefrj(await fetchText(SOURCES.cefrj));
  console.log(`[fetch] CEFR-J: ${Object.keys(cefrjWords).length} palabras`);

  let c1c2Words = {};
  if (LEVEL_FILTER.includes('C1') || LEVEL_FILTER.includes('C2')) {
    console.log('[fetch] Descargando Words-CEFR-Dataset (C1/C2) — puede tardar...');
    const [wordsCsv, posCsv] = await Promise.all([
      fetchText(SOURCES.cefrWords),
      fetchText(SOURCES.cefrPos),
    ]);
    c1c2Words = parseWordsCefr(wordsCsv, posCsv);
    console.log(`[fetch] C1/C2: ${Object.keys(c1c2Words).length} palabras candidatas`);
  }

  console.log('[fetch] Descargando IPA (US + UK)...');
  const [ipaUsText, ipaUkText] = await Promise.all([
    fetchText(SOURCES.ipaUS),
    fetchText(SOURCES.ipaUK),
  ]);
  const ipaUS = buildIpaMap(ipaUsText);
  const ipaUK = buildIpaMap(ipaUkText);
  console.log(`[fetch] IPA US: ${Object.keys(ipaUS).length} | UK: ${Object.keys(ipaUK).length}`);

  // Merge word lists — CEFR-J takes priority for A1-B2
  const allWords = { ...c1c2Words };
  for (const [w, lvl] of Object.entries(cefrjWords)) allWords[w] = lvl;

  // Filter by requested levels
  let wordEntries = Object.entries(allWords)
    .filter(([, lvl]) => LEVEL_FILTER.includes(lvl));

  if (LIMIT > 0) wordEntries = wordEntries.slice(0, LIMIT);

  const eta = Math.ceil(wordEntries.length * (DELAY_MS / CONCURRENCY) / 60000);
  console.log(`[fetch] Procesando ${wordEntries.length} palabras con ${CONCURRENCY} workers, delay ${DELAY_MS}ms (~${eta} min)...`);

  let lastPct = -1;
  const tasks = wordEntries.map(([word]) => () => getSpanishTranslation(word));
  const translations = await runPool(tasks, CONCURRENCY, DELAY_MS, (done, total) => {
    const pct = Math.floor(done / total * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      process.stdout.write(`\r[fetch] ${done}/${total} (${pct}%)   `);
    }
  });
  console.log('\n[fetch] Traducciones obtenidas.');

  // Build result grouped by level
  const result = {};
  for (const lvl of ['A1','A2','B1','B2','C1','C2']) result[lvl] = [];

  let skipped = 0;
  for (let i = 0; i < wordEntries.length; i++) {
    const [word, level] = wordEntries[i];
    const translation = translations[i];
    if (!translation) { skipped++; continue; }
    // Skip self-translations (same word as source)
    if (translation.toLowerCase() === word.toLowerCase()) { skipped++; continue; }
    result[level].push({
      word,
      translation,
      category: 'general',
      uk_ipa:   ipaUK[word] || '',
      us_ipa:   ipaUS[word] || '',
    });
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

  let total = 0;
  for (const [lvl, words] of Object.entries(result)) {
    console.log(`[fetch] ${lvl}: ${words.length} palabras`);
    total += words.length;
  }
  console.log(`[fetch] Total: ${total} palabras (${skipped} sin traducción)`);
  console.log(`[fetch] Guardado en: ${OUTPUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
