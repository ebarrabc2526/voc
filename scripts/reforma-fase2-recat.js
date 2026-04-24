#!/usr/bin/env node
'use strict';

/**
 * Reforma — Fase 2: recategorización + reverificación de traducciones
 *   usando Claude Sonnet 4.6 vía `claude -p`.
 *
 * Ámbito: pares únicos (word, translation) cuya categoría actual sea una de
 *   las 3 más contaminadas: verbos, descriptions, general.
 *
 * Para cada par pregunta en UNA sola llamada:
 *   - ¿Mantener o eliminar? (basura / nombre propio / no-inglés / flexión)
 *   - Mejor CATEGORÍA (de la lista cerrada).
 *   - Mejor TRADUCCIÓN al español de España (puede cambiarla si es incorrecta).
 *
 * Checkpoint reanudable en data/reforma-fase2-checkpoint.json.
 *
 * Uso:
 *   node scripts/reforma-fase2-recat.js           # arranca o reanuda
 *   node scripts/reforma-fase2-recat.js --apply   # aplica cambios a la DB
 *   node scripts/reforma-fase2-recat.js --status  # muestra progreso
 */

const { spawnSync } = require('child_process');
const Database      = require('better-sqlite3');
const fs            = require('fs');
const path          = require('path');

const DB_PATH    = path.join(__dirname, '../data/voc.db');
const CHECKPOINT = path.join(__dirname, '../data/reforma-fase2-checkpoint.json');
const BATCH_SIZE = 120;
const CLAUDE_BIN = '/home/ebarrab/.local/bin/claude';

const SCOPE_CATS = ['verbos', 'descriptions', 'general'];

const ALL_CATS = [
  'verbos', 'phrasal_verbs', 'animals', 'arts', 'body', 'clothes', 'colours',
  'descriptions', 'family_and_friends', 'feelings', 'finance_and_money',
  'food_and_drink', 'general', 'geography', 'grammar', 'health_and_medicine',
  'law_and_crime', 'military', 'miscellaneous', 'numbers_and_time', 'places',
  'religion', 'school', 'science', 'sports_and_leisure', 'the_home',
  'toys_and_technology', 'transport', 'weather_and_nature', 'work',
];

const PROMPT_HEADER =
`Para cada par "inglés | español" decide tres cosas:
  1. keep/drop: "drop" si es nombre propio, palabra no-inglesa, fragmento sin sentido,
     o flexión redundante sin valor didáctico; "keep" en otro caso.
  2. cat: la categoría MÁS PRECISA de la lista cerrada.
  3. es: la mejor traducción al ESPAÑOL DE ESPAÑA (castellano, no latinoamericano).
     Si la traducción actual es correcta y adecuada, repítela tal cual.
     Si es incorrecta, latinoamericana, o ambigua, sustitúyela por la castellana.
     Si el par es "drop", devuelve "" (cadena vacía).

Categorías permitidas: ${ALL_CATS.join(', ')}

Criterios por categoría (prioridad de arriba abajo):
- verbos: SÓLO si el par funciona como verbo en infinitivo español (work|trabajar, run|correr).
  Un participio usado como adjetivo (-ado/-ido) → descriptions.
  Un sustantivo derivado (movement|movimiento) → categoría temática.
- phrasal_verbs: verbo + partícula (pick up, turn off, look after).
- grammar: pronombres, preposiciones, conjunciones, determinantes, auxiliares (the, of, which, would, can).
- colours: colores y matices. numbers_and_time: números, fechas, horas, festivos.
- body: partes del cuerpo, fluidos, sistemas anatómicos.
- feelings: emociones y estados de ánimo (incluyendo "to love" → feelings, no verbos).
- family_and_friends: familia y relaciones humanas (sin nombres propios).
- food_and_drink, clothes, animals, weather_and_nature, geography, places, the_home,
  transport, school, work, arts, sports_and_leisure, toys_and_technology,
  science, religion, law_and_crime, military: temáticas obvias.
- finance_and_money: dinero, banca, impuestos, economía.
- health_and_medicine: medicina, enfermedades, tratamientos, sanitarios.
- miscellaneous: interjecciones/muletillas (wow, ouch, hmm, alas).
- descriptions: adjetivos y adverbios descriptivos no clasificables arriba.
- general: SÓLO si no encaja en ninguna anterior. Evítala siempre que puedas.

Responde ÚNICAMENTE con JSON válido, con esta forma exacta:
{"palabra_inglesa": {"k": "keep"|"drop", "c": "categoria", "es": "traducción"}}

No incluyas texto fuera del JSON. La clave debe ser exactamente la forma inglesa del par.

Pares (inglés | español):`;

function categorizeBatch(pairs) {
  const list   = pairs.map(p => `${p.word} | ${p.translation}`).join('\n');
  const prompt = PROMPT_HEADER + '\n' + list;

  const result = spawnSync(CLAUDE_BIN, ['-p', prompt], {
    encoding: 'utf8',
    timeout:  300_000,
    maxBuffer: 8 * 1024 * 1024,
  });

  if (result.error)      throw new Error('claude: ' + result.error.message);
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
  // pares únicos (word, translation) cuya categoría actual está en el ámbito
  return db.prepare(`
    SELECT DISTINCT word, translation, category
    FROM words
    WHERE category IN (${SCOPE_CATS.map(c => `'${c}'`).join(',')})
  `).all();
}

