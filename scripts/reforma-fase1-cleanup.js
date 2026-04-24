#!/usr/bin/env node
'use strict';

/**
 * Reforma — Fase 1: limpieza determinista (sin LLM).
 *
 *  - Corrige traducciones críticas erróneas conocidas (who→oms, would→quería…).
 *  - Elimina formas flexionadas redundantes cuya base ya existe (loves, appears, stomped…).
 *  - Elimina cognados triviales idénticos (word == translation) de bajo nivel.
 *  - Elimina pares basura conocidos (peabody, tis…).
 *
 * Idempotente y seguro: reporta sin aplicar si se pasa --dry-run.
 *
 * Uso: node scripts/reforma-fase1-cleanup.js [--dry-run]
 */

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, '../data/voc.db');
const DRY     = process.argv.includes('--dry-run');

// Correcciones de traducción críticas (errores conocidos de Google Translate).
// Se aplican a todas las filas con ese (word, category) en cualquier nivel.
const FIX_TRANSLATIONS = [
  { word: 'who',    category: 'grammar', translation: 'quién' },
  { word: 'would',  category: 'grammar', translation: 'querría / -ía (condicional)' },
  { word: 'could',  category: 'grammar', translation: 'podría / pudo' },
  { word: 'should', category: 'grammar', translation: 'debería' },
  { word: 'might',  category: 'grammar', translation: 'podría (posibilidad)' },
  { word: 'must',   category: 'grammar', translation: 'deber (obligación)' },
  { word: 'shall',  category: 'grammar', translation: 'deberá / iremos a' },
  { word: 'will',   category: 'grammar', translation: 'futuro auxiliar' },
  { word: 'may',    category: 'grammar', translation: 'puede (permiso/posibilidad)' },
  { word: 'tis',    category: 'grammar', translation: 'es (arcaico de «it is»)' },
  { word: 'whom',   category: 'grammar', translation: 'a quién' },
  { word: 'whose',  category: 'grammar', translation: 'de quién / cuyo' },
  { word: 'aback',  category: 'grammar', translation: 'atrás / desprevenido' },
  { word: 'hardly', category: 'grammar', translation: 'apenas' },
];

// Pares basura conocidos a eliminar (word, translation). Se eliminan en todas sus filas.
const DROP_PAIRS = [
  ['peabody', 'cuerpo de guisante'],
  ['aims',    'Los objetivos son:'],
  ['gab',     'charla'],
];

