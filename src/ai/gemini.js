import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
let ai = null;

if (apiKey) {
  try {
    ai = new GoogleGenAI({ apiKey });
    console.log('Gemini AI client initialized successfully');
  } catch (e) {
    console.error('Failed to init Gemini AI client:', e.message);
  }
} else {
  console.error('GEMINI_API_KEY is not set!');
}

export async function askGemini(message, userName) {
  if (!ai) {
    console.error('Gemini AI client is not initialized');
    return 'AI is not available.';
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `You are a smart Discord bot assistant named TitanBot. 
You manage a Discord server. You can:
- Create channels, roles, and manage the server
- Answer questions in Arabic and English
- Be helpful and friendly
- Understand natural language commands

User "${userName}" says: ${message}

Respond in the same language they used. Be smart and helpful.`,
    });
    
    const text = typeof response.text === 'function' ? response.text() : response.text;
    return text || 'No response from AI.';
  } catch (error) {
    console.error('Gemini API error:', error.message);
    return 'Sorry, I encountered an error. Please try again.';
  }
}
