import fs from 'fs';
const text = `200
<span style="display:none">80</span><div class="alert">النتائج 1 إلى 10 من 10410</div><div><a target="_blank" href="https://shamela.ws/book/27107/90609"><b><span class="text-primaryy">فتاوى الشبكة الإسلامية</span></b> <span class="text-gray">[مجموعة من المؤلفين]</span></a></div><p class=""><span data-type="title" id=toc-92094>معنى (<em>الضرورات</em> <em>تبيح</em> <em>المحظورات</em>)</span><span data-type="title">[السُّؤَالُ]</span>ـ[أرجو توضيح القاعدة الفقهية التالية: <em>الضرورات</em> <em>تبيح</em> <em>المحظورات</em> والحاجيات ...</p><div><a target="_blank" href="https://shamela.ws/book/7270/264"><b><span class="text-primaryy">القواعد والضوابط الفقهية المتضمنة للتيسير</span></b> <span class="text-gray">[عبد الرحمن بن صالح العبد اللطيف]</span></a></div><p class=""><span data-type="title" id=toc-23>القاعدة التاسعة عشر: <em>الضرورات</em> <em>تبيح</em> <em>المحظورات</span></القاعدة التاسعة عشرة: <em>الضرورات</em> <em>تبيح</em> <em>المحظورات</em>.</p><div><a target="_blank" href="`;

const items = text.split('<div><a target="_blank"').slice(1);
console.log("Items:", items.length);
for (let i = 0; i < Math.min(items.length, 2); i++) {
  const item = items[i];
  
  const urlMatch = item.match(/href="([^"]+)"/);
  const bookNameMatch = item.match(/<span class="text-primaryy">(.*?)<\/span>/);
  const authorMatch = item.match(/<span class="text-gray">\[(.*?)\]<\/span>/);
  
  const parts = item.split('</a></div>');
  let snippetMatch = parts.length > 1 ? parts[1] : '';
  const pMatch = snippetMatch.match(/<p[^>]*>(.*?)<\/p>/s);
  const snippetText = pMatch ? pMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  
  const book_name = bookNameMatch ? bookNameMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown Book';
  const author = authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown Author';
  console.log(book_name, author, snippetText);
}
