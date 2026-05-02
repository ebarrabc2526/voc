'use strict';
const https = require('https');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const API_URL = 'https://restcountries.com/v3.1/all?fields=cca2,name,translations,unMember';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'voc-seed-flags/1.0' }, timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  const all = await fetchJson(API_URL);
  const countries = all
    .filter(c => c.unMember && c.cca2 && c.translations && c.translations.spa)
    .map(c => ({
      iso: c.cca2.toUpperCase(),
      en: c.name.common,
      es: c.translations.spa.common,
    }))
    .sort((a, b) => a.es.localeCompare(b.es));

  console.log(`Países UN con traducción ES: ${countries.length}`);

  const db = new Database(DB_PATH);
  db.prepare("DELETE FROM words WHERE category='flags'").run();

  const insert = db.prepare(`
    INSERT INTO words (word, translation, level, category, uk_ipa, us_ipa)
    VALUES (?, ?, 'B1', 'flags', '', '')
  `);
  const tx = db.transaction((rows) => {
    rows.forEach(r => insert.run(r.en, r.es));
  });
  tx(countries);

  const n = db.prepare("SELECT COUNT(*) as n FROM words WHERE category='flags'").get().n;
  console.log(`Insertados: ${n}`);

  // Guardamos también un JSON de referencia con códigos ISO (necesarios para imágenes)
  const fs = require('fs');
  const out = path.join(__dirname, '..', 'data', 'flags-iso.json');
  fs.writeFileSync(out, JSON.stringify(countries, null, 2));
  console.log(`ISO map: ${out}`);

  db.close();
})().catch(e => { console.error(e); process.exit(1); });
