import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("knowledge.db");
console.log(db.prepare("SELECT * FROM books LIMIT 1").all());
