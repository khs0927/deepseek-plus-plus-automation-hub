// Engine: Google Gemini Free API (Gemini 2.0 Flash / 1.5 Flash)

async function runGeminiWorker({ role, task, apiKey, model = 'gemini-2.0-flash' }) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for Gemini engine.');
  }

  const systemInstruction = `You are an expert autonomous subagent acting as '${role}'. You perform targeted, high-precision tasks assigned by a primary orchestrator agent. Provide thorough, well-reasoned, actionable output in structured Markdown.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: `Role: ${role}\n\nTask:\n${task}` }]
      }],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: 0.4
      }
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API returned ${res.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Gemini API');
  }

  return {
    ok: true,
    role,
    engine: `gemini (${model})`,
    output: text
  };
}

module.exports = { runGeminiWorker };
