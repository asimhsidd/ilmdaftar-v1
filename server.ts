import express from "express";
import { createServer as createViteServer } from "vite";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";
import { GoogleGenAI, Type } from "@google/genai";
import { google } from "googleapis";
import { generateEmbedding, expandSearchQuery, parseUnstructuredText } from "./src/services/geminiService";

// Helper functions for vector math and normalization
function cosineSimilarity(vecA: Float32Array, vecB: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u064B-\u065F]/g, "") // Remove harakat (tashkeel)
    .replace(/[أإآء]/g, "ا")        // Normalize various Alif forms
    .replace(/ى/g, "ي")              // Normalize Alif Maqsura to Yaa
    .replace(/ة/g, "ه")              // Normalize Taa Marbuta to Haa
    .replace(/[^\u0600-\u06FF\s]/g, "") // Strip non-arabic characters like punctuation, parenthesis, quotes. Shamela's search engine fails hard when punctuation is included in exact phrase searching.
    .replace(/\s+/g, " ")            // Normalize spaces
    .trim()
    .toLowerCase(); // Lowercase just in case of English mix
}

type SourceType = "book" | "youtube" | "other";

type SourcePayload = {
  type: SourceType;
  book?: {
    name?: string;
    author?: string;
    page?: number;
  };
  youtube?: {
    url?: string;
    timestamp?: string;
  };
};

function isValidYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}

function parseAndValidateSource(source: any): { sourceType: SourceType; sourceJson: string | null; normalizedSource: string } {
  if (!source || typeof source !== "object") {
    return { sourceType: "other", sourceJson: null, normalizedSource: "" };
  }

  const type = source.type as SourceType;
  if (type !== "book" && type !== "youtube" && type !== "other") {
    throw new Error("Invalid source.type. Expected one of: book, youtube, other");
  }

  const cleanSource: SourcePayload = { type };

  if (type === "book") {
    const pageRaw = source.book?.page;
    const page = pageRaw === undefined || pageRaw === null || pageRaw === "" ? undefined : Number(pageRaw);
    if (page !== undefined && (!Number.isInteger(page) || page <= 0)) {
      throw new Error("Invalid book page number");
    }

    cleanSource.book = {
      name: source.book?.name ? String(source.book.name).trim() : undefined,
      author: source.book?.author ? String(source.book.author).trim() : undefined,
      page
    };
  }

  if (type === "youtube") {
    const url = source.youtube?.url ? String(source.youtube.url).trim() : "";
    if (!url || !isValidYouTubeUrl(url)) {
      throw new Error("Invalid YouTube URL");
    }
    cleanSource.youtube = {
      url,
      timestamp: source.youtube?.timestamp ? String(source.youtube.timestamp).trim() : undefined
    };
  }

  const normalizedParts: string[] = [type];
  if (cleanSource.book) {
    normalizedParts.push(cleanSource.book.name || "", cleanSource.book.author || "", cleanSource.book.page ? String(cleanSource.book.page) : "");
  }
  if (cleanSource.youtube) {
    normalizedParts.push(cleanSource.youtube.url || "", cleanSource.youtube.timestamp || "");
  }

  return {
    sourceType: type,
    sourceJson: JSON.stringify(cleanSource),
    normalizedSource: normalizeArabic(normalizedParts.join(" "))
  };
}

// In-Memory cache for embeddings to ensure <50ms searching
const embeddingCache = new Map<number, Float32Array>();
const embeddingQueue: { id: number, textToEmbed: string }[] = [];

class Database {
  constructor(file: string) {
    this.db = new DatabaseSync(file);
  }
  db: DatabaseSync;

  pragma(sql: string) { return this.db.exec(`PRAGMA ${sql}`); }
  exec(sql: string) { return this.db.exec(sql); }
  
  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    
    const handleError = (e: any) => {
      if (e.message && e.message.includes('UNIQUE constraint failed')) {
        e.code = 'SQLITE_CONSTRAINT_UNIQUE';
      }
      throw e;
    };

