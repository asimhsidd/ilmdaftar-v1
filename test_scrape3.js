import fs from 'fs';

async function run() {
  const query = "الضرورات تبيح المحظورات";
  const formData = new URLSearchParams();
  formData.append('exact', '0');
  formData.append('srch_type', 'all');
  formData.append('sqks[0]', query); // maybe array keys like this
  
  const res = await fetch("https://shamela.ws/index.php/page/search_res", {
     method: 'POST',
     body: formData
  });
  console.log(res.status);
  const text = await res.text();
  console.log(text.substring(0, 500));
}
run();
