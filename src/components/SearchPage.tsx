import React, { useState, useEffect } from 'react';
import { Search, Copy, Loader2, Trash2, Edit2, GraduationCap, BookOpen, Library, TrendingUp, X, Sparkles, Maximize2, ExternalLink } from 'lucide-react';
import { Fawaid, Science, Book, Sharh, Stats } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { useModal } from '../contexts/ModalContext';
import ShamelaMatch from './shamela/ShamelaMatch';

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
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'smart' | 'exact'>('smart');
  const [results, setResults] = useState<Fawaid[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedTag, setSelectedTag] = useState('');
  const [expansions, setExpansions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingNote, setEditingNote] = useState<Fawaid | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [books, setBooks] = useState<Book[]>([]);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [editShuruuh, setEditShuruuh] = useState<Sharh[]>([]);
  const [editingScienceId, setEditingScienceId] = useState('');
  const { t, language } = useSettings();
  const { showModal } = useModal();
  const devMode = typeof window !== 'undefined' && localStorage.getItem('fawaid_dev_mode') === 'true';
  

  const [filters, setFilters] = useState(() => ({
    scienceId: '',
    bookId: '',
    author: '',
    status: ''
  }));

  const [shamelaTargetContent, setShamelaTargetContent] = useState<string | null>(null);
  const [isShamelaModalOpen, setIsShamelaModalOpen] = useState(false);

  const [authors, setAuthors] = useState<string[]>([]);

  // Clear localStorage when component mounts to ensure fresh search each time
  useEffect(() => {
    localStorage.removeItem('fawaid_search_query');
    localStorage.removeItem('fawaid_search_tag');
    localStorage.removeItem('fawaid_search_filters');
  }, []);

  useEffect(() => {
    if (filters.scienceId) {
      fetch(`/api/books?scienceId=${filters.scienceId}`)
        .then(res => res.json())
        .then(setBooks)
        .catch(() => setBooks([]));
    } else {
      setBooks(allBooks);
    }
  }, [filters.scienceId, allBooks]);

  useEffect(() => {
    fetch('/api/books')
      .then(res => res.ok ? res.json() : [])
      .then((data: Book[]) => setAllBooks(Array.isArray(data) ? data : []))
      .catch(() => setAllBooks([]));

    fetch('/api/authors')
      .then(res => res.ok ? res.json() : [])
      .then((data: string[]) => setAuthors(Array.isArray(data) ? data : []))
      .catch(() => setAuthors([]));
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
    if ((await showModal({ type: 'confirm', title: t ? t('Confirm') : 'Confirm', message: t('Delete Fawaid Confirmation') })) !== 'confirm') return;

    try {
      const res = await fetch(`/api/fawaid/${id}`, { method: 'DELETE' });
      
      if (!res.ok) {
        const error = await res.json();
        await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: error.error || t('Delete Error') });
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
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Delete Error') });
    }
  };

  const handleUpdate = async () => {
    if (!editingNote) return;

    if (!editingNote.book_id || !editingNote.content?.trim()) {
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Fill Required Fields') });
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
      language: updatedNote.language || (language === 'ar' ? 'arabic' : 'english'),
      status: updatedNote.status || 'formatted'
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
        await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: error.error || t('Error') });
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
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Error') });
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    if (query.trim().length >= 2) {
      const timer = setTimeout(() => {
        fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`)
          .then(r => r.json())
          .then(data => setSuggestions(Array.isArray(data) ? data : []))
          .catch(() => setSuggestions([]));
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSuggestions([]);
    }
  }, [query]);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.scienceId) params.append('scienceId', filters.scienceId);
      if (filters.bookId) params.append('bookId', filters.bookId);
      if (filters.author) params.append('author', filters.author);
      if (filters.status) params.append('status', filters.status);
      if (selectedTag) params.append('tag', selectedTag);
      params.append('mode', searchMode);

      if (query.trim()) {
        params.append('search', query.trim());
        const res = await fetch(`/api/search/semantic?${params.toString()}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults(data.results || []);
        setExpansions(data.expansions || []);
      } else {
        const res = await fetch(`/api/fawaid?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch fawaid');
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setExpansions([]);
      }
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      handleSearch();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [query, filters, language, searchMode, selectedTag]);

  const copyIndividual = async (f: Fawaid) => {
    const ref = f.reference || (f.page_number ? `p. ${f.page_number}` : '');
    const text = `${f.title}\n\n${f.content}\n\n[${f.book_title || 'Unknown Book'}${ref ? ' / ' + ref : ''}]`;
    navigator.clipboard.writeText(text);
    await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Copied to clipboard!') });
  };

  const openEditModal = (note: Fawaid) => {
    const inferredScienceId = note.science_id ?? allBooks.find(book => book.id === note.book_id)?.science_id;
    setEditingScienceId(inferredScienceId ? String(inferredScienceId) : '');
    setEditingNote({ ...note });
  };

  const viewInBook = (f: Fawaid) => {
    localStorage.setItem('fawaid_open_explorer', 'true');
    localStorage.setItem('fawaid_explorer_view', 'fawaid');
    localStorage.setItem('fawaid_explorer_science', JSON.stringify({id: f.science_id, name: f.science_name}));
    localStorage.setItem('fawaid_explorer_book', JSON.stringify({id: f.book_id, title: f.book_title, science_id: f.science_id}));
    localStorage.setItem('fawaid_explorer_sharh', JSON.stringify(f.sharh_id ? {id: f.sharh_id, title: f.sharh_title} : null));
    localStorage.setItem('fawaid_explorer_open_faidah', JSON.stringify(f));
    onNavigate('explorer');
  };

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const editModalBooks = editingScienceId
    ? allBooks.filter(book => String(book.science_id) === editingScienceId)
    : [];

  const isEditSaveDisabled = savingEdit || !editingNote?.book_id || !editingNote?.content?.trim();

  return (
    <div className="space-y-8 relative">
      <header className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl montserrat-bold text-[#1A1A1A] dark:text-white">{t('Global Search')}</h2>
          <p className="text-[#8E8E8E] dark:text-gray-400 mt-2">{t('Search Description')}</p>
        </div>
        <button 
          onClick={() => onNavigate('dashboard')}
          className="p-2 text-[#8E8E8E] hover:text-[#1A1A1A] dark:hover:text-white transition-colors bg-[#F5F5F7] dark:bg-zinc-800 rounded-full"
          title="Back to Dashboard"
        >
          <X className="w-6 h-6" />
        </button>
      </header>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
            icon={<TrendingUp className="w-6 h-6" />}
            label={t('Needs Formatting')}
            value={stats.needsFormatting || 0}
            color="bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
          />
          <StatCard
            icon={<Library className="w-6 h-6" />}
            label={t('Total Fawaid')}
            value={stats.totalFawaid}
            color="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
          />
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E7EB] dark:border-zinc-800 shadow-sm space-y-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-[#8E8E8E] dark:text-gray-500" />
          <input 
            type="text"
            autoFocus
            value={query}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('Search Placeholder')}
            className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-2xl pl-14 pr-6 py-5 text-lg focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 transition-all"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-[#E5E7EB] dark:border-zinc-800 rounded-xl shadow-lg z-10 overflow-hidden">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setQuery(s);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 text-[#1A1A1A] dark:text-white transition-colors"
                >
                  <Search className="inline-block w-4 h-4 mr-2 text-[#8E8E8E]" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedTag && (
          <div className="flex items-center gap-2 text-xs font-bold text-[#18407B] dark:text-zinc-300">
            <span className="bg-[#F5F5F7] dark:bg-zinc-800 px-3 py-1 rounded-full">Tag: #{selectedTag}</span>
            <button
              onClick={() => setSelectedTag('')}
              className="px-2 py-1 rounded bg-red-50 dark:bg-red-900/30 text-red-600"
            >
              {t('Clear')}
            </button>
          </div>
        )}

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="searchMode"
              value="smart"
              checked={searchMode === 'smart'}
              onChange={() => setSearchMode('smart')}
              className="text-[#18407B] focus:ring-[#6197EC]"
            />
            <span className="text-sm font-medium dark:text-gray-300">{t('Smart Mode')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="searchMode"
              value="exact"
              checked={searchMode === 'exact'}
              onChange={() => setSearchMode('exact')}
              className="text-[#18407B] focus:ring-[#6197EC]"
            />
            <span className="text-sm font-medium dark:text-gray-300">{t('Exact Match')}</span>
          </label>
        </div>

        {expansions.length > 0 && (
          <div className="text-sm font-medium">
            <span className="text-[#8E8E8E] dark:text-gray-400 mr-2">{t('Did you mean:')}</span>
            <div className="inline-flex gap-2 flex-wrap mt-1 lg:mt-0">
              {expansions.map((exp, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(exp)}
                  className="px-3 py-1 bg-[#F5F5F7] dark:bg-zinc-800 text-[#18407B] dark:text-zinc-300 rounded-lg hover:bg-[#E5E7EB] dark:hover:bg-zinc-700 transition-colors"
                >
                  {exp}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-4 pt-4 border-t border-[#F5F5F7] dark:border-zinc-800">
          <select 
            value={filters.scienceId}
            onChange={e => setFilters({...filters, scienceId: e.target.value, bookId: ''})}
            className="flex-1 min-w-[200px] bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
          >
            <option value="">{t('All Sciences')}</option>
            {sciences?.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select 
            value={filters.bookId}
            onChange={e => setFilters({...filters, bookId: e.target.value})}
            className="flex-1 min-w-[200px] bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
          >
            <option value="">{t('All Books')}</option>
            {books?.map(b => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>

          <select 
            value={filters.author}
            onChange={e => setFilters({...filters, author: e.target.value})}
            className="flex-1 min-w-[200px] bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
          >
            <option value="">{t('All Authors')}</option>
            {authors?.map((author, index) => (
              <option key={index} value={author}>{author}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={e => setFilters({ ...filters, status: e.target.value })}
            className="flex-1 min-w-[180px] bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
          >
            <option value="">{t('All Statuses')}</option>
            <option value="formatted">{t('Formatted')}</option>
            <option value="unformatted">{t('Unformatted')}</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#18407B] dark:text-zinc-400 animate-spin" />
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
                className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-[#E5E7EB] dark:border-zinc-800 shadow-sm hover:border-[#6197EC] dark:hover:border-zinc-600 transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#18407B] dark:text-zinc-300 bg-[#6197EC]/10 dark:bg-zinc-800 px-2 py-0.5 rounded">
                      {f.science_name}
                    </span>
                    <span className="text-[10px] sm:text-sm uppercase tracking-widest text-[#8E8E8E] dark:text-gray-500 bg-[#F5F5F7] dark:bg-zinc-800 px-2 py-0.5 rounded aref-ruqaa-regular">
                      {f.book_title}
                    </span>
                    {(f as any).semanticScore !== undefined && (
                      <span className="text-[10px] flex items-center gap-1 font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded" title="Semantic Match Score">
                        <Sparkles className="w-3 h-3" />
                        {Number((f as any).semanticScore).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    <button 
                      onClick={() => toggleExpand(f.id)}
                      className="p-2 bg-[#F5F5F7] dark:bg-zinc-800 text-[#18407B] dark:text-zinc-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-[#E5E7EB] dark:hover:bg-zinc-700"
                      title={t('Expand / Collapse')}
                    >
                      <Maximize2 className={`w-4 h-4 transition-transform ${expandedIds.has(f.id) ? 'rotate-180 scale-90' : ''}`} />
                    </button>
                    <button 
                      onClick={() => viewInBook(f)}
                      className="p-2 bg-[#F5F5F7] dark:bg-zinc-800 text-[#18407B] dark:text-zinc-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-[#E5E7EB] dark:hover:bg-zinc-700"
                      title={t('View in Book')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => copyIndividual(f)}
                      className="p-2 bg-[#F5F5F7] dark:bg-zinc-800 text-[#18407B] dark:text-zinc-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-[#E5E7EB] dark:hover:bg-zinc-700"
                      title={t('Copy')}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(f)}
                      className="p-2 bg-[#F5F5F7] dark:bg-zinc-800 text-[#18407B] dark:text-zinc-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-[#E5E7EB] dark:hover:bg-zinc-700"
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
                    {devMode && (
                      <button 
                        onClick={() => { setShamelaTargetContent(f.content); setIsShamelaModalOpen(true); }}
                        className="p-2 bg-[#6197EC]/10 dark:bg-zinc-800 text-[#18407B] dark:text-zinc-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-[#6197EC]/20 dark:hover:bg-zinc-700"
                        title={t('Search Shamela')}
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="text-xl aref-ruqaa-regular dark:text-white text-center mb-6 leading-relaxed" dir="rtl">{f.title || t('Untitled Note')}</h3>
                
                <p className={`text-[#4A4A4A] dark:text-gray-300 scheherazade-new-regular mb-4 text-right transition-all leading-relaxed whitespace-pre-wrap ${expandedIds.has(f.id) ? '' : 'line-clamp-3'}`} dir="rtl">
                  {f.content}
                </p>

                <div className="flex flex-col gap-2 pt-4 border-t border-[#F5F5F7] dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1 flex-wrap">
                      {f.tags?.map((tag, i) => (
                        <span key={i} className="text-[9px] font-bold text-[#8E8E8E] dark:text-gray-400 bg-[#F5F5F7] dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                      <span className="text-[10px] text-[#8E8E8E] dark:text-gray-500 font-bold">
                        {t('Linked:')} {f.connections?.length || 0}
                      </span>
                      {f.reference || f.page_number ? (
                        <span className="text-xs font-bold text-[#8E8E8E] dark:text-gray-500">{f.reference || (f.page_number ? `${t('Page #')} ${f.page_number}` : '')}</span>
                      ) : null}
                      {(f as any)._score !== undefined && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-2 py-0.5 rounded">
                          Score: {((f as any)._score).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  {(f as any).match_reasons && (f as any).match_reasons.length > 0 && (
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded-lg inline-block self-start">
                      {t('Matched because:')} {(f as any).match_reasons.join(', ')}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {devMode && isShamelaModalOpen && shamelaTargetContent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-[#E5E7EB] dark:border-zinc-800"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl montserrat-bold dark:text-white flex items-center gap-3">
                    <img src="https://shamela.ws/images/logo.png" alt="Shamela" className="w-8 h-8" />
                    {t('Shamela Search')}
                  </h3>
                  <button onClick={() => setIsShamelaModalOpen(false)} className="p-2 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 rounded-full transition-colors">
                    <X className="w-6 h-6 dark:text-white" />
                  </button>
                </div>
                
                <div className="bg-[#F5F5F7] dark:bg-zinc-800/50 p-6 rounded-3xl mb-8 border border-[#E5E7EB] dark:border-zinc-800">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E8E] dark:text-gray-500 mb-3">{t('Searching Content:')}</p>
                  <p className="scheherazade-new-regular text-xl text-right leading-relaxed" dir="rtl">{shamelaTargetContent}</p>
                </div>

                <ShamelaMatch 
                  content={shamelaTargetContent}
                  onMatchConfirm={async (metadata) => {
                    // Handle metadata match from search page (e.g. update existing note)
                    if (editingNote) {
                       setEditingNote({
                         ...editingNote,
                         author: metadata.author,
                         page_number: metadata.page_number ? parseInt(metadata.page_number) : undefined,
                         reference: metadata.source_url
                       });
                    }
                    // For now just show info or trigger update if we had a specific result targeted
                    await showModal({ type: 'alert', title: 'Shamela Match', message: `Matched with: ${metadata.book_name}. You can copy this data manually or edit the note.` });
                  }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
                className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-[#E5E7EB] dark:border-zinc-800"
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
                      className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
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
                      className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[#6197EC] dark:focus:ring-zinc-600 disabled:opacity-50"
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
                      className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[#6197EC] dark:focus:ring-zinc-600 disabled:opacity-50"
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
                      className="aref-ruqaa-regular text-2xl w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                      placeholder={t('Title Placeholder')}
                      dir="auto"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 mb-2 block">{t('Content')} *</label>
                    <textarea
                      value={editingNote.content || ''}
                      onChange={e => setEditingNote(prev => prev ? { ...prev, content: e.target.value } : prev)}
                      className="w-full h-32 resize-none text-xl scheherazade-new-regular leading-relaxed bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                      placeholder={t('Content Placeholder')}
                      dir="auto"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 mb-2 block">{t('Extra Notes')}</label>
                    <textarea
                      value={editingNote.extra_notes || ''}
                      onChange={e => setEditingNote(prev => prev ? { ...prev, extra_notes: e.target.value } : prev)}
                      className="w-full h-16 resize-none text-lg scheherazade-new-regular leading-relaxed bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
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
                      className="flex-1 text-xs font-bold bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-2 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                      placeholder={t('Author Placeholder')}
                    />
                    <input
                      type="text"
                      value={editingNote.reference || ''}
                      onChange={e => setEditingNote(prev => prev ? { ...prev, reference: e.target.value } : prev)}
                      className="flex-1 text-xs font-bold bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-2 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
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
                    className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all"
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={isEditSaveDisabled}
                    className="px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : t('Save')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {!loading && results.length === 0 && (
          <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 border-dashed">
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
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-[#E5E7EB] dark:border-zinc-800 shadow-sm flex items-center gap-5">
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
