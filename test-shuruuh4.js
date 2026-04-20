import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("knowledge.db");
try {
  const info = db.prepare("INSERT INTO shuruuh (book_id, title, author) VALUES (?, ?, ?)").run(2, "Test Sharh", null);
  console.log(info);
} catch (e) {
  console.log(e);
}
