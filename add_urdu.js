const fs = require('fs');

const file = fs.readFileSync('src/translations.ts', 'utf8');

// The file exports `export const translations: Record<string, Record<string, string>> = { en: {...}, ar: {...} };`
// Let's just append `ur: ar` but translated? 
// For now, let's just do a shallow copy of 'ar' and replace a few keys to prove it works, or use the English keys translated to Urdu.

// It's easier if I use a quick script.
