const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const geminiApiKey = process.env.GEMINI_API_KEY;
const hasGeminiApiKey = Boolean(geminiApiKey && geminiApiKey !== 'your_gemini_api_key_here');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

// --- CORS: allow the ESP32 (and any device on your LAN) to POST to this server ---
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: hasGeminiApiKey });
});

// --- In-memory store for latest ESP32 reading (swap for a DB later if needed) ---
let latestSensorData = null;

// ESP32 -> Server: POST sensor readings here
app.post('/api/sensor-data', (req, res) => {
  const payload = req.body;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: { message: 'Request body must be a JSON object.' } });
  }

  latestSensorData = {
    ...payload,
    receivedAt: new Date().toISOString()
  };

  console.log('Received sensor data from ESP32:', latestSensorData);
  res.status(201).json({ ok: true, received: latestSensorData });
});

// Optional: let your frontend (or you, for testing) fetch the latest reading
app.get('/api/sensor-data', (req, res) => {
  if (!latestSensorData) {
    return res.status(404).json({ error: { message: 'No sensor data received yet.' } });
  }
  res.json(latestSensorData);
});

app.post('/api/gemini', async (req, res) => {
  if (!hasGeminiApiKey) {
    return res.status(500).json({ error: { message: 'GEMINI_API_KEY is not configured in .env.' } });
  }

  const { contents, model = 'gemini-3.6-flash' } = req.body;
  if (!Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: { message: 'A non-empty contents array is required.' } });
  }

  const safeModel = /^[a-zA-Z0-9._-]+$/.test(model) ? model : 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${geminiApiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0,
          topK: 1,
          topP: 1,
          seed: 42
        }
      })
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Gemini request failed:', error);
    res.status(502).json({ error: { message: 'Unable to reach the Gemini API.' } });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Stroke Risk Analyzer running at http://0.0.0.0:${port}`);
  console.log('On your LAN, the ESP32 should POST to: http://<your-laptop-local-IP>:' + port + '/api/sensor-data');
});
