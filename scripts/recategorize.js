'use strict';

/**
 * Recategoriza todas las palabras usando Claude Sonnet 4.6 vía CLI (suscripción).
 * No consume API — usa `claude -p` del Claude Code instalado.
 *
 * Uso: node scripts/recategorize.js
 */

const { spawnSync } = require('child_process');
const Database      = require('better-sqlite3');
const fs            = require('fs');
const path          = require('path');

const db         = new Database(path.join(__dirname, '../data/voc.db'));
const CHECKPOINT = path.join(__dirname, '../data/recategorize-checkpoint.json');
const BATCH_SIZE = 150;
const CLAUDE_BIN = '/home/ebarrab/.local/bin/claude';

const CATEGORIES = [
  'actions', 'animals', 'arts', 'body', 'clothes', 'colours',
  'descriptions', 'family_and_friends', 'feelings', 'food_and_drink',
  'general', 'geography', 'grammar', 'law_and_crime', 'military',
  'miscellaneous', 'numbers_and_time', 'places', 'religion', 'school',
  'science', 'sports_and_leisure', 'the_home', 'toys_and_technology',
  'transport', 'weather_and_nature', 'work',
];

const PROMPT_HEADER =
`Asigna la categoría más apropiada a cada palabra inglesa según su traducción al español.
Responde ÚNICAMENTE con un objeto JSON {"palabra": "categoría", ...}. Sin texto adicional.

Categorías: ${CATEGORIES.join(', ')}

Guía rápida:
- actions: verbos de acción (run, eat, build…)
- animals: animales, pájaros, peces, insectos
- arts: música, pintura, literatura, cine, teatro
- body: partes del cuerpo, salud, medicina
- clothes: ropa, calzado, accesorios
- colours: colores y matices (red, blue, pale…)
- descriptions: adjetivos y adverbios (big, fast, beautiful…)
- family_and_friends: familia, relaciones, nombres propios de persona
- feelings: emociones y estados de ánimo (happy, angry…)
- food_and_drink: comida, bebidas, cocina
- general: nombres propios sin categoría clara, palabras sin encaje
- geography: países, ciudades, accidentes geográficos
- grammar: palabras funcionales (pronombres, preposiciones, conjunciones)
- law_and_crime: términos legales, crimen, justicia
- military: guerra, armas, fuerzas armadas
- miscellaneous: interjecciones, muletillas (hmm, ouch, wow…)
- numbers_and_time: números, fechas, horas, festivos
- places: tipos de lugares/edificios (hospital, park, airport…)
- religion: términos religiosos, fe, espiritualidad
- school: educación, aprendizaje, asignaturas
- science: ciencia, química, física, biología, matemáticas
- sports_and_leisure: deportes, juegos, hobbies, ocio
- the_home: hogar, muebles, electrodomésticos
- toys_and_technology: tecnología, dispositivos, videojuegos, internet
- transport: vehículos, medios de transporte
- weather_and_nature: tiempo, naturaleza, plantas, medio ambiente
- work: profesiones, negocio, economía, oficina

Palabras (inglés | español):`;

function categorizeBatch(words) {
  const wordList = words.map(w => `${w.word} | ${w.translation}`).join('\n');
  const prompt   = PROMPT_HEADER + '\n' + wordList;

  const result = spawnSync(CLAUDE_BIN, ['-p', prompt], {
    encoding: 'utf8',
    timeout:  120_000,
    maxBuffer: 1024 * 1024,
  });

  if (result.error) throw new Error('Error ejecutando claude: ' + result.error.message);
  if (result.status !== 0) throw new Error('claude salió con código ' + result.status + ': ' + (result.stderr || '').slice(0, 200));

  const text = (result.stdout || '').trim();
  const m    = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Sin JSON en respuesta: ' + text.slice(0, 300));
  return JSON.parse(m[0]);
}

async function main() {
  const LEVEL_ORDER = { A1:1, A2:2, B1:3, B2:4, C1:5, C2:6 };
  const raw  = db.prepare('SELECT word, translation, level FROM words ORDER BY word').all();
  const best = new Map();
  for (const r of raw) {
    const ex = best.get(r.word);
    if (!ex || LEVEL_ORDER[r.level] < LEVEL_ORDER[ex.level]) best.set(r.word, r);
  }
  const allWords = [...best.values()];

  let done = new Set();
  if (fs.existsSync(CHECKPOINT)) {
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
      done = new Set(cp.done || []);
      console.log(`📂 Checkpoint: ${done.size} palabras ya procesadas`);
    } catch { /* empezar de cero */ }
  }

  const pending      = allWords.filter(w => !done.has(w.word));
  const totalBatches = Math.ceil(pending.length / BATCH_SIZE);
  console.log(`📊 Total únicas: ${allWords.length} | Pendientes: ${pending.length} | Lotes: ${totalBatches} (${BATCH_SIZE}/lote)`);
  console.log(`🤖 Usando: claude -p (Claude Sonnet 4.6 — suscripción)\n`);

  const updateStmt = db.prepare('UPDATE words SET category = ? WHERE word = ?');
  let totalUpdated = 0;
  let errors       = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch    = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const pct      = Math.round(batchNum / totalBatches * 100);
    const eta      = batchNum > 1 ? '' : '';

    process.stdout.write(`[${String(batchNum).padStart(3)}/${totalBatches}] ${String(pct).padStart(3)}% — `);

    let attempt = 0;
    while (attempt < 3) {
      try {
        const result = categorizeBatch(batch);

        db.transaction(() => {
          for (const [word, cat] of Object.entries(result)) {
            if (CATEGORIES.includes(cat)) { updateStmt.run(cat, word); totalUpdated++; }
          }
        })();

        batch.forEach(w => done.add(w.word));
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ done: [...done] }));
        console.log(`✓ ${Object.keys(result).length} palabras`);
        break;

      } catch (err) {
        attempt++;
        console.log(`\n  ⚠ Error (${attempt}/3): ${err.message.slice(0, 120)}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000 * attempt));
        else { errors++; console.log('  ✗ Lote omitido'); }
      }
    }
  }

  console.log(`\n✅ Completado — ${totalUpdated} palabras actualizadas, ${errors} lotes con error\n`);
  console.log('📊 Distribución final:');
  db.prepare('SELECT category, COUNT(*) as c FROM words GROUP BY category ORDER BY c DESC').all()
    .forEach(r => console.log(`   ${r.category.padEnd(25)} ${r.c}`));

  if (errors === 0 && fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
}

main().catch(err => { console.error('💥', err.message); process.exit(1); });
