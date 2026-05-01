#!/usr/bin/env node
// Vuelca data/voc.db a data/voc.sql en formato compatible con `sqlite3 .dump`.
// Permite versionar el contenido de la BD en git de forma legible y diffable.
//
// Por defecto solo vuelca la tabla `words` (el diccionario). Las tablas de
// usuarios, sesiones y HOF contienen datos personales y NUNCA deben subirse
// a un repo público — usa --all solo para backups privados fuera de git.
//
// Uso:
//   node scripts/dump-db.js          → solo `words` → data/voc.sql
//   node scripts/dump-db.js --all    → BD completa → data/voc.sql (¡PII!)

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const OUT_PATH = path.join(__dirname, '..', 'data', 'voc.sql');
const ALL = process.argv.includes('--all');
const PUBLIC_TABLES = new Set(['words']);

if (!fs.existsSync(DB_PATH)) {
  console.error(`[dump-db] No se encuentra ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

function quote(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return String(value);
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

const out = fs.createWriteStream(OUT_PATH);
out.write('PRAGMA foreign_keys=OFF;\n');
out.write('BEGIN TRANSACTION;\n');

const objects = db.prepare(`
  SELECT type, name, tbl_name, sql
  FROM sqlite_master
  WHERE sql IS NOT NULL
    AND name NOT LIKE 'sqlite_%'
  ORDER BY
    CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 WHEN 'view' THEN 4 ELSE 5 END,
    name
`).all();

const includeTable = (name) => ALL || PUBLIC_TABLES.has(name);

const tables = objects.filter(o => o.type === 'table' && includeTable(o.name));
const others = objects.filter(o => o.type !== 'table' && includeTable(o.tbl_name));

for (const t of tables) {
  out.write(`${t.sql};\n`);
  const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all().map(c => c.name);
  const rows = db.prepare(`SELECT ${cols.map(c => `"${c}"`).join(', ')} FROM "${t.name}"`).all();
  for (const r of rows) {
    const values = cols.map(c => quote(r[c])).join(',');
    out.write(`INSERT INTO "${t.name}" VALUES(${values});\n`);
  }
}

if (ALL) {
  let seqRows = [];
  try { seqRows = db.prepare("SELECT name, seq FROM sqlite_sequence").all(); } catch {}
  if (seqRows.length) {
    out.write(`DELETE FROM sqlite_sequence;\n`);
    for (const s of seqRows) {
      out.write(`INSERT INTO sqlite_sequence VALUES(${quote(s.name)},${quote(s.seq)});\n`);
    }
  }
}

for (const o of others) {
  out.write(`${o.sql};\n`);
}

out.write('COMMIT;\n');
out.end();

out.on('finish', () => {
  const stats = fs.statSync(OUT_PATH);
  const wordsCount = db.prepare('SELECT COUNT(*) c FROM words').get().c;
  console.log(`[dump-db] OK → ${OUT_PATH}`);
  console.log(`[dump-db] modo: ${ALL ? 'COMPLETO (¡PII!)' : 'solo words'} · ${(stats.size / 1024 / 1024).toFixed(2)} MB · words: ${wordsCount}`);
  db.close();
});
