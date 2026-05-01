'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'data', 'images');

function safeFilename(s) {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
}

function extForMime(mime) {
  switch (mime) {
    case 'image/svg+xml': return 'svg';
    case 'image/png':     return 'png';
    case 'image/jpeg':    return 'jpg';
    case 'image/webp':    return 'webp';
    default:              return 'bin';
  }
}

function relPath(word, category, mime) {
  return `${category}/${safeFilename(word)}.${extForMime(mime)}`;
}

function writeImage(word, category, mime, data) {
  const rel = relPath(word, category, mime);
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  return rel;
}

module.exports = { safeFilename, extForMime, relPath, writeImage, ROOT };
