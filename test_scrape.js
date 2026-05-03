import fs from 'fs';

async function run() {
  const query = "الضرورات تبيح المحظورات";
  const body = new URLSearchParams({
    "exact": 0,
    "srch_type": "all",
    "sqks[0]": query,
    "books": -1
  });
  
  const res = await fetch("https://shamela.ws/index.php/ajax/search", {
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
