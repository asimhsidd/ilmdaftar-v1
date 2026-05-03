import fs from 'fs';
const html = fs.readFileSync('search_res.html', 'utf8');
const regex = /.{0,50}الضرورات تبيح المحظورات.{0,50}/g;
let m;
let i=0;
while((m = regex.exec(html)) !== null && i < 10) {
  console.log(m[0]);
  i++;
}
