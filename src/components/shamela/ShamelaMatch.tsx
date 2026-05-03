import React, { useState, useEffect } from 'react';
import { Search, Check, Loader2, ExternalLink, X, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ShamelaResult {
  title: string;
  book_name: string;
  author: string;
  snippet: string;
  page_number: string | null;
  volume_number?: string | null;
  link_to_result: string;
  score?: number;
}

export interface ParsedReference {
  matn: string;
  sharhTitle: string | null;
  author: string | null;
  isDerivedWork: boolean;
  page: string | null;
  volume: string | null;
  sourceUrl: string;
  rawBookName: string;
}

interface ShamelaModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  currentPage?: string;
  volume?: string;
  onFillReferences: (ref: ParsedReference) => void;
}

const normalizeArabic = (text: string): string => {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '') // Remove Harakat
    .replace(/[أإآء]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FF\s]/g, '') // Keep only Arabic and spaces
    .replace(/\s+/g, ' ')
    .trim();
};

// ─── Deterministic Parsing ───────────────────────────────────────────

const DERIVED_PREFIXES = ['شرح', 'حاشية', 'تعليق', 'مختصر'];
const AUTHOR_MARKERS = ['لابن', 'للإمام', 'للشيخ', 'للعلامة', 'للحافظ', 'لـ'];

export function parseIslamicBookTitle(bookName: string): {
  matn: string;
  sharhTitle: string | null;
  author: string | null;
  isDerivedWork: boolean;
} {
  if (!bookName) return { matn: bookName, sharhTitle: null, author: null, isDerivedWork: false };

  const trimmed = bookName.trim();

  // 1. Extract author (appears after author markers)
  let author: string | null = null;
  let titleWithoutAuthor = trimmed;

  for (const marker of AUTHOR_MARKERS) {
    const idx = trimmed.indexOf(marker);
    if (idx > 0) {
      author = trimmed.slice(idx + marker.length).trim();
      titleWithoutAuthor = trimmed.slice(0, idx).trim();
      break;
    }
  }

  // 2. Detect derived work prefix
  for (const prefix of DERIVED_PREFIXES) {
    if (titleWithoutAuthor.startsWith(prefix + ' ') || titleWithoutAuthor === prefix) {
      const afterPrefix = titleWithoutAuthor.slice(prefix.length).trim();
      return {
        matn: afterPrefix || titleWithoutAuthor,
        sharhTitle: titleWithoutAuthor,
        author,
        isDerivedWork: true,
      };
    }
  }

  // 3. Not a derived work
  return {
    matn: titleWithoutAuthor,
    sharhTitle: null,
    author,
    isDerivedWork: false,
  };
}

export function parseVolumeAndPage(snippetText: string, url: string): { volume: string | null; page: string | null } {
  let volume: string | null = null;
  let page: string | null = null;

  // Parse from snippet text: ج 3 ص 234 or ج3 ص234
  const volMatch = snippetText.match(/ج\s*(\d+)/);
  const pageMatch = snippetText.match(/ص\s*(\d+)/);

  if (volMatch) volume = volMatch[1];
  if (pageMatch) page = pageMatch[1];

  // Fallback: parse page from URL last segment
  if (!page && url) {
    const urlParts = url.replace(/\/$/, '').split('/');
    const lastSegment = urlParts[urlParts.length - 1];
    if (/^\d+$/.test(lastSegment)) {
      page = lastSegment;
    }
  }

  return { volume, page };
}



function highlightMatchedWords(snippet: string, queryContent: string): string {
  if (!snippet || !queryContent) return snippet;

  const queryTokens = new Set(
    normalizeArabic(queryContent)
      .split(' ')
      .filter(t => t.length > 2) // skip very short tokens
  );

  if (queryTokens.size === 0) return snippet;

  // Split snippet into words, check each normalized form against query tokens
  const words = snippet.split(/(\s+)/);
  return words
    .map(word => {
      if (/^\s+$/.test(word)) return word;
      const norm = normalizeArabic(word);
      if (norm && queryTokens.has(norm)) {
        return `<mark class="bg-yellow-200/60 dark:bg-yellow-500/30 rounded px-0.5">${word}</mark>`;
      }
      return word;
    })
    .join('');
}

// ─── Modal Component ─────────────────────────────────────────────────

