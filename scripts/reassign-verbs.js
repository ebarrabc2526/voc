#!/usr/bin/env node
'use strict';

/**
 * Detecta verbos mal categorizados y los mueve a category='verbos'.
 *
 * Estrategia:
 *   1. Prefiltro heurístico: palabras de categorías != 'verbos' cuya traducción
 *      al español parece un infinitivo (-ar/-er/-ir, reflexivos -arse/-erse/-irse,
 *      con enclíticos -arlo/-arla/-arlos/-arlas, o contiene "se ").
 *   2. Clasificación precisa con Claude Sonnet 4.6 vía `claude -p` (suscripción).
 *   3. UPDATE category='verbos' para las palabras confirmadas como verbo.
 *
 * Uso: node scripts/reassign-verbs.js
 */

const { spawnSync } = require('child_process');
const Database      = require('better-sqlite3');
const fs            = require('fs');
const path          = require('path');

const DB_PATH    = path.join(__dirname, '../data/voc.db');
const CHECKPOINT = path.join(__dirname, '../data/reassign-verbs-checkpoint.json');
const BATCH_SIZE = 120;
const CLAUDE_BIN = '/home/ebarrab/.local/bin/claude';

const PROMPT_HEADER =
`Decide si cada palabra INGLESA funciona principalmente como VERBO (acción o estado), teniendo en cuenta su traducción al español.

Reglas:
- Responde ÚNICAMENTE con un JSON {"palabra": "si"|"no", ...}. Sin texto adicional.
- "si" solo si el significado principal en ese par EN|ES es un verbo.
  Ejemplos de "si": work|trabajar, run|correr, be|ser, become|devenir, can|poder, must|deber.
- "no" si es sustantivo, adjetivo, adverbio, pronombre, preposición, etc., aunque la traducción termine en -ar/-er/-ir.
  Ejemplos de "no": dollar|dólar, similar|similar, popular|popular, regular|regular, familiar|familiar, sweater|suéter, poster|póster, pair|par, yesterday|ayer, welfare|bienestar, holder|titular, homelessness|personas sin hogar.
- Si la palabra inglesa puede ser verbo Y sustantivo, elige "si" solo si la traducción dada es la forma verbal (infinitivo en español).

Pares (palabra_inglesa | traducción_español):`;

function classifyBatch(words) {
  const list   = words.map(w => `${w.word} | ${w.translation}`).join('\n');
  const prompt = PROMPT_HEADER + '\n' + list;

  const result = spawnSync(CLAUDE_BIN, ['-p', prompt], {
    encoding: 'utf8',
    timeout:  180_000,
    maxBuffer: 2 * 1024 * 1024,
  });

  if (result.error) throw new Error('claude: ' + result.error.message);
  if (result.status !== 0) throw new Error('claude exit ' + result.status + ': ' + (result.stderr || '').slice(0, 200));

  const text = (result.stdout || '').trim();
  const m    = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('sin JSON: ' + text.slice(0, 300));
  return JSON.parse(m[0]);
}

async function main() {
  const db = new Database(DB_PATH);

  // Prefiltro: candidatos únicos (por word + translation) fuera de 'verbos'
  const rows = db.prepare(`
    SELECT DISTINCT word, translation
    FROM words
    WHERE category != 'verbos'
      AND (
        translation LIKE 'se %' OR translation LIKE '% se %'
        OR translation GLOB '*ar' OR translation GLOB '*er' OR translation GLOB '*ir'
        OR translation GLOB '*arse' OR translation GLOB '*erse' OR translation GLOB '*irse'
        OR translation GLOB '*arlo' OR translation GLOB '*arla'
        OR translation GLOB '*arlos' OR translation GLOB '*arlas'
      )
  `).all();

  console.log(`Candidatos (word|translation únicos): ${rows.length}`);

  // Checkpoint
  let decided = {};
  if (fs.existsSync(CHECKPOINT)) {
    try {
      decided = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')).decided || {};
      console.log(`Checkpoint: ${Object.keys(decided).length} ya clasificados`);
    } catch { /* reset */ }
  }

  const keyOf  = r => `${r.word}|||${r.translation}`;
  const pending = rows.filter(r => !(keyOf(r) in decided));
  const total   = Math.ceil(pending.length / BATCH_SIZE);
  console.log(`Pendientes: ${pending.length} | Lotes: ${total} (${BATCH_SIZE}/lote)\n`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch    = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`[${String(batchNum).padStart(3)}/${total}] `);

    let attempt = 0, ok = false;
    while (attempt < 3 && !ok) {
      try {
        const res = classifyBatch(batch);
        for (const r of batch) {
          const ans = res[r.word];
          decided[keyOf(r)] = ans === 'si' ? 'si' : ans === 'no' ? 'no' : 'no';
        }
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ decided }));
        const yes = batch.filter(r => decided[keyOf(r)] === 'si').length;
        console.log(`✓ ${batch.length} clasificados — ${yes} verbos`);
        ok = true;
      } catch (err) {
        attempt++;
        console.log(`\n  ⚠ Error (${attempt}/3): ${err.message.slice(0, 140)}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
    if (!ok) console.log(`  ✗ Lote omitido`);
  }

  // Apply updates
  const verbos = rows.filter(r => decided[keyOf(r)] === 'si');
  console.log(`\nVerbos confirmados: ${verbos.length}`);

  const upd = db.prepare(`UPDATE words SET category='verbos' WHERE word=? AND translation=? AND category!='verbos'`);
  let changed = 0;
  db.transaction(() => {
    for (const r of verbos) {
      const res = upd.run(r.word, r.translation);
      changed += res.changes;
    }
  })();
  console.log(`Filas actualizadas: ${changed}`);

  console.log(`\nverbos totales: ${db.prepare("SELECT COUNT(*) c FROM words WHERE category='verbos'").get().c}`);
  console.log('Distribución verbos por nivel:');
  db.prepare("SELECT level, COUNT(*) c FROM words WHERE category='verbos' GROUP BY level ORDER BY level")
    .all().forEach(r => console.log(`  ${r.level}  ${r.c}`));

  if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
  db.close();
}

main().catch(err => { console.error('💥', err.message); process.exit(1); });