function showStatus(db) {
  const decided = loadCheckpoint();
  const pairs   = getPairs(db);
  const done    = pairs.filter(p => decided[p.word + '|||' + p.translation]).length;
  console.log(`Checkpoint: ${done} / ${pairs.length} pares procesados (${(done/pairs.length*100).toFixed(1)}%).`);
  if (fs.existsSync(CHECKPOINT)) {
    const st = fs.statSync(CHECKPOINT);
    console.log(`Última actualización: ${st.mtime.toISOString()}`);
  }
}

async function runProcess() {
  const db      = new Database(DB_PATH);
  const pairs   = getPairs(db);
  const decided = loadCheckpoint();
  const keyOf   = p => p.word + '|||' + p.translation;

  const pending = pairs.filter(p => !decided[keyOf(p)]);
  const total   = Math.ceil(pending.length / BATCH_SIZE);
  console.log(`Pares en ámbito: ${pairs.length} | Ya procesados: ${pairs.length - pending.length} | Pendientes: ${pending.length} | Lotes: ${total}\n`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch    = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const pct      = Math.round(batchNum / total * 100);
    const t0       = Date.now();
    process.stdout.write(`[${String(batchNum).padStart(3)}/${total}] ${String(pct).padStart(3)}% — `);

    let attempt = 0, ok = false;
    while (attempt < 3 && !ok) {
      try {
        const res = categorizeBatch(batch);
        let drops = 0, recat = 0, retrans = 0;
        for (const p of batch) {
          const entry = res[p.word];
          if (!entry || typeof entry !== 'object') {
            decided[keyOf(p)] = { k: 'keep', c: p.category, es: p.translation };
            continue;
          }
          const k   = entry.k === 'drop' ? 'drop' : 'keep';
          const c   = ALL_CATS.includes(entry.c) ? entry.c : p.category;
          const es  = typeof entry.es === 'string' && entry.es.trim() ? entry.es.trim() : p.translation;
          decided[keyOf(p)] = { k, c, es };
          if (k === 'drop') drops++;
          else {
            if (c !== p.category)   recat++;
            if (es !== p.translation) retrans++;
          }
        }
        saveCheckpoint(decided);
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`✓ drop=${drops} recat=${recat} retrans=${retrans} (${dt}s)`);
        ok = true;
      } catch (err) {
        attempt++;
        console.log(`\n  ⚠ Error (${attempt}/3): ${err.message.slice(0, 140)}`);
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

  // Estrategia robusta frente al UNIQUE(word,level,category):
  //   drop  → DELETE todas las filas que coincidan en (word, translation).
  //   keep  → para cada fila origen, INSERT OR IGNORE en destino y DELETE origen.
  //     Si el destino ya existía (misma word+level+categoría_nueva), el OR IGNORE
  //     evita la colisión y la fila origen se borra limpiamente.
  const selSrc = db.prepare(`
    SELECT id, level, uk_ipa, us_ipa FROM words
    WHERE word = ? AND translation = ? AND category IN (${SCOPE_CATS.map(c => `'${c}'`).join(',')})
  `);
  const insDst = db.prepare(`
    INSERT OR IGNORE INTO words (word, translation, level, category, uk_ipa, us_ipa)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const delById = db.prepare('DELETE FROM words WHERE id = ?');
  const delPair = db.prepare('DELETE FROM words WHERE word = ? AND translation = ?');

  let dropped = 0, movedOk = 0, movedDupSkipped = 0, unchanged = 0;
  db.transaction(() => {
    for (const [key, dec] of Object.entries(decided)) {
      const [w, t] = key.split('|||');
      if (dec.k === 'drop') {
        dropped += delPair.run(w, t).changes;
        continue;
      }
      const rows = selSrc.all(w, t);
      for (const row of rows) {
        // Si nada cambia, dejar la fila como está.
        if (dec.c === null || dec.es === null) { unchanged++; continue; }
        const ins = insDst.run(w, dec.es, row.level, dec.c, row.uk_ipa, row.us_ipa);
        delById.run(row.id);
        if (ins.changes) movedOk++;
        else              movedDupSkipped++;
      }
    }
  })();

  // Dedupe de seguridad (por si quedara algún duplicado legado).
  db.exec(`
    DELETE FROM words WHERE id NOT IN (
      SELECT MIN(id) FROM words GROUP BY word, level, category
    );
  `);

  const after = db.prepare('SELECT COUNT(*) c FROM words').get().c;
  console.log(`Borradas (drop):          ${dropped}`);
  console.log(`Movidas/actualizadas:     ${movedOk}`);
  console.log(`Omitidas por duplicado:   ${movedDupSkipped}`);
  console.log(`Total antes: ${before} → después: ${after} (neto: ${before - after} filas menos)`);

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
