#!/usr/bin/env node
'use strict';

/**
 * Fase 2 — Añadir nuevas categorías y reclasificar palabras afines.
 *
 * Nuevas categorías:
 *   - finance_and_money     (dinero, banca, inversión, impuestos)
 *   - health_and_medicine   (medicina, enfermedades, tratamientos)
 *   - phrasal_verbs         (verbos compuestos: pick up, turn off, end up)
 *
 * Estrategia:
 *   1. Detectar candidatos por palabras clave (pre-filtro rápido).
 *   2. Confirmar con Claude Sonnet 4.6 vía `claude -p` para evitar falsos positivos.
 *   3. Actualizar category en filas aprobadas.
 *
 * Checkpoint reanudable. Uso: node scripts/add-new-categories.js
 */

const { spawnSync } = require('child_process');
const Database      = require('better-sqlite3');
const fs            = require('fs');
const path          = require('path');

const DB_PATH    = path.join(__dirname, '../data/voc.db');
const CHECKPOINT = path.join(__dirname, '../data/add-new-categories-checkpoint.json');
const BATCH_SIZE = 150;
const CLAUDE_BIN = '/home/ebarrab/.local/bin/claude';

const NEW_CATS = ['finance_and_money', 'health_and_medicine', 'phrasal_verbs'];

// Categorías válidas finales (incluyendo las nuevas)
const ALL_CATS = [
  'verbos', 'phrasal_verbs', 'animals', 'arts', 'body', 'clothes', 'colours',
  'descriptions', 'family_and_friends', 'feelings', 'finance_and_money',
  'food_and_drink', 'general', 'geography', 'grammar', 'health_and_medicine',
  'law_and_crime', 'military', 'miscellaneous', 'numbers_and_time', 'places',
  'religion', 'school', 'science', 'sports_and_leisure', 'the_home',
  'toys_and_technology', 'transport', 'weather_and_nature', 'work',
];

