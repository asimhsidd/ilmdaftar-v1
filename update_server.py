with open('server.ts', 'r') as f:
    text = f.read()

import re

# Let's replace the duplicate boolean check
old_import_check = """      // Check for duplicates
      if (!forceDuplicates) {"""

new_import_check = """      const allowedSet = new Set(req.body.allowedDuplicateContents || []);

      // Filter duplicates first
      let itemsToInsert = items;
      if (!forceDuplicates) {
        // Collect exact content text for speed
        const existingDocs = db.prepare('SELECT content FROM fawaid').all();
        const existingContentSet = new Set(existingDocs.map((doc: any) => doc.content));

        itemsToInsert = items.filter((item: any) => {
          if (allowedSet.has(item.content)) {
            // Manually allowed
            return true;
          }
          if (existingContentSet.has(item.content)) {
            return false;
          }
          return true;
        });
      }

      if (itemsToInsert.length === 0 && items.length > 0 && !forceDuplicates) {"""

text = text.replace(old_import_check, new_import_check)

# remove old loop validation for insert to use itemsToInsert
text = text.replace("for (const item of items) {", "for (const item of itemsToInsert) {")

with open('server.ts', 'w') as f:
    f.write(text)

