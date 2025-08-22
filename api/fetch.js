const fetch = require('node-fetch');
const { URL } = require('url');
const config = require('../config');

function addCORSHeaders(req, res) {
  if (req.method.toUpperCase() === 'OPTIONS') {
    if (req.headers['access-control-request-headers']) {
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
    }
    if (req.headers['access-control-request-method']) {
      res.setHeader('Access-Control-Allow-Methods', req.headers['access-control-request-method']);
    }
  }
  res.setHeader('Access-Control-Allow-Origin', req.headers['origin'] || '*');
}

module.exports = async (req, res) => {
  addCORSHeaders(req, res);

  if (req.method.toUpperCase() === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // 1) URL может приходить как query ?url=
  let target = req.query.url;

  // 2) или из пути /api/fetch/<encoded>
  if (!target && req.url.startsWith('/api/fetch/')) {
    const raw = req.url.replace(/^\/api\/fetch\//, '');
    if (raw) target = decodeURIComponent(raw);
  }

  if (!target) {
    res.status(404).end('url must be provided as ?url=... or /api/fetch/<encoded-url>');
    return;
  }

  let remoteURL;
  try {
    remoteURL = new URL(target);
  } catch (e) {
    res.status(404).end('invalid url');
    return;
  }

  if (!/^https?:$/.test(remoteURL.protocol)) {
    res.status(400).end('only http and https are supported');
    return;
  }

  if (config.blacklist_hostname_regex.test(remoteURL.hostname)) {
    res.status(400).end('naughty, naughty...');
    return;
  }

  // Готовим заголовки
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;

  // Таймаут
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.proxy_request_timeout_ms);

  let upstream;
  try {
    upstream = await fetch(remoteURL.toString(), {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : req,
      redirect: 'manual',
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      res.status(504).end('upstream timeout');
    } else {
      res.status(502).end('upstream error');
    }
    return;
  }

  clearTimeout(timeout);

  // Прокидываем статус
  res.status(upstream.status);

  // Прокидываем заголовки
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'content-encoding') {
      res.setHeader(key, value);
    }
  });

  // Ещё раз ставим CORS
  addCORSHeaders(req, res);

  // Стримим тело
  if (!upstream.body) {
    res.end();
    return;
  }
  upstream.body.pipe(res);
};
