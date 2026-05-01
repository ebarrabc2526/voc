'use strict';
// Aplica migración 005: crea word_images y añade image_display_seconds a user_prefs

const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');

const DB_PATH  = path.join(__dirname, '..', 'data', 'voc.db');
const SQL_PATH = path.join(__dirname, '..', 'migrations', '005_word_images.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 1. Aplicar DDL de la migración
const sql = fs.readFileSync(SQL_PATH, 'utf8');
db.exec(sql);
console.log('[005] Tabla word_images y su índice creados (o ya existían).');

// 2. Añadir columna image_display_seconds a user_prefs si no existe
const cols = db.prepare("PRAGMA table_info(user_prefs)").all().map(r => r.name);
if (!cols.includes('image_display_seconds')) {
  db.prepare("ALTER TABLE user_prefs ADD COLUMN image_display_seconds INTEGER NOT NULL DEFAULT 5").run();
  console.log('[005] Columna image_display_seconds añadida a user_prefs (default 5).');
} else {
  console.log('[005] Columna image_display_seconds ya existía en user_prefs.');
}

// 3. Verificar
const tableExists = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='word_images'"
).get();
const colExists = db.prepare("PRAGMA table_info(user_prefs)").all().some(r => r.name === 'image_display_seconds');
console.log('[005] Verificación — word_images existe:', !!tableExists);
console.log('[005] Verificación — image_display_seconds existe:', colExists);

if (!tableExists || !colExists) {
  console.error('[005] ERROR: La migración no se aplicó correctamente.');
  process.exit(1);
}

console.log('[005] Migración completada con éxito.');
db.close();
