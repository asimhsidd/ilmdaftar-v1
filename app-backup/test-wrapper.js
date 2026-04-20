import { DatabaseSync } from "node:sqlite";
class MyDatabase {
  constructor(file) {
    this.db = new DatabaseSync(file);
  }
  pragma(sql) {
    return this.db.exec(`PRAGMA ${sql}`);
  }
  exec(sql) {
    return this.db.exec(sql);
  }
  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      all: (...args) => stmt.all(...args),
      get: (...args) => stmt.get(...args),
      run: (...args) => stmt.run(...args),
    };
  }
  transaction(fn) {
    return (...args) => {
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
const db = new MyDatabase("knowledge.db");
db.pragma('foreign_keys = ON');
const stmt = db.prepare("SELECT id FROM sciences ORDER BY id");
console.log(stmt.all());
