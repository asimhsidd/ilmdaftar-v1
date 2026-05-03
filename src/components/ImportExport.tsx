import React, { useState, useEffect, useRef } from 'react';
import { Science, Fawaid, Book } from '../types';
import { Download, Upload, FileJson, FileText, FileType, FileSpreadsheet, Loader2, CloudUpload, CloudDownload, CheckCircle2, XCircle, FileDown, AlertCircle } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useModal } from '../contexts/ModalContext';

interface ImportExportProps {
  sciences: Science[];
  onUpdate?: () => void;
}

type Section = 'import-export' | 'pdf' | 'drive';

export default function ImportExport({ sciences, onUpdate }: ImportExportProps) {
  const [activeSection, setActiveSection] = useState<Section>('import-export');
  const [mode, setMode] = useState<'export' | 'import'>('export');
  const [loading, setLoading] = useState(false);
  const [exportFilters, setExportFilters] = useState({ scienceId: '', format: 'json', bookId: '', author: '' });
  const [importData, setImportData] = useState<string>('');
  const [importPreview, setImportPreview] = useState<any>(null);
  const [forceDuplicates, setForceDuplicates] = useState(false);
  const [showDuplicateReviewWindow, setShowDuplicateReviewWindow] = useState(false);
  const [allowedDuplicateContents, setAllowedDuplicateContents] = useState<string[]>([]);
  const [expandedFawaid, setExpandedFawaid] = useState<Set<number>>(new Set());

  const isArabic = (str: string) => /[\u0600-\u06FF]/.test(str);
  const { showModal } = useModal();
  const [parsedImportData, setParsedImportData] = useState<any[] | null>(null);
  const [pdfFilters, setPdfFilters] = useState({ scienceId: '', bookId: '', author: '' });
  const [pdfTitle, setPdfTitle] = useState('');
  const [includePdfHeader, setIncludePdfHeader] = useState(true);
  const [driveStatus, setDriveStatus] = useState<boolean>(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t, isRTL, apiKey } = useSettings();

  const escapeHtml = (value: string) => {
    return (value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const formatSourceLabel = (f: Fawaid) => {
    const source: any = (f as any).source;
    if (!source || source.type === 'other') {
      return `${f.book_title || ''}${f.reference ? ` (${f.reference})` : ''}`.trim() || 'Other';
    }
    if (source.type === 'book') {
      const name = source.book?.name || f.book_title || 'Book';
      const author = source.book?.author ? `, ${source.book.author}` : '';
      const page = source.book?.page ? ` p.${source.book.page}` : '';
      return `Book: ${name}${author}${page}`;
    }
    if (source.type === 'youtube') {
      const url = source.youtube?.url || 'YouTube';
      const ts = source.youtube?.timestamp ? ` @ ${source.youtube.timestamp}` : '';
      return `YouTube: ${url}${ts}`;
    }
    return 'Other';
  };

  useEffect(() => {
    fetch('/api/books').then(r => r.json()).then(d => setBooks(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/authors').then(r => r.json()).then(d => setAuthors(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/drive/status').then(r => r.json()).then(d => setDriveStatus(d.connected)).catch(() => {});
  }, []);

  // === EXPORT ===
  const handleExport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (exportFilters.scienceId) params.append('scienceId', exportFilters.scienceId);
      if (exportFilters.bookId) params.append('bookId', exportFilters.bookId);
      if (exportFilters.author) params.append('author', exportFilters.author);
      const res = await fetch(`/api/fawaid?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch data for export');
      const data: Fawaid[] = await res.json();

      let content = '';
      let mimeType = '';
      let extension = '';

      if (exportFilters.format === 'json') {
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        extension = 'json';
      } else if (exportFilters.format === 'csv') {
        const csvHeader = 'title,content,book_title,science_name,reference,source,author,tags,extra_notes,language,status,created_at';
        const csvRows = data.map(f => {
          const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
          return [
            esc(f.title), esc(f.content), esc(f.book_title || ''), esc(f.science_name || ''),
            esc(f.reference || ''), esc(formatSourceLabel(f)), esc(f.author || ''),
            esc((f.tags || []).join('; ')), esc(f.extra_notes || ''),
            esc(f.language || 'arabic'), esc((f as any).status || 'formatted'), esc(f.created_at || '')
          ].join(',');
        });
        content = [csvHeader, ...csvRows].join('\n');
        mimeType = 'text/csv';
        extension = 'csv';
      } else if (exportFilters.format === 'markdown') {
        content = data.map(f => `## ${f.title || t('Untitled')}\n\n${f.content}\n\n**${t('Source')}:** ${formatSourceLabel(f)}\n\n${t('Tags')}: ${f.tags?.join(', ')}`).join('\n\n---\n\n');
        mimeType = 'text/markdown';
        extension = 'md';
      } else {
        content = data.map(f => `${f.title}\n${f.content}\n[${formatSourceLabel(f)}]`).join('\n\n-------------------\n\n');
        mimeType = 'text/plain';
        extension = 'txt';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fawaid_export_${new Date().toISOString().split('T')[0]}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Export Failed') });
    } finally {
      setLoading(false);
    }
  };

  // === IMPORT ===
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isTextFile = file.name.endsWith('.md') || file.name.endsWith('.txt');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      
      if (isTextFile) {
        setLoading(true);
        try {
          const res = await fetch('/api/import/ai-parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, apiKey })
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || 'AI parsing failed');
          }
          const parsed = await res.json();
          const jsonStr = JSON.stringify(parsed, null, 2);
          setImportData(jsonStr);
          parseAndPreview(jsonStr);
        } catch (err: any) {
          await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: err.message || 'AI Parse Failed' });
        } finally {
          setLoading(false);
        }
      } else {
        setImportData(text);
        parseAndPreview(text);
      }
    };
    reader.readAsText(file);
  };

  const parseAndPreview = async (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      if (!Array.isArray(data)) {
        await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Invalid JSON') });
        return;
      }
      setParsedImportData(data);
      setLoading(true);
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const preview = await res.json();
      setImportPreview(preview);
    } catch (e: any) {
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: e.message || t('Invalid JSON') });
      setParsedImportData(null);
      setImportPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewFromText = () => {
    if (!importData.trim()) return;
    parseAndPreview(importData);
  };

  const handleConfirmImport = async () => {
    if (!parsedImportData) return;
    setLoading(true);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedImportData, forceDuplicates, allowedDuplicateContents })
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Import failed');
      }
      const result = await res.json();
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: `${t('Imported')} ${result.count} ${t('Items')}. ${result.skipped || 0} ${t('Duplicates Skipped')}.`});
      setImportData('');
      setImportPreview(null);
      setParsedImportData(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onUpdate) onUpdate();
    } catch (e: any) {
      console.error(e);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: e.message || t('Invalid JSON') });
    } finally {
      setLoading(false);
    }
  };

  const handleUndoLastImport = async () => {
    const res = await showModal({
      type: 'confirm',
      title: 'Undo Last Import',
      message: 'Are you sure you want to undo the most recent import? This action is permanent.',
      confirmText: 'Undo Import',
      cancelText: 'Cancel'
    });
    if (res !== 'confirm') return;

    try {
      const fetchRes = await fetch('/api/import/undo', { method: 'DELETE' });
      const data = await fetchRes.json();
      if (data.success) {
        await showModal({
          type: 'alert',
          title: 'Undo Successful',
          message: `Removed ${data.deletedCount} items.`
        });
        if (onUpdate) onUpdate();
      } else {
        await showModal({
          type: 'alert',
          title: 'Undo Failed',
          message: data.error || 'Failed to undo import.'
        });
      }
    } catch {
      await showModal({
        type: 'alert',
        title: 'Error',
        message: 'Network or connection error while undoing the import.'
      });
    }
  };

  // === PDF ===
  const handleGeneratePDF = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (pdfFilters.scienceId) params.append('scienceId', pdfFilters.scienceId);
      if (pdfFilters.bookId) params.append('bookId', pdfFilters.bookId);
      if (pdfFilters.author) params.append('author', pdfFilters.author);
      const res = await fetch(`/api/fawaid?${params.toString()}`);
      const data: Fawaid[] = await res.json();

      if (data.length === 0) {
        await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('No notes found') });
        return;
      }

      // Use the user's title or a sensible default for the PDF filename
      const pdfFilename = (pdfTitle.trim() || "My Fawaid") + " - IlmDaftar";

      const notesHtml = data.map((f, idx) => {
          const sourceText = formatSourceLabel(f);
          return `
            <article class="note">
              <h2 dir="auto" style="font-family: 'Aref Ruqaa', serif; font-weight: 400;">${idx + 1}. ${escapeHtml(f.title || t('Untitled Note'))}</h2>
              <div class="content" dir="auto" style="white-space: pre-wrap; font-family: 'Scheherazade New', serif; font-weight: 400;">${escapeHtml(f.content || '')}</div>
            ${f.extra_notes ? `<p class="extra" dir="auto">${escapeHtml(f.extra_notes).replace(/\n/g, '<br>')}</p>` : ''}
            <p class="source">${escapeHtml(sourceText)}</p>
          </article>
          ${idx < data.length - 1 ? '<hr />' : ''}
        `;
      }).join('');

      const html = `
        <!doctype html>
        <html lang="${isRTL ? 'ar' : 'en'}" dir="${isRTL ? 'rtl' : 'ltr'}">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${escapeHtml(pdfFilename)}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Aref+Ruqaa:wght@400;700&family=Scheherazade+New:wght@400;600;700&display=swap');
            
            :root {
              --text: #1A1A1A;
              --muted: #666;
              --line: #e7e7e7;
              --bg: #ffffff;
            }
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              background: var(--bg);
              color: var(--text);
              font-family: "Montserrat", "Scheherazade New", serif;
              -webkit-font-smoothing: antialiased;
              text-rendering: optimizeLegibility;
            }
            .page {
              max-width: 900px;
              margin: 0 auto;
              padding: 28px 24px 40px;
            }
            .header-container {
              text-align: center;
              margin-bottom: 32px;
            }
            h1 {
              margin: 0;
              font-size: 30px;
              line-height: 1.2;
              letter-spacing: 0.2px;
              font-family: "Montserrat", "Aref Ruqaa", serif;
              font-weight: 400;
            }
            .meta {
              margin-top: 6px;
              color: var(--muted);
              font-size: 13px;
              font-family: inherit;
            }
            .note {
              break-inside: auto;
              page-break-inside: auto;
              padding: 16px 0;
            }
            .note h2 {
              margin: 0 0 10px;
              font-size: 22px;
              line-height: 1.4;
              font-family: "Montserrat", "Aref Ruqaa", serif;
              font-weight: 400;
            }
            .content {
              margin: 0;
              font-size: 20px;
              line-height: 1.9;
              white-space: pre-wrap;
              color: #1A1A1A;
              font-family: "Montserrat", "Scheherazade New", serif;
              font-weight: 400;
            }
            .extra {
              margin: 14px 0 0;
              font-size: 17px;
              line-height: 1.8;
              color: #0a5a46;
              background: #eef8f4;
              border: 1px solid #dcefe8;
              border-radius: 10px;
              padding: 10px 12px;
            }
            .source {
              margin: 10px 0 0;
              font-size: 14px;
              color: var(--muted);
              font-family: "Aref Ruqaa", serif;
            }
            hr {
              border: 0;
              border-top: 1px solid var(--line);
              margin: 2px 0 0;
            }

            /* Full-page diagonal watermark */
            .watermark-overlay {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .watermark-inner {
              transform: rotate(-35deg);
              opacity: 0.15;
              text-align: center;
              white-space: nowrap;
            }
            .watermark-inner img.wm-logo {
              width: 100px;
              height: 100px;
              display: block;
              margin: 0 auto 12px;
              object-fit: contain;
            }
            .watermark-inner .wm-text {
              font-family: 'Montserrat', 'Arial', sans-serif;
              font-size: 42px;
              font-weight: 900;
              color: #6197EC;
              letter-spacing: 3px;
            }

            @media print {
              @page {
                size: auto;
                margin: 20mm 15mm 25mm 15mm;
              }
              @page {
                @bottom-center {
                  content: counter(page);
                  font-family: Arial, sans-serif;
                  font-size: 12px;
                  color: #888;
                }
              }
              body {
                padding: 0;
              }
              .page {
                max-width: none;
                margin: 0;
                padding: 0;
              }
              h1 { font-size: 24px; }
              .note h2 { font-size: 18px; }
              .content { font-size: 16px; }
              .source { font-size: 10px; }
              .watermark-overlay {
                position: fixed;
                display: flex;
              }
            }
          </style>
        </head>
        <body>
          <div class="watermark-overlay">
            <div class="watermark-inner">
              <img src="${window.location.origin}/logo.png" class="wm-logo" alt="Logo" />
              <div class="wm-text">'IlmDaftar</div>
            </div>
          </div>
          <main class="page">
            ${includePdfHeader ? `
            <div class="header-container">

              <h1 dir="auto">${escapeHtml(pdfTitle.trim() || "My Fawa'id")}</h1>
              <p class="meta" dir="auto">${escapeHtml(`${data.length} ${t('Notes')} | ${new Date().toLocaleDateString()}`)}</p>
            </div>
            ` : ''}
            ${notesHtml}
          </main>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Print window blocked');
      }

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      const triggerPrint = () => {
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
      };
      printWindow.onload = () => {
        triggerPrint();
      };
      setTimeout(triggerPrint, 350);
    } catch (e) {
      console.error(e);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Export Failed') });
    } finally {
      setLoading(false);
    }
  };

  // === GOOGLE DRIVE ===
  const handleDriveConnect = async () => {
    try {
      const res = await fetch('/api/drive/auth-url');
      const { url } = await res.json();
      const popup = window.open(url, '_blank', 'width=500,height=600');
      const check = setInterval(() => {
        if (popup?.closed) {
          clearInterval(check);
          fetch('/api/drive/status').then(r => r.json()).then(d => setDriveStatus(d.connected));
        }
      }, 1000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDriveUpload = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/drive/upload', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Backup Success') });
    } catch (e: any) {
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: e.message || t('Export Failed') });
    } finally {
      setLoading(false);
    }
  };

  const handleDriveDownload = async () => {
    if ((await showModal({ type: 'confirm', title: t ? t('Confirm') : 'Confirm', message: t('Restore Confirmation') })) !== 'confirm') return;
    setLoading(true);
    try {
      const res = await fetch('/api/drive/download', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: t('Restore Success') });
      if (onUpdate) onUpdate();
    } catch (e: any) {
      await showModal({ type: 'alert', title: t ? t('Information') : 'Information', message: e.message || t('Export Failed') });
    } finally {
      setLoading(false);
    }
  };

  const tabClass = (section: Section) =>
    `flex items-center justify-center text-center gap-1.5 md:gap-2 px-2 sm:px-4 md:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex-1 md:flex-none ${
      activeSection === section
        ? 'bg-[#6197EC] dark:bg-zinc-700 text-white shadow-md'
        : 'text-[#8E8E8E] dark:text-gray-400 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800'
    }`;

  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto w-full space-y-8 pb-12">
      <header className="text-center w-full">
        <h2 className="text-3xl font-serif font-bold text-[#1A1A1A] dark:text-white">{t('Import / Export')}</h2>
        <p className="text-[#8E8E8E] dark:text-gray-400 mt-2">{t('Import Export Description')}</p>
      </header>

      {/* Section tabs */}
      <div className="flex p-1 bg-white dark:bg-zinc-900 border border-[#E5E7EB] dark:border-zinc-800 rounded-xl gap-1">
        <button onClick={() => setActiveSection('import-export')} className={tabClass('import-export')}>
          <Download className="w-4 h-4 flex-shrink-0" />
          <span className="hidden md:inline">{t('Import / Export')}</span>
          <span className="md:hidden">Import</span>
        </button>
        <button onClick={() => setActiveSection('pdf')} className={tabClass('pdf')}>
          <FileDown className="w-4 h-4 flex-shrink-0" />
          <span className="hidden md:inline">{t('Print to PDF')}</span>
          <span className="md:hidden">{t('PDF Export') || 'PDF Export'}</span>
        </button>
        <button onClick={() => setActiveSection('drive')} className={tabClass('drive')}>
          <CloudUpload className="w-4 h-4 flex-shrink-0" />
          <span className="hidden md:inline">{t('Google Drive Sync')}</span>
          <span className="md:hidden">Drive</span>
        </button>
      </div>

      {/* Section A: Import / Export */}
      {activeSection === 'import-export' && (
        <div className="space-y-6 w-full">
          {/* Sub-toggle: Export / Import */}
          <div className="flex p-1 bg-[#F5F5F7] dark:bg-zinc-800 rounded-lg w-fit mx-auto">
            <button
              onClick={() => { setMode('export'); setImportPreview(null); }}
              className={`px-5 py-1.5 rounded-md text-sm font-bold transition-all ${
                mode === 'export' ? 'bg-white dark:bg-zinc-700 text-[#1A1A1A] dark:text-white shadow-sm' : 'text-[#8E8E8E] dark:text-gray-400'
              }`}
            >
              {t('Export')}
            </button>
            <button
              onClick={() => setMode('import')}
              className={`px-5 py-1.5 rounded-md text-sm font-bold transition-all ${
                mode === 'import' ? 'bg-white dark:bg-zinc-700 text-[#1A1A1A] dark:text-white shadow-sm' : 'text-[#8E8E8E] dark:text-gray-400'
              }`}
            >
              {t('Import')}
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E7EB] dark:border-zinc-800 shadow-sm w-full mx-auto">
            {mode === 'export' ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">Filter Science (Optional)</label>
                    <select
                      value={exportFilters.scienceId}
                      onChange={e => setExportFilters({...exportFilters, scienceId: e.target.value, bookId: ''})}
                      className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 aref-ruqaa-regular"
                    >
                      <option value="">All Sciences</option>
                      {sciences?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">Filter Book (Optional)</label>
                    <select
                      value={exportFilters.bookId}
                      onChange={e => setExportFilters({...exportFilters, bookId: e.target.value})}
                      className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 aref-ruqaa-regular"
                    >
                      <option value="">All Books</option>
                      {books?.filter(b => !exportFilters.scienceId || String(b.science_id) === exportFilters.scienceId).map(b => (
                        <option key={b.id} value={b.id}>{b.title}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">Filter Author (Optional)</label>
                    <select
                      value={exportFilters.author}
                      onChange={e => setExportFilters({...exportFilters, author: e.target.value})}
                      className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 aref-ruqaa-regular"
                    >
                      <option value="">All Authors</option>
                      {authors.map(author => (
                        <option key={author} value={author}>{author}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Format')}</label>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { id: 'json', label: t('JSON'), icon: FileJson },
                      { id: 'csv', label: t('CSV'), icon: FileSpreadsheet },
                      { id: 'markdown', label: t('Markdown'), icon: FileType },
                      { id: 'text', label: t('Plain Text'), icon: FileText },
                    ].map(fmt => (
                      <button
                        key={fmt.id}
                        onClick={() => setExportFilters({...exportFilters, format: fmt.id})}
                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                          exportFilters.format === fmt.id
                            ? 'border-[#6197EC] dark:border-zinc-500 bg-[#6197EC]/5 dark:bg-zinc-800 text-[#18407B] dark:text-zinc-300'
                            : 'border-[#E5E7EB] dark:border-zinc-700 hover:border-[#6197EC]/50 dark:hover:border-zinc-600 text-[#8E8E8E] dark:text-gray-500'
                        }`}
                      >
                        <fmt.icon className="w-6 h-6" />
                        <span className="text-xs font-bold">{fmt.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[#8E8E8E] dark:text-zinc-500 mt-2 italic">
                    {t('If you\'re not sure which format to export in, just choose JSON')}
                  </p>
                </div>

                <button
                  onClick={handleExport}
                  disabled={loading}
                  className="w-full bg-[#6197EC] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#6197EC]/20 dark:shadow-none hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  {t('Download Export')}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <button
                  onClick={handleUndoLastImport}
                  className="w-full py-3 rounded-xl text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  Undo Last Import
                </button>
                {/* File upload */}
                <div className="space-y-3 flex flex-col items-center text-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block">{t('Upload File')}</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.md,.txt"
                    onChange={handleFileUpload}
                    className="w-full max-w-sm cursor-pointer bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 text-sm flex items-center justify-center text-center file:cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-[#6197EC] file:text-white hover:file:bg-[#4C81D9]"
                  />
                </div>

                {/* Or paste JSON */}
                <div className="space-y-3 flex flex-col items-center text-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500 block">{t('Or Paste JSON')}</label>
                  <textarea
                    value={importData}
                    onChange={e => { setImportData(e.target.value); setImportPreview(null); setParsedImportData(null); }}
                    rows={8}
                    className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 font-mono text-xs"
                    placeholder='[{"title": "Note Title", "content": "...", ...}]'
                  />
                  {importData && !importPreview && (
                    <button
                      onClick={handlePreviewFromText}
                      disabled={loading}
                      className="px-4 py-2 bg-[#F5F5F7] dark:bg-zinc-800 text-[#18407B] dark:text-zinc-300 rounded-xl text-sm font-bold hover:bg-[#E5E7EB] dark:hover:bg-zinc-700 transition-all"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                      {t('Import Preview')}
                    </button>
                  )}
                </div>

                {/* Preview results */}
                {importPreview && (
                  <div className="bg-[#F5F5F7] dark:bg-zinc-800 rounded-2xl p-5 space-y-3">
                    <h4 className="text-sm font-bold text-[#1A1A1A] dark:text-white flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> {t('Import Preview')}
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-[#18407B] dark:text-zinc-300">{importPreview.total}</div>
                        <div className="text-xs text-[#8E8E8E] dark:text-gray-500">{t('Items')}</div>
                      </div>
                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-green-600">{importPreview.newCount}</div>
                        <div className="text-xs text-[#8E8E8E] dark:text-gray-500">{t('New Items')}</div>
                      </div>
                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-amber-500">{importPreview.duplicateCount}</div>
                        <div className="text-xs text-[#8E8E8E] dark:text-gray-500">{t('Duplicates Skipped')}</div>
                        {importPreview.duplicateCount > 0 && (
                          <button
                            onClick={() => setShowDuplicateReviewWindow(true)}
                            className="mt-2 text-[10px] text-amber-600 underline hover:text-amber-700 font-bold"
                          >
                            Review & Select Duplicates
                          </button>
                        )}
                      </div>
                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-[#18407B] dark:text-zinc-300">{importPreview.sciences}</div>
                        <div className="text-xs text-[#8E8E8E] dark:text-gray-500">{t('Sciences')}</div>
                      </div>
                    </div>
                    {importPreview.duplicateCount > 0 && (
                      <div className="flex justify-center items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          id="forceDuplicates"
                          checked={forceDuplicates}
                          onChange={(e) => setForceDuplicates(e.target.checked)}
                          className="rounded border-gray-300 text-[#18407B] focus:ring-[#6197EC]"
                        />
                        <label htmlFor="forceDuplicates" className="text-sm font-medium text-[#18407B] dark:text-zinc-300">
                          Force-save duplicates anyway
                        </label>
                      </div>
                    )}
                    <button
                      onClick={handleConfirmImport}
                      disabled={loading || (importPreview.newCount === 0 && (!forceDuplicates || importPreview.duplicateCount === 0))}
                      className="w-full bg-[#6197EC] dark:bg-zinc-700 text-white font-bold py-3 rounded-2xl shadow-lg shadow-[#6197EC]/20 dark:shadow-none hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                      {t('Confirm Import')} ({importPreview.newCount} {t('New Items')})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section B: Print to PDF */}
      {activeSection === 'pdf' && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E7EB] dark:border-zinc-800 shadow-sm w-full mx-auto space-y-6">
          <div className="space-y-4">


            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">PDF Title (Optional)</label>
              <input
                type="text"
                value={pdfTitle}
                onChange={e => setPdfTitle(e.target.value)}
                placeholder="Import / Export"
                className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 aref-ruqaa-regular"
                dir="auto"
              />
            </div>
            
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-[#F5F5F7] dark:bg-zinc-800 rounded-xl border border-transparent hover:border-[#E5E7EB] dark:hover:border-zinc-700 transition-all">
              <input
                type="checkbox"
                checked={includePdfHeader}
                onChange={(e) => setIncludePdfHeader(e.target.checked)}
                className="w-4 h-4 rounded text-[#18407B] focus:ring-[#6197EC] dark:focus:ring-zinc-600 dark:bg-zinc-900 border-none"
              />
              <span className="text-sm font-bold text-[#1A1A1A] dark:text-white">
                Include Title and Meta Information
              </span>
            </label>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">Filter Science (Optional)</label>
              <select
                value={pdfFilters.scienceId}
                onChange={e => setPdfFilters({...pdfFilters, scienceId: e.target.value, bookId: ''})}
                className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 aref-ruqaa-regular"
              >
                <option value="">All Sciences</option>
                {sciences?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">Filter Book (Optional)</label>
              <select
                value={pdfFilters.bookId}
                onChange={e => setPdfFilters({...pdfFilters, bookId: e.target.value})}
                className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 aref-ruqaa-regular"
              >
                <option value="">All Books</option>
                {books?.filter(b => !pdfFilters.scienceId || String(b.science_id) === pdfFilters.scienceId).map(b => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">Filter Author (Optional)</label>
              <select
                value={pdfFilters.author}
                onChange={e => setPdfFilters({...pdfFilters, author: e.target.value})}
                className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600 aref-ruqaa-regular"
              >
                <option value="">All Authors</option>
                {authors.map(author => (
                  <option key={author} value={author}>{author}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
            <strong>Tip:</strong> To remove the default browser date and title at the very top of the page, uncheck the <strong>"Headers and footers"</strong> option in your print dialog.
          </div>

          <button
            onClick={handleGeneratePDF}
            disabled={loading}
            className="w-full bg-[#6197EC] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#6197EC]/20 dark:shadow-none hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />}
            {t('Generate PDF')}
          </button>
        </div>
      )}

      {/* Section C: Google Drive Sync */}
      {activeSection === 'drive' && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E7EB] dark:border-zinc-800 shadow-sm w-full mx-auto space-y-6">
          {/* Status */}
          <div className="flex items-center gap-3 bg-[#F5F5F7] dark:bg-zinc-800 rounded-2xl p-4">
            {driveStatus ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <div>
              <p className="text-sm font-bold dark:text-white">
                {driveStatus ? t('Connected') : t('Not Connected')}
              </p>
              <p className="text-xs text-[#8E8E8E] dark:text-gray-500">{t('Google Drive')}</p>
            </div>
          </div>

          {!driveStatus ? (
            <button
              onClick={handleDriveConnect}
              className="w-full bg-[#6197EC] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#6197EC]/20 dark:shadow-none hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2"
            >
              <CloudUpload className="w-5 h-5" />
              {t('Connect to Google Drive')}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleDriveUpload}
                disabled={loading}
                className="bg-[#6197EC] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#6197EC]/20 dark:shadow-none hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudUpload className="w-5 h-5" />}
                {t('Backup to Drive')}
              </button>
              <button
                onClick={handleDriveDownload}
                disabled={loading}
                className="bg-white dark:bg-zinc-800 text-[#18407B] dark:text-zinc-300 font-bold py-4 rounded-2xl border-2 border-[#6197EC] dark:border-zinc-600 hover:bg-[#F5F5F7] dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudDownload className="w-5 h-5" />}
                {t('Restore from Drive')}
              </button>
            </div>
          )}
        </div>
      )}
    
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
                                  className="w-5 h-5 rounded border-zinc-300 text-[#18407B] focus:ring-[#6197EC] disabled:opacity-50"
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
                    <span className="text-xl font-bold text-[#18407B] dark:text-zinc-200 mr-2">{allowedDuplicateContents.length}</span> 
                    selected to overwrite/save
                  </div>
                  <button
                    onClick={() => setShowDuplicateReviewWindow(false)}
                    className="w-full sm:w-auto px-8 py-3 bg-[#6197EC] dark:bg-zinc-700 text-white rounded-xl font-bold shadow-lg shadow-[#6197EC]/20 dark:shadow-none hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Done Reviewing
                  </button>
                </div>
              </div>
            </div>
          )}
</div>
  );
}
