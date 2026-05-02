'use strict';
const https = require('https');

const HOST = 'image.pollinations.ai';

function buildPrompt(word, category) {
  const hints = {
    body: `human ${word}, anatomical photograph, neutral pose, white background, photorealistic, high detail`,
    animals: `${word}, photograph, natural setting, photorealistic, high detail`,
    food: `${word}, food photography, top down, white background, photorealistic`,
    clothes: `${word}, clothing item, product photography, white background`,
    objects: `${word}, product photography, white background, photorealistic`,
    nature: `${word}, nature photography, photorealistic, high detail`,
  };
  return hints[category] || `${word}, photograph, white background, photorealistic, high detail`;
}

function fetchImage(prompt, opts = {}) {
  const { width = 1024, height = 1024, model = 'flux', seed } = opts;
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: 'true',
    model,
    private: 'true',
    enhance: 'false',
    safe: 'false',
  });
  if (seed != null) params.set('seed', String(seed));
  const path = `/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'GET',
      hostname: HOST,
      path,
      timeout: 120000,
      headers: { 'User-Agent': 'voc-fetcher/1.0' },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return reject(new Error(`Pollinations redirect ${res.statusCode}: ${res.headers.location}`));
      }
      if (res.statusCode !== 200) {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => reject(new Error(`Pollinations HTTP ${res.statusCode}: ${data.slice(0,200)}`)));
        return;
      }
      const ct = res.headers['content-type'] || '';
      if (!ct.startsWith('image/')) {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => reject(new Error(`Pollinations non-image content-type: ${ct} body=${data.slice(0,200)}`)));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), mime: ct.split(';')[0].trim() }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Pollinations request timeout')); });
    req.end();
  });
}

async function generate(word, category, opts = {}) {
  const prompt = buildPrompt(word, category);
  const seed = Math.floor(Math.random() * 1e9);
  const r = await fetchImage(prompt, { ...opts, seed });
  return {
    buffer: r.buffer,
    mime: r.mime || 'image/jpeg',
    source: 'pollinations',
    model: opts.model || 'flux',
    prompt,
    seed,
    query: word,
  };
}

module.exports = { generate, buildPrompt };
