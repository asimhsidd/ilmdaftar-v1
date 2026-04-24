import fs from "fs";

async function run() {
  const query = "الضرورات تبيح المحظورات";
  const searchUrl = `https://shamela.ws/search?q=${encodeURIComponent(query)}`;
  console.log("Fetching", searchUrl);
  const res = await fetch(searchUrl);
  const html = await res.text();
  fs.writeFileSync("search_res.html", html);
}
run();
