#!/usr/bin/env node
'use strict';

/**
 * Fase 3 — Re-verificar sólo las categorías más contaminadas: 'verbos' y 'descriptions'.
 *
 * Motivo: tras recat-v2 quedan muchas filas mal clasificadas:
 *   - verbos: ~58% con traducción NO infinitiva (participios, sustantivos derivados).
 *   - descriptions: mezcla adjetivos con sustantivos abstractos.
 *
 * Checkpoint reanudable. Uso: node scripts/reverify-verbos-descriptions.js
 */

const { spawnSync } = require('child_process');
const Database      = require('better-sqlite3');
const fs            = require('fs');
const path          = require('path');

const DB_PATH    = path.join(__dirname, '../data/voc.db');
const CHECKPOINT = path.join(__dirname, '../data/reverify-v-d-checkpoint.json');
const BATCH_SIZE = 150;
const CLAUDE_BIN = '/home/ebarrab/.local/bin/claude';

const ALL_CATS = [
  'verbos', 'phrasal_verbs', 'animals', 'arts', 'body', 'clothes', 'colours',
  'descriptions', 'family_and_friends', 'feelings', 'finance_and_money',
  'food_and_drink', 'general', 'geography', 'grammar', 'health_and_medicine',
  'law_and_crime', 'military', 'miscellaneous', 'numbers_and_time', 'places',
  'religion', 'school', 'science', 'sports_and_leisure', 'the_home',
  'toys_and_technology', 'transport', 'weather_and_nature', 'work',
];

const PROMPT_HEADER =
`Reclasifica cada par inglés|español con la categoría MÁS PRECISA.

Categorías: ${ALL_CATS.join(', ')}

Criterios clave:
- verbos: SÓLO si el par funciona como verbo en infinitivo (work|trabajar, run|correr). Un participio pasivo en español (terminado en -ado/-ido/-to/-so/-cho) usado como adjetivo → descriptions. Un sustantivo derivado de verbo (repetitions|repeticiones, movement|movimiento) → categoría temática correspondiente.
- descriptions: adjetivos y adverbios que describen (fast, beautiful, quickly). Sustantivos abstractos (depth|profundidad, obedience|obediencia) → categoría temática (feelings si es emoción, o a la categoría que corresponda).
- phrasal_verbs: verbo + partícula (pick up, turn off).
- feelings: emociones y estados de ánimo (verbos emocionales también: to love → feelings no verbos).
- health_and_medicine: medicina, enfermedades.
- finance_and_money: dinero, banca, impuestos.
- Si el par es un nombre propio o fragmento sin sentido, devuelve "drop".

Responde SOLO con JSON {"palabra": "categoría_o_drop", ...}.

Pares (inglés | español):`;

function categorizeBatch(words) {
  const list   = words.map(w => `${w.word} | ${w.translation}`).join('\n');
  const prompt = PROMPT_HEADER + '\n' + list;

  const result = spawnSync(CLAUDE_BIN, ['-p', prompt], {
    encoding: 'utf8',
    timeout:  240_000,
    maxBuffer: 4 * 1024 * 1024,
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

  const rows = db.prepare(`
    SELECT DISTINCT word, translation, category
    FROM words
    WHERE category IN ('verbos', 'descriptions')
  `).all();
  console.log(`Pares a revisar (verbos + descriptions): ${rows.length}`);

  let decided = {};
  if (fs.existsSync(CHECKPOINT)) {
    try {
      decided = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')).decided || {};
      console.log(`Checkpoint: ${Object.keys(decided).length} ya clasificados`);
    } catch { decided = {}; }
  }

  const keyOf = r => r.word + '|||' + r.translation;
  const pending = rows.filter(r => !(keyOf(r) in decided));
  const total = Math.ceil(pending.length / BATCH_SIZE);
  console.log(`Pendientes: ${pending.length} | Lotes: ${total}\n`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch    = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const pct      = Math.round(batchNum / total * 100);
    process.stdout.write(`[${String(batchNum).padStart(3)}/${total}] ${String(pct).padStart(3)}% — `);

    let attempt = 0, ok = false;
    while (attempt < 3 && !ok) {
      try {
        const res = categorizeBatch(batch);
        let moved = 0, kept = 0, drops = 0;
        for (const r of batch) {
          const v = res[r.word];
          if (v === 'drop') {
            decided[keyOf(r)] = 'drop';
            drops++;
          } else if (ALL_CATS.includes(v)) {
            decided[keyOf(r)] = v;
            if (v !== r.category) moved++; else kept++;
          } else {
            decided[keyOf(r)] = r.category;
            kept++;
          }
        }
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ decided }));
        console.log(`✓ moved=${moved} kept=${kept} drop=${drops}`);
        ok = true;
      } catch (err) {
        attempt++;
        console.log(`\n  ⚠ Error (${attempt}/3): ${err.message.slice(0, 140)}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
    if (!ok) console.log(`  ✗ Lote omitido`);
  }

  console.log('\nAplicando…');
  const upd = db.prepare('UPDATE words SET category = ? WHERE word = ? AND translation = ?');
  const del = db.prepare('DELETE FROM words WHERE word = ? AND translation = ?');
  let moved = 0, removed = 0;
  db.transaction(() => {
    for (const [k, v] of Object.entries(decided)) {
      const [w, t] = k.split('|||');
      if (v === 'drop') {
        removed += del.run(w, t).changes;
      } else {
        moved += upd.run(v, w, t).changes;
      }
    }
  })();
  console.log(`Filas movidas: ${moved}, eliminadas: ${removed}`);

  console.log('\nDistribución final:');
  db.prepare('SELECT category, COUNT(*) c FROM words GROUP BY category ORDER BY c DESC')
    .all().forEach(r => console.log('  ' + r.category.padEnd(22) + r.c));

  db.close();
}

main().catch(err => { console.error('💥', err.message); process.exit(1); });
