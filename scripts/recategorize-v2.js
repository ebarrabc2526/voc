#!/usr/bin/env node
'use strict';

/**
 * Recategorización definitiva con Claude Sonnet 4.6 vía `claude -p`.
 *
 * - Incluye la nueva categoría 'verbos' (reemplaza 'actions').
 * - Procesa palabras únicas y propaga la categoría a todas las filas (todos los niveles).
 * - Checkpoint reanudable en data/recategorize-v2-checkpoint.json.
 *
 * Uso: node scripts/recategorize-v2.js
 */

const { spawnSync } = require('child_process');
const Database      = require('better-sqlite3');
const fs            = require('fs');
const path          = require('path');

const DB_PATH    = path.join(__dirname, '../data/voc.db');
const CHECKPOINT = path.join(__dirname, '../data/recategorize-v2-checkpoint.json');
const BATCH_SIZE = 150;
const CLAUDE_BIN = '/home/ebarrab/.local/bin/claude';

const CATEGORIES = [
  'verbos', 'animals', 'arts', 'body', 'clothes', 'colours',
  'descriptions', 'family_and_friends', 'feelings', 'food_and_drink',
  'general', 'geography', 'grammar', 'law_and_crime', 'military',
  'miscellaneous', 'numbers_and_time', 'places', 'religion', 'school',
  'science', 'sports_and_leisure', 'the_home', 'toys_and_technology',
  'transport', 'weather_and_nature', 'work',
];

const PROMPT_HEADER =
`Asigna la categoría más apropiada a cada palabra inglesa según el par "inglés | español".
Responde ÚNICAMENTE con un JSON {"palabra": "categoría", ...}. Sin texto adicional.

Categorías permitidas: ${CATEGORIES.join(', ')}

Guía semántica (prioridad de arriba abajo en caso de duda):
- verbos: cualquier verbo (acción, estado o auxiliar). Si la traducción es un infinitivo español (-ar/-er/-ir) o el significado principal del par es verbo (work|trabajar, be|ser, can|poder, run|correr, become|devenir, rain|llover).
- grammar: palabras funcionales NO verbales: pronombres, preposiciones, conjunciones, artículos, determinantes, adverbios gramaticales (the, of, which, although, however, perhaps).
- colours: colores y matices (red, azure, crimson, pale).
- numbers_and_time: números, fechas, días, meses, horas, festivos, estaciones.
- body: partes del cuerpo, órganos, salud, enfermedades, medicamentos, medicina.
- family_and_friends: familia, relaciones humanas genéricas (mother, friend, neighbour). Sin nombres propios.
- feelings: emociones y estados de ánimo (happy, angry, nostalgia).
- food_and_drink: alimentos, bebidas, ingredientes, cocina.
- clothes: ropa, calzado, accesorios, tejidos.
- animals: animales, aves, peces, insectos, mascotas.
- weather_and_nature: clima, fenómenos naturales, plantas, medio ambiente, geología genérica.
- geography: accidentes geográficos genéricos (mountain, river, continent). Sin topónimos.
- places: tipos de lugares/edificios (hospital, park, airport, restaurant).
- the_home: hogar, muebles, electrodomésticos, utensilios domésticos.
- transport: vehículos, medios de transporte, infraestructura (road, flight).
- school: educación, aprendizaje, asignaturas, material escolar.
- work: profesiones, negocio, economía, oficina, dinero.
- arts: música, pintura, literatura, cine, teatro, danza.
- sports_and_leisure: deportes, juegos, hobbies, ocio.
- toys_and_technology: tecnología, dispositivos, internet, juguetes, videojuegos.
- science: ciencia, química, física, biología, matemáticas, astronomía.
- religion: términos religiosos, fe, espiritualidad.
- law_and_crime: derecho, justicia, delito, seguridad.
- military: guerra, fuerzas armadas, armas, estrategia.
- miscellaneous: interjecciones y muletillas (wow, ouch, hmm, alas).
- descriptions: adjetivos y adverbios descriptivos NO clasificables arriba (big, fast, beautiful, quickly).
- general: solo si realmente no encaja en ninguna de las anteriores.

Reglas:
- Prioriza el SIGNIFICADO del par, no solo la palabra inglesa.
- Si la palabra inglesa suele ser verbo Y sustantivo, usa la traducción para decidir (work|trabajo → work; work|trabajar → verbos).
- No uses 'general' salvo que ninguna otra categoría encaje razonablemente.

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

  // Palabras únicas por (word, translation) — primera entrada en el orden por nivel ascendente
  const LEVEL_ORDER = { A1:1, A2:2, B1:3, B2:4, C1:5, C2:6 };
  const raw = db.prepare('SELECT word, translation, level, category FROM words').all();
  const bestMap = new Map();
  for (const r of raw) {
    const key = `${r.word}|||${r.translation}`;
    const ex  = bestMap.get(key);
    if (!ex || (LEVEL_ORDER[r.level] || 9) < (LEVEL_ORDER[ex.level] || 9)) bestMap.set(key, r);
  }
  const allPairs = [...bestMap.values()];
  console.log(`Pares únicos (word|translation): ${allPairs.length}`);

  // Checkpoint
  let decided = {};
  if (fs.existsSync(CHECKPOINT)) {
    try {
      decided = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')).decided || {};
      console.log(`Checkpoint: ${Object.keys(decided).length} ya clasificados`);
    } catch { decided = {}; }
  }

  const keyOf   = r => `${r.word}|||${r.translation}`;
  const pending = allPairs.filter(r => !(keyOf(r) in decided));
  const total   = Math.ceil(pending.length / BATCH_SIZE);
  console.log(`Pendientes: ${pending.length} | Lotes: ${total} (${BATCH_SIZE}/lote)\n`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch    = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const pct      = Math.round(batchNum / total * 100);
    process.stdout.write(`[${String(batchNum).padStart(3)}/${total}] ${String(pct).padStart(3)}% — `);

    let attempt = 0, ok = false;
    while (attempt < 3 && !ok) {
      try {
        const res = categorizeBatch(batch);
        let assigned = 0;
        for (const r of batch) {
          const cat = res[r.word];
          if (CATEGORIES.includes(cat)) {
            decided[keyOf(r)] = cat;
            assigned++;
          } else {
            decided[keyOf(r)] = r.category; // fallback: keep current
          }
        }
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ decided }));
        console.log(`✓ ${assigned}/${batch.length}`);
        ok = true;
      } catch (err) {
        attempt++;
        console.log(`\n  ⚠ Error (${attempt}/3): ${err.message.slice(0, 140)}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
    if (!ok) console.log(`  ✗ Lote omitido`);
  }

  // Apply: UPDATE category for every row matching (word, translation)
  console.log(`\nAplicando actualizaciones…`);
  const upd = db.prepare('UPDATE words SET category = ? WHERE word = ? AND translation = ?');
  let changed = 0;
  db.transaction(() => {
    for (const pair of allPairs) {
      const key = keyOf(pair);
      const cat = decided[key];
      if (cat && cat !== pair.category) {
        const res = upd.run(cat, pair.word, pair.translation);
        changed += res.changes;
      }
    }
  })();
  console.log(`Filas actualizadas: ${changed}`);

  console.log('\nDistribución final:');
  db.prepare('SELECT category, COUNT(*) c FROM words GROUP BY category ORDER BY c DESC')
    .all().forEach(r => console.log(`  ${r.category.padEnd(22)} ${r.c}`));

  if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
  db.close();
}

main().catch(err => { console.error('💥', err.message); process.exit(1); });
