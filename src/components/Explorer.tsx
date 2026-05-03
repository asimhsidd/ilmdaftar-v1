import React, { useState, useEffect, useRef } from 'react';
import { Science, Book, Fawaid, Sharh } from '../types';
import { useModal } from '../contexts/ModalContext';
import {
  ChevronRight,
  BookOpen,
  FileText,
  Copy,
  ArrowLeft,
  Library,
  Loader2,
  Trash2,
  Edit2,
  Check,
  X,
  Maximize2,
  Plus,
  MessageSquare,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Link2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSettings } from '../contexts/SettingsContext';
import Capture from './Capture';

export default function Explorer({ sciences, onUpdate }: { sciences: Science[], onUpdate?: () => void | Promise<void> }) {
  const { showModal } = useModal();
  const [view, setView] = useState<'sciences' | 'books' | 'fawaid'>(() => {
    const saved = localStorage.getItem('fawaid_explorer_view') as any;
    return (saved === 'shuruuh' ? 'fawaid' : saved) || 'sciences';
  });
  const [selectedScience, setSelectedScience] = useState<Science | null>(() => {
    const saved = localStorage.getItem('fawaid_explorer_science');
    return saved ? JSON.parse(saved) : null;
  });
  const [selectedBook, setSelectedBook] = useState<Book | null>(() => {
    const saved = localStorage.getItem('fawaid_explorer_book');
    return saved ? JSON.parse(saved) : null;
  });
  const [selectedSharh, setSelectedSharh] = useState<Sharh | null>(() => {
    const saved = localStorage.getItem('fawaid_explorer_sharh');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    localStorage.setItem('fawaid_explorer_view', view);
    if (selectedScience) localStorage.setItem('fawaid_explorer_science', JSON.stringify(selectedScience));
    else localStorage.removeItem('fawaid_explorer_science');
    if (selectedBook) localStorage.setItem('fawaid_explorer_book', JSON.stringify(selectedBook));
    else localStorage.removeItem('fawaid_explorer_book');
    if (selectedSharh) localStorage.setItem('fawaid_explorer_sharh', JSON.stringify(selectedSharh));
    else localStorage.removeItem('fawaid_explorer_sharh');
  }, [view, selectedScience, selectedBook, selectedSharh]);
  const [items, setItems] = useState<any[]>([]);
  const [bookShuruuh, setBookShuruuh] = useState<Sharh[]>([]);

  useEffect(() => {
    if (selectedBook) {
      fetch(`/api/shuruuh?bookId=${selectedBook.id}`, { headers: { 'Cache-Control': 'no-cache' } })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          setBookShuruuh(Array.isArray(data) ? data : []);
        })
        .catch(() => setBookShuruuh([]));
    } else {
      setBookShuruuh([]);
    }
  }, [selectedBook]);

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedNote, setExpandedNote] = useState<Fawaid | null>(null);
  const [isAddingScience, setIsAddingScience] = useState(false);
  const [newScienceName, setNewScienceName] = useState('');
  const [editingScience, setEditingScience] = useState<Science | null>(null);
  const [editScienceName, setEditScienceName] = useState('');
  const [isAddingSharh, setIsAddingSharh] = useState(false);
  const [isAddingFaidah, setIsAddingFaidah] = useState(false);
  const [isAddingBook, setIsAddingBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [newSharhTitle, setNewSharhTitle] = useState('');
  const [newSharhAuthor, setNewSharhAuthor] = useState('');
  const [editingSharh, setEditingSharh] = useState<Sharh | null>(null);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editBookTitle, setEditBookTitle] = useState('');
  const [editBookAuthor, setEditBookAuthor] = useState('');
  const [editSharhTitle, setEditSharhTitle] = useState('');
  const [editSharhAuthor, setEditSharhAuthor] = useState('');
  const [activeScienceId, setActiveScienceId] = useState<number | null>(null);
  const [isSavingScienceOrder, setIsSavingScienceOrder] = useState(false);
  const [showQuickCaptureInbox, setShowQuickCaptureInbox] = useState(false);
  const [formattingDraft, setFormattingDraft] = useState<Fawaid | null>(null);
  const [linkingNote, setLinkingNote] = useState<Fawaid | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkCandidates, setLinkCandidates] = useState<Fawaid[]>([]);
  const [selectedLinkIds, setSelectedLinkIds] = useState<number[]>([]);
  const [linkedItems, setLinkedItems] = useState<Fawaid[]>([]);
  const scienceOrderSnapshotRef = useRef<Science[] | null>(null);
  const pendingScienceOrderRef = useRef<number[] | null>(null);
  const { t, language } = useSettings();

  useEffect(() => {
    const expandingNoteStr = localStorage.getItem('fawaid_explorer_open_faidah');
    if (expandingNoteStr) {
      try {
        const f = JSON.parse(expandingNoteStr);
        setExpandedNote(f);
      } catch (e) {
        console.error(e);
      }
      localStorage.removeItem('fawaid_explorer_open_faidah');
    }

    if (localStorage.getItem('fawaid_explorer_quick_capture_inbox') === 'true') {
      setShowQuickCaptureInbox(true);
      setView('fawaid');
      setSelectedScience(null);
      setSelectedBook(null);
      setSelectedSharh(null);
      localStorage.removeItem('fawaid_explorer_quick_capture_inbox');
    }
  }, []);

  const scienceDragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 8
      }
    })
  );

  const performCopy = async (fawaid: Fawaid | Fawaid[]) => {
    const itemsToCopy = Array.isArray(fawaid) ? fawaid : [fawaid];

    const text = itemsToCopy.map(f => {
      // Use new reference field if available, otherwise build from old fields
      const refText = f.reference || (() => {
        const vol = f.volume_number ? `ج${f.volume_number}/` : '';
        const page = f.page_number ? `ص${f.page_number}` : '';
        const tabahText = f.tabah ? ` - ${f.tabah}` : '';
        return `${tabahText} ${vol}${page}`.trim();
      })();
      const sourceName = selectedSharh && selectedSharh.id !== -1 ? selectedSharh.title : (f.book_title || selectedBook?.title);

      // Format reference
      const reference = `[${sourceName}${refText ? ' ' + refText : ''}]`;

      return `${f.title}\n\n${f.content}\n\n${reference}`;
    }).join('\n\n---\n\n');
    
    navigator.clipboard.writeText(text);
    await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Copied to clipboard!') });
  };

  useEffect(() => {
    if (view === 'sciences') {
      if (showQuickCaptureInbox) {
        setShowQuickCaptureInbox(false);
      }
      if (isSavingScienceOrder) return;

      const pendingScienceOrder = pendingScienceOrderRef.current;
      if (pendingScienceOrder) {
        const pendingScienceSet = new Set(pendingScienceOrder);
        const hasSameScienceEntities =
          sciences.length === pendingScienceOrder.length &&
          sciences.every(science => pendingScienceSet.has(science.id));

        if (!hasSameScienceEntities) {
          pendingScienceOrderRef.current = null;
        } else {
          const isSynced = sciences.every((science, index) => science.id === pendingScienceOrder[index]);
          if (!isSynced) {
            return;
          }
          pendingScienceOrderRef.current = null;
        }
      }

      setItems(sciences);
    } else if (view === 'books' && selectedScience) {
      setLoading(true);
      fetch(`/api/books?scienceId=${selectedScience.id}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          setItems(Array.isArray(data) ? data : []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (view === 'fawaid' && showQuickCaptureInbox) {
      setLoading(true);
      fetch(`/api/fawaid?status=unformatted&includeUnformatted=true`, { headers: { 'Cache-Control': 'no-cache' } })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          const fawaidList = Array.isArray(data) ? data : [];
          setItems(fawaidList);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (view === 'fawaid' && selectedBook) {
      fetchFawaid();
    }
  }, [view, selectedScience, selectedBook, selectedSharh, sciences, isSavingScienceOrder, showQuickCaptureInbox]);

  const fetchFawaid = () => {
    if (!selectedBook) return;
    setLoading(true);
    let url = `/api/fawaid?bookId=${selectedBook.id}`;
    if (selectedSharh) {
      if (selectedSharh.id === -1) {
        url += `&noSharh=true`;
      } else {
        url += `&sharhId=${selectedSharh.id}`;
      }
    }
    url += `&language=${language === 'ar' ? 'arabic' : 'english'}`;
    fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const fawaidList = Array.isArray(data) ? data : [];
        fawaidList.sort((a, b) => a.page_number - b.page_number);
        setItems(fawaidList);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const handleBack = () => {
    if (view === 'fawaid') {
      if (showQuickCaptureInbox) {
        setShowQuickCaptureInbox(false);
        setView('sciences');
        return;
      }
      setView('books');
      setSelectedBook(null);
      setSelectedSharh(null);
    } else if (view === 'books') {
      setView('sciences');
      setSelectedScience(null);
    }
  };

  const copyIndividual = (f: Fawaid) => {
    performCopy(f);
  };

  const copyAllFromBook = () => {
    if (!selectedBook) return;
    performCopy(items as Fawaid[]);
  };

  const openLinkModal = async (note: Fawaid) => {
    setLinkingNote(note);
    setLinkQuery('');
    setSelectedLinkIds([]);
    setLinkCandidates([]);

    try {
      const res = await fetch(`/api/fawaid/${note.id}/connections`);
      const data = res.ok ? await res.json() : [];
      setLinkedItems(Array.isArray(data) ? data : []);
    } catch {
      setLinkedItems([]);
    }
  };

  const refreshLinkedItems = async (noteId: number) => {
    const res = await fetch(`/api/fawaid/${noteId}/connections`);
    const data = res.ok ? await res.json() : [];
    setLinkedItems(Array.isArray(data) ? data : []);
  };

  const searchForLinkCandidates = async () => {
    if (!linkingNote) {
      setLinkCandidates([]);
      return;
    }

    const queryValue = linkQuery.trim();
    const endpoint = queryValue.length >= 2
      ? `/api/search/semantic?search=${encodeURIComponent(queryValue)}&mode=smart&includeUnformatted=true`
      : '/api/fawaid?includeUnformatted=true';

    const res = await fetch(endpoint);
    const data = res.ok ? await res.json() : { results: [] };
    const pool = Array.isArray(data) ? data : (data.results || []);
    const results = pool.filter((x: Fawaid) => x.id !== linkingNote.id).slice(0, 80);
    setLinkCandidates(results);
  };

  const connectSelected = async () => {
    if (!linkingNote || selectedLinkIds.length === 0) return;
    const res = await fetch(`/api/fawaid/${linkingNote.id}/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectedIds: selectedLinkIds })
    });
    if (res.ok) {
      await refreshLinkedItems(linkingNote.id);
      setSelectedLinkIds([]);
      if (showQuickCaptureInbox) {
        const updated = await fetch(`/api/fawaid?status=unformatted&includeUnformatted=true`);
        setItems(updated.ok ? await updated.json() : []);
      } else {
        fetchFawaid();
      }
    }
  };

  const jumpToLinkedFaidah = (item: Fawaid) => {
    setShowQuickCaptureInbox(false);
    setSelectedScience({ id: Number((item as any).science_id), name: (item as any).science_name });
    setSelectedBook({
      id: Number(item.book_id),
      science_id: Number((item as any).science_id),
      title: item.book_title || 'Book',
      total_pages: 0
    });
    setSelectedSharh(item.sharh_id ? { id: Number(item.sharh_id), book_id: Number(item.book_id), title: (item as any).sharh_title || '' } : null);
    setView('fawaid');
    setExpandedNote(item);
    setLinkingNote(null);
  };

  const openFormatNow = (note: Fawaid) => {
    const scienceId = Number((note as any).science_id);
    const bookId = Number(note.book_id);
    const hasScience = Number.isFinite(scienceId) && scienceId > 0;
    const hasBook = Number.isFinite(bookId) && bookId > 0;

    if (hasScience) {
      setSelectedScience({ id: scienceId, name: (note as any).science_name || '' });
    } else {
      setSelectedScience(null);
    }

    if (hasScience && hasBook) {
      setSelectedBook({
        id: bookId,
        science_id: scienceId,
        title: note.book_title || '',
        total_pages: 0
      });
      setSelectedSharh(note.sharh_id ? { id: Number(note.sharh_id), book_id: bookId, title: note.sharh_title || '' } : null);
    } else {
      setSelectedBook(null);
      setSelectedSharh(null);
    }

    setFormattingDraft(note);
    setIsAddingFaidah(true);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchForLinkCandidates();
    }, 250);
    return () => clearTimeout(timer);
  }, [linkQuery, linkingNote?.id]);

  const handleDelete = async (id: number) => {
    if (!(await showModal({ type: 'confirm', title: t ? t('Confirm') : 'Confirm', message: t('Delete Fawaid Confirmation') }) === 'confirm')) return;
    try {
      const res = await fetch(`/api/fawaid/${id}`, { method: 'DELETE' });
      
      if (!res.ok) {
        const error = await res.json();
        await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: error.error || t('Delete Error') });
        return;
      }

      // Update UI immediately by filtering local state
      setItems(prevItems => prevItems.filter(i => i.id !== id));
      
      if (onUpdate) onUpdate();
      
      if (expandedNote?.id === id) {
        setExpandedNote(null);
      }
    } catch (error) {
      console.error('Error deleting fawaid:', error);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Delete Error') });
    }
  };

  const handleUpdate = async (updatedNote: Fawaid) => {
    await fetch(`/api/fawaid/${updatedNote.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...updatedNote,
        language: language === 'ar' ? 'arabic' : 'english'
      })
    });
    setItems(items.map(i => i.id === updatedNote.id ? updatedNote : i));
    setEditingId(null);
  };

  const handleDeleteBook = async (id: number) => {
    if (!(await showModal({ type: 'confirm', title: t ? t('Confirm') : 'Confirm', message: t('Delete Book Confirmation') }) === 'confirm')) return;
    try {
      const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
      
      if (!res.ok) {
        const error = await res.json();
        console.error('Failed to delete book', error);
        await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: error.error || t('Delete Error') });
        return;
      }
      
      setItems(prevItems => prevItems.filter(i => i.id !== id));
    } catch (error) {
      console.error('Error deleting book:', error);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Delete Error') });
    }
  };

  const handleRenameSharh = (sharh: Sharh) => {
    console.log('Rename Sharh clicked', sharh);
    setEditingSharh(sharh);
    setEditSharhTitle(sharh.title);
    setEditSharhAuthor(sharh.author || '');
  };

  const submitEditBook = async () => {
    if (!editingBook || !editBookTitle.trim()) return;

    try {
      const res = await fetch(`/api/books/${editingBook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: editBookTitle.trim(),
          author: editBookAuthor.trim() || null
        })
      });
      if (!res.ok) throw new Error('Failed to rename book');
      
      setItems(prev => prev.map(item => item.id === editingBook.id ? { ...item, title: editBookTitle.trim(), author: editBookAuthor.trim() || undefined } : item));
      setEditingBook(null);
      setEditBookTitle('');
      setEditBookAuthor('');
    } catch (e) {
      console.error(e);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Error') });
    }
  };

  const submitEditSharh = async () => {
    if (!editingSharh || !editSharhTitle.trim()) return;

    try {
      const res = await fetch(`/api/shuruuh/${editingSharh.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: editSharhTitle.trim(),
          author: editSharhAuthor.trim() || undefined
        })
      });
      if (!res.ok) throw new Error('Failed to rename');
      
      setItems(prev => prev.map(item => item.id === editingSharh.id ? { ...item, title: editSharhTitle.trim(), author: editSharhAuthor.trim() || undefined } : item));
      setEditingSharh(null);
      setEditSharhTitle('');
      setEditSharhAuthor('');
    } catch (e) {
      console.error(e);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Error') });
    }
  };

  const handleDeleteSharh = async (id: number) => {
    try {
      const res = await fetch(`/api/shuruuh/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json();
        await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: error.error || t('Delete Error') });
        return;
      }
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Delete Error') });
    }
  };

  const handleAddSharh = () => {
    console.log('Add Sharh clicked');
    setIsAddingSharh(true);
  };

  const handleAddSharhSubmit = async () => {
    if (!newSharhTitle.trim() || !selectedBook) return;
    
    try {
      const res = await fetch('/api/shuruuh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          book_id: selectedBook.id, 
          title: newSharhTitle.trim(),
          author: newSharhAuthor.trim() || undefined
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create sharh');
      }

      const newSharh = await res.json();
      if (newSharh.id) {
        setBookShuruuh([...bookShuruuh, newSharh]);
        setSelectedSharh(newSharh);
        setIsAddingSharh(false);
        setNewSharhTitle('');
        setNewSharhAuthor('');
      }
    } catch (e: any) {
      console.error(e);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: e.message || t('Error') });
    }
  };

  const handleAddFaidah = async () => {
    if (!selectedScience || !selectedBook) {
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Select Book First') });
      return;
    }
    setIsAddingFaidah(true);
  };

  const handleAddBookSubmit = async () => {
    if (!newBookTitle.trim() || !selectedScience) return;

    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          science_id: selectedScience.id,
          title: newBookTitle.trim(),
          author: newBookAuthor.trim() || undefined
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create book');
      }

      const newBook = await res.json();
      if (newBook.id) {
        setItems([...items, newBook]);
        setIsAddingBook(false);
        setNewBookTitle('');
        setNewBookAuthor('');
        if (onUpdate) onUpdate();
      }
    } catch (e: any) {
      console.error(e);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: e.message || t('Error') });
    }
  };

  const handleScienceDragStart = (event: DragStartEvent) => {
    if (isSavingScienceOrder) return;
    const activeId = Number(event.active.id);
    if (!Number.isNaN(activeId)) {
      setActiveScienceId(activeId);
    }
  };

  const handleScienceDragCancel = () => {
    setActiveScienceId(null);
  };

  const handleScienceDragEnd = async (event: DragEndEvent) => {
    setActiveScienceId(null);
    if (isSavingScienceOrder) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = Number(active.id);
    const overId = Number(over.id);
    if (Number.isNaN(activeId) || Number.isNaN(overId)) return;

    const scienceItems = items as Science[];
    const sourceIndex = scienceItems.findIndex(item => item.id === activeId);
    const destIndex = scienceItems.findIndex(item => item.id === overId);

    if (sourceIndex === -1 || destIndex === -1 || sourceIndex === destIndex) return;

    const currentItems = [...scienceItems];
    const reorderedItems = arrayMove(currentItems, sourceIndex, destIndex);
    const orderedIds = reorderedItems.map(item => item.id);

    scienceOrderSnapshotRef.current = currentItems;
    setItems(reorderedItems);
    setIsSavingScienceOrder(true);

    try {
      const response = await fetch('/api/sciences/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error || 'Failed to reorder sciences');
      }

      pendingScienceOrderRef.current = orderedIds;
      if (onUpdate) {
        await onUpdate();
      }
    } catch (e) {
      console.error('Failed to reorder sciences', e);
      pendingScienceOrderRef.current = null;
      setItems(scienceOrderSnapshotRef.current ?? sciences);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Error') });
    } finally {
      scienceOrderSnapshotRef.current = null;
      setIsSavingScienceOrder(false);
    }
  };

  const handleMoveBook = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(index, 1);
    newItems.splice(newIndex, 0, reorderedItem);

    setItems(newItems);

    try {
      await fetch('/api/books/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: newItems.map((i: any) => i.id) })
      });
    } catch (e) {
      console.error('Failed to reorder books', e);
    }
  };

  const handleDeleteScience = async (id: number) => {
    if (!(await showModal({ type: 'confirm', title: t ? t('Confirm') : 'Confirm', message: t('Delete Science Confirmation') }) === 'confirm')) return;
    try {
      const res = await fetch(`/api/sciences/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json();
        await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: error.error || t('Delete Error') });
        return;
      }
      setItems(prevItems => prevItems.filter(i => i.id !== id));
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error deleting science:', error);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Delete Error') });
    }
  };

  const readScienceError = async (res: Response) => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  const getScienceErrorMessage = (code?: string) => {
    switch (code) {
      case 'SCIENCE_NAME_REQUIRED':
        return t('Science Name Required');
      case 'SCIENCE_ALREADY_EXISTS':
        return t('Science Already Exists');
      case 'SCIENCE_NOT_FOUND':
        return t('Science Not Found');
      default:
        return t('Error');
    }
  };

  const handleEditScience = (science: Science) => {
    setEditingScience(science);
    setEditScienceName(science.name);
  };

  const submitEditScience = async () => {
    if (!editingScience) {
      return;
    }

    const trimmedName = editScienceName.trim();

    if (!trimmedName) {
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Science Name Required') });
      return;
    }

    if (trimmedName === editingScience.name) {
      setEditingScience(null);
      return;
    }

    try {
      const res = await fetch(`/api/sciences/${editingScience.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName })
      });
      if (!res.ok) {
        const error = await readScienceError(res);
        await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: getScienceErrorMessage(error?.code) || error?.error || t('Error') });
        return;
      }
      
      setItems(prev => prev.map(item => item.id === editingScience.id ? { ...item, name: trimmedName } : item));
      if (onUpdate) onUpdate();
      setEditingScience(null);
    } catch (e) {
      console.error(e);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Error') });
    }
  };

  const handleAddScienceSubmit = async () => {
    const trimmedName = newScienceName.trim();

    if (!trimmedName) {
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Science Name Required') });
      return;
    }

    try {
      const res = await fetch('/api/sciences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName })
      });
      if (!res.ok) {
        const error = await readScienceError(res);
        await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: getScienceErrorMessage(error?.code) || error?.error || t('Error') });
        return;
      }
      const newSci = await res.json();
      if (newSci.id) {
        setItems([...items, newSci]);
        if (onUpdate) onUpdate();
        setIsAddingScience(false);
        setNewScienceName('');
      }
    } catch (e) {
      console.error(e);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Error') });
    }
  };

  const scienceItems = items as Science[];
  const activeScience =
    activeScienceId === null
      ? null
      : scienceItems.find(science => science.id === activeScienceId) || null;

  return (
    <div className="space-y-6">
      {/* Add Science Modal */}
      <AnimatePresence>
        {isAddingScience && (
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
              <h3 className="text-2xl font-serif font-bold mb-4 dark:text-white">{t('Add Science')}</h3>
              <input
                type="text"
                value={newScienceName}
                onChange={(e) => setNewScienceName(e.target.value)}
                placeholder={t('Enter Science Name')}
                className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 mb-6"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddScienceSubmit();
                  if (e.key === 'Escape') {
                    setIsAddingScience(false);
                    setNewScienceName('');
                  }
                }}
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsAddingScience(false);
                    setNewScienceName('');
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleAddScienceSubmit}
                  disabled={!newScienceName.trim()}
                  className="px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Save')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Science Modal */}
      <AnimatePresence>
        {editingScience && (
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
              <h3 className="text-2xl font-serif font-bold mb-4 dark:text-white">{t('Edit Science')}</h3>
              <input
                type="text"
                value={editScienceName}
                onChange={(e) => setEditScienceName(e.target.value)}
                placeholder={t('Enter Science Name')}
                className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 mb-6"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitEditScience();
                  if (e.key === 'Escape') {
                    setEditingScience(null);
                  }
                }}
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setEditingScience(null)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={submitEditScience}
                  disabled={!editScienceName.trim() || editScienceName === editingScience.name}
                  className="px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Save')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  />
                </div>
                
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block mb-2">{t('Author')} ({t('Optional')})</label>
                  <input
                    type="text"
                    value={newSharhAuthor}
                    onChange={(e) => setNewSharhAuthor(e.target.value)}
                    placeholder={t('Author Name')}
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
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

      {/* Edit Sharh Modal */}
      <AnimatePresence>
        {editingSharh && (
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
              <h3 className="text-2xl font-serif font-bold mb-4 dark:text-white">{t('Edit Sharh')}</h3>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block mb-2">{t('Sharh Name')} *</label>
                  <input
                    type="text"
                    value={editSharhTitle}
                    onChange={(e) => setEditSharhTitle(e.target.value)}
                    placeholder={t('Enter Sharh Name')}
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block mb-2">{t('Author')} ({t('Optional')})</label>
                  <input
                    type="text"
                    value={editSharhAuthor}
                    onChange={(e) => setEditSharhAuthor(e.target.value)}
                    placeholder={t('Author Name')}
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setEditingSharh(null);
                    setEditSharhTitle('');
                    setEditSharhAuthor('');
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={submitEditSharh}
                  disabled={!editSharhTitle.trim()}
                  className="px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Save')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Book Modal */}
      <AnimatePresence>
        {isAddingBook && (
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
              <h3 className="text-2xl font-serif font-bold mb-4 dark:text-white">{t('Add Book')}</h3>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block mb-2">{t('Book Title')} *</label>
                  <input
                    type="text"
                    value={newBookTitle}
                    onChange={(e) => setNewBookTitle(e.target.value)}
                    placeholder={t('Enter Book Title')}
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddBookSubmit();
                      if (e.key === 'Escape') {
                        setIsAddingBook(false);
                        setNewBookTitle('');
                        setNewBookAuthor('');
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block mb-2">{t('Author')} ({t('Optional')})</label>
                  <input
                    type="text"
                    value={newBookAuthor}
                    onChange={(e) => setNewBookAuthor(e.target.value)}
                    placeholder={t('Author Name')}
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddBookSubmit();
                      if (e.key === 'Escape') {
                        setIsAddingBook(false);
                        setNewBookTitle('');
                        setNewBookAuthor('');
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsAddingBook(false);
                    setNewBookTitle('');
                    setNewBookAuthor('');
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleAddBookSubmit}
                  disabled={!newBookTitle.trim()}
                  className="px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Save')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Book Modal */}
      <AnimatePresence>
        {editingBook && (
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
              <h3 className="text-2xl font-serif font-bold mb-4 dark:text-white">{t('Edit Book')}</h3>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block mb-2">{t('Book Title')} *</label>
                  <input
                    type="text"
                    value={editBookTitle}
                    onChange={(e) => setEditBookTitle(e.target.value)}
                    placeholder={t('Enter Book Title')}
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitEditBook();
                      if (e.key === 'Escape') {
                        setEditingBook(null);
                        setEditBookTitle('');
                        setEditBookAuthor('');
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block mb-2">{t('Author')} ({t('Optional')})</label>
                  <input
                    type="text"
                    value={editBookAuthor}
                    onChange={(e) => setEditBookAuthor(e.target.value)}
                    placeholder={t('Author Name')}
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end mt-8">
                <button
                  type="button"
                  onClick={() => {
                    setEditingBook(null);
                    setEditBookTitle('');
                    setEditBookAuthor('');
                  }}
                  className="px-4 py-2 px-6 rounded-xl text-sm font-bold text-[#8E8E8E] dark:text-gray-400 hover:text-[#18407B] dark:hover:text-zinc-300 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  onClick={submitEditBook}
                  disabled={!editBookTitle.trim()}
                  className="px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Save')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 max-w-full">
          {view !== 'sciences' && !showQuickCaptureInbox && (
            <button 
              onClick={handleBack}
              className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-xl transition-all dark:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-3xl font-serif font-bold text-[#1A1A1A] dark:text-white truncate" title={view === 'sciences' ? t('Sciences') : view === 'books' ? selectedScience?.name : (showQuickCaptureInbox ? 'Quick Capture Inbox' : (selectedSharh && selectedSharh.id !== -1 ? selectedSharh.title : selectedBook?.title))}>
              {view === 'sciences' && t('Sciences')}
              {view === 'books' && selectedScience?.name}
              {view === 'fawaid' && (showQuickCaptureInbox ? 'Quick Capture Inbox' : (selectedSharh && selectedSharh.id !== -1 ? selectedSharh.title : selectedBook?.title))}
            </h2>
            {!showQuickCaptureInbox && (
              <nav className="flex items-center gap-2 text-sm text-[#8E8E8E] dark:text-gray-400 mt-1">
                <span className="hover:text-[#18407B] dark:hover:text-zinc-300 cursor-pointer" onClick={() => { setView('sciences'); setSelectedScience(null); setSelectedBook(null); setSelectedSharh(null); }}>{t('Library')}</span>
                {selectedScience && (
                  <>
                    <ChevronRight className="w-3 h-3" />
                    <span className="hover:text-[#18407B] dark:hover:text-zinc-300 cursor-pointer montserrat-semibold" onClick={() => { setView('books'); setSelectedBook(null); setSelectedSharh(null); }}>{selectedScience.name}</span>
                  </>
                )}
                {selectedBook && (
                  <>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-[#18407B] dark:text-zinc-300 aref-ruqaa-regular">{selectedBook.title}</span>
                  </>
                )}
                {selectedSharh && selectedSharh.id !== -1 && (
                  <>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-[#18407B] dark:text-zinc-300 aref-ruqaa-regular">{selectedSharh.title}</span>
                  </>
                )}
              </nav>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'books' && (
            <button
              onClick={() => setIsAddingBook(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all"
            >
              <Plus className="w-4 h-4" /> {t('Add Book')}
            </button>
          )}

          {view === 'fawaid' && selectedBook && !showQuickCaptureInbox && (
            <select
              className="bg-white dark:bg-zinc-800 border border-[#E5E7EB] dark:border-zinc-700 text-sm font-bold text-[#1A1A1A] dark:text-white rounded-xl px-4 py-2 pr-8 hover:bg-[#F5F5F7] dark:hover:bg-zinc-700 transition-all outline-none cursor-pointer appearance-none bg-no-repeat"
              style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238E8E8E%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")', backgroundPosition: 'right 0.5rem center', backgroundSize: '1em' }}
              value={selectedSharh ? selectedSharh.id : ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setSelectedSharh(null);
                } else if (val === "-1") {
                  setSelectedSharh({ id: -1, title: t('General Notes'), book_id: selectedBook.id, author: null } as Sharh);
                } else if (val === "new") {
                  setIsAddingSharh(true);
                  e.target.value = selectedSharh ? String(selectedSharh.id) : "";
                } else {
                  const sharh = bookShuruuh.find(s => s.id === Number(val));
                  if (sharh) setSelectedSharh(sharh);
                }
              }}
            >
              <option value="">{t('All Notes')}</option>
              <option value="-1">{t('General Notes')}</option>
              {bookShuruuh.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
              <option value="new">+ {t('Add Sharh')}</option>
            </select>
          )}

          {selectedBook && view === 'fawaid' && !showQuickCaptureInbox && (
            <button
              onClick={handleAddFaidah}
              className="flex items-center gap-2 px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all"
            >
              <Plus className="w-4 h-4" /> {t('Add Fāʾidah')}
            </button>
          )}

          {view === 'fawaid' && items.length > 0 && !showQuickCaptureInbox && (
            <>
              <button 
                onClick={copyAllFromBook}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 border border-[#E5E7EB] dark:border-zinc-700 rounded-xl text-sm font-bold hover:bg-[#F5F5F7] dark:hover:bg-zinc-700 transition-all dark:text-white"
              >
                <Copy className="w-4 h-4" /> {t('Copy All')}
              </button>
            </>
          )}
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-[#18407B] animate-spin" />
        </div>
      ) : view === 'sciences' ? (
        <DndContext
          sensors={scienceDragSensors}
          collisionDetection={closestCenter}
          onDragStart={handleScienceDragStart}
          onDragCancel={handleScienceDragCancel}
          onDragEnd={handleScienceDragEnd}
        >
          <SortableContext items={scienceItems.map(item => item.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 auto-rows-[1fr]">
              {scienceItems.map((item) => (
                <div key={item.id} className="h-full">
                  <SortableScienceCard
                    science={item}
                    onClick={() => { setSelectedScience(item); setView('books'); }}
                    onEdit={() => handleEditScience(item)}
                    onDelete={() => handleDeleteScience(item.id)}
                    t={t}
                    disabled={isSavingScienceOrder}
                  />
                </div>
              ))}

              {/* Add Science Card - always at the end, not draggable */}
              <div className="h-full">
                <AddScienceCard
                  onClick={() => setIsAddingScience(true)}
                  t={t}
                />
              </div>
            </div>
          </SortableContext>

          <DragOverlay>
            {activeScience ? (
              <div className="opacity-90">
                <ScienceCard
                  science={activeScience}
                  onClick={() => {}}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  t={t}
                  forceHandleVisible={true}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className={`grid gap-4 md:gap-6 ${view === 'books' ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
          <AnimatePresence mode="popLayout">
            {items?.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: (idx + 1) * 0.05 }}
              >
                {view === 'books' && (
                  <BookCard 
                    book={item} 
                    onClick={() => { setSelectedBook(item); setSelectedSharh(null); setView('fawaid'); }} 
                    onEdit={() => { setEditingBook(item); setEditBookTitle(item.title); setEditBookAuthor(item.author || ''); }}
                    onDelete={() => handleDeleteBook(item.id)}
                    onMoveUp={() => handleMoveBook(idx, 'up')}
                    onMoveDown={() => handleMoveBook(idx, 'down')}
                    isFirst={idx === 0}
                    isLast={idx === items.length - 1}
                    t={t}
                  />
                )}
                {view === 'fawaid' && (
                  <FawaidCard 
                    fawaid={item} 
                    onEdit={() => setEditingId(item.id)}
                    onDelete={() => handleDelete(item.id)}
                    onCopy={() => copyIndividual(item)} 
                    onExpand={() => setExpandedNote(item)}
                    onLink={() => openLinkModal(item)}
                    onFormatNow={showQuickCaptureInbox ? () => openFormatNow(item) : undefined}
                    isQuickCaptureInbox={showQuickCaptureInbox}
                    t={t}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Edit Fawaid Modal */}
      <AnimatePresence>
        {editingId && (
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
              
              {(() => {
                const note = items.find(i => i.id === editingId);
                if (!note) return null;
                return (
                  <div className="space-y-4 mb-6">
                    <input 
                      value={note.title}
                      onChange={e => setItems(items.map(i => i.id === editingId ? {...i, title: e.target.value} : i))}
                      className="aref-ruqaa-regular text-2xl w-full border-b border-[#E5E7EB] dark:border-zinc-700 pb-2 focus:outline-none focus:border-[#6197EC] bg-transparent dark:text-white"
                      placeholder={t('Title Placeholder')}
                      dir="auto"
                    />
                    <textarea 
                      value={note.content}
                      onChange={e => setItems(items.map(i => i.id === editingId ? {...i, content: e.target.value} : i))}
                      className="w-full h-32 resize-none text-xl scheherazade-new-regular leading-relaxed focus:outline-none bg-transparent dark:text-gray-300"
                      placeholder={t('Content Placeholder')}
                      dir="auto"
                    />
                    <textarea 
                      value={note.extra_notes || ''}
                      onChange={e => setItems(items.map(i => i.id === editingId ? {...i, extra_notes: e.target.value} : i))}
                      className="w-full h-16 resize-none text-lg scheherazade-new-regular leading-relaxed focus:outline-none bg-[#F5F5F7] dark:bg-zinc-800 dark:text-gray-300 p-2 rounded-md"
                      placeholder={t('Enter Extra Notes')}
                      dir="auto"
                    />
                    <div className="flex flex-col gap-2">
                      <input
                        value={note.author || ''}
                        onChange={e => setItems(items.map(i => i.id === editingId ? {...i, author: e.target.value} : i))}
                        className="w-full text-xs font-bold bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white px-3 py-2 rounded-md"
                        placeholder={t('Author Placeholder')}
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={note.volume_number || ''}
                          onChange={e => setItems(items.map(i => i.id === editingId ? {...i, volume_number: e.target.value} : i))}
                          className="flex-1 min-w-0 text-xs font-bold bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white px-2 py-1 rounded-md"
                          placeholder={t('Volume')}
                        />
                        <input
                          type="number"
                          value={note.page_number || ''}
                          onChange={e => setItems(items.map(i => i.id === editingId ? {...i, page_number: parseInt(e.target.value)} : i))}
                          className="flex-1 min-w-0 text-xs font-bold bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white px-2 py-1 rounded-md"
                          placeholder={t('Page')}
                        />
                        <input
                          type="text"
                          value={note.tabah || ''}
                          onChange={e => setItems(items.map(i => i.id === editingId ? {...i, tabah: e.target.value} : i))}
                          className="flex-1 min-w-0 text-xs font-bold bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white px-2 py-1 rounded-md"
                          placeholder={t('Edition')}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 transition-all"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={async () => {
                    const note = items.find(i => i.id === editingId);
                    if (note) await handleUpdate(note);
                    setEditingId(null);
                  }}
                  className="px-4 py-2 bg-[#6197EC] text-white rounded-xl text-sm font-bold hover:bg-[#4C81D9] transition-all"
                >
                  {t('Save')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {items.length === 0 && !loading && (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 border-dashed">
          <p className="text-[#8E8E8E] dark:text-gray-500">{t('No items found')}</p>
        </div>
      )}

      {/* Expanded Note Modal */}
      <AnimatePresence>
        {expandedNote && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setExpandedNote(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-3xl p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6 relative">
                <div className="flex-1 flex flex-col items-center">
                  <h3 className="text-3xl aref-ruqaa-regular text-center dark:text-white" dir="auto">{expandedNote.title || t('Untitled Note')}</h3>
                  <div className="flex items-center justify-center flex-wrap gap-2 mt-2 text-sm text-[#8E8E8E] dark:text-gray-400">
                    <span>{expandedNote.book_title}</span>
                    {expandedNote.sharh_title && (
                      <>
                        <span>•</span>
                        <span>{expandedNote.sharh_title}</span>
                      </>
                    )}
                    {(expandedNote.reference || expandedNote.volume_number || expandedNote.page_number || expandedNote.tabah) && (
                      <>
                        <span>•</span>
                        <span>{expandedNote.reference || [
                          expandedNote.tabah ? `${expandedNote.tabah}` : '',
                          expandedNote.volume_number ? `${t('Volume')} ${expandedNote.volume_number}` : '',
                          expandedNote.page_number ? `${t('Page')} ${expandedNote.page_number}` : ''
                        ].filter(Boolean).join(' • ')}</span>
                      </>
                    )}
                    {expandedNote.author && (
                      <>
                        <span>•</span>
                        <span>{expandedNote.author}</span>
                      </>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => setExpandedNote(null)}
                  className="absolute top-0 right-0 p-2 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 rounded-full transition-all dark:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="prose dark:prose-invert max-w-none mt-2">
                <p className="text-xl scheherazade-new-regular leading-relaxed whitespace-pre-wrap dark:text-gray-300" dir="auto">
                  {expandedNote.content}
                </p>
                {expandedNote.extra_notes && (
                  <div className="mt-8 p-6 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                    <h4 className="text-sm font-bold text-emerald-600 dark:text-emerald-500 mb-4 uppercase tracking-wider">{t('Extra Notes')}</h4>
                    <p className="text-lg scheherazade-new-regular leading-relaxed whitespace-pre-wrap dark:text-gray-300" dir="auto">
                      {expandedNote.extra_notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-[#E5E7EB] dark:border-zinc-800 flex justify-between items-center">
                <div className="flex gap-2">
                  {expandedNote.tags?.map((tag, i) => (
                    <span key={i} className="text-xs font-bold bg-[#F5F5F7] dark:bg-zinc-800 text-[#8E8E8E] dark:text-gray-400 px-3 py-1 rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="mt-4 flex justify-end">
                <button 
                  onClick={() => handleDelete(expandedNote.id)}
                  className="flex items-center gap-2 px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all text-sm font-bold"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('Delete')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Faidah Modal */}
      <AnimatePresence>
        {isAddingFaidah && ((selectedScience && selectedBook) || formattingDraft) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsAddingFaidah(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-[#E5E7EB] dark:border-zinc-800 p-6"
            >
              <Capture
                sciences={sciences}
                prefilledScience={selectedScience || undefined}
                prefilledBook={selectedBook || undefined}
                prefilledSharh={selectedSharh}
                prefilledDraft={formattingDraft ? {
                  title: formattingDraft.title || '',
                  content: formattingDraft.content || '',
                  extra_notes: formattingDraft.extra_notes || '',
                  author: formattingDraft.author || '',
                  pageNumber: formattingDraft.page_number ? String(formattingDraft.page_number) : '',
                  volumeNumber: formattingDraft.volume_number || '',
                  tabah: formattingDraft.tabah || '',
                  tags: formattingDraft.tags || []
                } : undefined}
                editingFawaidId={formattingDraft?.id || null}
                isModal={true}
                onSave={() => {
                  setIsAddingFaidah(false);
                  setFormattingDraft(null);
                  if (showQuickCaptureInbox) {
                    fetch('/api/fawaid?status=unformatted&includeUnformatted=true', { headers: { 'Cache-Control': 'no-cache' } })
                      .then(res => res.ok ? res.json() : [])
                      .then(data => setItems(Array.isArray(data) ? data : []));
                  } else {
                    fetchFawaid();
                  }
                  if (onUpdate) onUpdate();
                }}
                onCancel={() => {
                  setIsAddingFaidah(false);
                  setFormattingDraft(null);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {linkingNote && (
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
              className="bg-white dark:bg-zinc-900 rounded-3xl p-6 max-w-3xl w-full shadow-2xl border border-[#E5E7EB] dark:border-zinc-800"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-serif font-bold dark:text-white">Linked Fawāʾid</h3>
                <button onClick={() => setLinkingNote(null)} className="p-2 rounded hover:bg-[#F5F5F7] dark:hover:bg-zinc-800">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E]">Search and link</div>
                  <input
                    value={linkQuery}
                    onChange={e => setLinkQuery(e.target.value)}
                    placeholder="Search all fawāʾid (leave empty to browse)..."
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white rounded-xl px-4 py-3"
                  />
                  <div className="max-h-56 overflow-y-auto space-y-2">
                    {linkCandidates.map(c => (
                      <label key={c.id} className="flex items-start gap-2 p-2 border border-[#E5E7EB] dark:border-zinc-800 rounded-lg">
                        <input
                          type="checkbox"
                          checked={selectedLinkIds.includes(c.id)}
                          onChange={() => setSelectedLinkIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                        />
                        <div>
                          <div className="text-sm font-bold dark:text-white">{c.title || 'Untitled'}</div>
                          <div className="text-xs text-[#8E8E8E] dark:text-gray-500">{String(c.content || '').slice(0, 100)}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={connectSelected}
                    className="w-full px-3 py-2 rounded-xl bg-[#6197EC] text-white text-sm font-bold disabled:opacity-50"
                    disabled={selectedLinkIds.length === 0}
                  >
                    Connect selected ({selectedLinkIds.length})
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] pt-2">Already linked</div>
                  <div className="max-h-28 overflow-y-auto space-y-2">
                    {linkedItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => jumpToLinkedFaidah(item)}
                        className="w-full text-left p-2 rounded border border-[#E5E7EB] dark:border-zinc-800 text-sm dark:text-white hover:bg-[#F5F5F7] dark:hover:bg-zinc-800"
                      >
                        {item.title || `#${item.id}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SortableScienceCard({
  science,
  onClick,
  onEdit,
  onDelete,
  t,
  disabled
}: {
  science: Science,
  onClick: () => void,
  onEdit: () => void,
  onDelete: () => void,
  t: any,
  disabled: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: science.id,
    disabled
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="h-full">
      <ScienceCard
        science={science}
        onClick={onClick}
        onEdit={onEdit}
        onDelete={onDelete}
        t={t}
        dragHandleProps={disabled ? undefined : { ...attributes, ...listeners }}
        forceHandleVisible={isDragging}
      />
    </div>
  );
}

function ScienceCard({
  science,
  onClick,
  onEdit,
  onDelete,
  t,
  dragHandleProps,
  forceHandleVisible = false
}: {
  science: Science,
  onClick: () => void,
  onEdit: () => void,
  onDelete: () => void,
  t: any,
  dragHandleProps?: any,
  forceHandleVisible?: boolean
}) {
  return (
    <div
      className="w-full bg-white dark:bg-zinc-900 p-5 md:p-8 rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-[#6197EC] dark:hover:border-zinc-600 transition-all text-left group relative flex flex-col h-full"
    >
      {/* Drag Handle - positioned at top left */}
      <div
        {...dragHandleProps}
        className={`absolute top-4 left-4 p-2 text-gray-300 hover:text-gray-500 dark:text-zinc-700 dark:hover:text-zinc-500 cursor-grab active:cursor-grabbing transition-opacity ${
          forceHandleVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        title={t('Drag to reorder')}
      >
        <GripVertical className="w-5 h-5" />
      </div>

      <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-2 text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300 bg-[#F5F5F7] dark:bg-zinc-800 rounded-lg"
          title={t('Edit')}
        >
          <Edit2 className="w-4 h-4" />
        </button>
      </div>
      <button onClick={onClick} className="w-full text-left flex-1">
        <div className="p-4 bg-[#F5F5F7] dark:bg-zinc-800 rounded-2xl w-fit mb-6 group-hover:bg-[#6197EC] group-hover:text-white transition-all">
          <Library className="w-8 h-8 dark:text-white group-hover:text-white" />
        </div>
        <h3 className="text-lg md:text-xl montserrat-bold mb-1 dark:text-white pr-8 md:pr-24">{science.name}</h3>
        <p className="text-sm text-[#8E8E8E] dark:text-gray-500">{t('Explore Description')}</p>
      </button>
      <div className="mt-4 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-2 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 bg-[#F5F5F7] dark:bg-zinc-800 rounded-lg"
          title={t('Delete')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function AddScienceCard({ onClick, t }: { onClick: () => void, t: any }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="w-full bg-gradient-to-br from-[#6197EC] to-[#4C81D9] dark:from-[#7567EE] dark:to-[#6197EC] p-5 md:p-8 rounded-3xl border-2 border-dashed border-[#A69DF4] dark:border-[#8D82F1] shadow-sm hover:shadow-lg hover:border-white/40 dark:hover:border-white/30 transition-all text-left group relative flex flex-col h-full items-center justify-center min-h-[200px]"
    >
      <div className="p-4 bg-white/20 dark:bg-white/15 rounded-2xl w-fit mb-4 group-hover:bg-white/30 dark:group-hover:bg-white/25 transition-all">
        <Plus className="w-8 h-8 text-white" />
      </div>
      <h3 className="text-xl font-serif font-bold text-white">{t('Add Science')}</h3>
      <p className="text-sm text-white/80 mt-2">{t('Create new science category')}</p>
    </button>
  );
}


function BookCard({ 
  book, 
  onClick, 
  onEdit,
  onDelete, 
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  t 
}: { 
  book: Book, 
  onClick: () => void, 
  onEdit: () => void,
  onDelete: () => void, 
  onMoveUp: () => void,
  onMoveDown: () => void,
  isFirst: boolean,
  isLast: boolean,
  t: any 
}) {
  return (
    <div 
      onClick={onClick}
      className="w-full bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-[#6197EC] dark:hover:border-zinc-600 transition-all text-left group flex flex-col h-full cursor-pointer relative"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-500 rounded-xl">
          <BookOpen className="w-6 h-6" />
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={isFirst}
            className="p-2 text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300 bg-[#F5F5F7] dark:bg-zinc-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
            title={t('Move Up')}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            disabled={isLast}
            className="p-2 text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300 bg-[#F5F5F7] dark:bg-zinc-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
            title={t('Move Down')}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      </div>
      <h3 className="text-lg aref-ruqaa-regular mb-2 flex-1 dark:text-white">{book.title}</h3>
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2 text-xs text-[#8E8E8E] dark:text-gray-500">
          <FileText className="w-3 h-3" />
          <span>{book.author || t('Unknown Author')}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
            title={t('Edit')}
          >
            <Edit2 className="w-4 h-4 pointer-events-none" />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
            title={t('Delete')}
          >
            <Trash2 className="w-4 h-4 pointer-events-none" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SharhCard({ sharh, onClick, onDelete, onRename, t, isGeneral }: { sharh: Sharh, onClick: () => void, onDelete: () => void, onRename: () => void, t: any, isGeneral?: boolean }) {
  return (
    <div 
      onClick={onClick}
      className="w-full bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-[#6197EC] dark:hover:border-zinc-600 transition-all text-left group flex flex-col h-full cursor-pointer relative"
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 ${isGeneral ? 'bg-gray-50 dark:bg-zinc-800 text-gray-600 dark:text-gray-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-500'} rounded-xl`}>
          <MessageSquare className="w-6 h-6" />
        </div>
      </div>
      <h3 className="text-lg aref-ruqaa-regular mb-2 flex-1 dark:text-white">{sharh.title}</h3>
      {sharh.author && <p className="text-sm text-[#8E8E8E] dark:text-gray-400 mb-4">{sharh.author}</p>}
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2 text-xs text-[#8E8E8E] dark:text-gray-500">
          <FileText className="w-3 h-3" />
          <span>{t('View all fawāʾid')}</span>
        </div>
        {!isGeneral && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onRename();
              }}
              className="p-2 text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
              title={t('Rename')}
            >
              <Edit2 className="w-4 h-4 pointer-events-none" />
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
              title={t('Delete')}
            >
              <Trash2 className="w-4 h-4 pointer-events-none" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FawaidCard({ 
  fawaid, 
  onEdit,
  onDelete,
  onCopy,
  onExpand,
  onLink,
  onFormatNow,
  isQuickCaptureInbox,
  t
}: { 
  fawaid: Fawaid, 
  onEdit: () => void,
  onDelete: () => void,
  onCopy: () => void,
  onExpand: () => void,
  onLink: () => void,
  onFormatNow?: () => void,
  isQuickCaptureInbox?: boolean,
  t: any
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-[#E5E7EB] dark:border-zinc-800 shadow-sm flex flex-col h-full group hover:border-[#6197EC] dark:hover:border-zinc-600 transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className="flex gap-1">
        </div>
        <span className="text-[10px] font-bold bg-[#F5F5F7] dark:bg-zinc-800 text-[#18407B] dark:text-zinc-300 px-2 py-1 rounded-md">
          {fawaid.reference || [
            fawaid.tabah ? `${fawaid.tabah}` : '',
            fawaid.volume_number ? `${t('Volume')} ${fawaid.volume_number}` : '',
            fawaid.page_number ? `${t('Page')} ${fawaid.page_number}` : ''
          ].filter(Boolean).join(' • ')}
        </span>
      </div>
      
      <h3 className="text-lg aref-ruqaa-regular mb-3 dark:text-white text-center" dir="rtl">{fawaid.title || t('Untitled Note')}</h3>
      
      <p className="text-sm text-[#4A4A4A] dark:text-gray-300 scheherazade-new-regular leading-relaxed mb-6 flex-1 line-clamp-4 text-right whitespace-pre-wrap" dir="rtl">
        {fawaid.content}
      </p>

      <div className="flex flex-wrap gap-1 mb-6">
        {fawaid.tags?.map((tag, i) => (
          <span key={i} className="text-[9px] font-bold uppercase tracking-tighter bg-[#F5F5F7] dark:bg-zinc-800 text-[#8E8E8E] dark:text-gray-400 px-2 py-0.5 rounded-full">
            #{tag}
          </span>
        ))}
      </div>

      {isQuickCaptureInbox ? (
        <div className="flex gap-2 border-t border-[#F5F5F7] dark:border-zinc-800 pt-4 mt-auto">
          {onFormatNow && (
            <button
              onClick={onFormatNow}
              className="flex-1 px-3 py-2 text-xs font-bold rounded-xl bg-[#6197EC] text-white hover:bg-[#4C81D9] transition-all"
              title="Format now"
            >
              Format now
            </button>
          )}
          <button 
            onClick={onExpand}
            className="p-2 text-[#18407B] dark:text-zinc-400 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 rounded-xl transition-all"
            title={t('Open')}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button 
            onClick={onDelete}
            className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
            title={t('Delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-[#F5F5F7] dark:border-zinc-800 pt-4 mt-auto">
          {onFormatNow && (
            <button
              onClick={onFormatNow}
              className="flex-1 px-3 py-2 text-xs font-bold rounded-xl bg-[#6197EC] text-white hover:bg-[#4C81D9] transition-all"
              title="Format now"
            >
              Format now
            </button>
          )}
          <button 
            onClick={onExpand}
            className="p-2 text-[#18407B] dark:text-zinc-400 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 rounded-xl transition-all"
            title={t('Open')}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <>
            <button 
              onClick={onCopy}
              className="p-2 text-[#18407B] dark:text-zinc-400 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 rounded-xl transition-all"
              title={t('Copy')}
            >
              <Copy className="w-4 h-4" />
            </button>
            <button 
              onClick={onEdit}
              className="p-2 text-[#18407B] dark:text-zinc-400 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 rounded-xl transition-all"
              title={t('Edit')}
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={onLink}
              className="p-2 text-[#18407B] dark:text-zinc-400 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 rounded-xl transition-all"
              title="Link Fāʾidah"
            >
              <Link2 className="w-4 h-4" />
            </button>
          </>
          <div className="flex-1" />
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
            title={t('Delete')}
          >
            <Trash2 className="w-4 h-4 pointer-events-none" />
          </button>
        </div>
      )}
    </div>
  );
}
