#!/usr/bin/env node
'use strict';

/**
 * Reforma — Fase 3: coherencia del trío (word, translation, category).
 *
 * Evalúa TODO el vocabulario (no solo las categorías contaminadas) usando
 * Claude Sonnet 4.6 vía `claude -p`. Para cada par único (word, translation)
 * decide una de estas acciones:
 *
 *   - keep     → el trío es coherente, no tocar.
 *   - retrans  → cambiar la traducción para que case con la categoría.
 *   - recat    → cambiar la categoría para que case con la traducción.
 *   - split    → palabra polisémica: duplicar en varias filas, una por acepción.
 *   - drop     → basura / nombre propio / fragmento sin valor.
 *
 * Checkpoint reanudable en data/reforma-fase3-checkpoint.json.
 *
 * Uso:
 *   node scripts/reforma-fase3-coherencia.js           # arranca o reanuda
 *   node scripts/reforma-fase3-coherencia.js --status  # progreso
 *   node scripts/reforma-fase3-coherencia.js --apply   # aplica a la DB
 */

const { spawnSync } = require('child_process');
const Database      = require('better-sqlite3');
const fs            = require('fs');
const path          = require('path');

const DB_PATH    = path.join(__dirname, '../data/voc.db');
const CHECKPOINT = path.join(__dirname, '../data/reforma-fase3-checkpoint.json');
const BATCH_SIZE = 80;
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
`Para cada trío "inglés | español | categoría_actual" decide la acción más
apropiada para garantizar que las tres piezas sean COHERENTES entre sí.

Acciones posibles:
  - keep    → el trío ya es coherente. No se cambia nada.
  - retrans → la CATEGORÍA es la correcta pero la TRADUCCIÓN no encaja en esa
              categoría (o no es castellano de España). Devuelve la traducción
              nueva en "es". Mantén la categoría actual en "c".
  - recat   → la TRADUCCIÓN es correcta pero pertenece a otra categoría.
              Devuelve la nueva categoría en "c" (de la lista cerrada).
  - split   → la palabra es POLISÉMICA y merece varias filas (una por acepción
              diferente). Devuelve un array "variants" con 2+ objetos
              {"c": "categoria", "es": "traducción"}. Una de las variantes
              DEBE reflejar la combinación actual si sigue siendo válida.
              Usa split sólo si las acepciones caen en CATEGORÍAS DISTINTAS.
  - drop    → basura, nombre propio, palabra no-inglesa, fragmento, flexión
              redundante sin valor didáctico, o no se puede hacer coherente.

Categorías permitidas: ${ALL_CATS.join(', ')}

Criterios por categoría (prioridad de arriba abajo):
- verbos: SÓLO si el par funciona como verbo en infinitivo español (work|trabajar).
  Un participio usado como adjetivo (-ado/-ido) → descriptions.
  Un sustantivo derivado (movement|movimiento) → categoría temática.
- phrasal_verbs: verbo + partícula (pick up, turn off).
- grammar: pronombres, preposiciones, conjunciones, determinantes, auxiliares.
- colours: colores y matices.
- numbers_and_time: números, fechas, horas, festivos, días, meses.
- body: partes del cuerpo, sentidos, fluidos, sistemas anatómicos.
- feelings: emociones y estados de ánimo.
- family_and_friends: familia y relaciones humanas.
- food_and_drink, clothes, animals, weather_and_nature, geography, places,
  the_home, transport, school, work, arts, sports_and_leisure,
  toys_and_technology, science, religion, law_and_crime, military: temáticas obvias.
- finance_and_money: dinero, banca, impuestos, economía.
- health_and_medicine: medicina, enfermedades, tratamientos, sanitarios.
- miscellaneous: interjecciones, muletillas, onomatopeyas (wow, ouch, hmm).
- descriptions: adjetivos y adverbios descriptivos no clasificables arriba.
- general: SÓLO si no encaja en ninguna anterior. Evítala siempre que puedas.

Ejemplos de coherencia:
  hearing | audiencia | body
    → split: [{"c":"body","es":"oído"},{"c":"law_and_crime","es":"audiencia"}]
  bank | banco | places
    → split: [{"c":"finance_and_money","es":"banco (entidad)"},
              {"c":"the_home","es":"banco (asiento)"}]  (si procede)
  loved | amado | verbos
    → recat a descriptions (es participio-adjetivo), es="amado".
  chair | silla | body
    → recat a the_home, es="silla".
  movimiento errata | xxx | general
    → drop.

IMPORTANTE:
- Traducciones SIEMPRE en castellano de España (no latinoamericano).
- Si una palabra tiene una acepción claramente dominante, prefiere retrans/recat
  sobre split. Usa split sólo cuando ambas acepciones son útiles y frecuentes.
- Responde ÚNICAMENTE con JSON válido, con ESTA forma exacta:

{
  "palabra_inglesa": {
    "a": "keep"|"retrans"|"recat"|"split"|"drop",
    "c": "categoria_si_aplica",
    "es": "traduccion_si_aplica",
    "variants": [{"c":"cat","es":"trad"}, ...]   // sólo si a="split"
  }
}

La clave DEBE ser exactamente la forma inglesa del par. No incluyas texto fuera
del JSON.

Tríos (inglés | español | categoría):`;

