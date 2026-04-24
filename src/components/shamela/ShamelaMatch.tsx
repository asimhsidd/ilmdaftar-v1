import React, { useState } from 'react';
import { Search, Check, X, Loader2 } from 'lucide-react';

interface ShamelaResult {
  title: string;
  book_name: string;
  author: string;
  snippet: string;
  page_number: string | null;
  link_to_result: string;
  score?: number;
}

interface MatchProps {
  content: string;
  onMatchConfirm: (metadata: { book_name: string, author: string, page_number: string | null, source_url: string }) => void;
}

function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u064B-\u065F]/g, "") // Remove harakat (tashkeel)
    .replace(/[أإآ]/g, "ا")          // Normalize Alif
    .replace(/ى/g, "ي")              // Normalize Alif Maqsura to Yaa
    .replace(/ة/g, "ه")              // Normalize Taa Marbuta to Haa
    .replace(/\s+/g, " ")            // Normalize spaces
    .trim()
    .toLowerCase(); // Lowercase just in case of English mix
}

function calculateScore(query: string, result: ShamelaResult): number {
  const normQuery = normalizeArabic(query);
  const normSnippet = normalizeArabic(result.snippet || "");
  
  let score = 0;
  
  // Level 1 — Exact substring
  if (normSnippet.includes(normQuery)) {
    score += 0.3;
  }
  
  // Level 2 — Token overlap
  const queryTokens = normQuery.split(" ").filter(Boolean);
  const snippetTokens = normSnippet.split(" ").filter(Boolean);
  let overlapCount = 0;
  
  for (const t of queryTokens) {
    if (snippetTokens.includes(t)) overlapCount++;
  }
  
  if (queryTokens.length > 0) {
    const tokenOverlap = overlapCount / queryTokens.length;
    score += (tokenOverlap * 0.6);
  }
  
  // position_bonus * 0.1 (bonus if near start)
  const pos = normSnippet.indexOf(normQuery);
  if (pos !== -1) {
    const posBonus = Math.max(0, 1 - (pos / 500));
    score += (posBonus * 0.1);
  }
  
  return score;
}

export default function ShamelaMatch({ content, onMatchConfirm }: MatchProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ShamelaResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<ShamelaResult | null>(null);

  const performSearch = async () => {
    if (!content.trim()) return;
    setLoading(true);
    setResults(null);
    setError(null);

    try {
      const res = await fetch('/api/shamela-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: content })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to search Shamela');
      
      const scoredResults = (data.results || [])
        .map((r: ShamelaResult) => ({ ...r, score: calculateScore(content, r) }))
        .sort((a: ShamelaResult, b: ShamelaResult) => (b.score || 0) - (a.score || 0))
        .slice(0, 5); // Return top 3-5 only (max 5)
        
      setResults(scoredResults);
      if (scoredResults.length === 0) {
         setError("Not found in Shamela.ws, please input manually");
      }
    } catch (err: any) {
      setError(err.message || "Failed to contact Shamela");
    } finally {
      setLoading(false);
    }
  };

  if (!results && !loading && !error) {
    return (
      <button 
        type="button"
        onClick={performSearch}
        className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700 font-medium py-2 px-3 bg-green-50 rounded border border-green-200"
      >
        <Search className="w-4 h-4" />
        Search Shamela for source
      </button>
    );
  }

  return (
    <div className="bg-slate-50 border rounded-lg p-4 my-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-slate-800 flex items-center gap-2">
          <img src="https://shamela.ws/images/logo.png" alt="" className="w-4 h-4 object-contain" onError={(e) => e.currentTarget.style.display='none'} />
          Shamela.ws Matching
        </h4>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>
      
      {error && (
        <div className="text-sm text-amber-600 p-3 bg-amber-50 rounded-md border border-amber-200">
          {error}
        </div>
      )}

      {results && results.length > 0 && !selectedResult && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Please confirm the matching source:</p>
          {results.map((r, i) => (
            <div key={i} className="border bg-white rounded-md p-3 hover:border-blue-300 transition-colors cursor-pointer" onClick={() => setSelectedResult(r)}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold text-slate-800">{r.book_name}</div>
                  <div className="text-sm text-slate-600">Author: {r.author}</div>
                  <div className="text-xs text-slate-400">Score: {(r.score || 0).toFixed(2)}</div>
                </div>
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedResult(r); }}
                  className="bg-blue-600 text-white p-1.5 rounded-md hover:bg-blue-700"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded rtl" style={{ direction: 'rtl' }} dangerouslySetInnerHTML={{ __html: r.snippet }}></div>
            </div>
          ))}
        </div>
      )}

      {selectedResult && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex justify-between items-start mb-3">
             <div className="font-bold text-green-800">Confirmed match: {selectedResult.book_name}</div>
             <button type="button" onClick={() => setSelectedResult(null)} className="text-green-600 hover:text-green-800">
               <X className="w-4 h-4" />
             </button>
          </div>
          <button
             type="button"
             onClick={() => onMatchConfirm({
               book_name: selectedResult.book_name,
               author: selectedResult.author,
               page_number: selectedResult.page_number,
               source_url: selectedResult.link_to_result
             })}
             className="w-full bg-green-600 text-white text-sm font-medium py-2 rounded shadow hover:bg-green-700"
          >
             Auto-fill Metadata
          </button>
        </div>
      )}
    </div>
  );
}
