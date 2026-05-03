import fs from 'fs';

async function run() {
  const query = "الضرورات تبيح المحظورات";
  const body = "exact=0&books%5B%5D=-1&decades%5B%5D=-1&aqsam%5B%5D=-1&authors%5B%5D=-1&srch_type=all&sqks%5B%5D=" + encodeURIComponent(query);

  const res = await fetch("https://shamela.ws/index.php/ajax/search", {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
    },
    body: body
  });
  console.log(res.status);
  const text = await res.text();
  console.log(text.substring(0, 500));
}
run();
