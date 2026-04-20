import React, { useState, useEffect } from 'react';
import { RefreshCw, ChevronRight, BookOpen, Eye, EyeOff, Loader2, ArrowRight, Filter } from 'lucide-react';
import { Fawaid, Science, Book } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { Rating } from 'ts-fsrs';
import { getNextIntervals, gradeFawaid } from '../utils/fsrs';

export default function ReviewMode({ sciences }: { sciences: Science[] }) {
  const [fawaid, setFawaid] = useState<Fawaid[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showContent, setShowContent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const { t, language } = useSettings();
  
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('fawaid_review_filters');
    return saved ? JSON.parse(saved) : {
      scienceId: '',
      bookId: '',
      author: '',
      tag: ''
    };
  });

  useEffect(() => {
    localStorage.setItem('fawaid_review_filters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    if (filters.scienceId) {
      fetch(`/api/books?scienceId=${filters.scienceId}`)
        .then(res => res.json())
        .then(setBooks);
    } else {
      setBooks([]);
    }
  }, [filters.scienceId]);

  const fetchFawaid = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('due_only', 'true');
      if (filters.scienceId) params.append('scienceId', filters.scienceId);
      if (filters.bookId) params.append('bookId', filters.bookId);
      if (filters.tag) params.append('tag', filters.tag);
      if (filters.author) params.append('author', filters.author);
      params.append('language', language === 'ar' ? 'arabic' : 'english');

      const res = await fetch(`/api/fawaid?${params.toString()}`);
      const data = await res.json();
      const shuffled = data.sort(() => Math.random() - 0.5);
      setFawaid(shuffled);
      setCurrentIndex(0);
      setShowContent(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFawaid();
  }, [language]); // Initial load and language changes

  const handleGrade = async (rating: Rating) => {
    if (!currentNote) return;

    const fsrsPatch = gradeFawaid(currentNote, rating);
    
    await fetch(`/api/fawaid/${currentNote.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fsrsPatch)
    });

    if (currentIndex < fawaid.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setShowContent(false);
    } else {
      fetchFawaid();
    }
  };

  const currentNote = fawaid[currentIndex];

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-[#1A1A1A] dark:text-white">{t('Review Mode')}</h2>
          <p className="text-[#8E8E8E] dark:text-gray-400 mt-2">{t('Review Description')}</p>
        </div>
        <button 
          onClick={fetchFawaid}
          className="p-3 bg-white dark:bg-zinc-800 border border-[#E5E5E0] dark:border-zinc-700 rounded-2xl hover:bg-[#F5F5F0] dark:hover:bg-zinc-700 transition-all"
          title={t('Reload Shuffle')}
        >
          <RefreshCw className={`w-5 h-5 text-[#5A5A40] dark:text-zinc-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Filters */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-[#E5E5E0] dark:border-zinc-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[#8E8E8E] dark:text-gray-500 uppercase tracking-wider mb-2">
          <Filter className="w-4 h-4" /> {t('Filters')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <select 
            value={filters.scienceId}
            onChange={e => setFilters({...filters, scienceId: e.target.value, bookId: ''})}
            className="bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
          >
            <option value="">{t('All Sciences')}</option>
            {sciences?.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          
          <select 
            value={filters.bookId}
            onChange={e => setFilters({...filters, bookId: e.target.value})}
            className="bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
            disabled={!filters.scienceId}
          >
            <option value="">{t('All Books')}</option>
            {books?.map(b => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>

          <input 
            type="text"
            placeholder={t('Author')}
            value={filters.author}
            onChange={e => setFilters({...filters, author: e.target.value})}
            className="bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
          />

          <input 
            type="text"
            placeholder={t('Tag')}
            value={filters.tag}
            onChange={e => setFilters({...filters, tag: e.target.value})}
            className="bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
          />
        </div>
        <div className="flex justify-end">
          <button 
            onClick={fetchFawaid}
            className="px-6 py-2 bg-[#5A5A40] dark:bg-zinc-700 text-white rounded-xl text-sm font-bold hover:bg-[#4A4A30] dark:hover:bg-zinc-600 transition-all"
          >
            {t('Apply Filters')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-[#5A5A40] dark:text-zinc-400 animate-spin" />
        </div>
      ) : currentNote ? (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-[40px] p-12 border border-[#E5E5E0] dark:border-zinc-800 shadow-xl shadow-[#5A5A40]/5 dark:shadow-none relative overflow-hidden min-h-[400px] flex flex-col">
            <div className="absolute top-0 left-0 w-full h-2 bg-[#5A5A40]/10 dark:bg-zinc-800">
              <motion.div 
                className="h-full bg-[#5A5A40] dark:bg-zinc-500"
                initial={{ width: 0 }}
                animate={{ width: `${((currentIndex + 1) / fawaid.length) * 100}%` }}
              />
            </div>

            {/* Front of Card: Title */}
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8">
              <h4 className="text-3xl font-serif font-bold text-[#1A1A1A] dark:text-white leading-tight">
                {currentNote.title || t('Untitled Note')}
              </h4>

              <AnimatePresence mode="wait">
                {!showContent ? (
                  <motion.button
                    key="reveal"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    onClick={() => setShowContent(true)}
                    className="group flex flex-col items-center gap-4 mt-8"
                  >
                    <div className="p-6 bg-[#F5F5F0] dark:bg-zinc-800 rounded-full group-hover:bg-[#5A5A40] dark:group-hover:bg-zinc-700 group-hover:text-white transition-all shadow-sm">
                      <Eye className="w-8 h-8 dark:text-white" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-[#8E8E8E] dark:text-gray-500">{t('Reveal Answer')}</span>
                  </motion.button>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8 w-full"
                  >
                    <div className="w-full h-px bg-[#E5E5E0] dark:bg-zinc-800" />
                    
                    <p className="text-xl font-serif leading-relaxed text-[#4A4A4A] dark:text-gray-300">
                      {currentNote.content}
                    </p>
                    
                    <div className="bg-[#F5F5F0] dark:bg-zinc-800 rounded-2xl p-6 text-center">
                      <p className="font-serif font-bold text-[#5A5A40] dark:text-zinc-300 text-lg">
                        {currentNote.book_title}
                      </p>
                      {currentNote.sharh_title && (
                        <p className="text-sm text-[#8E8E8E] dark:text-gray-400 font-medium mt-1">
                          {t('Sharh')}: {currentNote.sharh_title}
                        </p>
                      )}
                      <p className="text-sm text-[#8E8E8E] dark:text-gray-500 font-bold mt-1">
                        {currentNote.reference || (currentNote.page_number ? `${t('Page #')} ${currentNote.page_number}` : '')}
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2">
                      {currentNote.tags?.map((tag, i) => (
                        <span key={i} className="text-xs font-bold text-[#5A5A40] dark:text-zinc-300 bg-[#5A5A40]/10 dark:bg-zinc-800 px-3 py-1 rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {showContent && currentNote && (
              <div className="grid grid-cols-4 gap-2 mt-8">
                {Object.entries({
                  [Rating.Again]: { color: 'bg-red-500 hover:bg-red-600', label: t('Again') },
                  [Rating.Hard]: { color: 'bg-orange-500 hover:bg-orange-600', label: t('Hard') },
                  [Rating.Good]: { color: 'bg-green-500 hover:bg-green-600', label: t('Good') },
                  [Rating.Easy]: { color: 'bg-blue-500 hover:bg-blue-600', label: t('Easy') }
                }).map(([rating, details]) => (
                  <button
                    key={rating}
                    onClick={() => handleGrade(Number(rating))}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all shadow-md text-white ${details.color}`}
                  >
                    <span className="text-xs font-bold opacity-90 mb-1">
                      {getNextIntervals(currentNote)[Number(rating) as Rating]}
                    </span>
                    <span className="font-bold text-sm">{details.label}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-12 pt-8 border-t border-[#F5F5F0] dark:border-zinc-800 flex justify-between items-center">
              <span className="text-xs font-bold text-[#8E8E8E] dark:text-gray-500">{t('Card')} {currentIndex + 1} {t('of')} {fawaid.length}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-[#E5E5E0] dark:border-zinc-800 border-dashed">
          <p className="text-[#8E8E8E] dark:text-gray-500">{t('No notes found')}</p>
        </div>
      )}

      {/* Revision Suggestions Section */}
      <div className="mt-16 border-t border-[#E5E5E0] dark:border-zinc-800 pt-16">
        {/* RevisionSuggestions has been replaced by native FSRS scheduling */}
      </div>
    </div>
  );
}
