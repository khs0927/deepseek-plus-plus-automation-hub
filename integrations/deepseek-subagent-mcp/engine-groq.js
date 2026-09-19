// Engine: Groq Free Cloud API (Llama 3.3 70B Versatile)

async function runGroqWorker({ role, task, apiKey, model = 'llama-3.3-70b-versatile' }) {
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is required for Groq engine.');
  }

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `You are an expert autonomous subagent acting as '${role}'. You perform targeted, high-precision tasks assigned by a primary orchestrator agent. Provide thorough, well-reasoned, actionable output in structured Markdown.`
        },
        {
          role: 'user',
          content: `Role: ${role}\n\nTask:\n${task}`
        }
      ],
      temperature: 0.4
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq API returned ${res.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Empty response from Groq API');
  }

  return {
    ok: true,
    role,
    engine: `groq (${model})`,
    output: text
  };
}

module.exports = { runGroqWorker };
