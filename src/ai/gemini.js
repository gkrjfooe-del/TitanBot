const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('[Gemini] GEMINI_API_KEY is not set!');
}

const MODELS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
];

export async function askGemini(message, userName) {
  if (!GEMINI_API_KEY) {
    return 'AI is not available (no API key).';
  }

  const prompt = `You are Majnoun-Bot, a smart Discord bot assistant managing "Ruthless Pact" server. Answer in Arabic and English. Be helpful, friendly, casual. If asked to do something server-related, suggest the slash command. User "${userName}" says: ${message}. Reply in same language. Keep concise (1-3 sentences).`;

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error(`[Gemini] ${model} failed (${response.status}):`, err.substring(0, 200));
        continue;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.error(`[Gemini] ${model} returned no text:`, JSON.stringify(data).substring(0, 200));
        continue;
      }

      console.log(`[Gemini] ${model} responded successfully`);
      return text;
    } catch (error) {
      console.error(`[Gemini] ${model} error:`, error.message);
      continue;
    }
  }

  return 'Sorry, AI is temporarily unavailable. Try again later.';
}
