import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  Loader2, 
  Check, 
  X, 
  AlertCircle, 
  Plus,
  Book,
  PenTool,
  Image as ImageIcon,
  MessageSquare,
  Wand2,
  Languages
} from 'lucide-react';
import { Science, Book as BookType, Sharh } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import NewItemModal from './NewItemModal';

import { performOCR, suggestTitleAndTags, translateContent } from '../services/geminiService';

const getExplorerTaxonomyPrefill = () => {
  try {
    const selectedScience = localStorage.getItem('fawaid_explorer_science');
    const selectedBook = localStorage.getItem('fawaid_explorer_book');
    const selectedSharh = localStorage.getItem('fawaid_explorer_sharh');

    const prefill: { scienceId?: string; bookId?: string; sharhId?: string } = {};

    if (selectedScience) {
      const parsedScience = JSON.parse(selectedScience);
      if (parsedScience?.id) {
        prefill.scienceId = String(parsedScience.id);
      }
    }

    if (selectedBook) {
      const parsedBook = JSON.parse(selectedBook);
      if (parsedBook?.id) {
        prefill.bookId = String(parsedBook.id);
      }
    }

    if (selectedSharh) {
      const parsedSharh = JSON.parse(selectedSharh);
      if (parsedSharh?.id === -1) {
        prefill.sharhId = '';
      } else if (parsedSharh?.id) {
        prefill.sharhId = String(parsedSharh.id);
      }
    }

    return prefill;
  } catch {
    return {};
  }
};

const getLockedExplorerTaxonomy = () => {
  const prefill = getExplorerTaxonomyPrefill();
  const scienceId = prefill.scienceId || '';
  const bookId = prefill.bookId || '';
  const sharhId = prefill.sharhId || '';

  if (!scienceId) {
    return { scienceId: '', bookId: '', sharhId: '' };
  }
  if (!bookId) {
    return { scienceId, bookId: '', sharhId: '' };
  }

  return { scienceId, bookId, sharhId };
};

interface CaptureProps {
  sciences: Science[];
  onSave: () => void;
  // Optional props for modal mode (when used from Explorer)
  prefilledScience?: Science;
  prefilledBook?: BookType;
  prefilledSharh?: Sharh | null;
  isModal?: boolean;
  onCancel?: () => void;
}

