'use strict';
// Crea data/voc.db desde cero aplicando migraciones y cargando el vocabulario.
// Uso: node scripts/setup-db.js [--force]
//   --force  elimina la DB existente antes de crearla

const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

const DB_PATH        = path.join(__dirname, '..', 'data', 'voc.db');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const WORDS_SEED     = path.join(__dirname, '..', 'data', 'words.sql');

const force = process.argv.includes('--force');

if (force && fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log('[setup] DB anterior eliminada.');
}

if (fs.existsSync(DB_PATH) && !force) {
  console.log('[setup] data/voc.db ya existe. Usa --force para recrearla.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrations = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of migrations) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  db.exec(sql);
  console.log(`[setup] Migración aplicada: ${file}`);
}

if (fs.existsSync(WORDS_SEED)) {
  const sql = fs.readFileSync(WORDS_SEED, 'utf8');
  db.exec(sql);
  const count = db.prepare('SELECT COUNT(*) as n FROM words').get().n;
  console.log(`[setup] Vocabulario cargado: ${count} palabras`);
} else {
  console.warn('[setup] No se encontró data/words.sql — DB creada sin vocabulario.');
}

db.close();
console.log('[setup] Listo. data/voc.db creada correctamente.');
