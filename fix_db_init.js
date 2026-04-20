import fs from 'fs';
let code = fs.readFileSync('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/server.ts', 'utf8');
code = code.replace(/  \/\/ Migration for import_batch_id[\s\S]*?  } catch \(err\) {[\s\S]*?  }/, "  \/\/ MIGRATION HAS BEEN EXTRACTED");
code = code.replace(/  CREATE TABLE IF NOT EXISTS embeddings \(/, "');\n\n  // Run migrations here\n  try {\n    const tableInfo = db.prepare('PRAGMA table_info(fawaid)').all();\n    const hasImportBatch = tableInfo.some((col) => col.name === 'import_batch_id');\n    if (!hasImportBatch) {\n      db.prepare('ALTER TABLE fawaid ADD COLUMN import_batch_id TEXT').run();\n      console.log('Added import_batch_id column to fawaid table');\n    }\n  } catch (err) {\n    console.error('Migration error import_batch_id:', err);\n  }\n\n  db.exec(`\n  CREATE TABLE IF NOT EXISTS embeddings (");
fs.writeFileSync('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/server.ts', code);
