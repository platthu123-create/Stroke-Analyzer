const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const geminiApiKey = process.env.GEMINI_API_KEY;
const hasGeminiApiKey = Boolean(geminiApiKey && geminiApiKey !== 'your_gemini_api_key_here');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: hasGeminiApiKey });
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
      body: JSON.stringify({ contents })
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Gemini request failed:', error);
    res.status(502).json({ error: { message: 'Unable to reach the Gemini API.' } });
  }
});

app.listen(port, () => {
  console.log(`Stroke Risk Analyzer running at http://localhost:${port}`);
});
