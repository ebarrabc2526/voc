'use strict';
const https = require('https');

const HOST = 'en.wikipedia.org';
const UA = 'voc-vocabulary-app/1.0 (https://voc.ebarrab.com; contact: ebarrabc2526@gmail.com)';

const ANATOMICAL_REDIRECTS = {
  anal: 'Anus',
  abs: 'Rectus_abdominis_muscle',
  pec: 'Pectoralis_major',
  pecs: 'Pectoralis_major',
  bicep: 'Biceps',
  biceps: 'Biceps',
  tricep: 'Triceps',
  triceps: 'Triceps',
  glute: 'Gluteus_maximus_muscle',
  glutes: 'Gluteus_maximus_muscle',
  quad: 'Quadriceps',
  quads: 'Quadriceps',
};

function getJson(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'GET', hostname: HOST, path,
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode === 404) return resolve(null);
        if (res.statusCode !== 200) return reject(new Error(`Wiki HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Wiki timeout')));
    req.end();
  });
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      method: 'GET', hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'User-Agent': UA },
      timeout: 60000,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadBuffer(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`Wiki img HTTP ${res.statusCode}`));
      const ct = res.headers['content-type'] || '';
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), mime: ct.split(';')[0].trim() }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Wiki img timeout')));
    req.end();
  });
}

async function lookupTitle(word) {
  const norm = word.toLowerCase().trim();
  if (ANATOMICAL_REDIRECTS[norm]) return ANATOMICAL_REDIRECTS[norm];
  const q = encodeURIComponent(word);
  const r = await getJson(`/w/api.php?action=query&list=search&srsearch=${q}&srlimit=1&format=json&origin=*`);
  if (!r || !r.query || !r.query.search || r.query.search.length === 0) return null;
  return r.query.search[0].title.replace(/ /g, '_');
}

async function getSummary(title) {
  const r = await getJson(`/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!r) return null;
  if (r.thumbnail && r.thumbnail.source) {
    return { url: r.thumbnail.source, title: r.title, page_url: r.content_urls && r.content_urls.desktop && r.content_urls.desktop.page };
  }
  return null;
}

async function generate(word, category) {
  const title = await lookupTitle(word);
  if (!title) throw new Error('no wiki article');
  const summary = await getSummary(title);
  if (!summary) throw new Error(`no thumbnail for ${title}`);
  const dl = await downloadBuffer(summary.url);
  return {
    buffer: dl.buffer,
    mime: dl.mime || 'image/jpeg',
    source: 'wikipedia',
    query: word,
    wiki_title: summary.title,
    wiki_url: summary.page_url,
    src_url: summary.url,
  };
}

module.exports = { generate, lookupTitle };
