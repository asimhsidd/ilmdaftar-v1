import fs from 'fs';
async function run() {
  const query = "الضرورات تبيح المحظورات";
  const body = new URLSearchParams();
  body.append('exact', '0');
  body.append('srch_type', 'all');
  body.append('sqks[]', query);
  
  const res = await fetch("https://shamela.ws/search", {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
    },
    body: body.toString()
  });
  console.log(res.status);
  const text = await res.text();
  console.log(text.substring(0, 500));
}
run();
