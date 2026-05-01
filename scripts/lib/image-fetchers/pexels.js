'use strict';
const https = require('https');

const API_BASE = 'https://api.pexels.com/v1';

function get(path, apiKey) {
  return new Promise((resolve, reject) => {
    https.get(`${API_BASE}${path}`, { headers: { Authorization: apiKey } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadBuffer(res.headers.location).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function searchAndFetch(query, apiKey, opts = {}) {
  const { perPage = 1, size = 'medium' } = opts;
  const q = encodeURIComponent(query);
  const r = await get(`/search?query=${q}&per_page=${perPage}&orientation=square`, apiKey);
  if (r.status !== 200) throw new Error(`Pexels HTTP ${r.status}: ${JSON.stringify(r.body)}`);
  if (!r.body.photos || r.body.photos.length === 0) return null;
  const photo = r.body.photos[0];
  const url = photo.src[size] || photo.src.medium || photo.src.small;
  const buffer = await downloadBuffer(url);
  return {
    buffer,
    mime: 'image/jpeg',  // Pexels normaliza a jpg
    photo_id: photo.id,
    photographer: photo.photographer,
    photographer_url: photo.photographer_url,
    photo_url: photo.url,
    src_url: url,
    query,
  };
}

module.exports = { searchAndFetch };