export default function ShamelaMatch({ isOpen, onClose, content, currentPage, volume, onFillReferences }: ShamelaModalProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ShamelaResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filledIndex, setFilledIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && content.trim()) {
      performSearch();
    }
    if (!isOpen) {
      setResults(null);
      setError(null);
      setFilledIndex(null);
    }
  }, [isOpen]);

  const performSearch = async () => {
    setLoading(true);
    setResults(null);
    setError(null);
    setFilledIndex(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch('/api/shamela-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: content, currentPage, volume }),
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to search Shamela');

      const scoredResults = (data.results || []).slice(0, 5);
      setResults(scoredResults);

      if (scoredResults.length === 0) {
        setError('Not found in Shamela.ws — please input manually.');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setError('Shamela request timed out. Please try again.');
      } else {
        setError(err.message || 'Failed to contact Shamela');
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleFill = (result: ShamelaResult, index: number) => {
    const parsed = parseIslamicBookTitle(result.book_name);
    const vp = parseVolumeAndPage(result.snippet || '', result.link_to_result || '');

    // Use server-provided volume/page if available, fallback to snippet parsing
    const finalPage = result.page_number || vp.page;
    const finalVolume = result.volume_number || vp.volume;

    onFillReferences({
      matn: parsed.matn,
      sharhTitle: parsed.sharhTitle,
      author: parsed.author || result.author || null,
      isDerivedWork: parsed.isDerivedWork,
      page: finalPage,
      volume: finalVolume,
      sourceUrl: result.link_to_result,
      rawBookName: result.book_name,
    });

    setFilledIndex(index);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="bg-white dark:bg-zinc-900 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl border border-[#E5E7EB] dark:border-zinc-800 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#6197EC]/10 dark:bg-zinc-800 rounded-xl">
                <BookOpen className="w-5 h-5 text-[#18407B] dark:text-zinc-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#1A1A1A] dark:text-white">Shamela Search</h3>
                <p className="text-xs text-[#8E8E8E] dark:text-gray-500">Find source references on Shamela.ws</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5 text-[#8E8E8E]" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-[#18407B] dark:text-zinc-400" />
                <p className="text-sm text-[#8E8E8E] dark:text-gray-500 font-medium">Searching Shamela.ws...</p>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="text-center py-12">
                <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-200 dark:border-amber-800">
                  {error}
                </div>
                <button
                  onClick={performSearch}
                  className="mt-4 px-4 py-2 bg-[#6197EC] text-white text-sm font-bold rounded-xl hover:bg-[#4C81D9] transition-colors"
                >
                  Retry Search
                </button>
              </div>
            )}

            {/* Results */}
            {results && results.length > 0 && !loading && (
              <div className="space-y-5">
                {/* Suggested Match (first result) */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#18407B] dark:text-zinc-400 mb-2 ml-1">
                    Suggested Match
                  </p>
                  <ResultCard
                    result={results[0]}
                    index={0}
                    isFilled={filledIndex === 0}
                    onFill={() => handleFill(results[0], 0)}
                    content={content}
                    isPrimary
                  />
                </div>

                {/* Suggested References (remaining results) */}
                {results.length > 1 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E] dark:text-gray-500 mb-2 ml-1">
                      Suggested References
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      {results.slice(1).map((result, idx) => (
                        <ResultCard
                          key={idx + 1}
                          result={result}
                          index={idx + 1}
                          isFilled={filledIndex === idx + 1}
                          onFill={() => handleFill(result, idx + 1)}
                          content={content}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Result Card ─────────────────────────────────────────────────────

function ResultCard({
  result,
  index,
  isFilled,
  onFill,
  content,
  isPrimary,
}: {
  result: ShamelaResult;
  index: number;
  isFilled: boolean;
  onFill: () => void;
  content: string;
  isPrimary: boolean;
}) {
  const vp = parseVolumeAndPage(result.snippet || '', result.link_to_result || '');
  const page = result.page_number || vp.page;
  const volume = result.volume_number || vp.volume;

  const metaParts: string[] = [];
  if (result.author && result.author !== 'Unknown Author') metaParts.push(result.author);
  if (page) metaParts.push(`Page ${page}`);
  if (volume) metaParts.push(`Vol ${volume}`);
  const metaLine = metaParts.join(' • ');

  const highlightedSnippet = highlightMatchedWords(result.snippet || '', content);

  return (
    <div
      className={`rounded-2xl border transition-all ${
        isPrimary
          ? 'border-[#6197EC]/40 dark:border-zinc-600 bg-[#6197EC]/[0.03] dark:bg-zinc-800/50 p-4'
          : 'border-[#E5E7EB] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3'
      }`}
    >
      {/* Title & Meta */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <h4
            className={`font-bold text-[#1A1A1A] dark:text-white truncate ${
              isPrimary ? 'text-base' : 'text-sm'
            }`}
            dir="auto"
          >
            {result.book_name}
          </h4>
          {metaLine && (
            <p className="text-xs text-[#8E8E8E] dark:text-gray-500 mt-0.5" dir="auto">
              {metaLine}
            </p>
          )}
        </div>
      </div>

      {/* Snippet */}
      <div
        className={`text-xs leading-relaxed bg-[#F5F5F7] dark:bg-zinc-800 rounded-xl p-3 mb-3 ${
          isPrimary ? 'text-[#1A1A1A] dark:text-gray-300' : 'text-[#666] dark:text-gray-400'
        }`}
        dir="rtl"
        dangerouslySetInnerHTML={{ __html: highlightedSnippet }}
      />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isFilled ? (
          <div className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-bold border border-emerald-200 dark:border-emerald-800">
            <Check className="w-3.5 h-3.5" />
            References filled
          </div>
        ) : (
          <button
            type="button"
            onClick={onFill}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              isPrimary
                ? 'bg-[#6197EC] text-white hover:bg-[#4C81D9] shadow-sm'
                : 'bg-[#F5F5F7] dark:bg-zinc-800 text-[#18407B] dark:text-zinc-300 hover:bg-[#E5E7EB] dark:hover:bg-zinc-700 border border-[#E5E7EB] dark:border-zinc-700'
            }`}
          >
            Fill references
          </button>
        )}
        <a
          href={result.link_to_result}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-[#8E8E8E] dark:text-gray-500 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-colors border border-[#E5E7EB] dark:border-zinc-800"
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </a>
      </div>
    </div>
  );
}
