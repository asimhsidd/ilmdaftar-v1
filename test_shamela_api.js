import fs from 'fs';
const text = fs.readFileSync('search_res.html', 'utf8');
console.log(text.substring(0, 1000));
console.log("Length:", text.length);
