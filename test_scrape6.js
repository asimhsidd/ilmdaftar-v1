import fs from 'fs';
async function run() {
  const query = "الضرورات تبيح المحظورات";
  const body = new URLSearchParams();
  body.append('term', query);
  body.append('aqsam', '-1');
  body.append('decades', '-1');
  body.append('authors', '-1');
  body.append('books', '-1');
  
  const res = await fetch("https://shamela.ws/ajax/search", {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
    },
    body: body.toString()
  });
  console.log(res.status);
  const text = await res.text();
  console.log(text.substring(0, 1000));
}
run();
