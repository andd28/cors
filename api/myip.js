const fetch = require('node-fetch');

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

  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const data = await r.json();

    res.status(200).json({
      vercel_ip: data.ip,
      note: 'Это IP, с которого данный деплой Vercel делает исходящие запросы'
    });
  } catch (err) {
    console.error('Ошибка определения IP:', err);
    res.status(500).json({ error: 'failed to determine IP' });
  }
};
