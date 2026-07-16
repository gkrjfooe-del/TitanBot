const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.error('[Gemini] GEMINI_API_KEY is not set! DM AI will not work.');
}

export async function askGemini(message, userName) {
  if (!GEMINI_API_KEY) {
    return 'AI is not available (no API key configured).';
  }

  const systemPrompt = `You are a smart Discord bot assistant named TitanBot.
You manage a Discord server called "Ruthless Pact". You can:
- Create channels, roles, and manage the server
- Answer questions in Arabic and English
- Be helpful, friendly, and casual
- Understand natural language commands

IMPORTANT: If the user asks you to do something in the server (like create a channel, kick someone, etc.), respond with what command they should use, since you can only chat in DMs.

User "${userName}" says: ${message}

Respond in the same language they used. Be smart and helpful. Keep responses concise (1-3 sentences unless more detail is needed).`;

  try {
    const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Gemini] API error ${response.status}:`, errorBody);
      return 'Sorry, AI is temporarily unavailable. Try again later.';
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('[Gemini] No text in response:', JSON.stringify(data));
      return 'No response from AI.';
    }

    return text;
  } catch (error) {
    console.error('[Gemini] Fetch error:', error.message);
    return 'Sorry, I encountered an error. Please try again.';
  }
}
