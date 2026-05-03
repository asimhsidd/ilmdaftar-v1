import React, { useState, useEffect } from 'react';
import { Science, Fawaid } from '../types';
import { Sparkles, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';

interface RevisionSuggestionsProps {
  sciences: Science[];
  onReview: () => void;
}

export default function RevisionSuggestions({ sciences, onReview }: RevisionSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Fawaid[]>([]);
  const [loading, setLoading] = useState(false);
  const { t, language } = useSettings();

  const generateSuggestions = async () => {
    setLoading(true);
    try {
      const languageParam = language === 'ar' ? 'arabic' : 'english';
      const res = await fetch(`/api/fawaid?t=${new Date().getTime()}&language=${languageParam}`);
      const data: Fawaid[] = await res.json();
      
      const now = new Date().getTime();

      const getOverdueAmount = (note: Fawaid) => {
        if (!note.lastReviewedAt) return Infinity;
        const lastReviewed = new Date(note.lastReviewedAt).getTime();
        const diffDays = (now - lastReviewed) / (1000 * 60 * 60 * 24);
        
        const threshold = note.priority === 'red' ? 2 : note.priority === 'yellow' ? 4 : 6;
        return diffDays - threshold;
      };

      const sortedData = [...data].sort((a, b) => {
        const overdueA = getOverdueAmount(a);
        const overdueB = getOverdueAmount(b);
        
        const isDueA = overdueA > -1;
        const isDueB = overdueB > -1;
        
        if (isDueA && isDueB) {
          return overdueB - overdueA;
        }
        
        if (isDueA && !isDueB) return -1;
        if (!isDueA && isDueB) return 1;
        
        const p: Record<string, number> = { red: 0, yellow: 1, green: 2 };
        const pA = p[a.priority || 'green'] ?? 2;
        const pB = p[b.priority || 'green'] ?? 2;
        
        if (pA !== pB) {
          return pA - pB;
        }
        
        return overdueB - overdueA;
      });

      setSuggestions(sortedData.slice(0, 5));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateSuggestions();
  }, [language]);

  const getRevisionStatus = (note: Fawaid) => {
    if (!note.lastReviewedAt) return { label: t('Never Reviewed'), color: 'bg-red-500' };
    const diffDays = (new Date().getTime() - new Date(note.lastReviewedAt).getTime()) / (1000 * 60 * 60 * 24);
    const threshold = note.priority === 'red' ? 2 : note.priority === 'yellow' ? 4 : 6;
    const overdue = diffDays - threshold;
    
    if (overdue >= 1) return { label: `${t('Overdue by')} ${Math.floor(overdue)} ${t('days')}`, color: 'bg-red-500' };
    if (overdue > -1) return { label: t('Due Today'), color: 'bg-yellow-400' };
    
    const baseLabel = note.priority === 'red' ? t('Poor') : note.priority === 'yellow' ? t('Medium') : t('Strong');
    const baseColor = note.priority === 'red' ? 'bg-red-500' : note.priority === 'yellow' ? 'bg-yellow-400' : 'bg-green-500';
    return { label: baseLabel, color: baseColor };
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-[#1A1A1A] dark:text-white">{t('Revision Suggestions Header')}</h2>
          <p className="text-[#8E8E8E] dark:text-gray-400 mt-2">{t('Revision Suggestions Description')}</p>
        </div>
        <button 
          onClick={generateSuggestions}
          className="p-3 bg-white dark:bg-zinc-800 border border-[#E5E7EB] dark:border-zinc-700 rounded-2xl hover:bg-[#F5F5F7] dark:hover:bg-zinc-700 transition-all"
        >
          <RefreshCw className={`w-5 h-5 text-[#18407B] dark:text-zinc-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-[#18407B] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {suggestions.map((note, idx) => {
            const status = getRevisionStatus(note);
            return (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 shadow-sm hover:border-[#6197EC] dark:hover:border-zinc-600 transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500 rounded-xl">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E] dark:text-gray-500 block">
                        {t('Suggested for Review')}
                      </span>
                      <h3 className="text-lg font-serif font-bold dark:text-white">{note.title || t('Untitled Note')}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#8E8E8E] dark:text-gray-500">{t('Revision Status')}: {status.label}</span>
                    <div className={`w-3 h-3 rounded-full ${status.color}`} title={status.label} />
                  </div>
                </div>

              <div className="pl-11">
                <p className="text-[#4A4A4A] dark:text-gray-300 font-serif italic mb-4 line-clamp-2">
                  "{note.content}"
                </p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#8E8E8E] dark:text-gray-500">
                    <span className="bg-[#F5F5F7] dark:bg-zinc-800 px-2 py-1 rounded-md">{note.book_title}</span>
                    <span>•</span>
                    <span>{note.reference || (note.page_number ? `${t('Page #')} ${note.page_number}` : '')}</span>
                  </div>
                  
                  <button 
                    onClick={onReview}
                    className="flex items-center gap-1 text-sm font-bold text-[#18407B] dark:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all hover:gap-2"
                  >
                    {t('Review Now')} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
            );
          })}

          {suggestions.length === 0 && (
            <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 border-dashed">
              <p className="text-[#8E8E8E] dark:text-gray-500">{t('No notes available')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
