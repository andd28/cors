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

  // --- Получаем URL ---
  let target = req.query.url;
  if (!target && req.url.startsWith('/api/fetch/')) {
    const raw = req.url.replace(/^\/api\/fetch\//, '');
    if (raw) target = decodeURIComponent(raw);
  }

  if (!target) {
    res.status(400).end('url must be provided as ?url=... or /api/fetch/<encoded-url>');
    return;
  }

  let remoteURL;
  try {
    remoteURL = new URL(target);
  } catch {
    res.status(400).end('invalid url');
    return;
  }

  if (!/^https?:$/.test(remoteURL.protocol)) {
    res.status(400).end('only http and https are supported');
    return;
  }

  if (config.blacklist_hostname_regex.test(remoteURL.hostname)) {
    res.status(403).end('naughty, naughty...');
    return;
  }

  // --- Подготовка заголовков ---
  const headers = { ...req.headers };

  // Удаляем лишние заголовки, которые ломают прокси
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  delete headers['transfer-encoding'];

  // Ставим нормальный User-Agent, если его нет
  if (!headers['user-agent']) {
    headers['user-agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
  }

  // Опционально можно добавить X-Forwarded-For (реальный IP клиента)
  if (req.headers['x-forwarded-for']) {
    headers['x-forwarded-for'] += `, ${req.socket.remoteAddress}`;
  } else {
    headers['x-forwarded-for'] = req.socket.remoteAddress;
  }

  // --- Таймаут запроса ---
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
      console.error('Fetch error:', err);
      res.status(502).end('upstream error');
    }
    return;
  }

  clearTimeout(timeout);

  // --- Пробрасываем статус ---
  res.status(upstream.status);

  // --- Пробрасываем заголовки ответа ---
  upstream.headers.forEach((value, key) => {
    if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  // Добавляем CORS заголовки ещё раз
  addCORSHeaders(req, res);

  // --- Стримим тело ответа ---
  if (!upstream.body) {
    res.end();
    return;
  }

  upstream.body.pipe(res);
};
