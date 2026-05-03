import fs from 'fs';

async function run() {
  const query = "الضرورات تبيح المحظورات";
  // The Shamela search form actually submits to index.php/page/search using normal forms maybe.
  // Wait, let's look at what the current shamela API seems to be. 
  // When I look at shamela.html that I grabbed earlier:
  
  const formData = new URLSearchParams();
  formData.append('exact', '0');
  formData.append('books[]', '-1');
  formData.append('decades[]', '-1');
  formData.append('aqsam[]', '-1');
  formData.append('authors[]', '-1');
  formData.append('srch_type', 'all');
  formData.append('sqks[]', query);
  
  const res = await fetch("https://shamela.ws/index.php/ajax/search", {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
    },
    body: formData.toString()
  });
  console.log(res.status);
  const text = await res.text();
  console.log(text.substring(0, 500));
}
run();
