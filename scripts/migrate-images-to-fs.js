'use strict';
// Fase 3: Vuelca BLOBs de word_images a ficheros en data/images/
// y actualiza la columna `path`. Vacía image_data a X'' para ahorrar espacio.
// Idempotente: solo procesa filas con path IS NULL.

const path     = require('path');
const Database = require('better-sqlite3');
const { writeImage } = require('./lib/image-storage');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const rows = db.prepare(
  'SELECT word_lower, category, image_data, image_mime FROM word_images WHERE path IS NULL'
).all();

console.log(`[migrate-fs] Filas a migrar: ${rows.length}`);
if (rows.length === 0) {
  console.log('[migrate-fs] Nada que migrar. Saliendo.');
  db.close();
  process.exit(0);
}

const updateRow = db.prepare(
  'UPDATE word_images SET path = ?, image_data = X\'\' WHERE word_lower = ? AND category = ?'
);

let migrated = 0;
let totalBytes = 0;
const firstPaths = [];

const migrate = db.transaction(() => {
  for (const row of rows) {
    const data = Buffer.isBuffer(row.image_data)
      ? row.image_data
      : Buffer.from(row.image_data);

    const rel = writeImage(row.word_lower, row.category, row.image_mime, data);
    updateRow.run(rel, row.word_lower, row.category);

    totalBytes += data.length;
    migrated++;
    if (firstPaths.length < 5) firstPaths.push(rel);
  }
});

migrate();

console.log(`[migrate-fs] Filas migradas: ${migrated}`);
console.log(`[migrate-fs] Tamaño total volcado: ${(totalBytes / 1024).toFixed(1)} KB`);
console.log(`[migrate-fs] Primeros 5 paths:`);
firstPaths.forEach(p => console.log('  ', p));

const remaining = db.prepare('SELECT COUNT(*) AS n FROM word_images WHERE path IS NULL').get().n;
const done      = db.prepare('SELECT COUNT(*) AS n FROM word_images WHERE path IS NOT NULL').get().n;
console.log(`[migrate-fs] Con path: ${done} | Sin path (NULL): ${remaining}`);

db.close();
