import fs from 'fs';
let code = fs.readFileSync('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/server.ts', 'utf8');
code = code.replace("  // MIGRATION HAS BEEN EXTRACTED\n\n');\n\n  // Run migrations here", "`)\n\n  // Run migrations here");
fs.writeFileSync('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/server.ts', code);
