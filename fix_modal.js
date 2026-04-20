const fs = require('fs');
let code = fs.readFileSync('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/src/contexts/ModalContext.tsx', 'utf8');
code = code.replace(/bg-black bg-opacity-50/, "bg-black/90 backdrop-blur-sm");
fs.writeFileSync('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/src/contexts/ModalContext.tsx', code);