function categorizeBatch(pairs) {
  const list   = pairs.map(p => `${p.word} | ${p.translation} | ${p.category}`).join('\n');
  const prompt = PROMPT_HEADER + '\n' + list;

  const result = spawnSync(CLAUDE_BIN, ['-p', prompt], {
    encoding: 'utf8',
    timeout:  360_000,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error)        throw new Error('claude: ' + result.error.message);
  if (result.status !== 0) throw new Error('claude exit ' + result.status + ': ' + (result.stderr || '').slice(0, 200));

  const text = (result.stdout || '').trim();
  const m    = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('sin JSON: ' + text.slice(0, 300));
  return JSON.parse(m[0]);
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT)) return {};
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')).decided || {};
  } catch {
    return {};
  }
}

function saveCheckpoint(decided) {
  const tmp = CHECKPOINT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ decided, savedAt: new Date().toISOString() }));
  fs.renameSync(tmp, CHECKPOINT);
}

function getPairs(db) {
  // Pares únicos (word, translation). Si una misma combinación está en varias
  // categorías, tomamos una sola fila (la de menor id) para la consulta al LLM.
  return db.prepare(`
    SELECT word, translation, category
    FROM words
    WHERE id IN (
      SELECT MIN(id) FROM words GROUP BY word, translation
    )
    ORDER BY word, translation
  `).all();
}

function keyOf(p) { return p.word + '|||' + p.translation; }

function sanitizeDecision(entry, current) {
  if (!entry || typeof entry !== 'object') {
    return { a: 'keep', c: current.category, es: current.translation };
  }
  const a = ['keep','retrans','recat','split','drop'].includes(entry.a) ? entry.a : 'keep';
  if (a === 'drop') return { a: 'drop' };
  if (a === 'split') {
    const variants = Array.isArray(entry.variants) ? entry.variants : [];
    const clean = variants
      .filter(v => v && typeof v === 'object' && typeof v.es === 'string' && v.es.trim())
      .map(v => ({
        c: ALL_CATS.includes(v.c) ? v.c : current.category,
        es: v.es.trim(),
      }));
    // dedupe por (c,es)
    const seen = new Set();
    const dedup = clean.filter(v => {
      const k = v.c + '|' + v.es;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (dedup.length < 2) {
      // split inválido → degradar a keep
      return { a: 'keep', c: current.category, es: current.translation };
    }
    return { a: 'split', variants: dedup };
  }
  const c  = ALL_CATS.includes(entry.c) ? entry.c : current.category;
  const es = typeof entry.es === 'string' && entry.es.trim() ? entry.es.trim() : current.translation;
  return { a, c, es };
}

function showStatus(db) {
  const decided = loadCheckpoint();
  const pairs   = getPairs(db);
  const done    = pairs.filter(p => decided[keyOf(p)]).length;
  const pct     = (done / pairs.length * 100).toFixed(1);
  console.log(`Checkpoint: ${done} / ${pairs.length} pares procesados (${pct}%).`);

  const tally = { keep: 0, retrans: 0, recat: 0, split: 0, drop: 0 };
  for (const d of Object.values(decided)) tally[d.a] = (tally[d.a] || 0) + 1;
  console.log('Decisiones hasta ahora:');
  for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(8)} ${v}`);

  if (fs.existsSync(CHECKPOINT)) {
    const st = fs.statSync(CHECKPOINT);
    console.log(`Última actualización: ${st.mtime.toISOString()}`);
  }
}

async function runProcess() {
  const db      = new Database(DB_PATH);
  const pairs   = getPairs(db);
  const decided = loadCheckpoint();

  const pending = pairs.filter(p => !decided[keyOf(p)]);
  const total   = Math.ceil(pending.length / BATCH_SIZE);
  console.log(`Pares totales: ${pairs.length} | Ya procesados: ${pairs.length - pending.length} | Pendientes: ${pending.length} | Lotes: ${total}\n`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch    = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const pct      = Math.round(batchNum / total * 100);
    const t0       = Date.now();
    process.stdout.write(`[${String(batchNum).padStart(4)}/${total}] ${String(pct).padStart(3)}% — `);

    let attempt = 0, ok = false;
    while (attempt < 3 && !ok) {
      try {
        const res = categorizeBatch(batch);
        const counts = { keep: 0, retrans: 0, recat: 0, split: 0, drop: 0 };
        for (const p of batch) {
          const entry = res[p.word];
          const dec   = sanitizeDecision(entry, p);
          decided[keyOf(p)] = dec;
          counts[dec.a]++;
        }
        saveCheckpoint(decided);
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`✓ keep=${counts.keep} retrans=${counts.retrans} recat=${counts.recat} split=${counts.split} drop=${counts.drop} (${dt}s)`);
        ok = true;
      } catch (err) {
        attempt++;
        console.log(`\n  ⚠ Error (${attempt}/3): ${err.message.slice(0, 160)}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
    if (!ok) {
      console.log(`  ✗ Lote omitido — se podrá reintentar al reanudar`);
    }
  }

  db.close();
  console.log('\n✅ Procesamiento completo. Revisa con --status y aplica con --apply.');
}