const PROMPT_HEADER =
`Asigna la categoría más apropiada a cada par inglés|español.

Categorías permitidas: ${ALL_CATS.join(', ')}

Prioridades (de más específica a menos):
- phrasal_verbs: verbos compuestos con preposición/adverbio (pick up, turn off, end up, look after, run out, take off).
- finance_and_money: dinero, banca, inversión, bolsa, impuestos, deudas, economía, moneda (bank, cash, loan, tax, stock, bitcoin, budget, debt, profit).
- health_and_medicine: medicina, enfermedades, tratamientos, fármacos, profesionales sanitarios, hospital como institución médica (doctor, disease, pill, surgery, diagnosis, therapy, cancer).
- body: sólo partes del cuerpo, órganos, fluidos, sistemas anatómicos (arm, heart, blood, brain).
- verbos: verbos simples (run, eat, think).
- work: profesiones y oficina NO sanitarias ni financieras (engineer, meeting, office, contract).
- Resto igual que tu guía habitual.

Reglas:
- "hospital" como lugar físico → places; como institución sanitaria → health_and_medicine. Por defecto places.
- "doctor", "nurse", "surgeon" → health_and_medicine (no work).
- "banker", "accountant" → finance_and_money.
- Verbo frasal siempre → phrasal_verbs, nunca verbos.

Responde SOLO con JSON {"palabra": "categoría", ...}.

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

function selectCandidates(db) {
  // 1) phrasal verbs: 2 palabras donde la traducción es infinitivo español
  const phrasal = db.prepare(`
    SELECT DISTINCT word, translation, category
    FROM words
    WHERE word GLOB '* *'
      AND (translation GLOB '*ar' OR translation GLOB '*er' OR translation GLOB '*ir'
           OR translation GLOB '*arse' OR translation GLOB '*erse' OR translation GLOB '*irse')
  `).all();

  // 2) finanzas: keywords en inglés o español
  const finKeywords = [
    'bank','stock','invest','bond','dividend','bitcoin','currency','coin','tax','loan','debt',
    'credit','cash','finance','budget','profit','interest','payable','asset','equity','fund',
    'pension','mortgage','wealth','refund','bankrupt','capital','revenue','expense','salary',
    'wage','payment','income','audit','accountant','banker','treasury','economic'
  ];
  const finEs = [
    'banco','bancario','banca','dinero','efectivo','préstamo','impuesto','tarjeta de crédito',
    'crédito','deuda','divisa','moneda','inversión','inversor','presupuesto','ganancia','pérdida',
    'activo','pasivo','fondo','pensión','hipoteca','riqueza','reembolso','arruinado','capital',
    'ingreso','gasto','salario','sueldo','pago','impuestos','bolsa','mercado de valores','economía'
  ];
  const finRegex = [
    ...finKeywords.map(k=>`word LIKE '% ${k}%' OR word LIKE '${k}%' OR word LIKE '%${k} %' OR word = '${k}'`),
    ...finEs.map(k=>`translation = '${k}' OR translation LIKE '${k} %' OR translation LIKE '% ${k}' OR translation LIKE '% ${k} %'`),
  ].join(' OR ');
  const finance = db.prepare(`
    SELECT DISTINCT word, translation, category FROM words
    WHERE (${finRegex})
  `).all();

  // 3) medicina: keywords
  const medKeywords = [
    'surgery','surgeon','disease','doctor','patient','medic','diagnos','clinic','therapy','cure',
    'treatment','drug','pill','prescription','virus','infection','symptom','cancer','tumor','tumour',
    'pharma','pharmac','hospital','nurse','dentist','dental','vaccine','vaccinat','antibiotic',
    'antiseptic','bandage','injection','syringe','prognos','epidemic','pandemic','flu','fever',
    'allerg','asthma','diabet','obes'
  ];
  const medEs = [
    'cirugía','cirujano','médic','medicina','enfermedad','paciente','diagnóst','clínic','terapia',
    'cura','tratamiento','fármaco','pastilla','prescripción','virus','infección','síntoma','cáncer',
    'tumor','enfermería','enfermero','enfermera','farmacia','hospital','dentista','vacuna','antibiótico',
    'antiséptico','venda','inyección','jeringa','pronóstico','epidemia','pandemia','gripe','fiebre',
    'alergia','asma','diabetes','obeso','obesidad','medicamento'
  ];
  const medRegex = [
    ...medKeywords.map(k=>`word LIKE '%${k}%'`),
    ...medEs.map(k=>`translation LIKE '%${k}%'`),
  ].join(' OR ');
  const medicine = db.prepare(`
    SELECT DISTINCT word, translation, category FROM words
    WHERE (${medRegex})
  `).all();

  // De-duplicar por (word, translation)
  const map = new Map();
  for (const r of [...phrasal, ...finance, ...medicine]) {
    const k = r.word + '|||' + r.translation;
    if (!map.has(k)) map.set(k, r);
  }
  return [...map.values()];
}

async function main() {
  const db = new Database(DB_PATH);

  const candidates = selectCandidates(db);
  console.log(`Candidatos a nuevas categorías: ${candidates.length}`);

  let decided = {};
  if (fs.existsSync(CHECKPOINT)) {
    try {
      decided = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')).decided || {};
      console.log(`Checkpoint: ${Object.keys(decided).length} ya clasificados`);
    } catch { decided = {}; }
  }

  const keyOf = r => r.word + '|||' + r.translation;
  const pending = candidates.filter(r => !(keyOf(r) in decided));
  const total = Math.ceil(pending.length / BATCH_SIZE);
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
        const counts = {};
        for (const r of batch) {
          const cat = res[r.word];
          if (ALL_CATS.includes(cat)) {
            decided[keyOf(r)] = cat;
          } else {
            decided[keyOf(r)] = r.category; // fallback: mantener
          }
          counts[decided[keyOf(r)]] = (counts[decided[keyOf(r)]] || 0) + 1;
        }
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ decided }));
        const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k}=${v}`).join(' ');
        console.log(`✓ ${top}`);
        ok = true;
      } catch (err) {
        attempt++;
        console.log(`\n  ⚠ Error (${attempt}/3): ${err.message.slice(0, 140)}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
    if (!ok) console.log(`  ✗ Lote omitido`);
  }

  console.log('\nAplicando actualizaciones…');
  const upd = db.prepare('UPDATE words SET category = ? WHERE word = ? AND translation = ?');
  let changed = 0;
  const byNewCat = { finance_and_money: 0, health_and_medicine: 0, phrasal_verbs: 0 };
  db.transaction(() => {
    for (const [k, cat] of Object.entries(decided)) {
      const [w, t] = k.split('|||');
      const res = upd.run(cat, w, t);
      if (res.changes > 0 && NEW_CATS.includes(cat)) byNewCat[cat] += res.changes;
      changed += res.changes;
    }
  })();
  console.log(`Filas tocadas (puede haber sido reasignación misma cat): ${changed}`);
  console.log('Filas a las categorías nuevas:');
  for (const c of NEW_CATS) console.log('  ' + c.padEnd(22) + byNewCat[c]);

  console.log('\nDistribución final:');
  db.prepare('SELECT category, COUNT(*) c FROM words GROUP BY category ORDER BY c DESC')
    .all().forEach(r => console.log('  ' + r.category.padEnd(22) + r.c));

  db.close();
  console.log('\nCheckpoint conservado en', CHECKPOINT);
}

main().catch(err => { console.error('💥', err.message); process.exit(1); });
