const fs = require('fs');
let code = fs.readFileSync('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/src/components/Capture.tsx', 'utf8');
code = code.replace(/bg-black bg-opacity-90 flex flex-col items-center justify-center p-4/, "bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4");
fs.writeFileSync('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/src/components/Capture.tsx', code);
