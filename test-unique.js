import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE sciences (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, order_index INTEGER DEFAULT 0);`);
const stmt = db.prepare("INSERT INTO sciences (name, order_index) VALUES (?, ?)");
stmt.run("Test", 1);
try {
  stmt.run("Test", 2);
} catch (e) {
  console.log(e.code, e.message);
}
