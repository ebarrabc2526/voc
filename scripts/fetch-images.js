'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const cloudflare = require('./lib/image-fetchers/cloudflare');
const pollinations = require('./lib/image-fetchers/pollinations');
const wikipedia = require('./lib/image-fetchers/wikipedia');
const { searchAndFetch: pexelsSearch } = require('./lib/image-fetchers/pexels');
const { safeFilename } = require('./lib/image-storage');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const CATEGORY = process.argv[2] || 'body';
const THROTTLE_MS = parseInt(process.env.THROTTLE_MS || '3000', 10);
const LIMIT = parseInt(process.env.LIMIT || '0', 10);

const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_TOKEN = process.env.CLOUDFLARE_AI_TOKEN;
const PEXELS_KEY = process.env.PEXELS_API_KEY;
const SKIP_CF = process.env.SKIP_CLOUDFLARE === '1';
const SKIP_POLLINATIONS = process.env.SKIP_POLLINATIONS === '1';
const SKIP_WIKIPEDIA = process.env.SKIP_WIKIPEDIA === '1';

// Palabras anatómicas sensibles → ir directo a Wikipedia (CF/Pollinations las censuran)
const WIKI_FIRST = new Set([
  'anal','anus','arse','arsehole','ass','asshole','butt','butthole',
  'breast','breasts','boob','boobs','bosom','bust','cleavage','nipple','nipples','areola',
  'penis','penises','phallus','dick','cock','testicle','testicles','testis','scrotum','foreskin','glans',
  'vagina','vaginas','vulva','clitoris','labia','cervix','hymen',
  'genital','genitals','genitalia','privates','crotch','groin','pubis','pubic',
  'rectum','rectal','perineum','prostate',
  'buttock','buttocks','bum','butts',
  'erection','ejaculation','orgasm','semen','sperm','menstruation','period','vaginal','penile',
]);

const db = new Database(DB_PATH);

function getPendingWords() {
  return db.prepare(`
    SELECT DISTINCT LOWER(word) as word_lower
    FROM words
    WHERE category = ?
      AND LOWER(word) NOT IN (
        SELECT word_lower FROM word_images WHERE category = ?
      )
    ORDER BY word_lower
  `).all(CATEGORY, CATEGORY).map(r => r.word_lower);
}

async function tryCloudflare(word) {
  if (SKIP_CF || !CF_ACCOUNT || !CF_TOKEN) return null;
  try {
    return await cloudflare.generate(word, CATEGORY, CF_ACCOUNT, CF_TOKEN);
  } catch (e) {
    return { error: e.message, refused: !!e.refused };
  }
}

async function tryPollinations(word) {
  if (SKIP_POLLINATIONS) return null;
  try {
    return await pollinations.generate(word, CATEGORY);
  } catch (e) {
    return { error: e.message };
  }
}

async function tryWikipedia(word) {
  if (SKIP_WIKIPEDIA) return null;
  try {
    return await wikipedia.generate(word, CATEGORY);
  } catch (e) {
    return { error: e.message };
  }
}

