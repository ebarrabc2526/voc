'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'images-body-fase1-report.json');
const OUT_PATH = path.join(__dirname, '..', 'data', 'images-body-fase1-audit.html');

if (!fs.existsSync(REPORT_PATH)) {
  console.error('No se encuentra el report: ' + REPORT_PATH);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
const db = new Database(DB_PATH);

// Obtener traducción ES para cada palabra
function getTranslation(word) {
  const row = db.prepare(
    "SELECT translation FROM words WHERE word=? AND category='body' LIMIT 1"
  ).get(word.toLowerCase());
  return row ? row.translation : '—';
}

// Obtener metadata de BD para las palabras ok
function getImageMeta(word) {
  const row = db.prepare(
    "SELECT metadata FROM word_images WHERE word_lower=? AND category='body' LIMIT 1"
  ).get(word.toLowerCase());
  if (!row) return null;
  try { return JSON.parse(row.metadata); } catch { return null; }
}

const cards = report.map((entry) => {
  const translation = getTranslation(entry.word);
  if (entry.status === 'ok') {
    const meta = getImageMeta(entry.word);
    const attr = meta && meta.attribution ? meta.attribution : {};
    const photoUrl = attr.photo_url || '#';
    const photographer = attr.photographer || '—';
    const photographerUrl = attr.photographer_url || '#';
    const bytes = meta && meta.bytes ? (meta.bytes / 1024).toFixed(1) + ' KB' : '—';
    return `
    <div class="card ok">
      <div class="card-header">
        <h2>${entry.word}</h2>
        <span class="translation">${translation}</span>
        <span class="badge ok-badge">OK</span>
      </div>
      <div class="card-body">
        <div class="img-wrap">
          <img src="/api/word-image/${entry.word}/body" alt="${entry.word}" loading="lazy" />
        </div>
        <div class="meta">
          <p class="attr">Foto de <a href="${photographerUrl}" target="_blank" rel="noopener">${photographer}</a>
            — <a href="${photoUrl}" target="_blank" rel="noopener">Ver en Pexels</a></p>
          <p class="size">Tamaño: ${bytes}</p>
          <p class="path">Path: <code>${entry.path}</code></p>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-ok" title="Marcar como aprobada">✅ OK</button>
        <button class="btn-reject" title="Marcar para reemplazar">❌ Rechazar</button>
      </div>
    </div>`;
  } else {
    return `
    <div class="card fail">
      <div class="card-header">
        <h2>${entry.word}</h2>
        <span class="translation">${translation}</span>
        <span class="badge fail-badge">${entry.status}</span>
      </div>
      <div class="card-body">
        <p class="error-msg">${entry.error || 'Sin imagen'}</p>
      </div>
    </div>`;
  }
}).join('\n');

const okCount = report.filter(r => r.status === 'ok').length;
const totalBytes = report
  .filter(r => r.bytes)
  .reduce((s, r) => s + r.bytes, 0);

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VOC — Auditoría imágenes body Fase 1</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f0f2f5; color: #222; padding: 24px; }
    h1 { font-size: 1.6rem; margin-bottom: 6px; }
    .subtitle { color: #555; margin-bottom: 24px; font-size: 0.95rem; }
    .summary { background: #fff; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px;
               box-shadow: 0 1px 4px rgba(0,0,0,0.1); display: flex; gap: 32px; flex-wrap: wrap; }
    .summary span { font-size: 1rem; }
    .summary strong { font-size: 1.2rem; color: #2a7a2a; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
    .card { background: #fff; border-radius: 10px; overflow: hidden;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1); display: flex; flex-direction: column; }
    .card.fail { border-left: 4px solid #e04040; }
    .card.ok { border-left: 4px solid #2a7a2a; }
    .card-header { padding: 14px 16px 10px; display: flex; align-items: center; gap: 10px; background: #f8f9fb; border-bottom: 1px solid #eee; }
    .card-header h2 { font-size: 1.2rem; flex: 1; text-transform: capitalize; }
    .translation { color: #555; font-size: 0.9rem; }
    .badge { font-size: 0.75rem; padding: 3px 8px; border-radius: 12px; font-weight: 600; text-transform: uppercase; }
    .ok-badge { background: #d4edda; color: #155724; }
    .fail-badge { background: #f8d7da; color: #721c24; }
    .card-body { padding: 14px 16px; flex: 1; }
    .img-wrap { width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: 6px; margin-bottom: 12px; background: #eee; }
    .img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .meta p { font-size: 0.82rem; color: #444; margin-bottom: 4px; }
    .meta a { color: #1a6eb5; text-decoration: none; }
    .meta a:hover { text-decoration: underline; }
    .meta code { font-size: 0.75rem; background: #f0f0f0; padding: 1px 4px; border-radius: 3px; word-break: break-all; }
    .error-msg { color: #9e2020; font-size: 0.9rem; }
    .card-actions { padding: 10px 16px 14px; display: flex; gap: 10px; border-top: 1px solid #eee; }
    .btn-ok, .btn-reject { flex: 1; padding: 8px; border: none; border-radius: 6px; cursor: pointer;
                           font-size: 0.9rem; font-weight: 600; transition: opacity 0.2s; }
    .btn-ok { background: #d4edda; color: #155724; }
    .btn-ok:hover { opacity: 0.8; }
    .btn-reject { background: #f8d7da; color: #721c24; }
    .btn-reject:hover { opacity: 0.8; }
    .btn-ok.selected { background: #2a7a2a; color: #fff; }
    .btn-reject.selected { background: #e04040; color: #fff; }
    @media (max-width: 600px) { body { padding: 12px; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>VOC — Auditoría imágenes body Fase 1</h1>
  <p class="subtitle">Generado: ${new Date().toLocaleString('es-ES')} · Las imágenes se cargan desde el servidor Node (<code>/api/word-image/&lt;word&gt;/body</code>).</p>

  <div class="summary">
    <span>Total: <strong>${report.length}</strong> palabras</span>
    <span>Descargadas: <strong>${okCount}</strong> OK</span>
    <span>Fallidas/saltadas: <strong>${report.length - okCount}</strong></span>
    <span>Peso total: <strong>${(totalBytes / 1024).toFixed(0)} KB</strong></span>
  </div>

  <div class="grid">
${cards}
  </div>

  <script>
    // Botones decorativos — marcan visualmente la decisión del usuario
    document.querySelectorAll('.card-actions').forEach(actions => {
      const btnOk = actions.querySelector('.btn-ok');
      const btnReject = actions.querySelector('.btn-reject');
      btnOk.addEventListener('click', () => {
        btnOk.classList.toggle('selected');
        btnReject.classList.remove('selected');
      });
      btnReject.addEventListener('click', () => {
        btnReject.classList.toggle('selected');
        btnOk.classList.remove('selected');
      });
    });
  </script>
</body>
</html>`;

fs.writeFileSync(OUT_PATH, html, 'utf8');
db.close();
console.log(`[audit-html] Generado: ${OUT_PATH}`);
console.log(`[audit-html] ${okCount}/${report.length} palabras con imagen OK`);
