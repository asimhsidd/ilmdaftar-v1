import fs from 'fs';

async function run() {
  const query = "الضرورات";
  const res = await fetch('https://shamela.ws/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exact: 0, query: query, authors: [], books: [], decades: [], aqsam: [] })
  });
  console.log(res.status);
  const text = await res.text();
  console.log(text.substring(0, 500));
}
run();
