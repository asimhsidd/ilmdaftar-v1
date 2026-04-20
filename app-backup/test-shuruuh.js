import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE shuruuh (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL, title TEXT NOT NULL, author TEXT);`);
const stmt = db.prepare("INSERT INTO shuruuh (book_id, title, author) VALUES (?, ?, ?)");
try {
  stmt.run(1, "Test", undefined);
  console.log("Success with undefined");
} catch (e) {
  console.log("Error with undefined:", e.message);
}
try {
  stmt.run(1, "Test", null);
  console.log("Success with null");
} catch (e) {
  console.log("Error with null:", e.message);
}
