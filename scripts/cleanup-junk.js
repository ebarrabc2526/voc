#!/usr/bin/env node
'use strict';

/**
 * Fase 1 — Limpieza con Claude Sonnet 4.6 vía `claude -p`.
 *
 * Objetivo: marcar y eliminar filas cuyo par (inglés | español) sea:
 *   - Nombre propio de persona (Andrei, Feeney, Armando, Rivas…).
 *   - Palabra no-inglesa (italiano, latín, catalán: nostra, nelle, mea…).
 *   - Fragmento/abreviatura sin sentido didáctico (ad n, phu, ged, zev…).
 *   - Topónimo no genérico (Himalayas, Everest, París…).
 *
 * Conserva cognados legítimos (hotel, plan, idea, radio, bar, club…).
 *
 * Checkpoint reanudable en data/cleanup-junk-checkpoint.json.
 * Uso: node scripts/cleanup-junk.js
 */

const { spawnSync } = require('child_process');
const Database      = require('better-sqlite3');
const fs            = require('fs');
const path          = require('path');

const DB_PATH    = path.join(__dirname, '../data/voc.db');
const CHECKPOINT = path.join(__dirname, '../data/cleanup-junk-checkpoint.json');
const BATCH_SIZE = 200;
const CLAUDE_BIN = '/home/ebarrab/.local/bin/claude';

const PROMPT_HEADER =
`Marca cada par inglés|español como "keep" o "drop".

DROP si se cumple CUALQUIERA:
- Nombre propio de persona (Andrei, Feeney, Rivas, Hsu, Armando).
- Topónimo específico no genérico (Himalayas, Everest, Oxford, Kent).
- Palabra que NO es inglés real (italiano/latín/catalán/otros: nostra, nelle, mea, mee, lui, och, mas).
- Fragmento sin sentido, ruido o abreviatura críptica (ad n, phu, ged, zev, rex, handa, dol, ying, dao, ard).
- Palabras cuya traducción repite la original sin ser cognado reconocible (luk→luk, kati→kati, argo→argo).
- Siglas o códigos sin utilidad didáctica (llc, gmt, rpm) EXCEPTO las muy usuales (pm, ok, tv).

KEEP si:
- Es palabra inglesa real con traducción útil (hotel, plan, radio, bar, club, idea, doctor).
- Interjección o muletilla común del inglés (ok, ah, um, wow, ouch).
- Abreviatura común en inglés cotidiano (pm, am, tv, uk, usa).
- Palabra didácticamente útil aunque poco frecuente (pate, bliss, zeal).

Responde SOLO con JSON {"palabra": "keep"|"drop", ...}. Sin texto adicional. Usa exactamente la forma inglesa como clave.

Pares (inglés | español):`;

function classifyBatch(words) {
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

  // Candidatos sospechosos: filtrar sólo los que parecen problemáticos para no desperdiciar llamadas
  // Criterio: word == translation (case-insensitive) OR word <=4 chars OR traducción muy corta
  const candidates = db.prepare(`
    SELECT DISTINCT word, translation
    FROM words
    WHERE LOWER(word) = LOWER(translation)
       OR LENGTH(word) <= 4
       OR LENGTH(translation) <= 4
       OR translation GLOB '* *' AND translation LIKE word || '%'
  `).all();

  console.log(`Candidatos sospechosos: ${candidates.length}`);

  let decided = {};
  if (fs.existsSync(CHECKPOINT)) {
    try {
      decided = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')).decided || {};
      console.log(`Checkpoint: ${Object.keys(decided).length} ya clasificados`);
    } catch { decided = {}; }
  }

  const keyOf   = r => `${r.word}|||${r.translation}`;
  const pending = candidates.filter(r => !(keyOf(r) in decided));
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
        const res = classifyBatch(batch);
        let drops = 0, keeps = 0, unknown = 0;
        for (const r of batch) {
          const v = (res[r.word] || '').toString().toLowerCase();
          if (v === 'drop' || v === 'keep') {
            decided[keyOf(r)] = v;
            if (v === 'drop') drops++; else keeps++;
          } else {
            decided[keyOf(r)] = 'keep'; // fallback seguro: conservar
            unknown++;
          }
        }
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ decided }));
        console.log(`✓ keep=${keeps} drop=${drops} ?=${unknown}`);
        ok = true;
      } catch (err) {
        attempt++;
        console.log(`\n  ⚠ Error (${attempt}/3): ${err.message.slice(0, 140)}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
    if (!ok) console.log(`  ✗ Lote omitido`);
  }

  // Aplicar: eliminar filas marcadas 'drop'
  console.log('\nAplicando borrados…');
  const del = db.prepare('DELETE FROM words WHERE word = ? AND translation = ?');
  let removed = 0;
  db.transaction(() => {
    for (const [k, v] of Object.entries(decided)) {
      if (v !== 'drop') continue;
      const [w, t] = k.split('|||');
      const res = del.run(w, t);
      removed += res.changes;
    }
  })();
  console.log(`Filas eliminadas: ${removed}`);

  const after = db.prepare('SELECT COUNT(*) c FROM words').get().c;
  console.log(`Total restante: ${after}`);

  db.close();
  console.log('\nCheckpoint conservado para auditoría en', CHECKPOINT);
}

main().catch(err => { console.error('💥', err.message); process.exit(1); });