async function tryPexels(word) {
  if (!PEXELS_KEY) return null;
  try {
    const r = await pexelsSearch(word, PEXELS_KEY);
    if (!r) return { error: 'no_results' };
    return {
      buffer: r.buffer,
      mime: r.mime,
      source: 'pexels',
      query: r.query,
      attribution: {
        photographer: r.photographer,
        photographer_url: r.photographer_url,
        photo_url: r.photo_url,
        license: 'Pexels License (free use, attribution appreciated)',
      },
      photo_id: r.photo_id,
      src_url: r.src_url,
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function processOne(word) {
  const trail = [];
  const wikiFirst = WIKI_FIRST.has(word.toLowerCase());

  if (wikiFirst) {
    let r = await tryWikipedia(word);
    if (r && r.buffer) return { word, status: 'ok', result: r, trail: ['wiki-first'] };
    if (r) trail.push(`wiki:${r.error}`);
  }

  let r = await tryPexels(word);
  if (r && r.buffer) return { word, status: 'ok', result: r, trail };
  if (r) trail.push(`pex:${r.error}`);
  else trail.push('pex:no_creds');

  if (!wikiFirst) {
    r = await tryWikipedia(word);
    if (r && r.buffer) return { word, status: 'ok', result: r, trail };
    if (r) trail.push(`wiki:${r.error}`);
  }

  r = await tryPollinations(word);
  if (r && r.buffer) return { word, status: 'ok', result: r, trail };
  if (r) trail.push(`poll:${r.error}`);

  r = await tryCloudflare(word);
  if (r && r.buffer) return { word, status: 'ok', result: r, trail };
  if (r) trail.push(`cf:${r.refused ? 'NSFW' : r.error}`);
  else if (!SKIP_CF) trail.push('cf:no_creds');

  return { word, status: 'no_results', trail };
}

function persist(word, result) {
  const rel = `${CATEGORY}/${safeFilename(word)}.jpg`;
  const abs = path.join(__dirname, '..', 'data', 'images', rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, result.buffer);

  const metadata = {
    source: result.source,
    query: result.query,
    bytes: result.buffer.length,
  };
  if (result.prompt) metadata.prompt = result.prompt;
  if (result.model) metadata.model = result.model;
  if (result.seed != null) metadata.seed = result.seed;
  if (result.attribution) metadata.attribution = result.attribution;
  if (result.photo_id) metadata.photo_id = result.photo_id;
  if (result.src_url) metadata.src_url = result.src_url;
  if (result.wiki_title) metadata.wiki_title = result.wiki_title;
  if (result.wiki_url) metadata.wiki_url = result.wiki_url;

  db.prepare(`
    INSERT OR REPLACE INTO word_images (word_lower, category, image_data, image_mime, source, metadata, path)
    VALUES (?, ?, X'', ?, ?, ?, ?)
  `).run(word.toLowerCase(), CATEGORY, result.mime, result.source, JSON.stringify(metadata), rel);

  return rel;
}

(async () => {
  let words = getPendingWords();
  if (LIMIT > 0) words = words.slice(0, LIMIT);

  console.log(`[fetch-images] Categoría: ${CATEGORY} — ${words.length} palabras pendientes`);
  console.log(`  cascade: ${PEXELS_KEY ? '✓' : '✗'} pexels → ${SKIP_WIKIPEDIA ? '✗' : '✓'} wikipedia → ${SKIP_POLLINATIONS ? '✗' : '✓'} pollinations → ${SKIP_CF ? '✗' : '✓'} cloudflare`);
  console.log(`  throttle: ${THROTTLE_MS}ms`);
  if (words.length === 0) { console.log('Nada que descargar.'); db.close(); return; }

  const report = [];
  const counts = { cloudflare: 0, pollinations: 0, wikipedia: 0, pexels: 0, no_results: 0 };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const r = await processOne(w);
    let line = `  [${String(i+1).padStart(3)}/${words.length}] ${w.padEnd(20)} `;
    if (r.status === 'ok') {
      const rel = persist(w, r.result);
      counts[r.result.source]++;
      line += `ok · ${r.result.source}`;
      if (r.trail.length) line += ` (skipped: ${r.trail.join(' | ')})`;
      report.push({ word: w, status: 'ok', source: r.result.source, path: rel, bytes: r.result.buffer.length, trail: r.trail });
    } else {
      counts.no_results++;
      line += `FAIL · ${r.trail.join(' | ')}`;
      report.push({ word: w, status: 'no_results', trail: r.trail });
    }
    console.log(line);
    if (i < words.length - 1) await new Promise(res => setTimeout(res, THROTTLE_MS));
  }

  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
  const reportPath = path.join(__dirname, '..', 'data', `images-${CATEGORY}-report-${ts}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n[fetch-images] Resumen:`);
  console.log(`  cloudflare:  ${counts.cloudflare}`);
  console.log(`  pollinations: ${counts.pollinations}`);
  console.log(`  wikipedia:   ${counts.wikipedia}`);
  console.log(`  pexels:      ${counts.pexels}`);
  console.log(`  no_results:  ${counts.no_results}`);
  console.log(`  total: ${words.length}`);
  console.log(`Reporte: ${reportPath}`);
  db.close();
})();
