import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec('CREATE TABLE foo (a INT)');
const t = (...args) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    throw new Error('foo');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};
try { t(); } catch(e) { console.log("Caught:", e.message); }
