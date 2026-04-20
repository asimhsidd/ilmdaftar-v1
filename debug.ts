import DatabaseSync from 'better-sqlite3';

function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u064B-\u065F]/g, "") // Remove harakat (tashkeel)
    .replace(/[أإآ]/g, "ا")          // Normalize Alif
    .replace(/ى/g, "ي")              // Normalize Alif Maqsura to Yaa
    .replace(/ة/g, "ه")              // Normalize Taa Marbuta to Haa
    .replace(/\s+/g, " ")            // Normalize spaces
    .trim()
    .toLowerCase(); // Lowercase just in case of English mix
}

const db = new DatabaseSync('knowledge_manager.db');

const candidates = db.prepare("SELECT id, title, content, normalized_title, normalized_content, normalized_tags FROM fawaid WHERE title LIKE '%تفضيل%'").all() as any[];

console.log("Candidates found:", candidates.length);
for (const c of candidates) {
  console.log("Title: ", c.title);
  console.log("NormTitle: ", c.normalized_title);
  console.log("NormContent: ", c.normalized_content);
  console.log("NormTags: ", c.normalized_tags);
  console.log("Match 'اوجه تفضيل الرجل علي المراه في الشريعه الاسلاميه'? :", c.normalized_title.includes(normalizeArabic("أوجه تفضيل الرجل على المرأة في الشريعة الإسلامية")));
}
