const DatabaseSync = require('better-sqlite3');

function normalizeArabic(text) {
  if (!text) return "";
  return String(text)
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const db = new DatabaseSync('knowledge_manager.db');

try {
  console.log("Force backfilling all items just in case...");
  const stmt = db.prepare("UPDATE fawaid SET normalized_title = ?, normalized_content = ?, normalized_tags = ? WHERE id = ?");
  const allToUpdate = db.prepare("SELECT id, title, content FROM fawaid").all();
  let count = 0;
  
  db.transaction(() => {
    for (const f of allToUpdate) {
      if (!f.title && !f.content) continue;
      
      const tags = db.prepare("SELECT t.name FROM tags t JOIN fawaid_tags ft ON t.id = ft.tag_id WHERE ft.fawaid_id = ?").all(f.id);
      const c = f.content ? normalizeArabic(f.content) : '';
      const t = f.title ? normalizeArabic(f.title) : '';
      const tagsNorm = tags.map(x => normalizeArabic(x.name)).join(' ');
      
      stmt.run(t, c, tagsNorm, f.id);
      count++;
    }
  })();
  console.log("Successfully normalized " + count + " records.");
} catch (e) {
  console.error("Migration failed", e);
}
