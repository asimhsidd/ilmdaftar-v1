import React,
 { useState, useRef, useEffect } from 'react';
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
  Languages,
  Search,
  RefreshCw
} from 'lucide-react';
import { useModal } from '../contexts/ModalContext';
import { Science, Book as BookType, Sharh } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import NewItemModal from './NewItemModal';
import ShamelaMatch, { ParsedReference } from './shamela/ShamelaMatch';

import { performOCR, suggestTitleAndTags, translateContent, categorizeBook, splitMasroohAndSharh } from '../services/geminiService';

const normalizeName = (name: string) => {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[أإآء]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FF\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

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

// Removed getLockedExplorerTaxonomy

interface CaptureProps {
  sciences: Science[];
  onSave: () => void;
  // Optional props for modal mode (when used from Explorer)
  prefilledScience?: Science;
  prefilledBook?: BookType;
  prefilledSharh?: Sharh | null;
  prefilledDraft?: Partial<{
    title: string;
    content: string;
    extra_notes: string;
    pageNumber: string;
    volumeNumber: string;
    tabah: string;
    tags: string[];
  }>;
  editingFawaidId?: number | null;
  isModal?: boolean;
  onCancel?: () => void;
}

export default function Capture({
  sciences,
  onSave,
  prefilledScience,
  prefilledBook,
  prefilledSharh,
  prefilledDraft,
  editingFawaidId,
  isModal = false,
  onCancel
}: CaptureProps) {
  const { showModal } = useModal();
  const [mode, setMode] = useState<'ocr' | 'manual'>(() => (isModal && !!prefilledDraft ? 'manual' : 'ocr'));
  const devMode = typeof window !== 'undefined' && localStorage.getItem('fawaid_dev_mode') === 'true';
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
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (err) {
        // Fallback if environment camera is not available
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch (e) {
      await showModal({ type: 'alert', title: 'Camera Error', message: 'Failed to access camera' });
    }
  };

  useEffect(() => {
    if (isCameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraOpen]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setImage(dataUrl);
        processOCR(dataUrl);
        stopCamera();
      }
    }
  };


  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              setImage(reader.result as string);
              // Automatically process the image (like scan and OCR)
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);


  const [formData, setFormData] = useState(() => {
    // In modal mode, use prefilled props directly
    if (isModal && prefilledScience && prefilledBook) {
      return {
        scienceId: String(prefilledScience.id),
        bookId: String(prefilledBook.id),
        sharhId: prefilledSharh && prefilledSharh.id !== -1 ? String(prefilledSharh.id) : '',
        volumeNumber: prefilledDraft?.volumeNumber || '',
        pageNumber: prefilledDraft?.pageNumber || '',
        tabah: prefilledDraft?.tabah || '',
        title: prefilledDraft?.title || '',
        content: prefilledDraft?.content || '',
        extra_notes: prefilledDraft?.extra_notes || '',
        tags: prefilledDraft?.tags || [] as string[]
      };
    }

    // Standalone mode: use localStorage
    const initialState = {
      scienceId: '',
      bookId: '',
      sharhId: '',
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
  const autoFilledBookRef = useRef<BookType | null>(null);
  const autoFilledSharhRef = useRef<Sharh | null>(null);
  const [localSciences, setLocalSciences] = useState<Science[]>(sciences);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { t, apiKey, language } = useSettings();
  const [isAddingBook, setIsAddingBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [isAddingSharh, setIsAddingSharh] = useState(false);
  const [newSharhTitle, setNewSharhTitle] = useState('');
  const [newSharhAuthor, setNewSharhAuthor] = useState('');
  const [tabahs, setTabahs] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [quickCaptureMode, setQuickCaptureMode] = useState(false);
  const [isShamelaOpen, setIsShamelaOpen] = useState(false);

  useEffect(() => {
    fetch('/api/tabahs')
      .then(res => res.ok ? res.json() : [])
      .then((data: string[]) => setTabahs(Array.isArray(data) ? data : []))
      .catch(console.error);

    fetch('/api/authors')
      .then(res => res.ok ? res.json() : [])
      .then((data: string[]) => setAuthors(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLocalSciences(sciences);
  }, [sciences]);

  useEffect(() => {
    if (formData.scienceId) {
      fetch(`/api/books?scienceId=${formData.scienceId}`)
        .then(res => res.json())
        .then((data: BookType[]) => {
          const preservedBook = autoFilledBookRef.current;
          const mergedBooks = preservedBook && !data.some(book => book.id === preservedBook.id)
            ? [...data, preservedBook]
            : data;

          setBooks(mergedBooks);
          setFormData(prev => {
            if (!prev.bookId) return prev;
            const hasSelectedBook = mergedBooks.some(book => book.id === parseInt(prev.bookId));
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
          const preservedSharh = autoFilledSharhRef.current;
          const mergedShuruuh = preservedSharh && !data.some(sharh => sharh.id === preservedSharh.id)
            ? [...data, preservedSharh]
            : data;

          setShuruuh(mergedShuruuh);
          setFormData(prev => {
            if (!prev.sharhId) return prev;
            const hasSelectedSharh = mergedShuruuh.some(sharh => sharh.id === parseInt(prev.sharhId));
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
      // Clear form before OCR
      setFormData(prev => ({
        ...prev,
        volumeNumber: '',
        pageNumber: '',
        tabah: '',
        title: '',
        content: '',
        extra_notes: '',
        tags: []
      }));
      setOcrResult(null);
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
      await showModal({ type: 'alert', title: t('Error'), message: t('API Key Required') });
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
      await showModal({ type: 'alert', title: t('Error'), message: t('OCR Failed') });
    } finally {
      setLoading(false);
    }
  };

  const handleAutoFillMetadata = async () => {
    if (!formData.content) {
      await showModal({ type: 'alert', title: t('Error'), message: t('Please enter Fāʾidah text first.') });
      return;
    }
    if (!apiKey) {
      await showModal({ type: 'alert', title: t('Error'), message: t('API Key Required') });
      return;
    }
    setIsGeneratingMetadata(true);
    try {
      // 1. Get basic suggestions (Title & Tags)
      const suggestions = await suggestTitleAndTags(formData.content, apiKey);
      let finalTitle = suggestions.suggestedTitle || formData.title;
      let finalTags = [...new Set([...(formData.tags || []), ...(suggestions.suggestedTags || [])])];

      // 2. Split Masrooh and Sharh if applicable
      const splitResult = await splitMasroohAndSharh(finalTitle, '', apiKey);
      const bookTitleCandidate = splitResult.masroohBookName;
      const sharhTitleCandidate = splitResult.sharhTitle;

      // 3. Categorize Book (find science and author)
      const categorization = await categorizeBook(bookTitleCandidate, '', localSciences, apiKey);
      
      let targetScienceId = categorization.matchedScienceId;
      if (!targetScienceId && categorization.newScienceName) {
        targetScienceId = await handleAutoCreateScience(categorization.newScienceName);
      }

      if (targetScienceId) {
        setFormData(prev => ({ ...prev, scienceId: String(targetScienceId) }));
        
        // Fetch books for this science to check existence
        const booksRes = await fetch(`/api/books?scienceId=${targetScienceId}`);
        const existingBooks: BookType[] = await booksRes.json();
        
        let targetBook = existingBooks.find(b => normalizeName(b.title) === normalizeName(bookTitleCandidate));
        
        if (!targetBook) {
          // Create book with AI suggested author if available (categorizeBook doesn't return author yet, let's assume it might in future or we prompt)
          // For now, if book doesn't exist, we might need to prompt for author or try to guess it.
          // Let's just create it and user can edit author later, or we can improve categorizeBook to return author.
          const res = await fetch('/api/books', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              science_id: targetScienceId, 
              title: bookTitleCandidate,
              author: categorization.suggestedAuthor || '' 
            })
          });
          if (res.ok) targetBook = await res.json();
        }

        if (targetBook) {
          setFormData(prev => ({ ...prev, bookId: String(targetBook?.id) }));
          
          if (sharhTitleCandidate) {
            const shuruuhRes = await fetch(`/api/shuruuh?bookId=${targetBook.id}`);
            const existingShuruuh: Sharh[] = await shuruuhRes.json();
            let targetSharh = existingShuruuh.find(s => normalizeName(s.title) === normalizeName(sharhTitleCandidate));
            
            if (!targetSharh) {
              const res = await fetch('/api/shuruuh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ book_id: targetBook.id, title: sharhTitleCandidate })
              });
              if (res.ok) targetSharh = await res.json();
            }
            if (targetSharh) {
              setFormData(prev => ({ ...prev, sharhId: String(targetSharh?.id) }));
            }
          }
        }
      }

      setFormData(prev => ({
        ...prev,
        title: finalTitle,
        tags: finalTags
      }));

    } catch (e) {
      console.error(e);
      await showModal({ type: 'alert', title: t('Error'), message: t('Failed to generate suggestions.') });
    } finally {
      setIsGeneratingMetadata(false);
    }
  };

  const handleSuggestMetadata = async () => {
    // Keep this for just Title & Tags if user wants minimal auto-fill
    if (!formData.content) {
      await showModal({ type: 'alert', title: t('Error'), message: t('Please enter Fāʾidah text first.') });
      return;
    }
    if (!apiKey) {
      await showModal({ type: 'alert', title: t('Error'), message: t('API Key Required') });
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
      await showModal({ type: 'alert', title: t('Error'), message: t('Failed to generate suggestions.') });
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
      await showModal({ type: 'alert', title: t('Error'), message: t('Translation failed.') });
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async (skipDuplicateCheck = false) => {
    if ((!quickCaptureMode && (!formData.scienceId || !formData.bookId)) || !formData.content) {
      await showModal({ type: 'alert', title: t('Error'), message: t('Fill Required Fields') });
      return;
    }

    if (!skipDuplicateCheck) {
      
    }

    setLoading(true);
    try {
      const payload = {
        book_id: formData.bookId ? parseInt(formData.bookId) : null,
        sharh_id: formData.sharhId ? parseInt(formData.sharhId) : null,
        volume_number: formData.volumeNumber ? String(formData.volumeNumber) : null,
        page_number: formData.pageNumber ? parseInt(formData.pageNumber) : null,
        tabah: formData.tabah || null,
        title: formData.title,
        content: formData.content,
        extra_notes: formData.extra_notes,
        tags: quickCaptureMode ? [] : formData.tags,
        language: language === 'ar' ? 'arabic' : 'english',
        status: quickCaptureMode ? 'unformatted' : 'formatted'
      };

      const res = await fetch(editingFawaidId ? `/api/fawaid/${editingFawaidId}` : '/api/fawaid', {
        method: editingFawaidId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t('Error'));
      }

      onSave();
      resetForm();
    } catch (e: any) {
      console.error(e);
      await showModal({ type: 'alert', title: t('Error'), message: e.message || t('Error') });
    } finally {
      setLoading(false);
    }
  };

  const getResetTaxonomy = () => {
    const scienceId = formData.scienceId || '';
    const bookId = formData.bookId || '';
    const sharhId = formData.sharhId || '';

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
      pageNumber: '',
      tabah: '',
      title: '',
      content: '',
      extra_notes: '',
      tags: []
    });
    
  };

  const handleAddBook = async (data: { title: string, author?: string }) => {
    if (!formData.scienceId) return;
    
    const normalizeName = (name: string) => name.trim().toLowerCase();
    
    // Check for duplicate book (case-insensitive)
    const existingDuplicate = books.find(
      b => normalizeName(b.title) === normalizeName(data.title)
    );
    if (existingDuplicate) {
      setFormData({...formData, bookId: existingDuplicate.id.toString()});
      await showModal({ type: 'alert', title: t('Duplicate'), message: `Book "${data.title}" already exists.` });
      setIsAddingBook(false);
      return;
    }
    
    const res = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ science_id: parseInt(formData.scienceId), title: data.title, author: data.author || undefined })
    });
    if (res.ok) {
      const newBook = await res.json();
      setBooks([...books, newBook]);
      setFormData({...formData, bookId: newBook.id.toString()});
      setIsAddingBook(false);
    }
  };

  const handleAddSharh = async (data: { title: string, author?: string }) => {
    if (!formData.bookId) return;
    
    const normalizeName = (name: string) => name.trim().toLowerCase();
    
    // Check for duplicate sharh (case-insensitive)
    const existingDuplicate = shuruuh.find(
      s => normalizeName(s.title) === normalizeName(data.title)
    );
    if (existingDuplicate) {
      setFormData({...formData, sharhId: existingDuplicate.id.toString()});
      await showModal({ type: 'alert', title: t('Duplicate'), message: `Sharh "${data.title}" already exists.` });
      setIsAddingSharh(false);
      return;
    }
    
    const res = await fetch('/api/shuruuh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: parseInt(formData.bookId), title: data.title, author: data.author || undefined })
    });
    if (res.ok) {
      const newSharh = await res.json();
      setShuruuh([...shuruuh, newSharh]);
      setFormData({...formData, sharhId: newSharh.id.toString()});
      setIsAddingSharh(false);
    }
  };

  const handleAutoCreateScience = async (suggestedScienceName: string) => {
    const normalizeName = (name: string) => name.trim().toLowerCase();
    
    // Check for duplicate science (case-insensitive)
    const existingDuplicate = localSciences.find(
      s => normalizeName(s.name) === normalizeName(suggestedScienceName)
    );
    if (existingDuplicate) {
      return existingDuplicate.id;
    }
    
    const shouldCreate = await showModal({
      type: 'confirm',
      title: t('Create New Science'),
      message: `No matching science found. Create new science: "${suggestedScienceName}"?`,
      confirmText: t('Create'),
      cancelText: t('Cancel')
    });

    if (shouldCreate !== 'confirm') return null;

    try {
      const res = await fetch('/api/sciences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: suggestedScienceName })
      });
      if (!res.ok) throw new Error('Failed to create science');
      const newScience = await res.json();
      
      // Add to local sciences list so it's available in dropdown
      setLocalSciences(prev => [...prev, newScience]);
      
      return newScience.id;
    } catch (e) {
      console.error(e);
      await showModal({ type: 'alert', title: t('Error'), message: t('Failed to create science') });
      return null;
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
              className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-[#E5E7EB] dark:border-zinc-800"
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
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
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
                    list="authors-list"
                    value={newSharhAuthor}
                    onChange={(e) => setNewSharhAuthor(e.target.value)}
                    placeholder={t('Author Name')}
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddSharhSubmit();
                      if (e.key === 'Escape') {
                        setIsAddingSharh(false);
                        setNewSharhTitle('');
                        setNewSharhAuthor('');
                      }
                    }}
                  />
                  <datalist id="authors-list">
                    {authors.map((a, i) => <option key={i} value={a} />)}
                  </datalist>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsAddingSharh(false);
                    setNewSharhTitle('');
                    setNewSharhAuthor('');
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleAddSharhSubmit}
                  disabled={!newSharhTitle.trim()}
                  className="px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Save')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex flex-col items-center text-center relative mb-8">
        <div>
          <h2 className="text-3xl font-serif font-bold text-[#1A1A1A] dark:text-white">{t('Add Fāʾidah')}</h2>
          {isModal && prefilledBook && (
            <p className="text-[#18407B] dark:text-zinc-400 mt-1 aref-ruqaa-regular inline-block px-4 py-1 bg-[#F5F5F7] dark:bg-zinc-800 rounded-full mt-3">
              {prefilledScience?.name} → {prefilledBook.title}
              {prefilledSharh && prefilledSharh.id !== -1 && ` → ${prefilledSharh.title}`}
            </p>
          )}
          {!isModal && <p className="text-[#8E8E8E] dark:text-gray-400 mt-2">{t('Capture Description')}</p>}
          {!isModal && (
            <label className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#18407B] dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={quickCaptureMode}
                onChange={(e) => setQuickCaptureMode(e.target.checked)}
                className="rounded border-[#D1D5DB]"
              />
              Quick Capture Mode
            </label>
          )}
        </div>
        <div className="absolute right-0 top-0 flex items-center gap-3">
          {(image || mode === 'manual') && (
            <button
              onClick={() => resetForm()}
              className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-1 hover:underline px-3 py-2"
            >
              <X className="w-4 h-4" /> {t('Reset')}
            </button>
          )}
          {isModal && onCancel && (
            <button
              onClick={onCancel}
              className="text-sm font-medium text-[#8E8E8E] dark:text-gray-400 flex items-center gap-1 hover:text-[#18407B] dark:hover:text-white px-3 py-2 rounded-xl hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all"
            >
              <X className="w-4 h-4" /> {t('Close')}
            </button>
          )}
        </div>
      </header>

      {/* Mode Selection - Hidden when opening a formatting draft directly */}
      {!(isModal && prefilledDraft) && (
        <div className="flex p-1 bg-white dark:bg-zinc-900 border border-[#E5E7EB] dark:border-zinc-800 rounded-xl w-fit mx-auto mb-8">
          <button
            onClick={() => { setMode('ocr'); resetForm({ preserveTaxonomy: true }); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              mode === 'ocr' ? 'bg-[#6197EC] text-white shadow-md dark:bg-zinc-700' : 'text-[#8E8E8E] dark:text-gray-400 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800'
            }`}
          >
            <ImageIcon className="w-4 h-4" /> {t('OCR Capture')}
          </button>
          <button
            onClick={() => { setMode('manual'); resetForm({ preserveTaxonomy: true }); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              mode === 'manual' ? 'bg-[#6197EC] text-white shadow-md dark:bg-zinc-700' : 'text-[#8E8E8E] dark:text-gray-400 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800'
            }`}
          >
            <PenTool className="w-4 h-4" /> {t('Manual Entry')}
          </button>
        </div>
      )}

      {mode === 'ocr' && !image && !(isModal && prefilledDraft) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-8">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#E5E7EB] dark:border-zinc-700 rounded-2xl lg:rounded-3xl p-6 lg:p-12 flex flex-col items-center justify-center bg-white dark:bg-zinc-900 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all cursor-pointer group text-center"
          >
            <div className="p-4 lg:p-6 bg-[#F5F5F7] dark:bg-zinc-800 rounded-full mb-4 lg:mb-6 group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8 lg:w-12 lg:h-12 text-[#18407B] dark:text-zinc-400" />
            </div>
            <h3 className="text-lg lg:text-xl font-bold mb-2 dark:text-white">{t('Upload Book Image')}</h3>
            <p className="text-sm lg:text-base text-[#8E8E8E] dark:text-gray-500">{t('Drag Drop Description')}</p>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileUpload} 
            />
          </div>
          <div 
            onClick={startCamera}
            className="border-2 border-dashed border-[#E5E7EB] dark:border-zinc-700 rounded-2xl lg:rounded-3xl p-6 lg:p-12 flex flex-col items-center justify-center bg-white dark:bg-zinc-900 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all cursor-pointer group text-center"
          >
            <div className="p-4 lg:p-6 bg-[#F5F5F7] dark:bg-zinc-800 rounded-full mb-4 lg:mb-6 group-hover:scale-110 transition-transform">
              <Camera className="w-8 h-8 lg:w-12 lg:h-12 text-[#18407B] dark:text-zinc-400" />
            </div>
            <h3 className="text-lg lg:text-xl font-bold mb-2 dark:text-white">{t('Take Picture')}</h3>
            <p className="text-sm lg:text-base text-[#8E8E8E] dark:text-gray-500">{t('Use Camera Description')}</p>
          </div>
        </div>
      ) : (
        <div className={`flex flex-col space-y-8`}>
          {/* Image Preview & OCR Status (Only for OCR mode) */}
          {mode === 'ocr' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden border border-[#E5E7EB] dark:border-zinc-800 shadow-sm">
                <img src={image!} alt="Captured" className="w-full h-auto max-h-[500px] object-contain bg-[#1A1A1A]" />
              </div>
              
              {loading && !ocrResult && (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-[#E5E7EB] dark:border-zinc-800 flex items-center gap-4">
                  <Loader2 className="w-6 h-6 text-[#18407B] dark:text-zinc-400 animate-spin" />
                  <div>
                    <p className="font-bold dark:text-white">{t('Analyzing OCR')}</p>
                    <p className="text-sm text-[#8E8E8E] dark:text-gray-500">{t('OCR Correction')}</p>
                  </div>
                </div>
              )}

              {ocrResult && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl p-6 border border-emerald-100 dark:border-emerald-800 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-emerald-700 dark:text-emerald-400">
                    <Check className="w-6 h-6" />
                    <div>
                      <p className="font-bold">{t('OCR Successful')}</p>
                      <p className="text-sm opacity-80">{t('Text Extracted')}</p>
                    </div>
                  </div>
                  {image && (
                    <button
                      onClick={() => { setOcrResult(null); processOCR(image); }}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-800/50 text-emerald-700 dark:text-emerald-300 rounded-xl text-sm font-bold hover:bg-emerald-200 dark:hover:bg-emerald-700/50 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {t('Retry OCR')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <div className={`bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E7EB] dark:border-zinc-800 shadow-sm space-y-6 ${mode === 'manual' ? 'max-w-3xl mx-auto w-full' : ''}`}>

            {/* Taxonomy Dropdowns */}
            {(!quickCaptureMode && (!isModal || !!editingFawaidId)) && (
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
                  className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 min-w-0"
                >
                  <option value="">{t('Select Science')}</option>
                  {localSciences?.map(s => (
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
                    className="flex-1 min-w-0 bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 disabled:opacity-50 text-ellipsis overflow-hidden"
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
                    className="p-3 bg-[#6197EC] dark:bg-zinc-700 text-white rounded-xl hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex-1 min-w-0 bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 disabled:opacity-50 text-ellipsis overflow-hidden"
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
                    className="p-3 bg-[#6197EC] dark:bg-zinc-700 text-white rounded-xl hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('Add New Sharh')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            )}


            {!quickCaptureMode && <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">
                  {t('Volume')}
                </label>
                <input
                  type="text"
                  value={formData.volumeNumber}
                  onChange={e => setFormData({...formData, volumeNumber: e.target.value})}
                  placeholder={t('e.g. 2')}
                  className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
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
                  className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">
                  {t('Edition')}
                </label>
                <input
                  type="text"
                  list="tabahs-list"
                  value={formData.tabah}
                  onChange={e => setFormData({...formData, tabah: e.target.value})}
                  placeholder={t('e.g. Dar al-Kutub')}
                  className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                />
                <datalist id="tabahs-list">
                  {tabahs.map((t, i) => <option key={i} value={t} />)}
                </datalist>
              </div>
            </div>}


            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Title')} ({t('Optional')})</label>
                {mode === 'manual' && (
                  <button
                    onClick={handleSuggestMetadata}
                    disabled={isGeneratingMetadata || !formData.content}
                    title={t('Suggest Title & Tags')}
                    className="text-xs font-bold text-[#18407B] dark:text-zinc-300 bg-[#F5F5F7] dark:bg-zinc-800 hover:bg-[#E5E7EB] dark:hover:bg-zinc-700 px-2 py-1 rounded-md flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="aref-ruqaa-regular text-2xl w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 placeholder:font-sans placeholder:text-base placeholder:font-normal"
                dir={language === 'ar' ? 'rtl' : 'ltr'}
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
                  className="flex items-center gap-1 px-3 py-1 bg-[#6197EC]/10 hover:bg-[#6197EC]/20 text-[#18407B] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
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
                className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 resize-none scheherazade-new-regular text-xl leading-relaxed"
                placeholder={mode === 'ocr' ? t('Extracted Text Placeholder') : t('Enter Text Placeholder')}
                dir="auto"
              />
            </div>
            
            {devMode && formData.content && !quickCaptureMode && (
              <button
                type="button"
                onClick={() => setIsShamelaOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#6197EC]/10 dark:bg-zinc-800 text-[#18407B] dark:text-zinc-300 rounded-xl text-sm font-bold hover:bg-[#6197EC]/20 dark:hover:bg-zinc-700 transition-all border border-[#6197EC]/20 dark:border-zinc-700"
              >
                <Search className="w-4 h-4" />
                {t('Search Shamela')}
              </button>
            )}

            {devMode && <ShamelaMatch
              isOpen={isShamelaOpen}
              onClose={() => setIsShamelaOpen(false)}
              content={formData.content}
              currentPage={formData.pageNumber}
              volume={formData.volumeNumber}
              onFillReferences={async (ref: ParsedReference) => {
                try {
                  const baseBookName = ref.isDerivedWork ? (ref.matn || ref.rawBookName) : ref.rawBookName;
                  const sharhTitle = ref.isDerivedWork ? (ref.sharhTitle || ref.rawBookName) : null;
                  const refAuthor = ref.author;

                  // 1. Categorize (find science) via AI or fallback
                  let targetScienceId: number | null = null;
                  try {
                    const categorizationResult = await categorizeBook(
                      baseBookName, refAuthor || '',
                      localSciences.map(s => ({ id: s.id, name: s.name })), apiKey
                    );
                    if (categorizationResult?.matchedScienceId) {
                      targetScienceId = categorizationResult.matchedScienceId;
                    } else if (categorizationResult?.newScienceName) {
                      const dup = localSciences.find(s => normalizeName(s.name) === normalizeName(categorizationResult.newScienceName));
                      targetScienceId = dup ? dup.id : await handleAutoCreateScience(categorizationResult.newScienceName);
                    }
                  } catch {
                    const keywordMap: Record<string, string> = {
                      'عقيدة': 'Aqeedah', 'توحيد': 'Aqeedah', 'التفسير': 'Tafsir',
                      'الفقه': 'Fiqh', 'الحديث': 'Hadith', 'النحو': 'Nahw', 'السيرة': 'Seerah',
                    };
                    for (const [kw, sciName] of Object.entries(keywordMap)) {
                      if (baseBookName.includes(kw)) {
                        const match = localSciences.find(s => normalizeName(s.name) === normalizeName(sciName));
                        if (match) { targetScienceId = match.id; break; }
                      }
                    }
                  }

                  if (!targetScienceId) {
                    setFormData(prev => ({ ...prev, pageNumber: ref.page || prev.pageNumber, volumeNumber: ref.volume || prev.volumeNumber }));
                    return;
                  }

                  setFormData(prev => ({ ...prev, scienceId: String(targetScienceId) }));

                  // 2. Find or create book (with user permission)
                  const booksRes = await fetch(`/api/books?scienceId=${targetScienceId}`);
                  const existingBooks: BookType[] = await booksRes.json();
                  let targetBook = existingBooks.find((b: BookType) => normalizeName(b.title) === normalizeName(baseBookName));

                  if (!targetBook) {
                    const confirmResult = await showModal({
                      type: 'confirm', title: t('Create New Book'),
                      message: `Book "${baseBookName}" not found. Create it?`,
                      confirmText: t('Create'), cancelText: t('Cancel'),
                    });
                    if (confirmResult !== 'confirm') {
                      setFormData(prev => ({ ...prev, pageNumber: ref.page || prev.pageNumber, volumeNumber: ref.volume || prev.volumeNumber }));
                      return;
                    }
                    const createRes = await fetch('/api/books', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ science_id: targetScienceId, title: baseBookName, author: refAuthor || '', total_pages: 0 }),
                    });
                    if (createRes.ok) targetBook = await createRes.json();
                  }

                  if (targetBook) {
                    setBooks(prev => prev.some(b => b.id === targetBook!.id) ? prev : [...prev, targetBook!]);
                  }

                  // 3. Handle sharh if derived work
                  let targetSharhId = '';
                  if (targetBook && sharhTitle) {
                    const shuruuhRes = await fetch(`/api/shuruuh?bookId=${targetBook.id}`);
                    const existingShuruuh: Sharh[] = shuruuhRes.ok ? await shuruuhRes.json() : [];
                    let targetSharh = existingShuruuh.find((s: Sharh) => normalizeName(s.title) === normalizeName(sharhTitle));
                    if (!targetSharh) {
                      const createSharhRes = await fetch('/api/shuruuh', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ book_id: targetBook.id, title: sharhTitle, author: refAuthor || undefined }),
                      });
                      if (createSharhRes.ok) targetSharh = await createSharhRes.json();
                    }
                    if (targetSharh) {
                      targetSharhId = String(targetSharh.id);
                      setShuruuh(prev => prev.some(s => s.id === targetSharh!.id) ? prev : [...prev, targetSharh!]);
                    }
                  }

                  // 4. Set all form data
                  setFormData(prev => ({
                    ...prev,
                    scienceId: String(targetScienceId),
                    bookId: targetBook ? String(targetBook.id) : prev.bookId,
                    sharhId: targetSharhId || prev.sharhId,
                    pageNumber: ref.page || prev.pageNumber,
                    volumeNumber: ref.volume || prev.volumeNumber,
                  }));
                } catch (e) {
                  console.error('Fill references error:', e);
                  setFormData(prev => ({ ...prev, pageNumber: ref.page || prev.pageNumber, volumeNumber: ref.volume || prev.volumeNumber }));
                }
              }} 

            />}

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Extra Notes')} ({t('Optional')})</label>
              <textarea 
                value={formData.extra_notes || ''}
                onChange={e => setFormData({...formData, extra_notes: e.target.value})}
                rows={3}
                className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 resize-none scheherazade-new-regular text-xl leading-relaxed"
                placeholder={t('Enter Extra Notes')}
                dir="auto"
              />
            </div>

            {!quickCaptureMode && <div className="flex items-center justify-between">
              <div className="space-y-2 text-right w-full">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Tags')}</label>
                <div className="flex flex-wrap justify-end gap-2">
                  {formData.tags?.map((tag, idx) => (
                    <span key={idx} className="bg-[#6197EC]/10 dark:bg-zinc-800 text-[#18407B] dark:text-zinc-300 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      {tag}
                      <button onClick={() => setFormData({...formData, tags: formData.tags.filter(t => t !== tag)})}>
                        <X className="w-2 h-2" />
                      </button>
                    </span>
                  ))}
                  <button 
                    onClick={() => setIsAddingTag(true)}
                    className="bg-[#F5F5F7] dark:bg-zinc-800 text-[#8E8E8E] dark:text-gray-400 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 hover:bg-[#E5E7EB] dark:hover:bg-zinc-700"
                  >
                    <Plus className="w-2 h-2" /> {t('Add')}
                  </button>
                </div>
              </div>
            </div>}

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
                    className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-xs w-full shadow-2xl border border-[#E5E7EB] dark:border-zinc-800"
                  >
                    <h3 className="text-lg font-serif font-bold mb-4 dark:text-white">{t('Add Tag')}</h3>
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder={t('Enter Tag Name')}
                      className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 mb-4 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (newTag) {
                            const trimmed = newTag.trim();
                            if (trimmed && !(formData.tags || []).includes(trimmed)) {
                              setFormData({...formData, tags: [...(formData.tags || []), trimmed]});
                            }
                          }
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
                        className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all"
                      >
                        {t('Cancel')}
                      </button>
                      <button
                        onClick={() => {
                          if (newTag) {
                            const trimmed = newTag.trim();
                            if (trimmed && !(formData.tags || []).includes(trimmed)) {
                              setFormData({...formData, tags: [...(formData.tags || []), trimmed]});
                            }
                          }
                          setIsAddingTag(false);
                          setNewTag('');
                        }}
                        disabled={!newTag.trim()}
                        className="px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all disabled:opacity-50"
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

            

            {quickCaptureMode ? (
              <button
                onClick={handleSave}
                disabled={loading || !formData.content}
                className="w-full bg-[#6197EC] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#6197EC]/20 dark:shadow-none hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Save for later
              </button>
            ) : (
              <button 
                onClick={handleSave}
                disabled={loading}
                className="w-full bg-[#6197EC] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#6197EC]/20 dark:shadow-none hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                {t('Save Fāʾidah')}
              </button>
            )}
          </div>
        </div>
      )}
    
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-zinc-900 rounded-xl overflow-hidden shadow-2xl">
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <button onClick={stopCamera} className="p-3 bg-red-600 hover:bg-red-500 text-white rounded-full transition-colors shadow-lg">
                <X className="w-6 h-6" />
              </button>
            </div>
            <video ref={videoRef} autoPlay playsInline className="w-full h-[60vh] object-cover bg-black" />
            <div className="p-6 flex justify-center bg-zinc-900">
              <button onClick={capturePhoto} className="w-20 h-20 bg-white rounded-full border-4 border-zinc-900 ring-2 ring-white hover:bg-zinc-200 transition-colors shadow-lg flex items-center justify-center">
                <Camera className="w-8 h-8 text-black" />
              </button>
            </div>
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
