import { DatabaseSync } from "node:sqlite";
class MyDatabase {
  constructor(file) {
    this.db = new DatabaseSync(file);
  }
  pragma(sql) { return this.db.exec(`PRAGMA ${sql}`); }
  exec(sql) { return this.db.exec(sql); }
  prepare(sql) {
    const stmt = this.db.prepare(sql);
    const wrap = (method) => (...args) => {
      try {
        return stmt[method](...args);
      } catch (e) {
        if (e.message && e.message.includes('UNIQUE constraint failed')) {
          e.code = 'SQLITE_CONSTRAINT_UNIQUE';
        }
        throw e;
      }
    };
    return {
      all: wrap('all'),
      get: wrap('get'),
      run: wrap('run'),
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

const db = new MyDatabase(":memory:");
db.exec(`CREATE TABLE sciences (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, order_index INTEGER DEFAULT 0);`);
const stmt = db.prepare("INSERT INTO sciences (name, order_index) VALUES (?, ?)");
stmt.run("Test", 1);
try {
  stmt.run("Test", 2);
} catch (e) {
  console.log(e.code);
}
