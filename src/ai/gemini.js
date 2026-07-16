import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function askGemini(message, userName) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `You are a smart Discord bot assistant named TitanBot. 
You manage a Discord server. You can:
- Create channels, roles, and manage the server
- Answer questions in Arabic and English
- Be helpful and friendly
- Understand natural language commands

User "${userName}" says: ${message}

Respond in the same language they used. Be smart and helpful.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    return 'Sorry, I encountered an error. Please try again.';
  }
}
