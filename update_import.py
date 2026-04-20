import sys
import re

with open('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/src/components/ImportExport.tsx', 'r') as f:
    text = f.read()

# 1. Add new state for duplicate review window
new_state = """const [forceDuplicates, setForceDuplicates] = useState(false);
  const [showDuplicateReviewWindow, setShowDuplicateReviewWindow] = useState(false);
  const [allowedDuplicateContents, setAllowedDuplicateContents] = useState<string[]>([]);
  const [expandedFawaid, setExpandedFawaid] = useState<Set<number>>(new Set());

  const isArabic = (str: string) => /[\\u0600-\\u06FF]/.test(str);"""

if "setShowDuplicateReviewWindow" not in text:
    text = text.replace("const [forceDuplicates, setForceDuplicates] = useState(false);", new_state)

# 2. Modify handleConfirmImport to include allowedDuplicateContents
if "allowedDuplicateContents" not in text.split("try {")[1][:200]:
    text = text.replace("body: JSON.stringify({ items: parsedImportData, forceDuplicates })", "body: JSON.stringify({ items: parsedImportData, forceDuplicates, allowedDuplicateContents })")

# 3. Change See Original Button logic
old_see_orig_button = """                            onClick={async () => {
                              const snippets = importPreview.duplicatesList?.map((dup: any) => `
                                <div style="border: 1px solid #ddd; padding: 8px; margin-bottom: 8px; text-align: left; color: black;" class="dark:text-white dark:border-zinc-700">
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
                            className="mt-2 text-[10px] text-amber-600 underline hover:text-amber-700"
                          >
                            See original Fawa'id
                          </button>"""

new_see_orig_button = """                            onClick={() => setShowDuplicateReviewWindow(true)}
                            className="mt-2 text-[10px] text-amber-600 underline hover:text-amber-700 font-bold"
                          >
                            Review & Select Duplicates
                          </button>"""
text = text.replace(old_see_orig_button, new_see_orig_button)

# 4. Add Duplicate Review Window code to the render before final </div></div>
# find the last </div>
components = text.rsplit("</div>", 1)

review_window_jsx = """
          {showDuplicateReviewWindow && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/90 backdrop-blur-[2px] p-4 sm:p-8">
              <div className="w-full max-w-screen-2xl h-[85vh] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950/50 shrink-0">
                  <h2 className="text-xl sm:text-2xl font-bold dark:text-zinc-100 flex items-center gap-2">
                    <AlertCircle className="w-7 h-7 text-amber-500" />
                    Review Duplicates
                  </h2>
                  <button 
                    onClick={() => setShowDuplicateReviewWindow(false)}
                    className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                  <div className="flex flex-nowrap gap-6 h-full items-start w-max">
                    {importPreview?.duplicatesList?.map((dup: any, i: number) => {
                        const existingText = dup.existing?.content || '';
                        const importedText = dup.imported?.content || '';
                        const isAr = isArabic(existingText);
                        const dir = isAr ? 'rtl' : 'ltr';
                        const textAlign = isAr ? 'text-right font-arabic text-xl/loose' : 'text-left';
                        const isExpanded = expandedFawaid.has(i);
                        
                        const snippetLimit = 200;
                        const needsExpand = existingText.length > snippetLimit;
                        const displayExisting = isExpanded ? existingText : (needsExpand ? existingText.substring(0, snippetLimit) + '...' : existingText);
                        
                        const isAllowed = forceDuplicates || allowedDuplicateContents.includes(importedText);

                        return (
                          <div 
                            key={i} 
                            className="w-[85vw] sm:w-[400px] bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col h-full overflow-hidden shrink-0 shadow-sm"
                          >
                            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900">
                              <span className="text-xs font-bold px-3 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500 rounded-md">
                                Database Match
                              </span>
                              <label className="flex items-center gap-2 cursor-pointer group">
                                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200">Force Save</span>
                                <input 
                                  type="checkbox"
                                  checked={isAllowed}
                                  disabled={forceDuplicates}
                                  onChange={(e) => {
                                    if (e.target.checked) setAllowedDuplicateContents(p => [...p, importedText]);
                                    else setAllowedDuplicateContents(p => p.filter(c => c !== importedText));
                                  }}
                                  className="w-5 h-5 rounded border-zinc-300 text-[#5A5A40] focus:ring-[#5A5A40] disabled:opacity-50"
                                />
                              </label>
                            </div>

                            <div className="p-5 flex flex-col h-full min-h-0">
                              <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                                <p dir={dir} className={`text-zinc-800 dark:text-zinc-300 break-words whitespace-pre-wrap ${textAlign}`}>
                                  {displayExisting}
                                </p>
                              </div>
                              {needsExpand && (
                                <button 
                                  onClick={() => setExpandedFawaid(prev => {
                                    const next = new Set(prev);
                                    if (next.has(i)) next.delete(i);
                                    else next.add(i);
                                    return next;
                                  })}
                                  className="mt-3 text-sm font-medium text-primary hover:underline text-center w-full py-2 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg"
                                >
                                  {isExpanded ? 'Show less' : 'Expand full Fawaid'}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                    })}
                  </div>
                </div>

                <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-zinc-600 dark:text-zinc-400 font-medium">
                    <span className="text-xl font-bold text-[#5A5A40] dark:text-zinc-200 mr-2">{allowedDuplicateContents.length}</span> 
                    selected to overwrite/save
                  </div>
                  <button
                    onClick={() => setShowDuplicateReviewWindow(false)}
                    className="w-full sm:w-auto px-8 py-3 bg-[#5A5A40] dark:bg-zinc-700 text-white rounded-xl font-bold shadow-lg shadow-[#5A5A40]/20 dark:shadow-none hover:bg-[#4A4A30] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Done Reviewing
                  </button>
                </div>
              </div>
            </div>
          )}
"""

if "showDuplicateReviewWindow &&" not in text:
    components[0] += review_window_jsx
    text = "</div>".join(components)

with open('/Users/rayaandanish/Personal/My app/Islamic-Knowledge-Manager/src/components/ImportExport.tsx', 'w') as f:
    f.write(text)

print("done ui")