    return {
      all: (...args: any[]): any[] => {
        try { return stmt.all(...args.map(a => a === undefined ? null : a)) as any[]; } catch (e) { handleError(e); return []; }
      },
      get: (...args: any[]): any => {
        try { return stmt.get(...args.map(a => a === undefined ? null : a)); } catch (e) { handleError(e); }
      },
      run: (...args: any[]): { changes: number; lastInsertRowid: number } => {
        try {
          const res = stmt.run(...args.map(a => a === undefined ? null : a)) as any;
          return {
            changes: Number(res.changes || 0),
            lastInsertRowid: Number(res.lastInsertRowid || 0)
          };
        } catch (e) {
          handleError(e);
          return { changes: 0, lastInsertRowid: 0 };
        }
      },
    };
  }
  
  transaction(fn: (...args: any[]) => any) {
    return (...args: any[]) => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    };
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("knowledge.db");
db.pragma('foreign_keys = ON');

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS sciences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    order_index INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    science_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    total_pages INTEGER DEFAULT 0,
    FOREIGN KEY (science_id) REFERENCES sciences(id),
    UNIQUE(science_id, title)
  );

  CREATE TABLE IF NOT EXISTS shuruuh (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    UNIQUE(book_id, title)
  );

  CREATE TABLE IF NOT EXISTS fawaid (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    sharh_id INTEGER,
    page_number INTEGER,
    source_type TEXT DEFAULT 'other',
    source_json TEXT,
    normalized_source TEXT DEFAULT '',
    status TEXT DEFAULT 'formatted',
    title TEXT,
    content TEXT NOT NULL,
    author TEXT,
    normalized_title TEXT DEFAULT '',
    normalized_content TEXT DEFAULT '',
    normalized_tags TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    import_batch_id TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (sharh_id) REFERENCES shuruuh(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    normalized_name TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS fawaid_tags (
    fawaid_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (fawaid_id, tag_id),
    FOREIGN KEY (fawaid_id) REFERENCES fawaid(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS fawaid_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fawaid_id INTEGER NOT NULL,
    connected_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fawaid_id, connected_id),
    FOREIGN KEY (fawaid_id) REFERENCES fawaid(id) ON DELETE CASCADE,
    FOREIGN KEY (connected_id) REFERENCES fawaid(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fawaid_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    difficulty TEXT DEFAULT 'Medium',
    FOREIGN KEY (fawaid_id) REFERENCES fawaid(id) ON DELETE CASCADE
  );

`)

  // Run migrations here
  try {
    const tableInfo = db.prepare('PRAGMA table_info(fawaid)').all();
    const hasImportBatch = tableInfo.some((col) => col.name === 'import_batch_id');
    if (!hasImportBatch) {
      db.prepare('ALTER TABLE fawaid ADD COLUMN import_batch_id TEXT').run();
      console.log('Added import_batch_id column to fawaid table');
    }
  } catch (err) {
    console.error('Migration error import_batch_id:', err);
  }

  // Add author column to books table
  try {
    const booksTableInfo = db.prepare('PRAGMA table_info(books)').all();
    const hasAuthor = booksTableInfo.some((col) => col.name === 'author');
    if (!hasAuthor) {
      db.prepare('ALTER TABLE books ADD COLUMN author TEXT').run();
      console.log('Added author column to books table');
    }
  } catch (err) {
    console.error('Migration error books.author:', err);
  }

  // Add normalized_name column to tags table
  try {
    const tagsTableInfo = db.prepare('PRAGMA table_info(tags)').all();
    const hasNormalizedName = tagsTableInfo.some((col) => col.name === 'normalized_name');
    if (!hasNormalizedName) {
      db.prepare('ALTER TABLE tags ADD COLUMN normalized_name TEXT').run();
      console.log('Added normalized_name column to tags table');

      // Backfill existing tags with normalized names
      const tags = db.prepare('SELECT id, name FROM tags').all() as any[];
      const updateStmt = db.prepare('UPDATE tags SET normalized_name = ? WHERE id = ?');
      for (const tag of tags) {
        const normalized = normalizeArabic(tag.name).toLowerCase();
        updateStmt.run(normalized, tag.id);
      }
      console.log(`Backfilled ${tags.length} tags with normalized names`);
    }
  } catch (err) {
    console.error('Migration error normalized_name:', err);
  }

  db.exec(`
  CREATE TABLE IF NOT EXISTS embeddings (
    item_id INTEGER PRIMARY KEY,
    vector BLOB NOT NULL,
    FOREIGN KEY (item_id) REFERENCES fawaid(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS query_expansions (
    original_query TEXT PRIMARY KEY,
    normalized TEXT NOT NULL,
    expansions TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- No initial sciences here anymore, we'll do it conditionally
  SELECT 1;
`);

// Conditional Seeding for Sciences
try {
  const countRes = db.prepare('SELECT count(*) as count FROM sciences').get() as any;
  if (countRes.count === 0) {
    db.exec(`
      INSERT INTO sciences (name) VALUES 
      ('Aqeedah'), ('Usul al-Fiqh'), ('Fiqh'), ('Hadith'), 
      ('Tafsir'), ('Arabic Language'), ('Seerah'), ('Qawa’id Fiqhiyyah');
    `);
    console.log('Seeded initial sciences');
  }
} catch (err) {
  console.error('Error seeding sciences:', err);
}

// Load embeddings into memory cache
try {
  const rows = db.prepare('SELECT item_id, vector FROM embeddings').all();
  for (const row of rows) {
    const float32Arr = new Float32Array(row.vector.buffer);
    embeddingCache.set(row.item_id, float32Arr);
  }
  console.log(`Loaded ${embeddingCache.size} embeddings into memory.`);
} catch (e) {
  console.error("Failed to load embeddings cache", e);
}

// Background Embedding Processor
let isProcessingEmbeddings = false;
async function processEmbeddingQueue() {
  if (isProcessingEmbeddings || embeddingQueue.length === 0) return;
  isProcessingEmbeddings = true;
  
  const saveStmt = db.prepare('INSERT OR REPLACE INTO embeddings (item_id, vector) VALUES (?, ?)');
  
  while (embeddingQueue.length > 0) {
    const item = embeddingQueue[0];
    try {
      // 1. Generate embedding
      const vector = await generateEmbedding(item.textToEmbed);
      
      // 2. Save SQLite BLOB
      const float32Arr = new Float32Array(vector);
      const buffer = Buffer.from(float32Arr.buffer);
      saveStmt.run(item.id, buffer);
      
      // 3. Update memory map
      embeddingCache.set(item.id, float32Arr);
      console.log(`Generated embedding for Fawaid #${item.id}`);
    } catch (e) {
      console.error(`Failed to generate embedding for Fawaid #${item.id}`, e);
    }
    
    embeddingQueue.shift(); // Remove from queue after processing or failing
    // Short artificial delay to respect rate limits
    await new Promise(r => setTimeout(r, 500));
  }
  
  isProcessingEmbeddings = false;
}

// Trigger backfill on startup for any missing items
function startEmbeddingBackfill() {
  const missingItems = db.prepare(`
    SELECT f.id, f.title, f.content, f.author, b.title as book_title, s.name as science_name
    FROM fawaid f
    LEFT JOIN books b ON f.book_id = b.id
    LEFT JOIN sciences s ON b.science_id = s.id
    WHERE f.id NOT IN (SELECT item_id FROM embeddings)
  `).all();
  
  if (missingItems.length > 0) {
    console.log(`Found ${missingItems.length} fawaid missing embeddings. Queuing...`);
    for (const item of missingItems) {
      // Create rich context string
      const contextStr = [
        item.title, 
        item.science_name, 
        item.book_title, 
        item.author, 
        item.content
      ].filter(Boolean).join(" | ");
      
      embeddingQueue.push({ id: item.id, textToEmbed: normalizeArabic(contextStr) });
    }
    processEmbeddingQueue();
  }
}
startEmbeddingBackfill();

// Migration: Add sharh_id to fawaid if missing
const fawaidColumns = db.prepare("PRAGMA table_info(fawaid)").all() as any[];
if (!fawaidColumns.some(col => col.name === 'sharh_id')) {
  console.log("Migrating: Adding sharh_id to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN sharh_id INTEGER REFERENCES shuruuh(id) ON DELETE SET NULL");
}

// Migration: Add question_types to fawaid if missing
if (!fawaidColumns.some(col => col.name === 'question_types')) {
  console.log("Migrating: Adding question_types to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN question_types TEXT DEFAULT '[]'");
}

// Migration: Add keywords to fawaid if missing
if (!fawaidColumns.some(col => col.name === 'keywords')) {
  console.log("Migrating: Adding keywords to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN keywords TEXT DEFAULT '[]'");
}

// Migration: Add extra_notes to fawaid if missing
if (!fawaidColumns.some(col => col.name === 'extra_notes')) {
  console.log("Migrating: Adding extra_notes to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN extra_notes TEXT");
}

// Migration: Add volume_number to fawaid if missing
if (!fawaidColumns.some(col => col.name === 'volume_number')) {
  console.log("Migrating: Adding volume_number to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN volume_number TEXT");
}

// Migration: Add order_index to sciences if missing
const scienceColumns = db.prepare("PRAGMA table_info(sciences)").all() as any[];
if (!scienceColumns.some(col => col.name === 'order_index')) {
  console.log("Migrating: Adding order_index to sciences table");
  db.exec("ALTER TABLE sciences ADD COLUMN order_index INTEGER DEFAULT 0");
  
  // Set initial order based on ID
  const sciences = db.prepare("SELECT id FROM sciences ORDER BY id").all() as any[];
  const stmt = db.prepare("UPDATE sciences SET order_index = ? WHERE id = ?");
  const updateMany = db.transaction((scis) => {
    for (let i = 0; i < scis.length; i++) {
      stmt.run(i, scis[i].id);
    }
  });
  updateMany(sciences);
}

// Migration: Add order_index to books if missing
const bookColumns = db.prepare("PRAGMA table_info(books)").all() as any[];
if (!bookColumns.some(col => col.name === 'order_index')) {
  console.log("Migrating: Adding order_index to books table");
  db.exec("ALTER TABLE books ADD COLUMN order_index INTEGER DEFAULT 0");
  
  // Set initial order based on ID
  const books = db.prepare("SELECT id FROM books ORDER BY id").all() as any[];
  const stmt = db.prepare("UPDATE books SET order_index = ? WHERE id = ?");
  const updateMany = db.transaction((bks) => {
    for (let i = 0; i < bks.length; i++) {
      stmt.run(i, bks[i].id);
    }
  });
  updateMany(books);
}

// Migration: Add priority to fawaid if missing
if (!fawaidColumns.some(col => col.name === 'priority')) {
  console.log("Migrating: Adding priority to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN priority TEXT");
}

// Migration: Add last_reviewed_at to fawaid if missing
if (!fawaidColumns.some(col => col.name === 'last_reviewed_at')) {
  console.log("Migrating: Adding last_reviewed_at to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN last_reviewed_at DATETIME");
}

// Migration: Add reference to fawaid if missing
if (!fawaidColumns.some(col => col.name === 'reference')) {
  console.log("Migrating: Adding reference to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN reference TEXT");
  // Migrate existing data: combine volume_number, page_number, tabah into reference
  const hasTabahColumn = fawaidColumns.some(col => col.name === 'tabah');
  const selectLegacyReferenceFields = hasTabahColumn
    ? "SELECT id, volume_number, page_number, tabah FROM fawaid"
    : "SELECT id, volume_number, page_number, '' AS tabah FROM fawaid";
  const fawaidWithOldFields = db.prepare(selectLegacyReferenceFields).all() as any[];
  const updateStmt = db.prepare("UPDATE fawaid SET reference = ? WHERE id = ?");
  for (const f of fawaidWithOldFields) {
    const parts = [];
    if (f.volume_number) parts.push(`Vol. ${f.volume_number}`);
    if (f.page_number) parts.push(`p. ${f.page_number}`);
    if (f.tabah) parts.push(f.tabah);
    if (parts.length > 0) {
      updateStmt.run(parts.join(', '), f.id);
    }
  }
}

// Migration: Add language to fawaid if missing
if (!fawaidColumns.some(col => col.name === 'language')) {
  console.log("Migrating: Adding language to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN language TEXT DEFAULT 'arabic'");
}

// Migration: Add tabah to fawaid if missing (Reverted reference to split fields)
if (!fawaidColumns.some(col => col.name === 'tabah')) {
  console.log("Migrating: Adding tabah returning to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN tabah TEXT");
}

if (!fawaidColumns.some(col => col.name === 'source_type')) {
  console.log("Migrating: Adding source_type to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN source_type TEXT DEFAULT 'other'");
}

if (!fawaidColumns.some(col => col.name === 'source_json')) {
  console.log("Migrating: Adding source_json to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN source_json TEXT");
}

if (!fawaidColumns.some(col => col.name === 'normalized_source')) {
  console.log("Migrating: Adding normalized_source to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN normalized_source TEXT DEFAULT ''");
}

if (!fawaidColumns.some(col => col.name === 'status')) {
  console.log("Migrating: Adding status to fawaid table");
  db.exec("ALTER TABLE fawaid ADD COLUMN status TEXT DEFAULT 'formatted'");
}

// Migration: Add FSRS spacing repetition fields
const fsrsColumns = [
  { name: 'due', type: 'TEXT' },
  { name: 'stability', type: 'REAL' },
  { name: 'difficulty', type: 'REAL' },
  { name: 'elapsed_days', type: 'INTEGER' },
  { name: 'scheduled_days', type: 'INTEGER' },
  { name: 'reps', type: 'INTEGER' },
  { name: 'lapses', type: 'INTEGER' },
  { name: 'state', type: 'INTEGER' },
  { name: 'learning_steps', type: 'INTEGER' }
];

for (const col of fsrsColumns) {
  if (!fawaidColumns.some(c => c.name === col.name)) {
    console.log(`Migrating: Adding ${col.name} to fawaid table for FSRS`);
    db.exec(`ALTER TABLE fawaid ADD COLUMN ${col.name} ${col.type}`);
  }
}

// Migration: Add normalized fields to fawaid for exact match searching
const normalizedFields = ['normalized_title', 'normalized_content', 'normalized_tags', 'normalized_source'];
for (const col of normalizedFields) {
  const currentFawaidColumns = db.prepare("PRAGMA table_info(fawaid)").all() as any[];
  if (!currentFawaidColumns.some(c => c.name === col)) {
    console.log(`Migrating: Adding ${col} to fawaid table`);
    db.exec(`ALTER TABLE fawaid ADD COLUMN ${col} TEXT DEFAULT ''`);
  }
}

// Backfill empty normalized fields
console.log("Checking for empty normalized fields to backfill...");
const emptyNorms = db.prepare("SELECT id, title, content FROM fawaid WHERE (normalized_content = '' AND content != '') OR (normalized_title = '' AND title != '') LIMIT 100").all() as any[];
if (emptyNorms.length > 0) {
  console.log(`Found ${emptyNorms.length} items needing normalization backfill. Starting transaction...`);
  const stmt = db.prepare("UPDATE fawaid SET normalized_title = ?, normalized_content = ?, normalized_tags = ?, normalized_source = ? WHERE id = ?");
  db.transaction(() => {
    const allToUpdate = db.prepare("SELECT id, title, content, source_json, source_type FROM fawaid").all() as any[];
    for (const f of allToUpdate) {
      const tags = db.prepare("SELECT t.name FROM tags t JOIN fawaid_tags ft ON t.id = ft.tag_id WHERE ft.fawaid_id = ?").all(f.id) as any[];
      const c = f.content ? normalizeArabic(f.content) : '';
      const t = f.title ? normalizeArabic(f.title) : '';
      const tagsNorm = tags.map(x => normalizeArabic(x.name)).join(' ');
      const sourceNorm = normalizeArabic(`${f.source_type || ''} ${f.source_json || ''}`);
      stmt.run(t, c, tagsNorm, sourceNorm, f.id);
    }
  })();
  console.log("Normalization backfill complete.");
}

// Migration: Drop deprecated columns from fawaid
const refreshFawaidColumns = db.prepare("PRAGMA table_info(fawaid)").all() as any[];
const deprecatedFawaidColumns = ['rating', 'daleel', 'translation'];
if (deprecatedFawaidColumns.some(columnName => refreshFawaidColumns.some(col => col.name === columnName))) {
  console.log("Migrating: Dropping deprecated columns from fawaid table");

  const existingColumnNames = new Set(refreshFawaidColumns.map(col => col.name));
  const selectExpr = (columnName: string, fallback: string) => existingColumnNames.has(columnName) ? columnName : fallback;

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN TRANSACTION");

    db.exec(`
      CREATE TABLE fawaid_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        sharh_id INTEGER,
        page_number INTEGER,
        title TEXT,
        content TEXT NOT NULL,
        author TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    import_batch_id TEXT,
        question_types TEXT DEFAULT '[]',
        keywords TEXT DEFAULT '[]',
        extra_notes TEXT,
        volume_number TEXT,
        priority TEXT,
        last_reviewed_at DATETIME,
        reference TEXT,
        language TEXT DEFAULT 'arabic',
        normalized_title TEXT DEFAULT '',
        normalized_content TEXT DEFAULT '',
        normalized_tags TEXT DEFAULT '',
        source_type TEXT DEFAULT 'other',
        source_json TEXT,
        normalized_source TEXT DEFAULT '',
        status TEXT DEFAULT 'formatted',
        due TEXT,
        stability REAL,
        difficulty REAL,
        elapsed_days INTEGER,
        scheduled_days INTEGER,
        reps INTEGER,
        lapses INTEGER,
        state INTEGER,
        learning_steps INTEGER,
        FOREIGN KEY (book_id) REFERENCES books(id),
        FOREIGN KEY (sharh_id) REFERENCES shuruuh(id) ON DELETE SET NULL
      )
    `);

    db.exec(`
      INSERT INTO fawaid_new (
        id, book_id, sharh_id, page_number, title, content, author, created_at,
        question_types, keywords, extra_notes, volume_number, priority,
        last_reviewed_at, reference, language,
        normalized_title, normalized_content, normalized_tags,
        source_type, source_json, normalized_source, status,
        due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, learning_steps
      )
      SELECT
        id,
        book_id,
        ${selectExpr('sharh_id', 'NULL')},
        ${selectExpr('page_number', 'NULL')},
        ${selectExpr('title', "''")},
        content,
        ${selectExpr('author', 'NULL')},
        ${selectExpr('created_at', 'CURRENT_TIMESTAMP')},
        ${selectExpr('question_types', "'[]'")},
        ${selectExpr('keywords', "'[]'")},
        ${selectExpr('extra_notes', 'NULL')},
        ${selectExpr('volume_number', 'NULL')},
        ${selectExpr('priority', 'NULL')},
        ${selectExpr('last_reviewed_at', 'NULL')},
        ${selectExpr('reference', 'NULL')},
        ${existingColumnNames.has('language') ? "COALESCE(language, 'arabic')" : "'arabic'"},
        '', '', '',
        ${selectExpr('source_type', "'other'")},
        ${selectExpr('source_json', 'NULL')},
        '',
        ${selectExpr('status', "'formatted'")},
        ${selectExpr('due', 'NULL')},
        ${selectExpr('stability', 'NULL')},
        ${selectExpr('difficulty', 'NULL')},
        ${selectExpr('elapsed_days', 'NULL')},
        ${selectExpr('scheduled_days', 'NULL')},
        ${selectExpr('reps', 'NULL')},
        ${selectExpr('lapses', 'NULL')},
        ${selectExpr('state', 'NULL')},
        ${selectExpr('learning_steps', 'NULL')}
      FROM fawaid
    `);

    db.exec("DROP TABLE fawaid");
    db.exec("ALTER TABLE fawaid_new RENAME TO fawaid");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

// Google Drive OAuth2 setup
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL || 'http://localhost:3000'}/api/drive/callback`
);

let driveTokens: any = null;
try {
  const tokenData = fs.readFileSync(path.join(__dirname, 'drive_tokens.json'), 'utf-8');
  driveTokens = JSON.parse(tokenData);
  oauth2Client.setCredentials(driveTokens);
} catch (e) {
  // No saved tokens
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  const PORT = 3000;

  app.post("/api/shamela-search", async (req, res) => {
    try {
      const { query, currentPage, volume } = req.body;
      if (!query) return res.status(400).json({ error: "Missing query" });

      const normalizedOriginal = normalizeArabic(query);
      const words = normalizedOriginal.split(' ').filter(Boolean);

      // Generate smart search candidates: use distinctive phrases, avoid generic openings
      // Strip common prefixes like بسم الله, قال, etc.
      const skipPrefixes = ['بسم', 'الله', 'الرحمن', 'الرحيم', 'قال', 'وقال', 'قالوا', 'ان', 'عن', 'من', 'في', 'الي', 'هو', 'هي', 'لا', 'ما', 'لم'];
      const distinctiveWords = words.filter(w => !skipPrefixes.includes(w) && w.length > 2);
      
      // Build candidate search terms: quoted phrase chunks for exact matching on Shamela
      const candidates: string[] = [];
      
      // Strategy 1: Use distinctive words from the middle of the text (most unique content)
      const midStart = Math.max(0, Math.floor(distinctiveWords.length * 0.2));
      const midWords = distinctiveWords.slice(midStart, midStart + 6);
      if (midWords.length >= 3) {
        candidates.push('"' + midWords.join(' ') + '"');
      }
      
      // Strategy 2: First 5-7 distinctive words as exact phrase
      if (distinctiveWords.length >= 4) {
        candidates.push('"' + distinctiveWords.slice(0, 6).join(' ') + '"');
      }
      
      // Strategy 3: Use + prefix for required word matching (Shamela supports this)
      if (distinctiveWords.length >= 3) {
        const requiredWords = distinctiveWords.slice(0, 5).map(w => '+' + w).join(' ');
        candidates.push(requiredWords);
      }
      
      // Strategy 4: Simple first N words without quotes (broadest match)
      candidates.push(words.slice(0, 10).join(' '));
      
      // Strategy 5: Shorter fallback
      if (words.length > 5) {
        candidates.push(words.slice(0, 5).join(' '));
      }

      // Deduplicate
      const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));

      const searchUrl = `https://shamela.ws/ajax/search`;
      const fetchShamelaHtml = async (term: string) => {
        const body = new URLSearchParams();
        body.append('term', term);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000);
        try {
          const response = await fetch(searchUrl, {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': 'https://shamela.ws/search',
              'Origin': 'https://shamela.ws'
            },
            body: body.toString(),
            signal: controller.signal
          });
          return await response.text();
        } finally {
          clearTimeout(timeoutId);
        }
      };

      // Server-side fuzzy matching: token overlap + bigram similarity
      function computeSimilarity(original: string, snippet: string): number {
        const normOrig = normalizeArabic(original);
        const normSnip = normalizeArabic(snippet);
        if (!normOrig || !normSnip) return 0;

        const origTokens = normOrig.split(' ').filter(Boolean);
        const snipTokens = normSnip.split(' ').filter(Boolean);
        if (origTokens.length === 0) return 0;

        // 1. Token overlap (unigram)
        const origSet = new Set(origTokens);
        let unigramOverlap = 0;
        for (const t of snipTokens) {
          if (origSet.has(t)) unigramOverlap++;
        }
        const unigramScore = unigramOverlap / Math.max(origTokens.length, 1);

        // 2. Bigram overlap  
        const makeBigrams = (tokens: string[]) => {
          const bg = new Set<string>();
          for (let i = 0; i < tokens.length - 1; i++) {
            bg.add(tokens[i] + ' ' + tokens[i + 1]);
          }
          return bg;
        };
        const origBigrams = makeBigrams(origTokens);
        const snipBigrams = makeBigrams(snipTokens);
        let bigramOverlap = 0;
        for (const bg of snipBigrams) {
          if (origBigrams.has(bg)) bigramOverlap++;
        }
        const bigramScore = origBigrams.size > 0 ? bigramOverlap / origBigrams.size : 0;

        // 3. Substring containment bonus
        let substringBonus = 0;
        if (normSnip.includes(normOrig.slice(0, 40))) substringBonus = 0.15;
        else if (normSnip.includes(normOrig.slice(0, 25))) substringBonus = 0.1;

        // Weighted combination
        return (unigramScore * 0.4) + (bigramScore * 0.45) + substringBonus;
      }

      function stripHtmlTags(html: string): string {
        return html.replace(/<[^>]+>/g, '').trim();
      }

      let allParsedResults: any[] = [];
      let hadTimeout = false;

      for (const term of uniqueCandidates) {
        try {
          const html = await fetchShamelaHtml(term);
          console.log(`Shamela query: "${term.substring(0, 60)}..." → ${html.length} chars`);

          if (html.includes('تحت الصيانة')) {
            return res.status(503).json({ error: 'Shamela is temporarily under maintenance. Please try again in a few minutes.' });
          }

          if (!html.includes('<div><a target="_blank"')) {
            continue; // No results for this candidate, try next
          }

          // Parse the HTML returned from Shamela's AJAX search
          const items = html.split('<div><a target="_blank"').slice(1);
          
          for (let i = 0; i < Math.min(items.length, 15); i++) {
            const item = items[i];
            
            const urlMatch = item.match(/href="([^"]+)"/);
            const bookNameMatch = item.match(/<span class="text-primaryy">(.*?)<\/span>/);
            const authorMatch = item.match(/<span class="text-gray">\[(.*?)\]<\/span>/);
            
            const parts = item.split('</a></div>');
            let snippetSection = parts.length > 1 ? parts[1] : '';
            const pMatch = snippetSection.match(/<p[^>]*>(.*?)<\/p>/s);
            const snippetHtml = pMatch ? pMatch[1] : '';
            const snippetText = stripHtmlTags(snippetHtml);

            const book_name = bookNameMatch ? stripHtmlTags(bookNameMatch[1]) : 'Unknown Book';
            const author = authorMatch ? stripHtmlTags(authorMatch[1]) : 'Unknown Author';
            const link_to_result = urlMatch ? urlMatch[1] : '';
            
            // Parse page from URL
            let page_number: string | null = null;
            if (link_to_result) {
              const urlParts = link_to_result.split('/');
              const lastSeg = urlParts[urlParts.length - 1];
              if (/^\d+$/.test(lastSeg)) page_number = lastSeg;
            }

            // Parse volume (ج) and page (ص) from snippet text
            let volume_number: string | null = null;
            const volSnipMatch = snippetText.match(/ج\s*(\d+)/);
            const pageSnipMatch = snippetText.match(/ص\s*(\d+)/);
            if (volSnipMatch) volume_number = volSnipMatch[1];
            if (pageSnipMatch && !page_number) page_number = pageSnipMatch[1];

            // Compute fuzzy similarity against original content
            const similarity = computeSimilarity(query, snippetText);

            // Apply page match boost
            let finalScore = similarity;
            if (page_number && currentPage && String(page_number) === String(currentPage)) {
              finalScore += 0.3;
            }

            // Only keep results above 20% threshold (client does final ranking)
            if (finalScore > 0.20 || snippetText.length > 20) {
              allParsedResults.push({
                title: book_name,
                book_name,
                author,
                snippet: snippetText,
                page_number,
                volume_number,
                link_to_result,
                score: finalScore,
                searchTerm: term
              });
            }
          }

          // If we have good results already, stop trying more candidates
          if (allParsedResults.some(r => r.score >= 0.6)) {
            break;
          }
        } catch (error: any) {
          if (error?.name === 'AbortError') {
            hadTimeout = true;
            continue;
          }
          throw error;
        }
      }

      if (allParsedResults.length === 0 && hadTimeout) {
        return res.status(504).json({ error: 'Shamela request timed out. Please try again.' });
      }

      // Deduplicate by link_to_result, keeping highest score
      const seenLinks = new Map<string, any>();
      for (const r of allParsedResults) {
        const key = r.link_to_result;
        if (!seenLinks.has(key) || (seenLinks.get(key).score < r.score)) {
          seenLinks.set(key, r);
        }
      }

      // Sort by score descending, take top 5 (client handles final display)
      const finalResults = Array.from(seenLinks.values())
        .sort((a, b) => b.score - a.score)
        .filter(r => r.score >= 0.2)
        .slice(0, 5);

      console.log(`Shamela: ${allParsedResults.length} raw → ${finalResults.length} final results.`);

      res.json({ results: finalResults });
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        return res.status(504).json({ error: 'Shamela request timed out. Please try again.' });
      }
      console.error("Shamela search error:", error);
      res.status(500).json({ error: "Failed to scrape Shamela" });
    }
  });

  // API Routes

  function getOrCreateQuickCaptureBookId() {
    let science = db.prepare("SELECT id FROM sciences WHERE name = ?").get("Uncategorized") as any;
    if (!science) {
      const maxOrder = db.prepare("SELECT MAX(order_index) as max FROM sciences").get() as any;
      const sciResult = db.prepare("INSERT INTO sciences (name, order_index) VALUES (?, ?)").run("Uncategorized", (maxOrder?.max || 0) + 1);
      science = { id: sciResult.lastInsertRowid };
    }

    let book = db.prepare("SELECT id FROM books WHERE science_id = ? AND title = ?").get(science.id, "Quick Capture Inbox") as any;
    if (!book) {
      const bookResult = db.prepare("INSERT INTO books (science_id, title, total_pages) VALUES (?, ?, ?)").run(science.id, "Quick Capture Inbox", 0);
      book = { id: bookResult.lastInsertRowid };
    }

    return Number(book.id);
  }

  app.get("/api/search/semantic", async (req, res) => {
    const { search, bookId, tag, scienceId, author, language, mode, status, includeUnformatted } = req.query;

    if (!search || typeof search !== 'string') {
      return res.status(400).json({ error: "Missing search query" });
    }

    try {
      let normalizedQuery = normalizeArabic(search);
      let expansions: string[] = [];

      // Exact Mode
      const isExact = mode === 'exact';

      if (!isExact) {
        // 1. Query Expansion & Cache check
        const cachedExpansion = db.prepare('SELECT normalized, expansions FROM query_expansions WHERE original_query = ?').get(search.toLowerCase()) as any;
        
        if (cachedExpansion) {
          normalizedQuery = cachedExpansion.normalized;
          expansions = JSON.parse(cachedExpansion.expansions || '[]');
        } else {
          try {
            const aiExpansions = await expandSearchQuery(search);
            if (aiExpansions.normalized) normalizedQuery = normalizeArabic(aiExpansions.normalized);
            expansions = aiExpansions.expansions || [];
            
            db.prepare('INSERT OR REPLACE INTO query_expansions (original_query, normalized, expansions) VALUES (?, ?, ?)')
              .run(search.toLowerCase(), normalizedQuery, JSON.stringify(expansions));
          } catch (expansionErr) {
            console.error("AI Expansion failed, falling back to basic normalization", expansionErr);
          }
        }
      }

      // 2. Sql Pre-filter
      let sql = `
        SELECT f.*, b.title as book_title, s.name as science_name, s.id as science_id, sh.title as sharh_title
        FROM fawaid f
        JOIN books b ON f.book_id = b.id
        JOIN sciences s ON b.science_id = s.id
        LEFT JOIN shuruuh sh ON f.sharh_id = sh.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (scienceId) { sql += " AND s.id = ?"; params.push(scienceId); }
      if (bookId) { sql += " AND f.book_id = ?"; params.push(bookId); }
      if (author) { sql += " AND f.author LIKE ?"; params.push(`%${author}%`); }
      if (language) { sql += " AND f.language = ?"; params.push(language); }
      if (status === 'formatted' || status === 'unformatted') {
        sql += " AND COALESCE(f.status, 'formatted') = ?";
        params.push(status);
      } else if (includeUnformatted !== 'true') {
        sql += " AND COALESCE(f.status, 'formatted') != 'unformatted'";
      }
      if (tag) {
        sql += " AND f.id IN (SELECT fawaid_id FROM fawaid_tags ft JOIN tags t ON ft.tag_id = t.id WHERE t.name = ?)";
        params.push(tag);
      }

      if (isExact) {
        const words = normalizedQuery.split(' ').filter(Boolean);
        words.forEach(w => {
          sql += " AND (f.normalized_title LIKE ? OR f.normalized_content LIKE ? OR f.normalized_tags LIKE ?)";
          params.push(`%${w}%`, `%${w}%`, `%${w}%`);
        });
      }

      let candidates = db.prepare(sql).all(...params);

      if (isExact) {
        const exactCandidates = candidates.map(f => {
          let score = 1.0;
          const matchReasons: string[] = [];
          
          const words = normalizedQuery.split(' ').filter(Boolean);
          const titleMatches = words.every(w => f.normalized_title && f.normalized_title.includes(w));
          const contentMatches = words.every(w => f.normalized_content && f.normalized_content.includes(w));
          const tagMatches = words.every(w => f.normalized_tags && f.normalized_tags.includes(w));

          if (titleMatches) matchReasons.push('Matched title (Exact)');
          if (contentMatches) matchReasons.push('Matched content (Exact)');
          if (tagMatches) matchReasons.push('Matched tags (Exact)');
          
          return { ...f, _score: score, match_reasons: matchReasons };
        });

        // Attach details
        const results = exactCandidates.map((f: any) => {
          const tags = db.prepare(`SELECT t.name FROM tags t JOIN fawaid_tags ft ON t.id = ft.tag_id WHERE ft.fawaid_id = ?`).all(f.id) as any[];
          return {
            ...f,
            tags: tags.map(t => t.name),
            status: f.status || 'formatted',
            question_types: JSON.parse(f.question_types || '[]'),
            keywords: JSON.parse(f.keywords || '[]')
          };
        });

        return res.json({ results, expansions: [], normalizedQuery });
      }

      // 3. Generate Embedding for the normalized query
      let qFloat32: Float32Array | null = null;
      try {
        const queryVector = await generateEmbedding(normalizedQuery);
        qFloat32 = new Float32Array(queryVector);
      } catch (embedErr) {
        console.error("Embedding generation failed, falling back to keyword search", embedErr);
      }

      // 4. Hybrid Scoring
      const searchTerms = [normalizedQuery, ...expansions.map(normalizeArabic)].filter(Boolean);
      
      const scoredCandidates = candidates.map(f => {
        let score = 0;
        const matchReasons: string[] = [];
        
        // Exact Keyword Bonus
        const textToSearch = normalizeArabic(`${f.title} ${f.content} ${f.normalized_tags}`);
        let keywordBonus = 0;
        
        // Check exact full query first
        if (textToSearch.includes(normalizedQuery)) {
           keywordBonus += 2.0; // Priority for exact keyword
           matchReasons.push('Exact match');
        } else {
           // Otherwise check words
           const words = normalizedQuery.split(' ').filter(Boolean);
           let matchedWords = 0;
           for (const word of words) {
              if (textToSearch.includes(word)) matchedWords++;
           }
           if (matchedWords === words.length && words.length > 0) {
              keywordBonus += 1.0; // All words present but not contiguous
              matchReasons.push('All keywords present');
           } else if (matchedWords > 0) {
              keywordBonus += (matchedWords / words.length) * 0.5;
           }
        }

        // Semantic Vector Score
        let cosineSim = 0;
        if (qFloat32) {
          const docVector = embeddingCache.get(f.id);
          if (docVector) {
            cosineSim = cosineSimilarity(qFloat32, docVector);
            if (cosineSim > 0.6) matchReasons.push('Strong semantic match');
            else if (cosineSim > 0.4) matchReasons.push('Semantic match');
          }
        }

        score = cosineSim + keywordBonus;
        return { ...f, _score: score, match_reasons: matchReasons };
      })
      .filter((c: any) => c._score > (qFloat32 ? 0.35 : 0.0) || c.match_reasons.length > 0)
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 30);

      // Attach details
      const results = scoredCandidates.map((f: any) => {
        const tags = db.prepare(`SELECT t.name FROM tags t JOIN fawaid_tags ft ON t.id = ft.tag_id WHERE ft.fawaid_id = ?`).all(f.id) as any[];
        return {
          ...f,
          tags: tags.map(t => t.name),
          status: f.status || 'formatted',
          question_types: JSON.parse(f.question_types || '[]'),
          keywords: JSON.parse(f.keywords || '[]')
        };
      });

      res.json({ results, expansions, normalizedQuery });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Semantic search failed" });
    }
  });

  app.get("/api/search/suggest", (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.length < 2) return res.json([]);
    
    try {
      // Fast normalized lookup
      const term = `%${normalizeArabic(q)}%`;
      
      // Look for tags that match
      const tags = db.prepare('SELECT name FROM tags WHERE normalized_name LIKE ? LIMIT 3').all(term) as any[];
      
      // Look for exact titles
      const titles = db.prepare('SELECT title FROM fawaid WHERE normalized_title LIKE ? LIMIT 3').all(term) as any[];
      
      const suggestions = new Set<string>();
      
      // Prefer exact tags and titles so clicking them returns results immediately
      tags.forEach(t => { if(t.name) suggestions.add(t.name) });
      titles.forEach(t => { if(t.title) suggestions.add(t.title) });
      
      // Look for the word in content to suggest just the word
      if (suggestions.size < 5) {
        const words = normalizeArabic(q).split(' ').filter(Boolean);
        if (words.length > 0) {
           suggestions.add(words.join(' '));
        }
      }
      
      res.json(Array.from(suggestions).slice(0, 5));
    } catch (e) {
      res.json([]);
    }
  });

  // Sciences
  app.get("/api/sciences", (req, res) => {
    const sciences = db.prepare("SELECT * FROM sciences ORDER BY order_index, name").all();
    res.json(sciences);
  });

  app.post("/api/sciences", (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ code: "SCIENCE_NAME_REQUIRED", error: "Science name is required" });
    }

    try {
      // Get max order_index
      const maxOrder = db.prepare("SELECT MAX(order_index) as max FROM sciences").get() as { max: number | null };
      const nextOrder = (maxOrder.max || 0) + 1;
      
      const result = db.prepare("INSERT INTO sciences (name, order_index) VALUES (?, ?)").run(name, nextOrder);
      res.status(201).json({ id: result.lastInsertRowid, name, order_index: nextOrder });
    } catch (e: any) {
      if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ code: "SCIENCE_ALREADY_EXISTS", error: "Science already exists" });
      }

      console.error("Failed to create science", e);
      res.status(500).json({ code: "SCIENCE_CREATE_FAILED", error: "Failed to create science" });
    }
  });

  app.patch("/api/sciences/:id", (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const { id } = req.params;

    if (!name) {
      return res.status(400).json({ code: "SCIENCE_NAME_REQUIRED", error: "Science name is required" });
    }

    try {
      const result = db.prepare("UPDATE sciences SET name = ? WHERE id = ?").run(name, id);
      if (!result.changes) {
        return res.status(404).json({ code: "SCIENCE_NOT_FOUND", error: "Science not found" });
      }
      res.json({ success: true });
    } catch (e: any) {
      if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ code: "SCIENCE_ALREADY_EXISTS", error: "Science already exists" });
      }

      console.error("Failed to update science", e);
      res.status(500).json({ code: "SCIENCE_UPDATE_FAILED", error: "Error updating science" });
    }
  });

  app.put("/api/sciences/reorder", (req, res) => {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "Invalid data" });
    
    try {
      const stmt = db.prepare("UPDATE sciences SET order_index = ? WHERE id = ?");
      const updateMany = db.transaction((ids: number[]) => {
        for (let i = 0; i < ids.length; i++) {
          stmt.run(i, ids[i]);
        }
      });
      updateMany(orderedIds);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error reordering sciences" });
    }
  });

  app.delete("/api/sciences/:id", (req, res) => {
    const { id } = req.params;
    try {
      const transaction = db.transaction(() => {
        const bookIds = db.prepare("SELECT id FROM books WHERE science_id = ?")
          .all(id).map((b: any) => b.id);

        if (bookIds.length > 0) {
          const bPlaceholders = bookIds.map(() => '?').join(',');
          const fawaidIds = db.prepare(
            `SELECT id FROM fawaid WHERE book_id IN (${bPlaceholders})`
          ).all(...bookIds).map((f: any) => f.id);

          if (fawaidIds.length > 0) {
            const fPlaceholders = fawaidIds.map(() => '?').join(',');
            db.prepare(`DELETE FROM questions WHERE fawaid_id IN (${fPlaceholders})`).run(...fawaidIds);
            db.prepare(`DELETE FROM fawaid_tags WHERE fawaid_id IN (${fPlaceholders})`).run(...fawaidIds);
          }

          db.prepare(`DELETE FROM fawaid WHERE book_id IN (${bPlaceholders})`).run(...bookIds);
          db.prepare(`DELETE FROM shuruuh WHERE book_id IN (${bPlaceholders})`).run(...bookIds);
          db.prepare("DELETE FROM books WHERE science_id = ?").run(id);
        }

        const info = db.prepare("DELETE FROM sciences WHERE id = ?").run(id);
        return info;
      });

      const info = transaction();
      if (info.changes === 0) {
        return res.status(404).json({ error: "Science not found" });
      }
      res.json({ success: true });
    } catch (e) {
      console.error("Error deleting science:", e);
      res.status(400).json({ error: "Error deleting science" });
    }
  });

  // Books
  app.get("/api/books", (req, res) => {
    const { scienceId } = req.query;
    let books;
    if (scienceId) {
      books = db.prepare("SELECT * FROM books WHERE science_id = ? ORDER BY order_index, title").all(scienceId);
    } else {
      books = db.prepare(`
        SELECT b.*, s.name as science_name 
        FROM books b 
        JOIN sciences s ON b.science_id = s.id 
        ORDER BY b.order_index, b.title
      `).all();
    }
    res.json(books);
  });

  app.post("/api/books", (req, res) => {
    const { science_id, title, total_pages, author } = req.body;
    try {
      const result = db.prepare("INSERT INTO books (science_id, title, author, total_pages) VALUES (?, ?, ?, ?)")
        .run(science_id, title, author || null, total_pages || 0);
      res.json({ id: result.lastInsertRowid, science_id, title, author: author || null, total_pages });
    } catch (e: any) {
      console.error('POST /api/books error:', e);
      const existing = db.prepare("SELECT * FROM books WHERE science_id = ? AND title = ?").get(science_id, title);
      if (existing) return res.json(existing);
      res.status(400).json({ error: e.message || "Error creating book" });
    }
  });

  app.put("/api/books/reorder", (req, res) => {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "Invalid data" });
    
    try {
      const stmt = db.prepare("UPDATE books SET order_index = ? WHERE id = ?");
      const updateMany = db.transaction((ids: number[]) => {
        for (let i = 0; i < ids.length; i++) {
          stmt.run(i, ids[i]);
        }
      });
      updateMany(orderedIds);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error reordering books" });
    }
  });

  app.patch("/api/books/:id", (req, res) => {
    const { total_pages } = req.body;
    const { id } = req.params;
    try {
      db.prepare("UPDATE books SET total_pages = ? WHERE id = ?").run(total_pages, id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error updating book" });
    }
  });

  // Authors
  app.get("/api/authors", (req, res) => {
    try {
      const authors = db.prepare(`
        SELECT DISTINCT author FROM (
          SELECT author FROM books WHERE author IS NOT NULL AND author != ''
          UNION
          SELECT author FROM shuruuh WHERE author IS NOT NULL AND author != ''
        ) ORDER BY author ASC
      `).all();
      res.json(authors.map((a: any) => a.author));
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Error fetching authors" });
    }
  });

  app.get("/api/tabahs", (req, res) => {
    try {
      const tabahs = db.prepare(`SELECT DISTINCT tabah FROM fawaid WHERE tabah IS NOT NULL AND tabah != '' ORDER BY tabah ASC`).all();
      res.json(tabahs.map((t: any) => t.tabah));
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Error fetching tabahs" });
    }
  });

  // Shuruuh
  app.get("/api/shuruuh", (req, res) => {
    const { bookId } = req.query;
    if (!bookId) return res.json([]);
    const shuruuh = db.prepare("SELECT * FROM shuruuh WHERE book_id = ? ORDER BY title").all(bookId);
    res.json(shuruuh);
  });

  app.post("/api/shuruuh", (req, res) => {
    const { book_id, title, author } = req.body;
    try {
      const result = db.prepare("INSERT INTO shuruuh (book_id, title, author) VALUES (?, ?, ?)").run(book_id, title, author);
      res.json({ id: result.lastInsertRowid, book_id, title, author });
    } catch (e) {
      res.status(400).json({ error: "Error creating sharh" });
    }
  });

  app.delete("/api/shuruuh/:id", (req, res) => {
    const { id } = req.params;
    try {
      const info = db.prepare("DELETE FROM shuruuh WHERE id = ?").run(id);
      if (info.changes === 0) return res.status(404).json({ error: "Sharh not found" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error deleting sharh" });
    }
  });

  // Fawaid
  app.get("/api/fawaid", (req, res) => {
    try {
    const { bookId, sharhId, noSharh, search, tag, scienceId, author, priority, language, due_only, status, includeUnformatted, uncategorized } = req.query;
    let query = `
      SELECT f.*, b.title as book_title, s.name as science_name, s.id as science_id, sh.title as sharh_title, b.author as author
      FROM fawaid f
      JOIN books b ON f.book_id = b.id
      JOIN sciences s ON b.science_id = s.id
      LEFT JOIN shuruuh sh ON f.sharh_id = sh.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (due_only === 'true') {
      query += " AND (f.state IS NULL OR f.state = 0 OR f.due <= CURRENT_TIMESTAMP)";
    }

    if (bookId) {
      query += " AND f.book_id = ?";
      params.push(bookId);
    }
    if (sharhId) {
      query += " AND f.sharh_id = ?";
      params.push(sharhId);
    }
    if (noSharh === 'true') {
      query += " AND f.sharh_id IS NULL";
    }
    if (scienceId) {
      query += " AND s.id = ?";
      params.push(scienceId);
    }
    if (author) {
      query += " AND b.author LIKE ?";
      params.push(`%${author}%`);
    }
    if (search) {
      query += " AND (f.content LIKE ? OR f.title LIKE ? OR b.title LIKE ? OR b.author LIKE ? OR sh.title LIKE ?)";
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }
    if (tag) {
      query += " AND f.id IN (SELECT fawaid_id FROM fawaid_tags ft JOIN tags t ON ft.tag_id = t.id WHERE t.name = ?)";
      params.push(tag);
    }
    if (priority) {
      query += " AND f.priority = ?";
      params.push(priority);
    }
    if (language === 'arabic' || language === 'english') {
      query += " AND COALESCE(f.language, 'arabic') = ?";
      params.push(language);
    }

    if (status === 'formatted' || status === 'unformatted') {
      query += " AND COALESCE(f.status, 'formatted') = ?";
      params.push(status);
    } else if (includeUnformatted !== 'true') {
      query += " AND COALESCE(f.status, 'formatted') != 'unformatted'";
    }

    if (uncategorized === 'true') {
      query += " AND (COALESCE(f.status, 'formatted') = 'unformatted' OR f.id NOT IN (SELECT fawaid_id FROM fawaid_tags))";
    }

    query += " ORDER BY f.created_at DESC";
    
    const fawaid = db.prepare(query).all(...params);
    
    // Attach tags, questions, question_types, keywords
    const fawaidWithDetails = fawaid.map((f: any) => {
      const tags = db.prepare(`
        SELECT t.name 
        FROM tags t 
        JOIN fawaid_tags ft ON t.id = ft.tag_id 
        WHERE ft.fawaid_id = ?
      `).all(f.id);
      
      const questions = db.prepare(`
        SELECT id, type, question, answer, difficulty
        FROM questions
        WHERE fawaid_id = ?
      `).all(f.id);

      return {
        ...f,
        tags: tags.map((t: any) => t.name),
        status: f.status || 'formatted',
        connections: db.prepare("SELECT connected_id FROM fawaid_connections WHERE fawaid_id = ? ORDER BY connected_id").all(f.id).map((c: any) => c.connected_id),
        question_types: JSON.parse(f.question_types || '[]'),
        keywords: JSON.parse(f.keywords || '[]'),
        questions: questions,
        lastReviewedAt: f.last_reviewed_at,
        language: f.language || 'arabic'
      };
    });

    res.json(fawaidWithDetails);
    } catch (e: any) {
      console.error('GET /api/fawaid error:', e);
      res.status(500).json({ error: e.message || 'Internal server error' });
    }
  });

  app.post("/api/fawaid", (req, res) => {
    console.log('POST /api/fawaid request received');
    const { book_id, sharh_id, page_number, reference, title, content, tags, question_types, keywords, questions, extra_notes, volume_number, tabah, language, status } = req.body;

    const normalized_title = title ? normalizeArabic(title) : '';
    const normalized_content = content ? normalizeArabic(content) : '';
    const normalized_tags = tags && Array.isArray(tags) ? tags.map(t => normalizeArabic(t)).join(' ') : '';
    const sourceData = parseAndValidateSource({ type: 'other' });
    const itemStatus = status === 'unformatted' ? 'unformatted' : 'formatted';

    let nextBookId = book_id ? Number(book_id) : null;
    if (!nextBookId && itemStatus === 'unformatted') {
      nextBookId = getOrCreateQuickCaptureBookId();
    }
    if (!nextBookId || !content) {
      return res.status(400).json({ error: "book_id and content are required" });
    }

    // Validate that the book exists before attempting insert
    const bookCheck = db.prepare("SELECT id FROM books WHERE id = ?").get(nextBookId);
    if (!bookCheck) {
      console.error(`POST /api/fawaid: book_id ${nextBookId} does not exist`);
      return res.status(400).json({ error: `Book with ID ${nextBookId} not found. Please select a valid book.` });
    }

    // Validate sharh_id if provided
    if (sharh_id) {
      const sharhCheck = db.prepare("SELECT id FROM shuruuh WHERE id = ?").get(sharh_id);
      if (!sharhCheck) {
        console.error(`POST /api/fawaid: sharh_id ${sharh_id} does not exist`);
        return res.status(400).json({ error: `Sharh with ID ${sharh_id} not found. Please select a valid sharh.` });
      }
    }

    const transaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO fawaid (book_id, sharh_id, page_number, reference, title, content, author, question_types, keywords, extra_notes, volume_number, tabah, language, source_type, source_json, normalized_source, status, normalized_title, normalized_content, normalized_tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nextBookId,
        sharh_id || null,
        page_number,
        reference || null,
        title,
        content,
        null, // author is now in books table
        JSON.stringify(question_types || []),
        JSON.stringify(keywords || []),
        extra_notes || null,
        volume_number || null,
        tabah || null,
        language || 'arabic',
        sourceData.sourceType,
        sourceData.sourceJson,
        sourceData.normalizedSource,
        itemStatus,
        normalized_title,
        normalized_content,
        normalized_tags
      );
      
      const fawaidId = result.lastInsertRowid;

      if (tags && Array.isArray(tags)) {
        for (const tagName of tags) {
          const normalizedTag = normalizeArabic(tagName).toLowerCase();

          // Check if a tag with this normalized name already exists
          const existingTag = db.prepare("SELECT id, name FROM tags WHERE normalized_name = ?").get(normalizedTag) as any;

          let tagId: number;
          if (existingTag) {
            // Use existing tag (prevents duplicates like "كتاب" vs "الكتاب")
            tagId = existingTag.id;
          } else {
            // Create new tag with normalized name
            db.prepare("INSERT INTO tags (name, normalized_name) VALUES (?, ?)").run(tagName, normalizedTag);
            const newTag = db.prepare("SELECT id FROM tags WHERE name = ?").get(tagName) as any;
            tagId = newTag.id;
          }

          db.prepare("INSERT OR IGNORE INTO fawaid_tags (fawaid_id, tag_id) VALUES (?, ?)").run(fawaidId, tagId);
        }
      }

      if (questions && Array.isArray(questions)) {
        for (const q of questions) {
          db.prepare(`
            INSERT INTO questions (fawaid_id, type, question, answer, difficulty)
            VALUES (?, ?, ?, ?, ?)
          `).run(fawaidId, q.type, q.question, q.answer, q.difficulty || 'Medium');
        }
      }

      return fawaidId;
    });

    try {
      console.log('Starting fawaid transaction...');
      const id = transaction();
      console.log('Transaction successful, ID:', id);
      
      // Queue for embedding
      console.log('Fetching bookData for nextBookId:', nextBookId);
      const bookData = db.prepare('SELECT title, science_id, author FROM books WHERE id = ?').get(nextBookId) as any;
      if (!bookData) throw new Error(`Book with ID ${nextBookId} not found`);

      console.log('Fetching scienceData for science_id:', bookData.science_id);
      const scienceData = db.prepare('SELECT name FROM sciences WHERE id = ?').get(bookData.science_id) as any;
      if (!scienceData) throw new Error(`Science with ID ${bookData.science_id} not found`);

      const contextStr = [
        title, 
        scienceData.name, 
        bookData.title, 
        bookData.author, 
        content,
        tags && Array.isArray(tags) ? tags.join(" ") : ""
      ].filter(Boolean).join(" | ");
      
      console.log('Queueing embedding...');
      embeddingQueue.push({ id: id as number, textToEmbed: normalizeArabic(contextStr) });
      processEmbeddingQueue();

      res.json({ id, book_id: nextBookId, sharh_id, page_number, title, content, tags, question_types, keywords, questions, extra_notes, volume_number, status: itemStatus });
    } catch (e: any) {
      console.error('CRITICAL POST /api/fawaid error:', e);
      res.status(400).json({ error: e.message || "Error creating fawaid" });
    }
  });

  app.put("/api/fawaid/:id", (req, res) => {
    const { id } = req.params;
    const { book_id, sharh_id, title, content, page_number, reference, author, question_types, keywords, questions, extra_notes, volume_number, tabah, language, status } = req.body;
    try {
      const existing = db.prepare("SELECT id, book_id, sharh_id FROM fawaid WHERE id = ?").get(id) as
        | { id: number; book_id: number; sharh_id: number | null }
        | undefined;

      if (!existing) {
        return res.status(404).json({ error: "Fawaid not found" });
      }

      const nextBookId =
        book_id !== undefined && book_id !== null && book_id !== ''
          ? Number(book_id)
          : existing.book_id;

      let resolvedBookId = nextBookId;
      const nextStatus = status === 'unformatted' ? 'unformatted' : 'formatted';
      if ((!resolvedBookId || !Number.isInteger(resolvedBookId) || resolvedBookId <= 0) && nextStatus === 'unformatted') {
        resolvedBookId = getOrCreateQuickCaptureBookId();
      }

      if (!Number.isInteger(resolvedBookId) || resolvedBookId <= 0) {
        return res.status(400).json({ error: "Invalid book_id" });
      }

      const nextSharhId =
        sharh_id === undefined
          ? existing.sharh_id
          : (sharh_id === null || sharh_id === '' ? null : Number(sharh_id));

      if (nextSharhId !== null && (!Number.isInteger(nextSharhId) || nextSharhId <= 0)) {
        return res.status(400).json({ error: "Invalid sharh_id" });
      }

      const sourceData = parseAndValidateSource({ type: 'other' });

      const transaction = db.transaction(() => {
        const normalized_title = title ? normalizeArabic(title) : '';
        const normalized_content = content ? normalizeArabic(content) : '';
        
        // Find current tags for this fawaid to update normalized_tags
        // In a real full sync we might need tags passed in PUT, but in this app
        // we'll just check if tags are updated or pull existing. Usually tags are separate, 
        // but if we are normalizing, we should probably update it fully. 
        // Actually, let's just update title and content for now on PUT, unless we get tags.
        // Wait, tags might not be in req.body for PUT. 
        const currentTags = db.prepare('SELECT t.name FROM tags t JOIN fawaid_tags ft ON t.id = ft.tag_id WHERE ft.fawaid_id = ?').all(id) as any[];
        const normalized_tags = currentTags.map(t => normalizeArabic(t.name)).join(' ');

        db.prepare(`
          UPDATE fawaid
          SET book_id = ?, sharh_id = ?, title = ?, content = ?, page_number = ?, reference = ?, author = ?, question_types = ?, keywords = ?, extra_notes = ?, volume_number = ?, tabah = ?, language = ?, source_type = ?, source_json = ?, normalized_source = ?, status = ?, normalized_title = ?, normalized_content = ?, normalized_tags = ?
          WHERE id = ?
        `).run(
          resolvedBookId,
          nextSharhId,
          title,
          content,
          page_number,
          reference || null,
          null, // author is now in books table
          JSON.stringify(question_types || []),
          JSON.stringify(keywords || []),
          extra_notes || null,
          volume_number || null,
          tabah || null,
          language || 'arabic',
          sourceData.sourceType,
          sourceData.sourceJson,
          sourceData.normalizedSource,
          nextStatus,
          normalized_title,
          normalized_content,
          normalized_tags,
          id
        );

        if (req.body.questions && Array.isArray(req.body.questions)) {
          // Delete existing questions
          db.prepare("DELETE FROM questions WHERE fawaid_id = ?").run(id);
          
          // Insert new questions
          for (const q of req.body.questions) {
            db.prepare(`
              INSERT INTO questions (fawaid_id, type, question, answer, difficulty)
              VALUES (?, ?, ?, ?, ?)
            `).run(id, q.type, q.question, q.answer, q.difficulty || 'Medium');
          }
        }
      });
      
      transaction();
      
      // Queue for re-embedding after an update
      const bookData = db.prepare('SELECT title, science_id, author FROM books WHERE id = ?').get(resolvedBookId) as any;
      const scienceData = db.prepare('SELECT name FROM sciences WHERE id = ?').get(bookData.science_id) as any;
      const tagData = db.prepare('SELECT t.name FROM tags t JOIN fawaid_tags ft ON ft.tag_id = t.id WHERE ft.fawaid_id = ?').all(id) as any[];
      const tags = tagData.map(t => t.name);
      const contextStr = [
        title, 
        scienceData.name, 
        bookData.title, 
        bookData.author, 
        content,
        tags.join(" ")
      ].filter(Boolean).join(" | ");
      embeddingQueue.push({ id: Number(id), textToEmbed: normalizeArabic(contextStr) });
      processEmbeddingQueue();

      res.json({ success: true });
    } catch (e: any) {
      console.error('PUT /api/fawaid error:', e);
      res.status(400).json({ error: e.message || "Error updating fawaid" });
    }
  });

  app.patch("/api/fawaid/:id", (req, res) => {
    const { id } = req.params;
    const { priority, lastReviewedAt, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, learning_steps } = req.body;
    try {
      const updates: string[] = [];
      const params: any[] = [];

      if (priority !== undefined) {
        updates.push("priority = ?");
        params.push(priority);
      }
      if (lastReviewedAt !== undefined) {
        updates.push("last_reviewed_at = ?");
        params.push(lastReviewedAt);
      }
      
      const fsrsFields = { due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, learning_steps };
      for (const [key, value] of Object.entries(fsrsFields)) {
        if (value !== undefined) {
          updates.push(`${key} = ?`);
          params.push(value);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      params.push(id);
      db.prepare(`UPDATE fawaid SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Error updating fawaid" });
    }
  });

  app.put("/api/books/:id", (req, res) => {
    const { id } = req.params;
    const { title, author } = req.body;
    if (!title) return res.status(400).json({ error: "Missing title" });
    try {
      db.prepare("UPDATE books SET title = ?, author = ? WHERE id = ?").run(title, author || null, id);
      const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
      res.json(book);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to update book' });
    }
  });

  app.delete("/api/books/:id", (req, res) => {
    const { id } = req.params;
    console.log(`Deleting book with id: ${id}`);
    try {
      const transaction = db.transaction(() => {
        // 1. Get all fawaid IDs for this book
        const fawaidIds = db.prepare("SELECT id FROM fawaid WHERE book_id = ?").all(id).map((f: any) => f.id);

        if (fawaidIds.length > 0) {
          const placeholders = fawaidIds.map(() => '?').join(',');
          // 2. Delete questions
          db.prepare(`DELETE FROM questions WHERE fawaid_id IN (${placeholders})`).run(...fawaidIds);
          // 3. Delete fawaid_tags
          db.prepare(`DELETE FROM fawaid_tags WHERE fawaid_id IN (${placeholders})`).run(...fawaidIds);
          // 4. Delete fawaid
          db.prepare("DELETE FROM fawaid WHERE book_id = ?").run(id);
        }

        // 5. Delete shuruuh for this book
        db.prepare("DELETE FROM shuruuh WHERE book_id = ?").run(id);
        // 6. Delete the book
        const info = db.prepare("DELETE FROM books WHERE id = ?").run(id);
        return info;
      });

      const info = transaction();

      if (info.changes === 0) {
        return res.status(404).json({ error: "Book not found" });
      }
      res.json({ success: true });
    } catch (e) {
      console.error("Error deleting book:", e);
      res.status(400).json({ error: "Error deleting book" });
    }
  });

  app.delete("/api/fawaid/:id", (req, res) => {
    const { id } = req.params;
    console.log(`Deleting fawaid with id: ${id}`);
    try {
      const transaction = db.transaction(() => {
        // Manually delete tags first to ensure cleanup even if CASCADE is missing
        db.prepare("DELETE FROM fawaid_tags WHERE fawaid_id = ?").run(Number(id));
        const info = db.prepare("DELETE FROM fawaid WHERE id = ?").run(Number(id));
        return info;
      });
      
      const info = transaction();
      
      if (info.changes === 0) {
        return res.status(404).json({ error: "Fawaid not found" });
      }
      res.json({ success: true });
    } catch (e) {
      console.error("Error deleting fawaid:", e);
      res.status(400).json({ error: "Error deleting fawaid" });
    }
  });

  app.get("/api/stats", (req, res) => {
    const totalSciences = db.prepare("SELECT COUNT(*) as count FROM sciences").get() as any;
    const totalBooks = db.prepare("SELECT COUNT(*) as count FROM books").get() as any;
    const totalFawaid = db.prepare("SELECT COUNT(*) as count FROM fawaid").get() as any;
    const needsFormatting = db.prepare("SELECT COUNT(*) as count FROM fawaid WHERE COALESCE(status, 'formatted') = 'unformatted'").get() as any;
    
    const scienceStats = db.prepare(`
      SELECT s.name, COUNT(f.id) as count
      FROM sciences s
      LEFT JOIN books b ON s.id = b.science_id
      LEFT JOIN fawaid f ON b.id = f.book_id
      GROUP BY s.id
      ORDER BY count DESC
    `).all();

    res.json({
      totalSciences: totalSciences.count,
      totalBooks: totalBooks.count,
      needsFormatting: needsFormatting.count,
      totalFawaid: totalFawaid.count,
      scienceStats
    });
  });

  app.post("/api/import", (req, res) => {
      const isArray = Array.isArray(req.body);
      const items = isArray ? req.body : req.body.items;
      const forceDuplicates = !isArray && req.body.forceDuplicates;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Expected an array of items" });
      }

      try {
      const importBatchId = Date.now().toString() + '_' + Math.random().toString(36).substring(7);
      console.log(`[Import] Starting import batch ${importBatchId} with ${items.length} items`);
      
      const transaction = db.transaction((fawaidList: any[]) => {
        let importedCount = 0;
        let skippedCount = 0;
        const errors: string[] = [];
        
        for (let idx = 0; idx < fawaidList.length; idx++) {
          const item = fawaidList[idx];
          
          try {
            // 1. Science — resolve or create, with fallback
            let scienceId = item.science_id;
            if (item.science_name) {
              const existingScience = db.prepare("SELECT id FROM sciences WHERE name = ?").get(item.science_name) as any;
              if (existingScience) {
                scienceId = existingScience.id;
              } else {
                const maxOrder = db.prepare("SELECT MAX(order_index) as max FROM sciences").get() as { max: number | null };
                const nextOrder = (maxOrder.max || 0) + 1;
                const result = db.prepare("INSERT INTO sciences (name, order_index) VALUES (?, ?)").run(item.science_name, nextOrder);
                scienceId = result.lastInsertRowid;
              }
            }
            
            // Fallback: if no science, use "Uncategorized"
            if (!scienceId) {
              let fallbackScience = db.prepare("SELECT id FROM sciences WHERE name = ?").get("Uncategorized") as any;
              if (!fallbackScience) {
                const maxOrder = db.prepare("SELECT MAX(order_index) as max FROM sciences").get() as { max: number | null };
                const nextOrder = (maxOrder.max || 0) + 1;
                const result = db.prepare("INSERT INTO sciences (name, order_index) VALUES (?, ?)").run("Uncategorized", nextOrder);
                fallbackScience = { id: result.lastInsertRowid };
              }
              scienceId = fallbackScience.id;
            }

            // 2. Book — resolve or create, with fallback
            let bookId = item.book_id;
            if (item.book_title && scienceId) {
              const existingBook = db.prepare("SELECT id FROM books WHERE science_id = ? AND title = ?").get(scienceId, item.book_title) as any;
              if (existingBook) {
                bookId = existingBook.id;
              } else {
                const result = db.prepare("INSERT INTO books (science_id, title) VALUES (?, ?)").run(scienceId, item.book_title);
                bookId = result.lastInsertRowid;
              }
            }
            
            // Fallback: if no book, create "Imported Notes" under the science
            if (!bookId && scienceId) {
              let fallbackBook = db.prepare("SELECT id FROM books WHERE science_id = ? AND title = ?").get(scienceId, "Imported Notes") as any;
              if (!fallbackBook) {
                const result = db.prepare("INSERT INTO books (science_id, title, total_pages) VALUES (?, ?, ?)").run(scienceId, "Imported Notes", 0);
                fallbackBook = { id: result.lastInsertRowid };
              }
              bookId = fallbackBook.id;
            }

            // 3. Sharh
            let sharhId = item.sharh_id;
            if (item.sharh_title && bookId) {
              const existingSharh = db.prepare("SELECT id FROM shuruuh WHERE book_id = ? AND title = ?").get(bookId, item.sharh_title) as any;
              if (existingSharh) {
                sharhId = existingSharh.id;
              } else {
                const result = db.prepare("INSERT INTO shuruuh (book_id, title) VALUES (?, ?)").run(bookId, item.sharh_title);
                sharhId = result.lastInsertRowid;
              }
            }

            // Validate: must have book and content
            if (!bookId) {
              errors.push(`Item #${idx + 1}: No book could be resolved`);
              skippedCount++;
              continue;
            }
            if (!item.content || !String(item.content).trim()) {
              errors.push(`Item #${idx + 1}: Missing content`);
              skippedCount++;
              continue;
            }

            // 4. Check for duplicate fawaid
            if (!forceDuplicates) {
              const existingFaidah = db.prepare(
                "SELECT id FROM fawaid WHERE book_id = ? AND content = ?"
              ).get(bookId, item.content);
              if (existingFaidah) {
                skippedCount++;
                continue;
              }
            }

            // 5. Parse source once (was previously called 3 times)
            const sourceData = parseAndValidateSource(item.source);

            // 6. Insert Fawaid with all fields INCLUDING import_batch_id
            const result = db.prepare(`
              INSERT INTO fawaid (book_id, sharh_id, page_number, reference, title, content, author, question_types, keywords, extra_notes, volume_number, language, source_type, source_json, normalized_source, status, normalized_title, normalized_content, normalized_tags, import_batch_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              bookId,
              sharhId || null,
              item.page_number || 0,
              item.reference || null,
              item.title || '',
              item.content,
              item.author || '',
              JSON.stringify(item.question_types || []),
              JSON.stringify(item.keywords || []),
              item.extra_notes || null,
              item.volume_number || null,
              item.language || 'arabic',
              sourceData.sourceType,
              sourceData.sourceJson,
              sourceData.normalizedSource,
              item.status === 'unformatted' ? 'unformatted' : 'formatted',
              item.title ? normalizeArabic(item.title) : '',
              item.content ? normalizeArabic(item.content) : '',
              item.tags && Array.isArray(item.tags) ? item.tags.map((t: string) => normalizeArabic(t)).join(' ') : '',
              importBatchId
            );
            
            const fawaidId = result.lastInsertRowid;

            // 7. Tags
            if (item.tags && Array.isArray(item.tags)) {
              for (const tagName of item.tags) {
                const normalizedTag = normalizeArabic(tagName).toLowerCase();

                // Check if a tag with this normalized name already exists
                const existingTag = db.prepare("SELECT id, name FROM tags WHERE normalized_name = ?").get(normalizedTag) as any;

                let tagId: number;
                if (existingTag) {
                  // Use existing tag (prevents duplicates like "كتاب" vs "الكتاب")
                  tagId = existingTag.id;
                } else {
                  // Create new tag with normalized name
                  db.prepare("INSERT INTO tags (name, normalized_name) VALUES (?, ?)").run(tagName, normalizedTag);
                  const newTag = db.prepare("SELECT id FROM tags WHERE name = ?").get(tagName) as any;
                  tagId = newTag.id;
                }

                db.prepare("INSERT OR IGNORE INTO fawaid_tags (fawaid_id, tag_id) VALUES (?, ?)").run(fawaidId, tagId);
              }
            }
            importedCount++;
          } catch (itemErr: any) {
            errors.push(`Item #${idx + 1}: ${itemErr.message || 'Unknown error'}`);
            skippedCount++;
          }
        }
        
        console.log(`[Import] Batch ${importBatchId}: ${importedCount} imported, ${skippedCount} skipped. ${errors.length} errors.`);
        return { importedCount, skippedCount, errors };
      });

      const result = transaction(items);
      res.json({ success: true, count: result.importedCount, skipped: result.skippedCount, batchId: importBatchId, errors: result.errors.slice(0, 10) });
    } catch (e) {
      console.error("Import error:", e);
      res.status(400).json({ error: "Error importing data" });
    }
  });

  
  // Semantic Duplicate Check
  app.post("/api/fawaid/duplicate-check", async (req, res) => {
    const { title, content, tags, book, science, excludeId } = req.body;
    if (!content) return res.status(400).json({ error: "Missing content" });

    try {
      const textToEmbed = normalizeArabic(`${title || ''} ${content || ''} ${(tags || []).join(' ')}`);
      
      let baseQuery = `
        SELECT f.id, f.title, f.content, f.normalized_content, f.embedding 
        FROM fawaid f 
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (excludeId) {
        baseQuery += ` AND f.id != ?`;
        params.push(excludeId);
      }
      
      const candidates = db.prepare(baseQuery).all(...params) as any[];
      
      // 1. Fast Pre-Check (Exact Match)
      let strictDuplicates = [];
      for (const c of candidates) {
        if (c.normalized_content && textToEmbed.includes(c.normalized_content) && c.normalized_content.length > 20) {
          strictDuplicates.push({
            id: c.id,
            title: c.title,
            contentSnippet: c.content.substring(0, 150) + "...",
            similarity: 1.0,
            type: "strong"
          });
        }
      }
      
      if (strictDuplicates.length > 0) {
        return res.json({ duplicates: strictDuplicates.slice(0, 5) });
      }

      // 2. Generate Embedding
      const queryVector = await generateEmbedding(textToEmbed);
      const qFloat32 = new Float32Array(queryVector);
      
      // 3. Similarity check against existing memory
      const duplicates = [];
      for (const c of candidates) {
        if (!c.embedding) continue;
        const eFloat32 = new Float32Array(c.embedding.buffer);
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < qFloat32.length; i++) {
          dotProduct += qFloat32[i] * eFloat32[i];
          normA += qFloat32[i] * qFloat32[i];
          normB += eFloat32[i] * eFloat32[i];
        }
        const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        
        if (similarity > 0.80) {
          duplicates.push({
            id: c.id,
            title: c.title,
            contentSnippet: c.content.substring(0, 150) + "...",
            similarity: Number(similarity.toFixed(3)),
            type: similarity > 0.90 ? "strong" : "possible"
          });
        }
      }
      
      duplicates.sort((a, b) => b.similarity - a.similarity);
      return res.json({ duplicates: duplicates.slice(0, 10) });

    } catch(e) {
      console.error("Duplicate check failed", e);
      res.status(500).json({ error: "Duplicate check failed" });
    }
  });

  app.get("/api/duplicate-check", (req, res) => {
    const { content, bookId, reference, volumeNumber, pageNumber, tabah } = req.query;
    if (!content || !bookId) {
      return res.json({ duplicate: null });
    }
    const duplicate = db.prepare(`
      SELECT f.*, b.title as book_title
      FROM fawaid f
      JOIN books b ON f.book_id = b.id
      WHERE (f.book_id = ? AND f.content = ?)
      OR (f.book_id = ? AND f.reference = ? AND f.reference IS NOT NULL AND f.reference != '')
      OR (f.book_id = ? AND f.volume_number = ? AND f.page_number = ? AND f.tabah = ?)
      LIMIT 1
    `).get(bookId, content, bookId, reference, bookId, volumeNumber, pageNumber, tabah);

    res.json({ duplicate: duplicate || null });
  });

  // AI Parsing Endpoint
  app.post("/api/import/ai-parse", async (req, res) => {
    const { text, apiKey } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });
    try {
      const parsedItems = await parseUnstructuredText(text, apiKey);
      res.json(parsedItems);
    } catch (e: any) {
      console.error("AI Parse failed", e);
      res.status(500).json({ error: e.message || "Failed to parse text" });
    }
  });

  // Import preview (check duplicates without inserting)
  
  // Undo latest import
  app.delete("/api/import/undo", (req, res) => {
    try {
      // Find the most recent import_batch_id
      const recent = db.prepare('SELECT import_batch_id FROM fawaid WHERE import_batch_id IS NOT NULL ORDER BY created_at DESC LIMIT 1').get() as { import_batch_id: string } | undefined;
      
      if (!recent || !recent.import_batch_id) {
        return res.status(404).json({ error: "No recent imports found" });
      }

      const batchId = recent.import_batch_id;
      const result = db.prepare('DELETE FROM fawaid WHERE import_batch_id = ?').run(batchId);

      // We should also delete empty tags / shuruuh but wait they are handled by other functions if they become empty? 
      // This is good enough for undoing Fawaid.
      
      res.json({ success: true, deletedCount: result.changes, batchId });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Failed to undo import", details: err.message });
    }
  });

  app.post("/api/import/preview", (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Expected array" });

    let newCount = 0;
    let duplicateCount = 0;
    const scienceNames = new Set<string>();
    const bookTitles = new Set<string>();
    const duplicatesList: { imported: any, existing: any }[] = [];

    for (const item of items) {
      if (item.science_name) scienceNames.add(item.science_name);
      if (item.book_title) bookTitles.add(item.book_title);
      if (!item.content) continue;

      let bookId = item.book_id;
      if (item.book_title && item.science_name) {
        const science = db.prepare("SELECT id FROM sciences WHERE name = ?").get(item.science_name) as any;
        if (science) {
          const book = db.prepare("SELECT id FROM books WHERE science_id = ? AND title = ?").get(science.id, item.book_title) as any;
          if (book) bookId = book.id;
        }
      }

      if (bookId) {
        const existing = db.prepare("SELECT * FROM fawaid WHERE book_id = ? AND content = ? LIMIT 1").get(bookId, item.content) as any;
        if (existing) {
          duplicateCount++;
          duplicatesList.push({ imported: item, existing: existing });
        } else {
          newCount++;
        }
      } else {
        newCount++;
      }
    }

    res.json({ total: items.length, newCount, duplicateCount, sciences: scienceNames.size, books: bookTitles.size, duplicatesList });
  });

  app.post("/api/fawaid/bulk-update", (req, res) => {
    const { ids, status, tags, source, book_id } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids is required" });
    }

    try {
      const sourceData = source !== undefined ? parseAndValidateSource(source) : null;
      const tx = db.transaction(() => {
        for (const rawId of ids) {
          const id = Number(rawId);
          if (!Number.isInteger(id)) continue;

          const updates: string[] = [];
          const params: any[] = [];

          if (status === 'formatted' || status === 'unformatted') {
            updates.push("status = ?");
            params.push(status);
          }

          if (book_id !== undefined && book_id !== null && book_id !== '') {
            updates.push("book_id = ?");
            params.push(Number(book_id));
          }

          if (sourceData) {
            updates.push("source_type = ?", "source_json = ?", "normalized_source = ?");
            params.push(sourceData.sourceType, sourceData.sourceJson, sourceData.normalizedSource);
          }

          if (updates.length > 0) {
            params.push(id);
            db.prepare(`UPDATE fawaid SET ${updates.join(', ')} WHERE id = ?`).run(...params);
          }

          if (Array.isArray(tags)) {
            db.prepare("DELETE FROM fawaid_tags WHERE fawaid_id = ?").run(id);
            for (const tagName of tags) {
              const normalizedTag = normalizeArabic(String(tagName)).toLowerCase();
              if (!normalizedTag) continue;
              let existingTag = db.prepare("SELECT id FROM tags WHERE normalized_name = ?").get(normalizedTag) as any;
              if (!existingTag) {
                const result = db.prepare("INSERT INTO tags (name, normalized_name) VALUES (?, ?)").run(String(tagName).trim(), normalizedTag);
                existingTag = { id: result.lastInsertRowid };
              }
              db.prepare("INSERT OR IGNORE INTO fawaid_tags (fawaid_id, tag_id) VALUES (?, ?)").run(id, existingTag.id);
            }
          }
        }
      });
      tx();
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Bulk update failed" });
    }
  });

  app.get("/api/fawaid/:id/connections", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const rows = db.prepare(`
      SELECT f.id, f.title, f.content, f.book_id, f.sharh_id, b.title AS book_title, s.id AS science_id, s.name AS science_name, sh.title AS sharh_title, f.created_at
      FROM fawaid_connections c
      JOIN fawaid f ON c.connected_id = f.id
      JOIN books b ON f.book_id = b.id
      JOIN sciences s ON b.science_id = s.id
      LEFT JOIN shuruuh sh ON f.sharh_id = sh.id
      WHERE c.fawaid_id = ?
      ORDER BY f.created_at DESC
    `).all(id);

    res.json(rows);
  });

  app.post("/api/fawaid/:id/connections", (req, res) => {
    const id = Number(req.params.id);
    const connectedIds = Array.isArray(req.body?.connectedIds) ? req.body.connectedIds.map((x: any) => Number(x)) : [];
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
    if (connectedIds.length === 0) return res.status(400).json({ error: "connectedIds is required" });

    try {
      const tx = db.transaction(() => {
        for (const target of connectedIds) {
          if (!Number.isInteger(target) || target <= 0) continue;
          if (target === id) continue;
          db.prepare("INSERT OR IGNORE INTO fawaid_connections (fawaid_id, connected_id) VALUES (?, ?)").run(id, target);
          db.prepare("INSERT OR IGNORE INTO fawaid_connections (fawaid_id, connected_id) VALUES (?, ?)").run(target, id);
        }
      });
      tx();
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create connections" });
    }
  });

  app.delete("/api/fawaid/:id/connections/:connectedId", (req, res) => {
    const id = Number(req.params.id);
    const connectedId = Number(req.params.connectedId);
    if (!Number.isInteger(id) || !Number.isInteger(connectedId)) {
      return res.status(400).json({ error: "Invalid ids" });
    }

    const tx = db.transaction(() => {
      db.prepare("DELETE FROM fawaid_connections WHERE fawaid_id = ? AND connected_id = ?").run(id, connectedId);
      db.prepare("DELETE FROM fawaid_connections WHERE fawaid_id = ? AND connected_id = ?").run(connectedId, id);
    });
    tx();
    res.json({ success: true });
  });

  app.post("/api/fawaid/:id/connections/suggestions", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    try {
      const base = db.prepare(`
        SELECT f.id, f.title, f.content, f.normalized_content, f.keywords, b.title AS book_title, s.name AS science_name
        FROM fawaid f
        JOIN books b ON f.book_id = b.id
        JOIN sciences s ON b.science_id = s.id
        WHERE f.id = ?
      `).get(id) as any;

      if (!base) return res.status(404).json({ error: "Fawaid not found" });

      const connectedSet = new Set<number>(
        db.prepare("SELECT connected_id FROM fawaid_connections WHERE fawaid_id = ?").all(id).map((r: any) => r.connected_id)
      );

      const targetVector = embeddingCache.get(id);
      const allCandidates = db.prepare(`
        SELECT f.id, f.title, f.content, f.normalized_content, f.keywords, b.title AS book_title, s.name AS science_name
        FROM fawaid f
        JOIN books b ON f.book_id = b.id
        JOIN sciences s ON b.science_id = s.id
        WHERE f.id != ?
          AND COALESCE(f.status, 'formatted') != 'unformatted'
      `).all(id) as any[];

      let scored = allCandidates
        .filter(c => !connectedSet.has(c.id))
        .filter(c => normalizeArabic(c.content || '') !== normalizeArabic(base.content || ''))
        .map(c => {
          const docVector = embeddingCache.get(c.id);
          let semanticScore = 0;
          if (targetVector && docVector) {
            semanticScore = cosineSimilarity(targetVector, docVector);
          }

          const keywordOverlap = (() => {
            const baseWords = new Set(normalizeArabic(`${base.title || ''} ${base.content || ''} ${base.keywords || ''}`).split(/\s+/).filter(Boolean));
            const candWords = normalizeArabic(`${c.title || ''} ${c.content || ''} ${c.keywords || ''}`).split(/\s+/).filter(Boolean);
            let matches = 0;
            for (const w of candWords) if (baseWords.has(w)) matches++;
            return Math.min(matches / 20, 0.35);
          })();

          const combined = semanticScore * 0.8 + keywordOverlap;
          return { ...c, combinedScore: combined };
        })
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, 20);

      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (apiKey && scored.length > 0) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const aiResp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ parts: [{ text: `Given original fawaid and candidates, return best related items only.\nOriginal:\n${JSON.stringify({ id: base.id, title: base.title, content: base.content, keywords: base.keywords })}\nCandidates:\n${JSON.stringify(scored.map(c => ({ id: c.id, title: c.title, content: c.content, keywords: c.keywords })))}\nReturn JSON array of objects {id:number,relevance:number,reason:string}.` }] }],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    relevance: { type: Type.NUMBER },
                    reason: { type: Type.STRING }
                  },
                  required: ["id", "relevance", "reason"]
                }
              }
            }
          });

          const parsed = JSON.parse(aiResp.text || "[]") as Array<{ id: number; relevance: number; reason: string }>;
          const byId = new Map(scored.map(c => [c.id, c]));
          const aiFiltered = parsed
            .filter(x => byId.has(x.id))
            .filter(x => x.relevance > 0.8)
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, 7)
            .map(x => ({
              id: x.id,
              relevance: x.relevance,
              reason: x.reason,
              title: byId.get(x.id)?.title,
              contentSnippet: String(byId.get(x.id)?.content || '').slice(0, 180)
            }));

          return res.json({ suggestions: aiFiltered, cached: false });
        } catch (aiErr) {
          console.warn("AI filtering for suggestions failed, falling back to semantic-only", aiErr);
        }
      }

      const semanticOnly = scored
        .filter(c => c.combinedScore > 0.8)
        .slice(0, 7)
        .map(c => ({
          id: c.id,
          relevance: Number(c.combinedScore.toFixed(3)),
          reason: "Similar content and keywords",
          title: c.title,
          contentSnippet: String(c.content || '').slice(0, 180)
        }));

      return res.json({ suggestions: semanticOnly, cached: false });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to suggest connections" });
    }
  });

  // Google Drive endpoints
  app.get("/api/drive/auth-url", (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
    res.json({ url: authUrl });
  });

  app.get("/api/drive/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);
      driveTokens = tokens;
      fs.writeFileSync(path.join(__dirname, 'drive_tokens.json'), JSON.stringify(tokens));
      res.send('<html><body><script>window.close();</script><p>Connected! You may close this tab.</p></body></html>');
    } catch (e) {
      res.status(400).send('Authentication failed');
    }
  });

  app.get("/api/drive/status", (req, res) => {
    res.json({ connected: !!driveTokens });
  });

  app.post("/api/drive/upload", async (req, res) => {
    if (!driveTokens) return res.status(401).json({ error: "Not authenticated with Google Drive" });
    try {
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      const dbPath = path.join(__dirname, 'knowledge.db');

      const listRes = await drive.files.list({
        q: "name='knowledge.db' and trashed=false",
        fields: 'files(id, name)'
      });

      const media = { mimeType: 'application/x-sqlite3', body: fs.createReadStream(dbPath) };

      if (listRes.data.files && listRes.data.files.length > 0) {
        await drive.files.update({
          fileId: listRes.data.files[0].id!,
          media
        });
      } else {
        await drive.files.create({
          requestBody: { name: 'knowledge.db' },
          media,
          fields: 'id'
        });
      }

      res.json({ success: true });
    } catch (e) {
      console.error("Drive upload error:", e);
      res.status(500).json({ error: "Failed to upload to Google Drive" });
    }
  });

  // ==================== TAG MANAGEMENT API ====================

  // GET /api/tags - List all tags with usage count
  app.get("/api/tags", (req, res) => {
    try {
      const { usedOnly } = req.query as { usedOnly?: string };
      const includeUnused = usedOnly !== 'true';
      const tags = db.prepare(`
        SELECT
          t.id,
          t.name,
          t.normalized_name,
          COUNT(ft.fawaid_id) as usage_count,
          MAX(f.created_at) as last_used_at
        FROM tags t
        LEFT JOIN fawaid_tags ft ON t.id = ft.tag_id
        LEFT JOIN fawaid f ON ft.fawaid_id = f.id
        GROUP BY t.id, t.name, t.normalized_name
        ${includeUnused ? '' : 'HAVING COUNT(ft.fawaid_id) > 0'}
        ORDER BY usage_count DESC, t.name ASC
      `).all() as any[];

      res.json(tags);
    } catch (e) {
      console.error("Error fetching tags:", e);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  // PUT /api/tags/:id/rename - Rename a tag
  app.put("/api/tags/:id/rename", (req, res) => {
    const { id } = req.params;
    const { newName } = req.body;

    if (!newName || !newName.trim()) {
      return res.status(400).json({ error: "New name is required" });
    }

    const trimmedName = newName.trim();
    const normalizedNewName = normalizeArabic(trimmedName).toLowerCase();

    try {
      // Check if another tag already has this normalized name
      const existingTag = db.prepare("SELECT id, name FROM tags WHERE normalized_name = ? AND id != ?").get(normalizedNewName, id) as any;
      if (existingTag) {
        return res.status(409).json({
          error: "A tag with this name already exists",
          existingTag: { id: existingTag.id, name: existingTag.name }
        });
      }

      // Update the tag
      db.prepare("UPDATE tags SET name = ?, normalized_name = ? WHERE id = ?").run(trimmedName, normalizedNewName, id);

      res.json({ success: true, tag: { id, name: trimmedName, normalized_name: normalizedNewName } });
    } catch (e) {
      console.error("Error renaming tag:", e);
      res.status(500).json({ error: "Failed to rename tag" });
    }
  });

  // DELETE /api/tags/:id - Delete a tag
  app.delete("/api/tags/:id", (req, res) => {
    const { id } = req.params;

    try {
      // Delete tag associations first (CASCADE should handle this, but being explicit)
      db.prepare("DELETE FROM fawaid_tags WHERE tag_id = ?").run(id);

      // Delete the tag
      const result = db.prepare("DELETE FROM tags WHERE id = ?").run(id);

      if (result.changes === 0) {
        return res.status(404).json({ error: "Tag not found" });
      }

      res.json({ success: true });
    } catch (e) {
      console.error("Error deleting tag:", e);
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });

  // POST /api/tags/merge - Merge multiple tags into one canonical tag
  app.post("/api/tags/merge", (req, res) => {
    const { sourceTagIds, targetTagId, targetTagName } = req.body;

    if (!Array.isArray(sourceTagIds) || sourceTagIds.length === 0) {
      return res.status(400).json({ error: "sourceTagIds must be a non-empty array" });
    }

    if (!targetTagId && (!targetTagName || !String(targetTagName).trim())) {
      return res.status(400).json({ error: "targetTagId or targetTagName must be provided" });
    }

    if (targetTagId && sourceTagIds.includes(targetTagId)) {
      return res.status(400).json({ error: "targetTagId cannot be in sourceTagIds" });
    }

    try {
      const transaction = db.transaction(() => {
        let targetTag: any;

        if (targetTagId) {
          targetTag = db.prepare("SELECT id, name FROM tags WHERE id = ?").get(targetTagId) as any;
          if (!targetTag) {
            throw new Error("Target tag not found");
          }
        } else {
          const trimmedTargetTagName = String(targetTagName).trim();
          const normalizedTargetTagName = normalizeArabic(trimmedTargetTagName).toLowerCase();
          targetTag = db.prepare("SELECT id, name FROM tags WHERE normalized_name = ?").get(normalizedTargetTagName) as any;
          if (!targetTag) {
            const result = db.prepare("INSERT INTO tags (name, normalized_name) VALUES (?, ?)").run(trimmedTargetTagName, normalizedTargetTagName);
            targetTag = { id: Number(result.lastInsertRowid), name: trimmedTargetTagName };
          }
        }

        // Verify all source tags exist
        for (const sourceId of sourceTagIds) {
          const sourceTag = db.prepare("SELECT id, name FROM tags WHERE id = ?").get(sourceId) as any;
          if (!sourceTag) {
            throw new Error(`Source tag ${sourceId} not found`);
          }
        }

        // Re-associate all fawaid from source tags to target tag
        for (const sourceId of sourceTagIds) {
          if (Number(sourceId) === Number(targetTag.id)) {
            continue;
          }

          // Get all fawaid_ids associated with this source tag
          const associations = db.prepare("SELECT fawaid_id FROM fawaid_tags WHERE tag_id = ?").all(sourceId) as any[];

          // Re-associate to target tag (INSERT OR IGNORE handles duplicates)
          for (const assoc of associations) {
            db.prepare("INSERT OR IGNORE INTO fawaid_tags (fawaid_id, tag_id) VALUES (?, ?)").run(assoc.fawaid_id, targetTag.id);
          }

          // Delete the source tag associations
          db.prepare("DELETE FROM fawaid_tags WHERE tag_id = ?").run(sourceId);

          // Delete the source tag
          db.prepare("DELETE FROM tags WHERE id = ?").run(sourceId);
        }

        return targetTag;
      });

      const targetTag = transaction();
      res.json({ success: true, mergedInto: { id: targetTag.id, name: targetTag.name } });
    } catch (e: any) {
      console.error("Error merging tags:", e);
      res.status(500).json({ error: e.message || "Failed to merge tags" });
    }
  });

  // POST /api/tags - Create a new tag (standalone endpoint)
  app.post("/api/tags", (req, res) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Tag name is required" });
    }

    const trimmedName = name.trim();
    const normalizedName = normalizeArabic(trimmedName).toLowerCase();

    try {
      // Check if tag with this normalized name already exists
      const existingTag = db.prepare("SELECT id, name FROM tags WHERE normalized_name = ?").get(normalizedName) as any;
      if (existingTag) {
        return res.status(409).json({
          error: "A tag with this name already exists",
          existingTag: { id: existingTag.id, name: existingTag.name }
        });
      }

      // Create new tag
      const result = db.prepare("INSERT INTO tags (name, normalized_name) VALUES (?, ?)").run(trimmedName, normalizedName);
      const newTag = db.prepare("SELECT id, name, normalized_name FROM tags WHERE id = ?").get(result.lastInsertRowid) as any;

      res.json({ success: true, tag: newTag });
    } catch (e) {
      console.error("Error creating tag:", e);
      res.status(500).json({ error: "Failed to create tag" });
    }
  });

  app.post("/api/drive/download", async (req, res) => {
    if (!driveTokens) return res.status(401).json({ error: "Not authenticated with Google Drive" });
    try {
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      const listRes = await drive.files.list({
        q: "name='knowledge.db' and trashed=false",
        fields: 'files(id, name, modifiedTime)'
      });

      if (!listRes.data.files || listRes.data.files.length === 0) {
        return res.status(404).json({ error: "No backup found on Google Drive" });
      }

      const fileId = listRes.data.files[0].id!;
      const dbPath = path.join(__dirname, 'knowledge.db');
      const backupPath = path.join(__dirname, 'knowledge.db.backup');

      fs.copyFileSync(dbPath, backupPath);

      const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      const dest = fs.createWriteStream(dbPath);
      await new Promise((resolve, reject) => {
        (response.data as any).pipe(dest)
          .on('finish', resolve)
          .on('error', reject);
      });

      res.json({ success: true });
    } catch (e) {
      console.error("Drive download error:", e);
      res.status(500).json({ error: "Failed to download from Google Drive" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
