'use strict';
const https = require('https');

const MODEL = '@cf/black-forest-labs/flux-1-schnell';

function buildPrompt(word, category) {
  const hints = {
    body: `human ${word}, anatomical photograph, neutral pose, white background, photorealistic, high detail, medical reference style`,
    animals: `${word}, photograph, natural setting, photorealistic, high detail`,
    food: `${word}, food photography, top down, white background, photorealistic`,
    clothes: `${word}, clothing item, product photography, white background`,
    objects: `${word}, product photography, white background, photorealistic`,
    nature: `${word}, nature photography, photorealistic, high detail`,
  };
  return hints[category] || `${word}, photograph, white background, photorealistic, high detail`;
}

function callApi(accountId, token, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ prompt, steps: 4 });
    const req = https.request({
      method: 'POST',
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error(`Bad JSON from CF: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('CF request timeout')); });
    req.write(body);
    req.end();
  });
}

async function generate(word, category, accountId, token) {
  const prompt = buildPrompt(word, category);
  const r = await callApi(accountId, token, prompt);

  if (r.status === 200 && r.body.success && r.body.result && r.body.result.image) {
    const buffer = Buffer.from(r.body.result.image, 'base64');
    return {
      buffer,
      mime: 'image/jpeg',
      source: 'cloudflare',
      model: MODEL,
      prompt,
      query: word,
    };
  }

  const err = r.body && r.body.errors && r.body.errors[0];
  if (err && err.code === 3030) {
    const e = new Error(`NSFW filter: ${err.message}`);
    e.refused = true;
    throw e;
  }
  throw new Error(`CF HTTP ${r.status}: ${err ? err.message : JSON.stringify(r.body).slice(0,200)}`);
}

module.exports = { generate, buildPrompt, MODEL };