function main() {
  const db = new Database(DB_PATH);
  const before = db.prepare('SELECT COUNT(*) c FROM words').get().c;

  // ─── 1) Correcciones de traducción críticas ──────────────────────────────
  const upd = db.prepare('UPDATE words SET translation = ? WHERE word = ? AND category = ?');
  let fixed = 0;
  for (const { word, category, translation } of FIX_TRANSLATIONS) {
    if (DRY) {
      const rows = db.prepare('SELECT id, level, translation FROM words WHERE word = ? AND category = ?').all(word, category);
      if (rows.length) console.log(`[fix] ${word} [${category}] ×${rows.length} → "${translation}" (antes: ${[...new Set(rows.map(r=>r.translation))].join(', ')})`);
    } else {
      fixed += upd.run(translation, word, category).changes;
    }
  }
  console.log(`Traducciones corregidas: ${fixed}`);

  // ─── 2) Basura específica ─────────────────────────────────────────────────
  const del = db.prepare('DELETE FROM words WHERE word = ? AND translation = ?');
  let droppedJunk = 0;
  for (const [w, t] of DROP_PAIRS) {
    if (DRY) {
      const n = db.prepare('SELECT COUNT(*) c FROM words WHERE word=? AND translation=?').get(w, t).c;
      if (n) console.log(`[drop-junk] ${w} | ${t} ×${n}`);
    } else {
      droppedJunk += del.run(w, t).changes;
    }
  }
  console.log(`Pares basura eliminados: ${droppedJunk}`);

  // ─── 3) Cognados triviales idénticos en A1-B1 ────────────────────────────
  // Conservamos los de B2-C2 (cognados académicos son didácticamente útiles).
  // Criterio: LOWER(word) == LOWER(translation) y nivel en A1/A2/B1.
  const trivialCognates = db.prepare(`
    SELECT id, word, translation, level FROM words
    WHERE LOWER(word) = LOWER(translation)
      AND level IN ('A1','A2','B1')
  `).all();
  console.log(`Cognados triviales A1-B1 detectados: ${trivialCognates.length}`);
  if (!DRY && trivialCognates.length) {
    const delById = db.prepare('DELETE FROM words WHERE id = ?');
    db.transaction(() => { for (const r of trivialCognates) delById.run(r.id); })();
  }

  // ─── 4) Formas flexionadas redundantes ───────────────────────────────────
  // Regla: si existe la palabra base (raíz) en MISMA categoría y MISMO nivel,
  // eliminar la forma flexionada. Sólo sufijos fiables:
  //   -s (3ª persona), -ed, -ing, -ly (adverbios con adjetivo ya presente), -er/-est (comparativos)
  const suffixes = [
    { suf: 's',   minLen: 5 },
    { suf: 'es',  minLen: 5 },
    { suf: 'ed',  minLen: 5 },
    { suf: 'd',   minLen: 5 }, // -e → -ed (loved → love)
    { suf: 'ing', minLen: 6 },
    { suf: 'ly',  minLen: 5 },
    { suf: 'er',  minLen: 5 },
    { suf: 'est', minLen: 6 },
    { suf: 'ier', minLen: 5 }, // funnier → funny
    { suf: 'iest',minLen: 6 },
  ];

  const hasRoot = db.prepare('SELECT 1 FROM words WHERE word = ? AND category = ? AND level = ? LIMIT 1');
  const all = db.prepare('SELECT id, word, category, level FROM words').all();
  const toDrop = [];
  for (const r of all) {
    const w = r.word;
    if (w.includes(' ')) continue; // phrasal: no tocar
    for (const { suf, minLen } of suffixes) {
      if (w.length < minLen || !w.endsWith(suf)) continue;
      const base = w.slice(0, -suf.length);
      // Variantes comunes de base: directa, con -e (para -ing), con -y (para -ier/-iest/-ily)
      const candidates = [base];
      if (suf === 'ing' || suf === 'ed' || suf === 'er' || suf === 'est') candidates.push(base + 'e');
      if (suf === 'ier' || suf === 'iest' || suf === 'ily') candidates.push(base + 'y');
      if ((suf === 's' || suf === 'es') && base.endsWith('i')) candidates.push(base.slice(0, -1) + 'y');
      for (const b of candidates) {
        if (b === w || b.length < 2) continue;
        if (hasRoot.get(b, r.category, r.level)) {
          toDrop.push(r.id);
          break;
        }
      }
      if (toDrop.length && toDrop[toDrop.length - 1] === r.id) break;
    }
  }
  console.log(`Formas flexionadas redundantes: ${toDrop.length}`);
  if (!DRY && toDrop.length) {
    const delById = db.prepare('DELETE FROM words WHERE id = ?');
    db.transaction(() => { for (const id of toDrop) delById.run(id); })();
  }

  // ─── 5) Translaciones con mayúscula inicial ≠ interjección ──────────────
  // Sólo normalizamos a minúscula (no borramos).
  if (!DRY) {
    const normalize = db.prepare(`
      UPDATE words SET translation = LOWER(SUBSTR(translation,1,1)) || SUBSTR(translation,2)
      WHERE translation GLOB '[A-Z]*'
        AND category NOT IN ('miscellaneous')
    `).run();
    console.log(`Traducciones normalizadas (mayúscula inicial): ${normalize.changes}`);
  }

  const after = db.prepare('SELECT COUNT(*) c FROM words').get().c;
  console.log(`\nTotal antes: ${before} → después: ${after} (${before - after} filas eliminadas)`);

  if (DRY) console.log('\n[DRY-RUN] Ningún cambio aplicado.');

  db.close();
}

main();
