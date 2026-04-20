import sys

with open('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/src/components/ImportExport.tsx', 'r') as f:
    content = f.read()

import re

# Update imports to include React hooks
if "import React, " not in content and "import { " in content:
    content = content.replace("import { ", "import React, { useState, useRef } from 'react';\nimport { ", 1)


# Adding forceDuplicates and Modal Context to ImportExport.tsx
old_imports = """import { useTranslation } from 'react-i18next';
import Backup from './Backup';
import ExportPDF from './ExportPDF';"""

new_imports = """import { useTranslation } from 'react-i18next';
import Backup from './Backup';
import ExportPDF from './ExportPDF';
import { useModal } from '../contexts/ModalContext';"""

content = content.replace(old_imports, new_imports)

old_state = "const [pdfFilters, setPdfFilters] = useState({ scienceId: '', bookId: '' });"

new_state = """const [pdfFilters, setPdfFilters] = useState({ scienceId: '', bookId: '' });
  const [forceDuplicates, setForceDuplicates] = useState(false);
  const { showModal } = useModal();"""

content = content.replace(old_state, new_state)

old_confirm_func = """const handleConfirmImport = async () => {
    if (!parsedImportData) return;
    setLoading(true);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedImportData)
      });"""

new_confirm_func = """const handleConfirmImport = async () => {
    if (!parsedImportData) return;
    setLoading(true);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedImportData, forceDuplicates })
      });"""
      
content = content.replace(old_confirm_func, new_confirm_func)

old_preview_render = """{importPreview.duplicateCount}
              </div>
              <div className="text-sm text-gray-500">{t('duplicates skipped')}</div>
            </div>
          </div>"""

new_preview_render = """{importPreview.duplicateCount}
              </div>
              <div className="text-sm text-gray-500">{t('duplicates skipped')}</div>
              {importPreview.duplicateCount > 0 && (
                 <button 
                  onClick={async () => {
                    const snippets = importPreview.duplicatesList?.map((dup: any) => `
                      <div style="border: 1px solid #ddd; padding: 8px; margin-bottom: 8px;">
                         <strong>Existing:</strong> ${dup.existing?.content?.substring(0, 100)}...<br/>
                         <strong>Importing:</strong> ${dup.imported?.content?.substring(0, 100)}...
                      </div>
                    `).join('') || 'No details available.';
                    await showModal({
                      type: 'alert',
                      title: 'Duplicate Fawaid Original Text',
                      message: snippets
                    });
                  }}
                  className="mt-2 text-xs text-primary underline"
                 >
                   See original Fawa'id
                 </button>
              )}
            </div>
          </div>
          
          {importPreview.duplicateCount > 0 && (
             <div className="mt-4 flex items-center justify-center space-x-2 text-sm text-gray-700">
               <input
                 type="checkbox"
                 id="forceDuplicates"
                 checked={forceDuplicates}
                 onChange={(e) => setForceDuplicates(e.target.checked)}
                 className="rounded border-gray-300 text-primary focus:ring-primary"
               />
               <label htmlFor="forceDuplicates">Force save duplicates anyway</label>
             </div>
          )}"""

content = content.replace(old_preview_render, new_preview_render)

with open('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/src/components/ImportExport.tsx', 'w') as f:
    f.write(content)

print("Updated ImportExport.tsx preview render")
