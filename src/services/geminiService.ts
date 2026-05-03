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
   - If the image is too blurry, illegible, or contains no readable text, DO NOT hallucinate or guess. Instead, set the "extractedText" strictly to the phrase: "OCR Failed- Image is too Blurry, Try again".
   - If the text is in classical Arabic, apply standard corrections (add missing Hamzas, Alif in plurals, fix Ta Marbuta/Ha, Ya/Alif Maqsura). Handle Quranic verses with appropriate spelling.
   - Preserve paragraphs and punctuation exactly.

2. **Metadata Generation**:
   - **Title**: Suggest a concise scholarly title in the exact same language as the extracted text. (If OCR fails, title should be empty.)
   - **Tags**: Suggest 3-5 relevant tags in the exact same language as the extracted text(or at least bilingual if Arabic text contains some English). (If OCR fails, tags should be empty.)

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

export async function categorizeBook(bookName: string, author: string, existingSciences: {id: number, name: string}[], apiKey?: string) {
  const key = apiKey || (typeof process !== 'undefined' && process.env?.API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  if (!key) {
    throw new Error("Please configure your Gemini API key in Settings.");
  }
  
  const ai = new GoogleGenAI({ apiKey: key });

  const prompt = `You are an expert Islamic bibliographer. I have a book:
Book Name: "${bookName}"
Current Author: "${author || 'Unknown'}"

I need to categorize this book into an Islamic science (category) and identify the famous author if possible.
Here is the list of existing sciences in my database:
${JSON.stringify(existingSciences)}

Task:
1. Examine the book name.
2. Check if it fits well into any of the existing sciences provided. If yes, return its exact ID in "matchedScienceId".
3. If it does NOT fit well, or if the list is empty, suggest a short, standard Arabic name for a new science category (e.g. "العقيدة", "الفقه", "الحديث", "التفسير", "أصول الفقه") in "newScienceName" and leave "matchedScienceId" as null.
4. If the Current Author is "Unknown" or empty, suggest the most famous author for this book name (in Arabic) in the "suggestedAuthor" field.

Return the result in strict JSON format:
{
  "matchedScienceId": number | null,
  "newScienceName": "string | null",
  "suggestedAuthor": "string | null"
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          matchedScienceId: { type: Type.NUMBER },
          newScienceName: { type: Type.STRING },
          suggestedAuthor: { type: Type.STRING },
        },
      },
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function splitMasroohAndSharh(bookName: string, author?: string, apiKey?: string) {
  const key = apiKey || (typeof process !== 'undefined' && process.env?.API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  if (!key) {
    return {
      masroohBookName: bookName,
      sharhTitle: null
    };
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const prompt = `You are an expert Islamic librarian.
Input title: "${bookName}"
Input author: "${author || ''}"

Goal:
1. Detect whether the title refers to a sharh/commentary work on another base text (matn/masrooh).
2. If it is a sharh, return the base text title in "masroohBookName" and the commentary title in "sharhTitle".
3. If it is not a sharh, return the original title as "masroohBookName" and null for "sharhTitle".
4. Preserve Arabic wording exactly when possible.

Return strict JSON:
{
  "masroohBookName": "string",
  "sharhTitle": "string | null"
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          masroohBookName: { type: Type.STRING },
          sharhTitle: { type: Type.STRING, nullable: true }
        },
        required: ['masroohBookName']
      }
    }
  });

  const parsed = JSON.parse(response.text || '{}');
  return {
    masroohBookName: parsed.masroohBookName || bookName,
    sharhTitle: parsed.sharhTitle || null
  };
}

export async function generateEmbedding(text: string, apiKey?: string) {
  const key = apiKey || (typeof process !== 'undefined' && process.env?.API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  if (!key) {
    throw new Error("Please configure your Gemini API key in Settings or environment.");
  }
  const ai = new GoogleGenAI({ apiKey: key });

  const response = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: text,
  });

  if (!response.embeddings || response.embeddings.length === 0 || !response.embeddings[0].values) {
    throw new Error("No embedding returned from Gemini");
  }

  return response.embeddings[0].values;
}

export async function expandSearchQuery(query: string, apiKey?: string) {
  const key = apiKey || (typeof process !== 'undefined' && process.env?.API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  if (!key) {
    throw new Error("Please configure your Gemini API key in Settings or environment.");
  }
  const ai = new GoogleGenAI({ apiKey: key });

  const prompt = `You are an expert Islamic knowledge retrieval engine. The user is searching an Islamic database.
Your job is to normalize the query and generate 2-3 precise variations to improve search accuracy.

RULES:
1. If the input is in latin transliteration (e.g., "hukm tafdeel rajul marah"), convert it to standard Arabic ("حكم تفضيل الرجل على المرأة"). 
2. If the input is in non-standard Arabic or has typos, fix it.
3. Provide up to 3 variations. DO NOT introduce new broader interpretations or novel concepts. Keep variations STRICTLY within the original intent.
4. Output standard Arabic. Do not use harakat (vowel marks).
5. The 'normalized' field must be the single best representation of the query in Arabic (or English if the query is purely English).

Query: "${query}"

Return strict JSON schema with 'normalized' as string and 'expansions' as array of strings:
{
  "normalized": "the single best query (Arabic or English)",
  "expansions": ["variation 1", "variation 2"]
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          normalized: { type: Type.STRING },
          expansions: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["normalized", "expansions"],
      },
    },
  });

  return JSON.parse(response.text || '{"normalized":"","expansions":[]}');
}

export async function parseUnstructuredText(text: string, apiKey?: string) {
  const key = apiKey || (typeof process !== 'undefined' && process.env?.API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  if (!key) {
    throw new Error("Please configure your Gemini API key in Settings or environment.");
  }
  const ai = new GoogleGenAI({ apiKey: key });

  const prompt = `You are an expert Islamic knowledge extractor. Read the following unstructured text/markdown and extract all distinct benefits (Fawa'id) or notes.

Text:
${text}

For each extracted note, provide:
- title: A concise and appropriate title
- content: The main body of the note
- author: The author of the note, if mentioned
- book_title: The book the note comes from, if mentioned
- science_name: The Islamic science category (e.g., Aqeedah, Fiqh, Hadith, etc.), infer if necessary
- language: 'arabic' or 'english'
- tags: Array of relevant tags
- reference: Detailed reference/page info if available
- extra_notes: Any additional comments or context

Return the result as a strict array of objects matching the schema.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            author: { type: Type.STRING },
            book_title: { type: Type.STRING },
            science_name: { type: Type.STRING },
            language: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            reference: { type: Type.STRING },
            extra_notes: { type: Type.STRING }
          },
          required: ["title", "content", "language"],
        }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}
