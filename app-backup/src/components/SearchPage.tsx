import React, { useState, useEffect } from 'react';
import { Search, Copy, Loader2, Trash2, Edit2, GraduationCap, BookOpen, Library, TrendingUp } from 'lucide-react';
import { Fawaid, Science, Book, Sharh, Stats } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';

export default function SearchPage({
  sciences,
  stats,
  onNavigate,
  onUpdate
}: {
  sciences: Science[],
  stats: Stats | null,
  onNavigate: (tab: string) => void,
  onUpdate?: () => void
}) {
  const [query, setQuery] = useState(() => localStorage.getItem('fawaid_search_query') || '');
  const [results, setResults] = useState<Fawaid[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingNote, setEditingNote] = useState<Fawaid | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [editShuruuh, setEditShuruuh] = useState<Sharh[]>([]);
  const [editingScienceId, setEditingScienceId] = useState('');
  const { t, language } = useSettings();
  
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('fawaid_search_filters');
    return saved ? JSON.parse(saved) : {
      scienceId: '',
      bookId: '',
      author: '',
      tag: '',
      pageNumber: ''
    };
  });

  useEffect(() => {
    localStorage.setItem('fawaid_search_query', query);
  }, [query]);

  useEffect(() => {
    localStorage.setItem('fawaid_search_filters', JSON.stringify(filters));
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

  useEffect(() => {
    fetch('/api/books')
      .then(res => res.ok ? res.json() : [])
      .then((data: Book[]) => setAllBooks(Array.isArray(data) ? data : []))
      .catch(() => setAllBooks([]));
  }, []);

  useEffect(() => {
    if (!editingNote?.book_id) {
      setEditShuruuh([]);
      return;
    }

    fetch(`/api/shuruuh?bookId=${editingNote.book_id}`, { headers: { 'Cache-Control': 'no-cache' } })
      .then(res => res.ok ? res.json() : [])
      .then((data: Sharh[]) => {
        const shuruuh = Array.isArray(data) ? data : [];
        setEditShuruuh(shuruuh);
        setEditingNote(prev => {
          if (!prev?.sharh_id) return prev;
          const hasSelectedSharh = shuruuh.some(sharh => sharh.id === prev.sharh_id);
          if (hasSelectedSharh) return prev;
          return { ...prev, sharh_id: undefined, sharh_title: undefined };
        });
      })
      .catch(() => setEditShuruuh([]));
  }, [editingNote?.book_id]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('Delete Fawaid Confirmation'))) return;

    try {
      const res = await fetch(`/api/fawaid/${id}`, { method: 'DELETE' });
      
      if (!res.ok) {
        const error = await res.json();
        alert(error.error || t('Delete Error'));
        return;
      }
      
      setResults(prev => prev.filter(i => i.id !== id));
      if (editingNote?.id === id) {
        setEditingNote(null);
        setEditingScienceId('');
        setEditShuruuh([]);
      }
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error(error);
      alert(t('Delete Error'));
    }
  };

  const handleUpdate = async () => {
    if (!editingNote) return;

    if (!editingNote.book_id || !editingNote.content?.trim()) {
      alert(t('Fill Required Fields'));
      return;
    }

    const updatedNote = { ...editingNote };
    const selectedBook = allBooks.find(book => book.id === updatedNote.book_id);
    const selectedScience =
      sciences.find(science => science.id === Number(editingScienceId)) ||
      (selectedBook ? sciences.find(science => science.id === selectedBook.science_id) : undefined);
    const selectedSharh = editShuruuh.find(sharh => sharh.id === updatedNote.sharh_id);

    const payload = {
      book_id: updatedNote.book_id,
      sharh_id: updatedNote.sharh_id ?? null,
      title: updatedNote.title || '',
      content: updatedNote.content || '',
      page_number: updatedNote.page_number,
      reference: updatedNote.reference,
      author: updatedNote.author,
      question_types: updatedNote.question_types || [],
      keywords: updatedNote.keywords || [],
      questions: updatedNote.questions || [],
      extra_notes: updatedNote.extra_notes,
      volume_number: updatedNote.volume_number,
      language: updatedNote.language || (language === 'ar' ? 'arabic' : 'english')
    };

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/fawaid/${updatedNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || t('Error'));
        return;
      }

      setResults(prev =>
        prev.map(i => {
          if (i.id !== updatedNote.id) return i;

          return {
            ...i,
            ...updatedNote,
            science_id: selectedScience?.id ?? i.science_id,
            science_name: selectedScience?.name ?? i.science_name,
            book_title: selectedBook?.title ?? i.book_title,
            sharh_title: updatedNote.sharh_id ? (selectedSharh?.title ?? i.sharh_title) : undefined
          };
        })
      );
      setEditingNote(null);
      setEditingScienceId('');
      setEditShuruuh([]);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error(error);
      alert(t('Error'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.append('search', query);
      if (filters.scienceId) params.append('scienceId', filters.scienceId);
      if (filters.bookId) params.append('bookId', filters.bookId);
      if (filters.author) params.append('author', filters.author);
      if (filters.tag) params.append('tag', filters.tag);
      if (filters.pageNumber) params.append('pageNumber', filters.pageNumber);
      params.append('language', language === 'ar' ? 'arabic' : 'english');

      const res = await fetch(`/api/fawaid?${params.toString()}`);
      const data = await res.json();
      setResults(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      handleSearch();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [query, filters, language]);

  const copyIndividual = (f: Fawaid) => {
    const ref = f.reference || (f.page_number ? `p. ${f.page_number}` : '');
    const text = `${f.title}\n\n${f.content}\n\n[${f.book_title || 'Unknown Book'}${ref ? ' / ' + ref : ''}]`;
    navigator.clipboard.writeText(text);
    alert(t('Copied to clipboard!'));
  };

  const openEditModal = (note: Fawaid) => {
    const inferredScienceId = note.science_id ?? allBooks.find(book => book.id === note.book_id)?.science_id;
    setEditingScienceId(inferredScienceId ? String(inferredScienceId) : '');
    setEditingNote({ ...note });
  };

  const editModalBooks = editingScienceId
    ? allBooks.filter(book => String(book.science_id) === editingScienceId)
    : [];

  const isEditSaveDisabled = savingEdit || !editingNote?.book_id || !editingNote?.content?.trim();

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-serif font-bold text-[#1A1A1A] dark:text-white">{t('Global Search')}</h2>
        <p className="text-[#8E8E8E] dark:text-gray-400 mt-2">{t('Search Description')}</p>
      </header>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            icon={<GraduationCap className="w-6 h-6" />}
            label={t('Total Sciences')}
            value={stats.totalSciences}
            color="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          />
          <StatCard
            icon={<BookOpen className="w-6 h-6" />}
            label={t('Total Books')}
            value={stats.totalBooks}
            color="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            icon={<Library className="w-6 h-6" />}
            label={t('Total Fawaid')}
            value={stats.totalFawaid}
            color="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
          />
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E5E0] dark:border-zinc-800 shadow-sm space-y-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-[#8E8E8E] dark:text-gray-500" />
          <input 
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('Search Placeholder')}
            className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-2xl pl-14 pr-6 py-5 text-lg focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 pt-4 border-t border-[#F5F5F0] dark:border-zinc-800">
          <select 
            value={filters.scienceId}
            onChange={e => setFilters({...filters, scienceId: e.target.value, bookId: ''})}
            className="bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
          >
            <option value="">{t('All Sciences')}</option>
            {sciences?.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select 
            value={filters.bookId}
            onChange={e => setFilters({...filters, bookId: e.target.value})}
            className="bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
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
            className="bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
          />

          <input 
            type="text"
            placeholder={t('Tag')}
            value={filters.tag}
            onChange={e => setFilters({...filters, tag: e.target.value})}
            className="bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
          />

          <input 
            type="number"
            placeholder={t('Page #')}
            value={filters.pageNumber}
            onChange={e => setFilters({...filters, pageNumber: e.target.value})}
            className="bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
          />

        </div>
      </div>

      {stats && stats.scienceStats && stats.scienceStats.length > 0 && (
        <section className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E5E0] dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-serif font-bold flex items-center gap-2 dark:text-white">
              <TrendingUp className="w-5 h-5 text-[#5A5A40] dark:text-zinc-400" />
              {t('Top Sciences')}
            </h3>
            <button
              onClick={() => onNavigate('explorer')}
              className="text-sm font-medium text-[#5A5A40] dark:text-zinc-400 hover:underline"
            >
              {t('View All')}
            </button>
          </div>
          <div className="space-y-4">
            {stats.scienceStats.slice(0, 5).map((sci, idx) => (
              <div key={idx} className="group">
                <div className="flex justify-between mb-2">
                  <span className="font-medium text-[#4A4A4A] dark:text-gray-300">{sci.name}</span>
                  <span className="text-sm font-bold text-[#5A5A40] dark:text-zinc-400">{sci.count} {t('Notes Count')}</span>
                </div>
                <div className="w-full bg-[#F5F5F0] dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((sci.count / (stats.totalFawaid || 1)) * 100, 100)}%` }}
                    className="bg-[#5A5A40] dark:bg-zinc-500 h-full rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#5A5A40] dark:text-zinc-400 animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {results?.map((f, idx) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.03 }}
                className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-[#E5E5E0] dark:border-zinc-800 shadow-sm hover:border-[#5A5A40] dark:hover:border-zinc-600 transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40] dark:text-zinc-300 bg-[#5A5A40]/10 dark:bg-zinc-800 px-2 py-0.5 rounded">
                        {f.science_name}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E] dark:text-gray-500 bg-[#F5F5F0] dark:bg-zinc-800 px-2 py-0.5 rounded">
                        {f.book_title}
                      </span>
                    </div>
                    <h3 className="text-lg font-serif font-bold dark:text-white">{f.title || t('Untitled Note')}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#8E8E8E] dark:text-gray-500">{f.reference || (f.page_number ? `${t('Page #')} ${f.page_number}` : '')}</span>
                    <button 
                      onClick={() => copyIndividual(f)}
                      className="p-2 bg-[#F5F5F0] dark:bg-zinc-800 text-[#5A5A40] dark:text-zinc-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-[#E5E5E0] dark:hover:bg-zinc-700"
                      title={t('Copy')}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(f)}
                      className="p-2 bg-[#F5F5F0] dark:bg-zinc-800 text-[#5A5A40] dark:text-zinc-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-[#E5E5E0] dark:hover:bg-zinc-700"
                      title={t('Edit')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(f.id)}
                      className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100 dark:hover:bg-red-900/40"
                      title={t('Delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <p className="text-[#4A4A4A] dark:text-gray-300 font-serif italic mb-4 line-clamp-3">
                  "{f.content}"
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-[#F5F5F0] dark:border-zinc-800">
                  <div className="flex gap-1">
                    {f.tags?.map((tag, i) => (
                      <span key={i} className="text-[9px] font-bold text-[#8E8E8E] dark:text-gray-400 bg-[#F5F5F0] dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {editingNote && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-[#E5E5E0] dark:border-zinc-800"
              >
                <h3 className="text-2xl font-serif font-bold mb-4 dark:text-white">{t('Edit Note')}</h3>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 mb-2 block">{t('Classification')}</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={editingScienceId}
                      onChange={e => {
                        const nextScienceId = e.target.value;
                        setEditingScienceId(nextScienceId);
                        setEditingNote(prev =>
                          prev
                            ? {
                                ...prev,
                                science_id: nextScienceId ? parseInt(nextScienceId, 10) : undefined,
                                book_id: 0,
                                sharh_id: undefined,
                                book_title: undefined,
                                sharh_title: undefined
                              }
                            : prev
                        );
                        setEditShuruuh([]);
                      }}
                      className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                    >
                      <option value="">{t('Select Science')}</option>
                      {sciences?.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>

                    <select
                      value={editingNote.book_id ? String(editingNote.book_id) : ''}
                      onChange={e => {
                        const nextBookId = e.target.value ? parseInt(e.target.value, 10) : 0;
                        setEditingNote(prev =>
                          prev
                            ? {
                                ...prev,
                                book_id: nextBookId,
                                sharh_id: undefined,
                                book_title: editModalBooks.find(book => book.id === nextBookId)?.title,
                                sharh_title: undefined
                              }
                            : prev
                        );
                        setEditShuruuh([]);
                      }}
                      className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[#5A5A40] dark:focus:ring-zinc-600 disabled:opacity-50"
                      disabled={!editingScienceId}
                    >
                      <option value="">{t('Select Book')}</option>
                      {editModalBooks.map(book => (
                        <option key={book.id} value={book.id}>{book.title}</option>
                      ))}
                    </select>

                    <select
                      value={editingNote.sharh_id ? String(editingNote.sharh_id) : ''}
                      onChange={e => {
                        const nextSharhId = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        setEditingNote(prev =>
                          prev
                            ? {
                                ...prev,
                                sharh_id: nextSharhId,
                                sharh_title: editShuruuh.find(sharh => sharh.id === nextSharhId)?.title
                              }
                            : prev
                        );
                      }}
                      className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[#5A5A40] dark:focus:ring-zinc-600 disabled:opacity-50"
                      disabled={!editingNote.book_id}
                    >
                      <option value="">{t('General Notes')}</option>
                      {editShuruuh.map(sharh => (
                        <option key={sharh.id} value={sharh.id}>{sharh.title}</option>
                      ))}
                    </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 mb-2 block">{t('Title')}</label>
                    <input
                      value={editingNote.title || ''}
                      onChange={e => setEditingNote(prev => prev ? { ...prev, title: e.target.value } : prev)}
                      className="font-serif font-bold text-lg w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                      placeholder={t('Title Placeholder')}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 mb-2 block">{t('Content')} *</label>
                    <textarea
                      value={editingNote.content || ''}
                      onChange={e => setEditingNote(prev => prev ? { ...prev, content: e.target.value } : prev)}
                      className="w-full h-32 resize-none text-sm font-serif leading-relaxed bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                      placeholder={t('Content Placeholder')}
                      dir="auto"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 mb-2 block">{t('Extra Notes')}</label>
                    <textarea
                      value={editingNote.extra_notes || ''}
                      onChange={e => setEditingNote(prev => prev ? { ...prev, extra_notes: e.target.value } : prev)}
                      className="w-full h-16 resize-none text-xs font-serif leading-relaxed bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                      placeholder={t('Enter Extra Notes')}
                      dir="auto"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 mb-2 block">{t('Reference & Author')}</label>
                    <div className="flex gap-2">
                    <input
                      value={editingNote.author || ''}
                      onChange={e => setEditingNote(prev => prev ? { ...prev, author: e.target.value } : prev)}
                      className="flex-1 text-xs font-bold bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-2 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                      placeholder={t('Author Placeholder')}
                    />
                    <input
                      type="text"
                      value={editingNote.reference || ''}
                      onChange={e => setEditingNote(prev => prev ? { ...prev, reference: e.target.value } : prev)}
                      className="flex-1 text-xs font-bold bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-2 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                      placeholder={t('Reference')}
                    />
                  </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setEditingNote(null);
                      setEditingScienceId('');
                      setEditShuruuh([]);
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F0] dark:hover:bg-zinc-800 transition-all"
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={isEditSaveDisabled}
                    className="px-4 py-2 bg-[#5A5A40] text-white rounded-xl text-sm font-bold hover:bg-[#4A4A30] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : t('Save')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {!loading && results.length === 0 && (
          <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-[#E5E5E0] dark:border-zinc-800 border-dashed">
            <p className="text-[#8E8E8E] dark:text-gray-500">{t('No results found')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: any,
  label: string,
  value: number,
  color: string
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-[#E5E5E0] dark:border-zinc-800 shadow-sm flex items-center gap-5">
      <div className={`p-4 rounded-2xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-[#8E8E8E] dark:text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-[#1A1A1A] dark:text-white">{value}</p>
      </div>
    </div>
  );
}
