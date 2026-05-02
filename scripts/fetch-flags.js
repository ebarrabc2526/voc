'use strict';
const fs = require('fs');
const https = require('https');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const ISO_FILE = path.join(__dirname, '..', 'data', 'flags-iso.json');
const FLAGS_DIR = path.join(__dirname, '..', 'data', 'images', 'flags');

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'voc-flags/1.0' }, timeout: 30000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return download(res.headers.location).then(resolve, reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  const countries = JSON.parse(fs.readFileSync(ISO_FILE, 'utf8'));
  fs.mkdirSync(FLAGS_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.prepare("DELETE FROM word_images WHERE category='flags'").run();
  const insert = db.prepare(`
    INSERT INTO word_images (word_lower, category, image_data, image_mime, source, metadata, path)
    VALUES (?, 'flags', X'', 'image/png', 'flagcdn', ?, ?)
  `);

  let ok = 0, fail = 0;
  for (let i = 0; i < countries.length; i++) {
    const c = countries[i];
    const iso = c.iso.toLowerCase();
    const url = `https://flagcdn.com/w320/${iso}.png`;
    const filePath = path.join(FLAGS_DIR, `${iso}.png`);
    const rel = `flags/${iso}.png`;

    try {
      const buf = await download(url);
      fs.writeFileSync(filePath, buf);
      const meta = JSON.stringify({
        source: 'flagcdn',
        iso: c.iso,
        country_en: c.en,
        country_es: c.es,
        bytes: buf.length,
        url,
      });
      insert.run(c.en.toLowerCase(), meta, rel);
      ok++;
      if ((i+1) % 20 === 0 || i === countries.length - 1) {
        console.log(`  [${i+1}/${countries.length}] ${ok} ok, ${fail} fail`);
      }
    } catch (e) {
      fail++;
      console.error(`  ${c.iso} (${c.en}): ${e.message}`);
    }
  }
  console.log(`\nResumen: ${ok}/${countries.length} ok, ${fail} fail`);
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