export default function Capture({
  sciences,
  onSave,
  prefilledScience,
  prefilledBook,
  prefilledSharh,
  isModal = false,
  onCancel
}: CaptureProps) {
  const [mode, setMode] = useState<'ocr' | 'manual'>('ocr');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<{
    extractedText: string;
    suggestedTitle: string;
    suggestedTags: string[];
  } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false);

  const [formData, setFormData] = useState(() => {
    // In modal mode, use prefilled props directly
    if (isModal && prefilledScience && prefilledBook) {
      return {
        scienceId: String(prefilledScience.id),
        bookId: String(prefilledBook.id),
        sharhId: prefilledSharh && prefilledSharh.id !== -1 ? String(prefilledSharh.id) : '',
        author: '',
        volumeNumber: '',
        pageNumber: '',
        tabah: '',
        title: '',
        content: '',
        extra_notes: '',
        tags: [] as string[]
      };
    }

    // Standalone mode: use localStorage
    const lockedTaxonomy = getLockedExplorerTaxonomy();

    const initialState = {
      scienceId: lockedTaxonomy.scienceId,
      bookId: lockedTaxonomy.bookId,
      sharhId: lockedTaxonomy.sharhId,
      author: '',
      volumeNumber: '',
      pageNumber: '',
      tabah: '',
      title: '',
      content: '',
      extra_notes: '',
      tags: [] as string[]
    };

    const saved = localStorage.getItem('fawaid_captureFormData');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.bookTitle !== undefined && parsed.bookId === undefined) {
          parsed.bookId = '';
          delete parsed.bookTitle;
        }
        
        // Ensure new fields exist
        if (parsed.volumeNumber === undefined) parsed.volumeNumber = '';
        if (parsed.pageNumber === undefined) parsed.pageNumber = '';
        if (parsed.tabah === undefined) parsed.tabah = '';
        // Removed legacy reference migration since we are going back to individual fields!

        delete parsed.scienceId;
        delete parsed.bookId;
        delete parsed.sharhId;

        const merged = {
          ...initialState,
          ...parsed
        };

        return merged;
      } catch (e) {
        // ignore
      }
    }

    return initialState;
  });

  useEffect(() => {
    // Don't persist form data to localStorage in modal mode
    if (!isModal) {
      localStorage.setItem('fawaid_captureFormData', JSON.stringify(formData));
    }
  }, [formData, isModal]);

  const [books, setBooks] = useState<BookType[]>([]);
  const [shuruuh, setShuruuh] = useState<Sharh[]>([]);
  const [duplicate, setDuplicate] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { t, apiKey, language } = useSettings();
  const [isAddingBook, setIsAddingBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [isAddingSharh, setIsAddingSharh] = useState(false);
  const [newSharhTitle, setNewSharhTitle] = useState('');
  const [newSharhAuthor, setNewSharhAuthor] = useState('');

  useEffect(() => {
    if (formData.scienceId) {
      fetch(`/api/books?scienceId=${formData.scienceId}`)
        .then(res => res.json())
        .then((data: BookType[]) => {
          setBooks(data);
          setFormData(prev => {
            if (!prev.bookId) return prev;
            const hasSelectedBook = data.some(book => book.id === parseInt(prev.bookId));
            if (hasSelectedBook) return prev;
            return {
              ...prev,
              bookId: '',
              sharhId: ''
            };
          });
        });
    } else {
      setBooks([]);
      setFormData(prev => {
        if (!prev.bookId && !prev.sharhId) return prev;
        return {
          ...prev,
          bookId: '',
          sharhId: ''
        };
      });
    }
  }, [formData.scienceId]);

  useEffect(() => {
    if (formData.bookId) {
      fetch(`/api/shuruuh?bookId=${formData.bookId}`)
        .then(res => res.json())
        .then((data: Sharh[]) => {
          setShuruuh(data);
          setFormData(prev => {
            if (!prev.sharhId) return prev;
            const hasSelectedSharh = data.some(sharh => sharh.id === parseInt(prev.sharhId));
            if (hasSelectedSharh) return prev;
            return {
              ...prev,
              sharhId: ''
            };
          });
        });
    } else {
      setShuruuh([]);
      setFormData(prev => {
        if (!prev.sharhId) return prev;
        return {
          ...prev,
          sharhId: ''
        };
      });
    }
  }, [formData.bookId]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        processOCR(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const processOCR = async (base64: string) => {
    if (!apiKey) {
      alert(t('API Key Required'));
      return;
    }
    setLoading(true);
    try {
      const data = await performOCR(base64, apiKey, language);
      setOcrResult(data);
      setFormData(prev => ({
        ...prev,
        title: data.suggestedTitle,
        content: data.extractedText,
        tags: data.suggestedTags
      }));
    } catch (e) {
      console.error(e);
      alert(t('OCR Failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestMetadata = async () => {
    if (!formData.content) {
      alert(t('Please enter Fāʾidah text first.'));
      return;
    }
    if (!apiKey) {
      alert(t('API Key Required'));
      return;
    }
    setIsGeneratingMetadata(true);
    try {
      const data = await suggestTitleAndTags(formData.content, apiKey);
      setFormData(prev => ({
        ...prev,
        title: data.suggestedTitle || prev.title,
        tags: [...new Set([...(prev.tags || []), ...(data.suggestedTags || [])])]
      }));
    } catch (e) {
      console.error(e);
      alert(t('Failed to generate suggestions.'));
    } finally {
      setIsGeneratingMetadata(false);
    }
  };

  const handleTranslate = async () => {
    if (!formData.content && !formData.title && (!formData.tags || formData.tags.length === 0)) return;
    setTranslating(true);
    try {
      const targetLang = language === 'ar' ? 'ar' : 'en';
      const translatedInfo = await translateContent(
        { title: formData.title, content: formData.content, tags: formData.tags },
        apiKey, 
        targetLang
      );
      setFormData(prev => ({ 
        ...prev, 
        content: translatedInfo.content || prev.content,
        title: translatedInfo.title || prev.title,
        tags: translatedInfo.tags || prev.tags
      }));
    } catch (e) {
      console.error(e);
      alert(t('Translation failed.'));
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async (skipDuplicateCheck = false) => {
    if (!formData.scienceId || !formData.bookId || !formData.content) {
      alert(t('Fill Required Fields'));
      return;
    }

    if (!skipDuplicateCheck) {
      const res = await fetch(`/api/duplicate-check?bookId=${formData.bookId}&volumeNumber=${encodeURIComponent(formData.volumeNumber)}&pageNumber=${encodeURIComponent(formData.pageNumber)}&tabah=${encodeURIComponent(formData.tabah)}&content=${encodeURIComponent(formData.content.substring(0, 50))}`);
      const data = await res.json();
      if (data.duplicate) {
        setDuplicate(data.duplicate);
        return; // Stop and show duplicate confirmation
      }
    }

    setLoading(true);
    try {
      // 2. Save Fawaid
      await fetch('/api/fawaid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: parseInt(formData.bookId),
          sharh_id: formData.sharhId ? parseInt(formData.sharhId) : null,
          volume_number: formData.volumeNumber ? String(formData.volumeNumber) : null,
          page_number: formData.pageNumber ? parseInt(formData.pageNumber) : null,
          tabah: formData.tabah || null,
          title: formData.title,
          content: formData.content,
          extra_notes: formData.extra_notes,
          tags: formData.tags,
          author: formData.author,
          language: language === 'ar' ? 'arabic' : 'english'
        })
      });

      onSave();
      resetForm();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getResetTaxonomy = () => {
    const lockedTaxonomy = getLockedExplorerTaxonomy();
    const scienceId = formData.scienceId || lockedTaxonomy.scienceId || '';
    const bookId = formData.bookId || lockedTaxonomy.bookId || '';
    const sharhId = formData.sharhId || lockedTaxonomy.sharhId || '';

    if (!scienceId) {
      return { scienceId: '', bookId: '', sharhId: '' };
    }
    if (!bookId) {
      return { scienceId, bookId: '', sharhId: '' };
    }

    return { scienceId, bookId, sharhId };
  };

  const resetForm = ({ preserveTaxonomy = true }: { preserveTaxonomy?: boolean } = {}) => {
    const taxonomy = preserveTaxonomy
      ? getResetTaxonomy()
      : { scienceId: '', bookId: '', sharhId: '' };

    setImage(null);
    setOcrResult(null);
    setFormData({
      ...taxonomy,
      author: '',
      volumeNumber: '',
      pageNumber: '',
      tabah: '',
      title: '',
      content: '',
      extra_notes: '',
      tags: []
    });
    setDuplicate(null);
  };

  const handleAddBook = async (data: { title: string, author?: string }) => {
    if (!formData.scienceId) return;
    const res = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ science_id: parseInt(formData.scienceId), title: data.title, author: data.author })
    });
    if (res.ok) {
      const newBook = await res.json();
      setBooks([...books, newBook]);
      setFormData({...formData, bookId: newBook.id.toString()});
    }
  };

  const handleAddSharh = async (data: { title: string, author?: string }) => {
    if (!formData.bookId) return;
    const res = await fetch('/api/shuruuh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: parseInt(formData.bookId), title: data.title, author: data.author })
    });
    if (res.ok) {
      const newSharh = await res.json();
      setShuruuh([...shuruuh, newSharh]);
      setFormData({...formData, sharhId: newSharh.id.toString()});
    }
  };

  const handleAddSharhSubmit = () => {
    handleAddSharh({ title: newSharhTitle, author: newSharhAuthor });
    setIsAddingSharh(false);
    setNewSharhTitle('');
    setNewSharhAuthor('');
  };



  return (
    <div className="space-y-8">

      {/* Add Sharh Modal */}
      <AnimatePresence>
        {isAddingSharh && (
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
              <h3 className="text-2xl font-serif font-bold mb-4 dark:text-white">{t('Add Sharh')}</h3>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block mb-2">{t('Sharh Name')} *</label>
                  <input
                    type="text"
                    value={newSharhTitle}
                    onChange={(e) => setNewSharhTitle(e.target.value)}
                    placeholder={t('Enter Sharh Name')}
                    className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddSharhSubmit();
                      if (e.key === 'Escape') {
                        setIsAddingSharh(false);
                        setNewSharhTitle('');
                        setNewSharhAuthor('');
                      }
                    }}
                  />
                </div>
                
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block mb-2">{t('Author')} ({t('Optional')})</label>
                  <input
                    type="text"
                    value={newSharhAuthor}
                    onChange={(e) => setNewSharhAuthor(e.target.value)}
                    placeholder={t('Author Name')}
                    className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddSharhSubmit();
                      if (e.key === 'Escape') {
                        setIsAddingSharh(false);
                        setNewSharhTitle('');
                        setNewSharhAuthor('');
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsAddingSharh(false);
                    setNewSharhTitle('');
                    setNewSharhAuthor('');
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F0] dark:hover:bg-zinc-800 transition-all"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleAddSharhSubmit}
                  disabled={!newSharhTitle.trim()}
                  className="px-4 py-2 bg-[#5A5A40] text-white rounded-xl text-sm font-bold hover:bg-[#4A4A30] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Save')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-[#1A1A1A] dark:text-white">{t('Add Fāʾidah')}</h2>
          {isModal && prefilledBook && (
            <p className="text-[#5A5A40] dark:text-zinc-400 mt-1 font-medium">
              {prefilledScience?.name} → {prefilledBook.title}
              {prefilledSharh && prefilledSharh.id !== -1 && ` → ${prefilledSharh.title}`}
            </p>
          )}
          {!isModal && <p className="text-[#8E8E8E] dark:text-gray-400 mt-2">{t('Capture Description')}</p>}
        </div>
        <div className="flex items-center gap-3">
          {(image || mode === 'manual') && (
            <button
              onClick={() => resetForm()}
              className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-1 hover:underline"
            >
              <X className="w-4 h-4" /> {t('Reset')}
            </button>
          )}
          {isModal && onCancel && (
            <button
              onClick={onCancel}
              className="text-sm font-medium text-[#8E8E8E] dark:text-gray-400 flex items-center gap-1 hover:text-[#5A5A40] dark:hover:text-white px-3 py-2 rounded-xl hover:bg-[#F5F5F0] dark:hover:bg-zinc-800 transition-all"
            >
              <X className="w-4 h-4" /> {t('Close')}
            </button>
          )}
        </div>
      </header>

      {/* Mode Selection */}
      <div className="flex p-1 bg-white dark:bg-zinc-900 border border-[#E5E5E0] dark:border-zinc-800 rounded-xl w-fit">
        <button
          onClick={() => { setMode('ocr'); resetForm({ preserveTaxonomy: true }); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            mode === 'ocr' ? 'bg-[#5A5A40] text-white shadow-md dark:bg-zinc-700' : 'text-[#8E8E8E] dark:text-gray-400 hover:bg-[#F5F5F0] dark:hover:bg-zinc-800'
          }`}
        >
          <ImageIcon className="w-4 h-4" /> {t('OCR Capture')}
        </button>
        <button
          onClick={() => { setMode('manual'); resetForm({ preserveTaxonomy: true }); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            mode === 'manual' ? 'bg-[#5A5A40] text-white shadow-md dark:bg-zinc-700' : 'text-[#8E8E8E] dark:text-gray-400 hover:bg-[#F5F5F0] dark:hover:bg-zinc-800'
          }`}
        >
          <PenTool className="w-4 h-4" /> {t('Manual Entry')}
        </button>
      </div>

      {mode === 'ocr' && !image ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#E5E5E0] dark:border-zinc-700 rounded-3xl p-12 flex flex-col items-center justify-center bg-white dark:bg-zinc-900 hover:bg-[#F5F5F0] dark:hover:bg-zinc-800 transition-all cursor-pointer group"
          >
            <div className="p-6 bg-[#F5F5F0] dark:bg-zinc-800 rounded-full mb-6 group-hover:scale-110 transition-transform">
              <Upload className="w-12 h-12 text-[#5A5A40] dark:text-zinc-400" />
            </div>
            <h3 className="text-xl font-bold mb-2 dark:text-white">{t('Upload Book Image')}</h3>
            <p className="text-[#8E8E8E] dark:text-gray-500 text-center">{t('Drag Drop Description')}</p>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileUpload} 
            />
          </div>
          <div 
            onClick={() => cameraInputRef.current?.click()}
            className="border-2 border-dashed border-[#E5E5E0] dark:border-zinc-700 rounded-3xl p-12 flex flex-col items-center justify-center bg-white dark:bg-zinc-900 hover:bg-[#F5F5F0] dark:hover:bg-zinc-800 transition-all cursor-pointer group"
          >
            <div className="p-6 bg-[#F5F5F0] dark:bg-zinc-800 rounded-full mb-6 group-hover:scale-110 transition-transform">
              <Camera className="w-12 h-12 text-[#5A5A40] dark:text-zinc-400" />
            </div>
            <h3 className="text-xl font-bold mb-2 dark:text-white">{t('Take Picture')}</h3>
            <p className="text-[#8E8E8E] dark:text-gray-500 text-center">{t('Use Camera Description')}</p>
            <input 
              type="file" 
              ref={cameraInputRef} 
              className="hidden" 
              accept="image/*" 
              capture="environment"
              onChange={handleFileUpload} 
            />
          </div>
        </div>
      ) : (
        <div className={`flex flex-col space-y-8`}>
          {/* Image Preview & OCR Status (Only for OCR mode) */}
          {mode === 'ocr' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden border border-[#E5E5E0] dark:border-zinc-800 shadow-sm">
                <img src={image!} alt="Captured" className="w-full h-auto max-h-[500px] object-contain bg-[#1A1A1A]" />
              </div>
              
              {loading && !ocrResult && (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-[#E5E5E0] dark:border-zinc-800 flex items-center gap-4">
                  <Loader2 className="w-6 h-6 text-[#5A5A40] dark:text-zinc-400 animate-spin" />
                  <div>
                    <p className="font-bold dark:text-white">{t('Analyzing OCR')}</p>
                    <p className="text-sm text-[#8E8E8E] dark:text-gray-500">{t('OCR Correction')}</p>
                  </div>
                </div>
              )}

              {ocrResult && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl p-6 border border-emerald-100 dark:border-emerald-800 flex items-center gap-4 text-emerald-700 dark:text-emerald-400">
                  <Check className="w-6 h-6" />
                  <div>
                    <p className="font-bold">{t('OCR Successful')}</p>
                    <p className="text-sm opacity-80">{t('Text Extracted')}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <div className={`bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E5E0] dark:border-zinc-800 shadow-sm space-y-6 ${mode === 'manual' ? 'max-w-3xl mx-auto w-full' : ''}`}>
            {/* Taxonomy Dropdowns - Hidden in modal mode since taxonomy is shown in header */}
            {!isModal && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">
                  <span className="flex items-center gap-1"><GraduationCapIcon className="w-3 h-3" /> {t('Science')} *</span>
                </label>
                <select
                  value={formData.scienceId}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      scienceId: e.target.value,
                      bookId: '',
                      sharhId: ''
                    });
                  }}
                  className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600 min-w-0"
                >
                  <option value="">{t('Select Science')}</option>
                  {sciences?.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">
                  <span className="flex items-center gap-1"><Book className="w-3 h-3" /> {t('Book Title')} *</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.bookId}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        bookId: e.target.value,
                        sharhId: ''
                      });
                    }}
                    className="flex-1 min-w-0 bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600 disabled:opacity-50 text-ellipsis overflow-hidden"
                    disabled={!formData.scienceId}
                  >
                    <option value="">{t('Select Book')}</option>
                    {books?.map(b => (
                      <option key={b.id} value={b.id}>{b.title}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setIsAddingBook(true)}
                    disabled={!formData.scienceId}
                    className="p-3 bg-[#5A5A40] dark:bg-zinc-700 text-white rounded-xl hover:bg-[#4A4A30] dark:hover:bg-zinc-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('Add New Book')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {t('Sharh')}</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.sharhId}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        sharhId: e.target.value
                      });
                    }}
                    className="flex-1 min-w-0 bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600 disabled:opacity-50 text-ellipsis overflow-hidden"
                    disabled={!formData.bookId}
                  >
                    <option value="">{t('General Notes')}</option>
                    {shuruuh?.map(s => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setIsAddingSharh(true)}
                    disabled={!formData.bookId}
                    className="p-3 bg-[#5A5A40] dark:bg-zinc-700 text-white rounded-xl hover:bg-[#4A4A30] dark:hover:bg-zinc-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('Add New Sharh')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">
                  {t('Volume')}
                </label>
                <input
                  type="text"
                  value={formData.volumeNumber}
                  onChange={e => setFormData({...formData, volumeNumber: e.target.value})}
                  placeholder={t('e.g. 2')}
                  className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">
                  {t('Page')}
                </label>
                <input
                  type="number"
                  value={formData.pageNumber}
                  onChange={e => setFormData({...formData, pageNumber: e.target.value})}
                  placeholder={t('e.g. 145')}
                  className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">
                  {t('Edition')}
                </label>
                <input
                  type="text"
                  value={formData.tabah}
                  onChange={e => setFormData({...formData, tabah: e.target.value})}
                  placeholder={t('e.g. Dar al-Kutub')}
                  className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Title')} ({t('Optional')})</label>
                {mode === 'manual' && (
                  <button
                    onClick={handleSuggestMetadata}
                    disabled={isGeneratingMetadata || !formData.content}
                    title={t('Suggest Title & Tags')}
                    className="text-xs font-bold text-[#5A5A40] dark:text-zinc-300 bg-[#F5F5F0] dark:bg-zinc-800 hover:bg-[#E5E5E0] dark:hover:bg-zinc-700 px-2 py-1 rounded-md flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingMetadata ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    <span className="hidden sm:inline">{t('Auto-Suggest')}</span>
                  </button>
                )}
              </div>
              <input 
                type="text"
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
                placeholder={t('Descriptive Title')}
                className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">
                  {mode === 'ocr' ? t('Extracted Note Content') : t('Fāʾidah Text')} *
                </label>
                <button
                  onClick={(e) => { e.preventDefault(); handleTranslate(); }}
                  disabled={translating || !formData.content}
                  className="flex items-center gap-1 px-3 py-1 bg-[#5A5A40]/10 hover:bg-[#5A5A40]/20 text-[#5A5A40] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  type="button"
                >
                  {translating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                  {t('Translate')}
                </button>
              </div>
              <textarea 
                value={formData.content}
                onChange={e => setFormData({...formData, content: e.target.value})}
                rows={6}
                className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600 resize-none font-serif text-lg leading-relaxed"
                placeholder={mode === 'ocr' ? t('Extracted Text Placeholder') : t('Enter Text Placeholder')}
                dir="auto"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Extra Notes')} ({t('Optional')})</label>
              <textarea 
                value={formData.extra_notes || ''}
                onChange={e => setFormData({...formData, extra_notes: e.target.value})}
                rows={3}
                className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600 resize-none font-serif text-lg leading-relaxed"
                placeholder={t('Enter Extra Notes')}
                dir="auto"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-2 text-right w-full">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Tags')}</label>
                <div className="flex flex-wrap justify-end gap-2">
                  {formData.tags?.map((tag, idx) => (
                    <span key={idx} className="bg-[#5A5A40]/10 dark:bg-zinc-800 text-[#5A5A40] dark:text-zinc-300 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      {tag}
                      <button onClick={() => setFormData({...formData, tags: formData.tags.filter(t => t !== tag)})}>
                        <X className="w-2 h-2" />
                      </button>
                    </span>
                  ))}
                  <button 
                    onClick={() => setIsAddingTag(true)}
                    className="bg-[#F5F5F0] dark:bg-zinc-800 text-[#8E8E8E] dark:text-gray-400 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 hover:bg-[#E5E5E0] dark:hover:bg-zinc-700"
                  >
                    <Plus className="w-2 h-2" /> {t('Add')}
                  </button>
                </div>
              </div>
            </div>

            {/* Add Tag Modal */}
            <AnimatePresence>
              {isAddingTag && (
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
                    className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-xs w-full shadow-2xl border border-[#E5E5E0] dark:border-zinc-800"
                  >
                    <h3 className="text-lg font-serif font-bold mb-4 dark:text-white">{t('Add Tag')}</h3>
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder={t('Enter Tag Name')}
                      className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 mb-4 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (newTag) setFormData({...formData, tags: [...(formData.tags || []), newTag]});
                          setIsAddingTag(false);
                          setNewTag('');
                        }
                      }}
                    />
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => {
                          setIsAddingTag(false);
                          setNewTag('');
                        }}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F0] dark:hover:bg-zinc-800 transition-all"
                      >
                        {t('Cancel')}
                      </button>
                      <button
                        onClick={() => {
                          if (newTag) setFormData({...formData, tags: [...(formData.tags || []), newTag]});
                          setIsAddingTag(false);
                          setNewTag('');
                        }}
                        disabled={!newTag.trim()}
                        className="px-4 py-2 bg-[#5A5A40] text-white rounded-xl text-sm font-bold hover:bg-[#4A4A30] transition-all disabled:opacity-50"
                      >
                        {t('Add')}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <NewItemModal 
              isOpen={isAddingBook} 
              onClose={() => setIsAddingBook(false)} 
              onSave={handleAddBook} 
              type="book" 
            />
            <NewItemModal 
              isOpen={isAddingSharh} 
              onClose={() => setIsAddingSharh(false)} 
              onSave={handleAddSharh} 
              type="sharh" 
            />

            <AnimatePresence>
              {duplicate && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex gap-3 text-amber-800 dark:text-amber-400"
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-bold">{t('Duplicate Found')}</p>
                    <p className="opacity-80">{t('Duplicate Description')} <strong>{duplicate.book_title}</strong>{duplicate.reference ? ` (${duplicate.reference})` : ''}.</p>
                    <div className="flex gap-2 mt-3">
                      <button 
                        onClick={() => handleSave(true)}
                        className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700"
                      >
                        {t('Add Anyway')}
                      </button>
                      <button 
                        onClick={() => setDuplicate(null)}
                        className="px-3 py-1 bg-white dark:bg-zinc-800 text-amber-800 dark:text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900"
                      >
                        {t('Cancel')}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              onClick={handleSave}
              disabled={loading}
              className="w-full bg-[#5A5A40] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#5A5A40]/20 dark:shadow-none hover:bg-[#4A4A30] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {t('Save Fāʾidah')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GraduationCapIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>
  )
}
