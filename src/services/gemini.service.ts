
import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env['API_KEY'] });
  }

  async analyzeImage(base64Data: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg', // Assuming jpeg for simplicity or read from file
                data: base64Data
              }
            },
            {
              text: "Describe the mood and visual elements of this photo in one poetic sentence suitable for a wallpaper caption."
            }
          ]
        }
      });
      return response.text || 'A beautiful scene.';
    } catch (error) {
      console.error('Gemini API Error:', error);
      return 'Could not analyze image.';
    }
  }
}
