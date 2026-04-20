import { GoogleGenAI, Type } from "@google/genai";

type ContentLanguage = 'ar' | 'en';

export async function performOCR(base64Image: string, apiKey?: string, contentLanguage: ContentLanguage = 'ar') {
  const key = apiKey || (typeof process !== 'undefined' && process.env?.API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  if (!key) {
    throw new Error("Please configure your Gemini API key in Settings.");
  }
  const ai = new GoogleGenAI({ apiKey: key });

  const ocrPrompt = `You are an expert in OCR and text extraction. Evaluate the image and perform high-accuracy extraction.

1. **Text Extraction**:
   - Extract the text exactly as it appears in its original language. Do not translate the text unless explicitly instructed.
   - If the text is in classical Arabic, apply standard corrections (add missing Hamzas, Alif in plurals, fix Ta Marbuta/Ha, Ya/Alif Maqsura). Handle Quranic verses with appropriate spelling.
   - Preserve paragraphs and punctuation exactly.

2. **Metadata Generation**:
   - **Title**: Suggest a concise scholarly title in the exact same language as the extracted text.
   - **Tags**: Suggest 3-5 relevant tags in the exact same language as the extracted text(or at least bilingual if Arabic text contains some English).

Return the result in strict JSON format:
{
  "extractedText": "...",
  "suggestedTitle": "...",
  "suggestedTags": ["tag1", "tag2"]
}`
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(',')[1] || base64Image,
            },
          },
          {
            text: ocrPrompt,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          extractedText: { type: Type.STRING },
          suggestedTitle: { type: Type.STRING },
          suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["extractedText", "suggestedTitle", "suggestedTags"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
}

export async function generateQuestions(faidah: any, apiKey?: string, contentLanguage: ContentLanguage = 'ar') {
  const key = apiKey || (typeof process !== 'undefined' && process.env?.API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  if (!key) {
    throw new Error("Please configure your Gemini API key in Settings.");
  }
  const ai = new GoogleGenAI({ apiKey: key });

  const questionPrompt = `You are an expert in Islamic Sciences. Generate high-quality, concept-based questions from the following Fāʾidah (benefit/note).

Fāʾidah Content:
Title: ${faidah.title}
Content: ${faidah.content}
Keywords: ${faidah.keywords?.join(', ') || 'None'}
Requested Question Types: ${faidah.question_types?.join(', ') || 'Any'}

Rules:
1. Generate 1 to 3 questions based on the content.
2. Do NOT use random word removal for fill-in-the-blanks. Only use meaningful keywords.
3. Use the requested question types if provided, otherwise infer the best types (e.g., Principle, Definition, Ruling, Evidence, Scenario).
4. Provide the question, the correct answer, the type of question, and a difficulty rating (Easy, Medium, Hard).
5. Output language must be ${contentLanguage === 'ar' ? 'Arabic only' : 'English only'}.

Return the result in strict JSON format:
{
  "questions": [
    {
      "type": "Explain the principle",
      "question": "Explain the principle of...",
      "answer": "...",
      "difficulty": "Medium"
    }
  ]
}`;
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        parts: [
          {
            text: questionPrompt
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
                difficulty: { type: Type.STRING }
              },
              required: ["type", "question", "answer", "difficulty"]
            }
          }
        },
        required: ["questions"]
      }
    }
  });

  return JSON.parse(response.text || '{"questions": []}').questions;
}

export async function suggestTitleAndTags(content: string, apiKey?: string) {
  const key = apiKey || (typeof process !== 'undefined' && process.env?.API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  if (!key) {
    throw new Error("Please configure your Gemini API key in Settings.");
  }
  const ai = new GoogleGenAI({ apiKey: key });

  const prompt = `You are an expert in Islamic Sciences. Review the following text and suggest a concise, scholarly title and 3-5 relevant tags.
Output the title and tags in the exact same language as the text provided below. Do not translate them to another language.

Text:
${content}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestedTitle: { type: Type.STRING },
          suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["suggestedTitle", "suggestedTags"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
}

export async function translateContent(content: { title?: string, tags?: string[], content?: string }, apiKey?: string, targetLanguage: ContentLanguage = 'ar') {
  const key = apiKey || (typeof process !== 'undefined' && process.env?.API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  if (!key) {
    throw new Error("Please configure your Gemini API key in Settings.");
  }
  const ai = new GoogleGenAI({ apiKey: key });

  const prompt = `Translate the following note, including its title, tags, and content into ${targetLanguage === 'ar' ? 'Arabic' : 'English'}. Keep the scholarly and academic tone, do not summarize, and maintain the original paragraph structure of the content.

Data to translate:
{
  "title": ${JSON.stringify(content.title || '')},
  "tags": ${JSON.stringify(content.tags || [])},
  "content": ${JSON.stringify(content.content || '')}
}

Return ONLY strict valid JSON matching exactly this schema:
{
  "title": "Translated title",
  "tags": ["translated label 1", "translated label 2"],
  "content": "Translated content..."
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          content: { type: Type.STRING }
        },
        required: ["title", "tags", "content"],
      },
    },
  });

  const translatedData = JSON.parse(response.text || "{}") as any;
  return {
    title: translatedData.title || content.title,
    tags: translatedData.tags || content.tags,
    content: translatedData.content || content.content
  };
}
