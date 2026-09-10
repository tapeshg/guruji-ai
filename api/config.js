const { config, loadConfig, saveConfig } = require('./config-lib');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const cfg = loadConfig();
    const safe = { ...cfg };
    if (safe.apiKey) safe.apiKey = safe.apiKey.slice(0, 8) + '...' + safe.apiKey.slice(-4);
    res.status(200).json(safe);
  } else if (req.method === 'POST') {
    const current = loadConfig();
    const updated = { ...current, ...req.body };
    saveConfig(updated);
    res.status(200).json({ ok: true });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};