'use strict';
// Sync idempotente de imágenes por categoría.
// Por ahora sólo category='colours' con generator='color_swatch'.
// Invocar nuevos generadores añadiendo entradas en GENERATORS.

const path     = require('path');
const { execFileSync } = require('child_process');

const GENERATORS = {
  colours: path.join(__dirname, 'generate-color-swatches.js'),
};

let anyError = false;
for (const [cat, scriptPath] of Object.entries(GENERATORS)) {
  console.log(`\n[sync] Procesando categoría: ${cat}`);
  try {
    const out = execFileSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    process.stdout.write(out);
  } catch (e) {
    console.error(`[sync] ERROR en ${cat}:`, e.message);
    anyError = true;
  }
}

if (anyError) process.exit(1);
console.log('\n[sync] Sync completado.');
