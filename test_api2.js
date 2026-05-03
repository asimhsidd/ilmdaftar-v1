import fs from 'fs';

async function run() {
  const query = "الضرورات";
  const url = `https://shamela.ws/index.php/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  console.log(res.status);
  const text = await res.text();
  console.log(text.substring(0, 500));
}
run();