function applyChanges() {
  const db      = new Database(DB_PATH);
  const decided = loadCheckpoint();
  const keys    = Object.keys(decided);
  if (!keys.length) { console.log('Checkpoint vacío. Nada que aplicar.'); return; }

  console.log(`Aplicando ${keys.length} decisiones…`);
  const before = db.prepare('SELECT COUNT(*) c FROM words').get().c;

  const selPair = db.prepare('SELECT id, level, uk_ipa, us_ipa, category FROM words WHERE word = ? AND translation = ?');
  const delPair = db.prepare('DELETE FROM words WHERE word = ? AND translation = ?');
  const delById = db.prepare('DELETE FROM words WHERE id = ?');
  const updRow  = db.prepare('UPDATE words SET translation = ?, category = ? WHERE id = ?');
  const insRow  = db.prepare(`
    INSERT OR IGNORE INTO words (word, translation, level, category, uk_ipa, us_ipa)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const stats = { keep: 0, retrans: 0, recat: 0, split: 0, drop: 0, dropped_rows: 0, split_rows: 0, conflicts: 0 };

  db.transaction(() => {
    for (const [k, dec] of Object.entries(decided)) {
      const [w, t] = k.split('|||');
      const rows   = selPair.all(w, t);
      if (!rows.length) continue;

      if (dec.a === 'keep') { stats.keep++; continue; }

      if (dec.a === 'drop') {
        stats.drop++;
        stats.dropped_rows += delPair.run(w, t).changes;
        continue;
      }

      if (dec.a === 'retrans' || dec.a === 'recat') {
        for (const row of rows) {
          const newT = dec.a === 'retrans' ? dec.es : t;
          const newC = dec.a === 'recat'   ? dec.c  : row.category;
          // Intentar UPDATE; si viola UNIQUE(word,level,cat), insertamos OR IGNORE y borramos original.
          try {
            updRow.run(newT, newC, row.id);
          } catch (e) {
            if (/UNIQUE/.test(e.message)) {
              insRow.run(w, newT, row.level, newC, row.uk_ipa, row.us_ipa);
              delById.run(row.id);
              stats.conflicts++;
            } else throw e;
          }
        }
        stats[dec.a]++;
        continue;
      }

      if (dec.a === 'split') {
        stats.split++;
        // Plan: por cada fila original (puede haber varias por distintos niveles),
        // generar N variantes con mismo nivel/IPA y categoría/traducción nuevas.
        // Después borrar la fila original.
        for (const row of rows) {
          for (const v of dec.variants) {
            const r = insRow.run(w, v.es, row.level, v.c, row.uk_ipa, row.us_ipa);
            if (r.changes) stats.split_rows++;
          }
          delById.run(row.id);
        }
        continue;
      }
    }
  })();

  // Dedupe de seguridad por UNIQUE(word,level,category)
  db.exec(`
    DELETE FROM words WHERE id NOT IN (
      SELECT MIN(id) FROM words GROUP BY word, level, category
    );
  `);

  const after = db.prepare('SELECT COUNT(*) c FROM words').get().c;
  console.log(`\nResumen de decisiones:`);
  console.log(`  keep     ${stats.keep}`);
  console.log(`  retrans  ${stats.retrans}`);
  console.log(`  recat    ${stats.recat}`);
  console.log(`  split    ${stats.split} (filas creadas: ${stats.split_rows})`);
  console.log(`  drop     ${stats.drop} (filas borradas: ${stats.dropped_rows})`);
  console.log(`  conflictos UNIQUE resueltos: ${stats.conflicts}`);
  console.log(`\nFilas antes: ${before} → después: ${after} (Δ ${after - before}).`);

  console.log('\nDistribución final:');
  db.prepare('SELECT category, COUNT(*) c FROM words GROUP BY category ORDER BY c DESC')
    .all().forEach(r => console.log(`  ${r.category.padEnd(22)} ${r.c}`));

  db.close();
}

async function main() {
  if (process.argv.includes('--status')) {
    const db = new Database(DB_PATH);
    showStatus(db);
    db.close();
    return;
  }
  if (process.argv.includes('--apply')) {
    applyChanges();
    return;
  }
  await runProcess();
}

main().catch(err => { console.error('💥', err.message); process.exit(1); });
