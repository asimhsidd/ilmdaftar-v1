import express from "express";
import { createServer as createViteServer } from "vite";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";
import { GoogleGenAI, Type } from "@google/genai";
import { google } from "googleapis";

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
    title TEXT,
    content TEXT NOT NULL,
    author TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (sharh_id) REFERENCES shuruuh(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fawaid_tags (
    fawaid_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (fawaid_id, tag_id),
    FOREIGN KEY (fawaid_id) REFERENCES fawaid(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
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

  -- Initial Sciences
  INSERT OR IGNORE INTO sciences (name) VALUES 
  ('Aqeedah'), ('Usul al-Fiqh'), ('Fiqh'), ('Hadith'), 
  ('Tafsir'), ('Arabic Language'), ('Seerah'), ('Qawa’id Fiqhiyyah');
`);

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
        question_types TEXT DEFAULT '[]',
        keywords TEXT DEFAULT '[]',
        extra_notes TEXT,
        volume_number TEXT,
        priority TEXT,
        last_reviewed_at DATETIME,
        reference TEXT,
        language TEXT DEFAULT 'arabic',
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
        last_reviewed_at, reference, language, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, learning_steps
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

  // API Routes
  
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
    const { science_id, title, total_pages } = req.body;
    try {
      const result = db.prepare("INSERT INTO books (science_id, title, total_pages) VALUES (?, ?, ?)")
        .run(science_id, title, total_pages || 0);
      res.json({ id: result.lastInsertRowid, science_id, title, total_pages });
    } catch (e) {
      const existing = db.prepare("SELECT * FROM books WHERE science_id = ? AND title = ?").get(science_id, title);
      if (existing) return res.json(existing);
      res.status(400).json({ error: "Error creating book" });
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
    const { bookId, sharhId, noSharh, search, tag, scienceId, author, priority, language, due_only } = req.query;
    let query = `
      SELECT f.*, b.title as book_title, s.name as science_name, s.id as science_id, sh.title as sharh_title
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
      query += " AND f.author LIKE ?";
      params.push(`%${author}%`);
    }
    if (search) {
      query += " AND (f.content LIKE ? OR f.title LIKE ? OR b.title LIKE ? OR f.author LIKE ? OR sh.title LIKE ?)";
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
        question_types: JSON.parse(f.question_types || '[]'),
        keywords: JSON.parse(f.keywords || '[]'),
        questions: questions,
        lastReviewedAt: f.last_reviewed_at,
        language: f.language || 'arabic'
      };
    });

    res.json(fawaidWithDetails);
  });

  app.post("/api/fawaid", (req, res) => {
    const { book_id, sharh_id, page_number, reference, title, content, tags, author, question_types, keywords, questions, extra_notes, volume_number, tabah, language } = req.body;

    const transaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO fawaid (book_id, sharh_id, page_number, reference, title, content, author, question_types, keywords, extra_notes, volume_number, tabah, language)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        book_id,
        sharh_id || null,
        page_number,
        reference || null,
        title,
        content,
        author,
        JSON.stringify(question_types || []),
        JSON.stringify(keywords || []),
        extra_notes || null,
        volume_number || null,
        tabah || null,
        language || 'arabic'
      );
      
      const fawaidId = result.lastInsertRowid;

      if (tags && Array.isArray(tags)) {
        for (const tagName of tags) {
          db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(tagName);
          const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get(tagName) as any;
          db.prepare("INSERT INTO fawaid_tags (fawaid_id, tag_id) VALUES (?, ?)").run(fawaidId, tag.id);
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
      const id = transaction();
      res.json({ id, book_id, sharh_id, page_number, title, content, tags, author, question_types, keywords, questions, extra_notes, volume_number });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Error creating fawaid" });
    }
  });

  app.put("/api/fawaid/:id", (req, res) => {
    const { id } = req.params;
    const { book_id, sharh_id, title, content, page_number, reference, author, question_types, keywords, questions, extra_notes, volume_number, tabah, language } = req.body;
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

      if (!Number.isInteger(nextBookId) || nextBookId <= 0) {
        return res.status(400).json({ error: "Invalid book_id" });
      }

      const nextSharhId =
        sharh_id === undefined
          ? existing.sharh_id
          : (sharh_id === null || sharh_id === '' ? null : Number(sharh_id));

      if (nextSharhId !== null && (!Number.isInteger(nextSharhId) || nextSharhId <= 0)) {
        return res.status(400).json({ error: "Invalid sharh_id" });
      }

      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE fawaid
          SET book_id = ?, sharh_id = ?, title = ?, content = ?, page_number = ?, reference = ?, author = ?, question_types = ?, keywords = ?, extra_notes = ?, volume_number = ?, tabah = ?, language = ?
          WHERE id = ?
        `).run(
          nextBookId,
          nextSharhId,
          title,
          content,
          page_number,
          reference || null,
          author,
          JSON.stringify(question_types || []),
          JSON.stringify(keywords || []),
          extra_notes || null,
          volume_number || null,
          tabah || null,
          language || 'arabic',
          id
        );

        if (questions && Array.isArray(questions)) {
          // Delete existing questions
          db.prepare("DELETE FROM questions WHERE fawaid_id = ?").run(id);
          
          // Insert new questions
          for (const q of questions) {
            db.prepare(`
              INSERT INTO questions (fawaid_id, type, question, answer, difficulty)
              VALUES (?, ?, ?, ?, ?)
            `).run(id, q.type, q.question, q.answer, q.difficulty || 'Medium');
          }
        }
      });
      
      transaction();
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Error updating fawaid" });
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
      totalFawaid: totalFawaid.count,
      scienceStats
    });
  });

  app.post("/api/import", (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Expected an array of items" });
    }

    try {
      const transaction = db.transaction((fawaidList: any[]) => {
        let importedCount = 0;
        let skippedCount = 0;
        for (const item of fawaidList) {
          // 1. Science
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

          // 2. Book
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

          if (!bookId || !item.content) continue;

          // 4. Check for duplicate fawaid
          const existingFaidah = db.prepare(
            "SELECT id FROM fawaid WHERE book_id = ? AND content = ?"
          ).get(bookId, item.content);
          if (existingFaidah) {
            skippedCount++;
            continue;
          }

          // 5. Insert Fawaid with all fields
          const result = db.prepare(`
            INSERT INTO fawaid (book_id, sharh_id, page_number, reference, title, content, author, question_types, keywords, extra_notes, volume_number, language)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            item.language || 'arabic'
          );
          
          const fawaidId = result.lastInsertRowid;

          // 5. Tags
          if (item.tags && Array.isArray(item.tags)) {
            for (const tagName of item.tags) {
              db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(tagName);
              const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get(tagName) as any;
              db.prepare("INSERT OR IGNORE INTO fawaid_tags (fawaid_id, tag_id) VALUES (?, ?)").run(fawaidId, tag.id);
            }
          }
          importedCount++;
        }
        return { importedCount, skippedCount };
      });

      const result = transaction(items);
      res.json({ success: true, count: result.importedCount, skipped: result.skippedCount });
    } catch (e) {
      console.error("Import error:", e);
      res.status(400).json({ error: "Error importing data" });
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

  // Import preview (check duplicates without inserting)
  app.post("/api/import/preview", (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Expected array" });

    let newCount = 0;
    let duplicateCount = 0;
    const scienceNames = new Set<string>();
    const bookTitles = new Set<string>();

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
        const existing = db.prepare("SELECT id FROM fawaid WHERE book_id = ? AND content = ?").get(bookId, item.content);
        if (existing) { duplicateCount++; } else { newCount++; }
      } else {
        newCount++;
      }
    }

    res.json({ total: items.length, newCount, duplicateCount, sciences: scienceNames.size, books: bookTitles.size });
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
