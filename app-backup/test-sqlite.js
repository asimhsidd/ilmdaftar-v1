import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE sciences (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, order_index INTEGER DEFAULT 0);`);
const maxOrder = db.prepare("SELECT MAX(order_index) as max FROM sciences").get();
const result = db.prepare("INSERT INTO sciences (name, order_index) VALUES (?, ?)").run("Test", 1);
console.log(result, maxOrder);
