'use strict';
// Genera swatches SVG 400×200 para todos los colores de la categoría 'colours'
// e inserta en word_images. Idempotente.

const path     = require('path');
const Database = require('better-sqlite3');
const hexMap   = require('../data/colors-hex.json');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// -- helpers -----------------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  return { r, g, b };
}

// Luminancia perceptiva W3C (sRGB linearizada)
function luminance({ r, g, b }) {
  const lin = v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function textColor(hex) {
  const rgb = hexToRgb(hex);
  // Umbral: contraste con blanco vs negro
  const L = luminance(rgb);
  // Contraste con blanco = (1 + 0.05) / (L + 0.05)
  // Contraste con negro  = (L + 0.05) / (0 + 0.05)
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#000000' : '#FFFFFF';
}

function buildSvg(hex, name, rgb) {
  const tc = textColor(hex);
  const { r, g, b } = rgb;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <rect width="400" height="200" fill="${hex}"/>
  <text x="200" y="70" font-family="system-ui, sans-serif" font-size="32" font-weight="600" fill="${tc}" text-anchor="middle">${escapeXml(name)}</text>
  <text x="200" y="115" font-family="monospace" font-size="28" fill="${tc}" text-anchor="middle">${hex.toUpperCase()}</text>
  <text x="200" y="155" font-family="monospace" font-size="22" fill="${tc}" text-anchor="middle">RGB(${r}, ${g}, ${b})</text>
</svg>`;
}

function escapeXml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// -- main --------------------------------------------------------------------

// Obtener todos los lemas únicos de colours con su traducción (primera fila por nivel)
const rows = db.prepare(`
  SELECT LOWER(word) AS word_lower, translation
  FROM words
  WHERE category = 'colours'
  ORDER BY word, CASE level WHEN 'A1' THEN 1 WHEN 'A2' THEN 2 WHEN 'B1' THEN 3
                             WHEN 'B2' THEN 4 WHEN 'C1' THEN 5 WHEN 'C2' THEN 6
                             ELSE 7 END
`).all();

// Deduplicate: primero encontrado (nivel más bajo)
const lemas = new Map();
for (const r of rows) {
  if (!lemas.has(r.word_lower)) lemas.set(r.word_lower, r.translation);
}

// Preparar statements
const checkExists = db.prepare('SELECT 1 FROM word_images WHERE word_lower=? AND category=?');
const insert = db.prepare(`
  INSERT INTO word_images (word_lower, category, image_data, image_mime, source, metadata)
  VALUES (?, 'colours', ?, 'image/svg+xml', 'color_swatch', ?)
`);

let generated = 0;
let skipped   = 0;
let noHex     = 0;
const noHexList = [];

const insertMany = db.transaction(() => {
  for (const [word_lower, translation] of lemas) {
    const hex = hexMap[word_lower];
    if (!hex) {
      noHex++;
      noHexList.push(word_lower);
      continue;
    }

    // Skip si ya existe
    if (checkExists.get(word_lower, 'colours')) {
      skipped++;
      continue;
    }

    const rgb = hexToRgb(hex);
    const svg = buildSvg(hex, translation, rgb);
    const meta = JSON.stringify({ hex: hex.toUpperCase(), rgb: [rgb.r, rgb.g, rgb.b] });
    insert.run(word_lower, Buffer.from(svg, 'utf8'), meta);
    generated++;
  }
});

insertMany();

console.log(`[swatches] Generados: ${generated}`);
console.log(`[swatches] Ya existían (saltados): ${skipped}`);
console.log(`[swatches] Sin hex (pendientes): ${noHex}`);
if (noHexList.length) console.log('[swatches] Pendientes:', noHexList);

// Verificar total
const total = db.prepare("SELECT COUNT(*) AS n FROM word_images WHERE category='colours'").get().n;
console.log(`[swatches] Total en word_images[colours]: ${total}`);

db.close();
