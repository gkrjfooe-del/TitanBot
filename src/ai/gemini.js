const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let ai = null;

if (GEMINI_API_KEY) {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log('[Gemini] SDK loaded successfully');
  } catch (e) {
    console.error('[Gemini] SDK failed to load:', e.message);
  }
} else {
  console.error('[Gemini] GEMINI_API_KEY is not set!');
}

export async function askGemini(message, userName) {
  if (!ai) {
    return 'AI is not available (SDK not loaded).';
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `You are a smart Discord bot assistant named Majnoun-Bot. You manage a Discord server called "Ruthless Pact". You can answer questions in Arabic and English, be helpful, friendly, and casual. If the user asks you to do something in the server (like create a channel, kick someone, etc.), respond with what command they should use. User "${userName}" says: ${message}. Respond in the same language they used. Be smart and helpful. Keep responses concise.`,
    });

    const text = typeof response.text === 'function' ? response.text() : response.text;
    return text || 'No response from AI.';
  } catch (error) {
    console.error('[Gemini] API error:', error.message);
    return 'Sorry, AI is temporarily unavailable. Try again later.';
  }
}
