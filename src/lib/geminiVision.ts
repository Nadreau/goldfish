/**
 * Gemini Vision — Understand screenshots with AI
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export interface ScreenUnderstanding {
  summary: string;
  app: string;
  activity: string;
  details: string[];
}

/**
 * Analyze a screenshot using Gemini Vision
 */
export async function analyzeScreenshot(
  imageBase64: string,
  apiKey: string
): Promise<ScreenUnderstanding | null> {
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Analyze this screenshot and provide a JSON response with:
{
  "summary": "Brief 1-line summary of what's happening",
  "app": "Name of the main application visible",
  "activity": "What the user is doing (e.g., 'writing code', 'browsing web', 'chatting')",
  "details": ["List of specific things visible like file names, URLs, chat messages, etc."]
}

Focus on what's useful for later recall. Be concise but capture key details.`
            },
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 512,
        }
      })
    });
    
    const data = await response.json();
    
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      const text = data.candidates[0].content.parts[0].text;
      // Try to parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ScreenUnderstanding;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Gemini Vision error:', error);
    return null;
  }
}

/**
 * Get a simple description of what's on screen
 */
export async function describeScreen(
  imageBase64: string,
  apiKey: string
): Promise<string | null> {
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Briefly describe what's happening on this screen in 1-2 sentences. Focus on the main activity and any important details visible.`
            },
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 200,
        }
      })
    });
    
    const data = await response.json();
    
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    }
    
    return null;
  } catch (error) {
    console.error('Gemini Vision error:', error);
    return null;
  }
}
