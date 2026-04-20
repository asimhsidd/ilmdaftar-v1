import React, { useState, useEffect, useRef } from 'react';
import { Science, Fawaid } from '../types';
import { Download, Upload, FileJson, FileText, FileType, FileSpreadsheet, Loader2, CloudUpload, CloudDownload, CheckCircle2, XCircle, FileDown, AlertCircle } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

interface ImportExportProps {
  sciences: Science[];
  onUpdate?: () => void;
}

type Section = 'import-export' | 'pdf' | 'drive';

export default function ImportExport({ sciences, onUpdate }: ImportExportProps) {
  const [activeSection, setActiveSection] = useState<Section>('import-export');
  const [mode, setMode] = useState<'export' | 'import'>('export');
  const [loading, setLoading] = useState(false);
  const [exportFilters, setExportFilters] = useState({ scienceId: '', format: 'json' });
  const [importData, setImportData] = useState<string>('');
  const [importPreview, setImportPreview] = useState<any>(null);
  const [parsedImportData, setParsedImportData] = useState<any[] | null>(null);
  const [pdfFilters, setPdfFilters] = useState({ scienceId: '' });
  const [driveStatus, setDriveStatus] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t, isRTL } = useSettings();

  const escapeHtml = (value: string) => {
    return (value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  useEffect(() => {
    fetch('/api/drive/status').then(r => r.json()).then(d => setDriveStatus(d.connected)).catch(() => {});
  }, []);

  // === EXPORT ===
  const handleExport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (exportFilters.scienceId) params.append('scienceId', exportFilters.scienceId);
      const res = await fetch(`/api/fawaid?${params.toString()}`);
      const data: Fawaid[] = await res.json();

      let content = '';
      let mimeType = '';
      let extension = '';

      if (exportFilters.format === 'json') {
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        extension = 'json';
      } else if (exportFilters.format === 'csv') {
        const csvHeader = 'title,content,book_title,science_name,reference,author,tags,extra_notes,language,created_at';
        const csvRows = data.map(f => {
          const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
          return [
            esc(f.title), esc(f.content), esc(f.book_title || ''), esc(f.science_name || ''),
            esc(f.reference || ''), esc(f.author || ''),
            esc((f.tags || []).join('; ')), esc(f.extra_notes || ''),
            esc(f.language || 'arabic'), esc(f.created_at || '')
          ].join(',');
        });
        content = [csvHeader, ...csvRows].join('\n');
        mimeType = 'text/csv';
        extension = 'csv';
      } else if (exportFilters.format === 'markdown') {
        content = data.map(f => `## ${f.title || t('Untitled')}\n\n${f.content}\n\n**${t('Source')}:** ${f.book_title}${f.reference ? ` (${f.reference})` : ''}\n\n${t('Tags')}: ${f.tags?.join(', ')}`).join('\n\n---\n\n');
        mimeType = 'text/markdown';
        extension = 'md';
      } else {
        content = data.map(f => `${f.title}\n${f.content}\n[${f.book_title}${f.reference ? ' / ' + f.reference : ''}]`).join('\n\n-------------------\n\n');
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
      alert(t('Export Failed'));
    } finally {
      setLoading(false);
    }
  };

  // === IMPORT ===
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportData(text);
      parseAndPreview(text);
    };
    reader.readAsText(file);
  };

  const parseAndPreview = async (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      if (!Array.isArray(data)) {
        alert(t('Invalid JSON'));
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
      alert(e.message || t('Invalid JSON'));
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
        body: JSON.stringify(parsedImportData)
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Import failed');
      }
      const result = await res.json();
      alert(`${t('Imported')} ${result.count} ${t('Items')}. ${result.skipped || 0} ${t('Duplicates Skipped')}.`);
      setImportData('');
      setImportPreview(null);
      setParsedImportData(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onUpdate) onUpdate();
    } catch (e: any) {
      console.error(e);
      alert(e.message || t('Invalid JSON'));
    } finally {
      setLoading(false);
    }
  };

  // === PDF ===
  const handleGeneratePDF = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (pdfFilters.scienceId) params.append('scienceId', pdfFilters.scienceId);
      const res = await fetch(`/api/fawaid?${params.toString()}`);
      const data: Fawaid[] = await res.json();

      if (data.length === 0) {
        alert(t('No notes found'));
        return;
      }

      const notesHtml = data.map((f, idx) => {
        const sourceText = `${f.book_title || ''}${f.reference ? ' | ' + f.reference : ''}${f.tags?.length ? ' | #' + f.tags.join(' #') : ''}`;
        return `
          <article class="note">
            <h2 dir="auto">${escapeHtml(f.title || t('Untitled Note'))}</h2>
            <p class="content" dir="auto">${escapeHtml(f.content || '').replace(/\n/g, '<br>')}</p>
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
          <title>Fawaid Export</title>
          <style>
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
              font-family: "Amiri", "Noto Naskh Arabic", "Scheherazade New", "Tahoma", "Segoe UI", serif;
              -webkit-font-smoothing: antialiased;
              text-rendering: optimizeLegibility;
            }
            .page {
              max-width: 900px;
              margin: 0 auto;
              padding: 28px 24px 40px;
            }
            h1 {
              margin: 0;
              font-size: 30px;
              line-height: 1.2;
              letter-spacing: 0.2px;
            }
            .meta {
              margin-top: 6px;
              color: var(--muted);
              font-size: 13px;
            }
            .note {
              break-inside: avoid;
              page-break-inside: avoid;
              padding: 16px 0;
            }
            .note h2 {
              margin: 0 0 10px;
              font-size: 22px;
              line-height: 1.4;
            }
            .content {
              margin: 0;
              font-size: 18px;
              line-height: 1.9;
              white-space: normal;
            }
            .extra {
              margin: 14px 0 0;
              font-size: 15px;
              line-height: 1.8;
              color: #0a5a46;
              background: #eef8f4;
              border: 1px solid #dcefe8;
              border-radius: 10px;
              padding: 10px 12px;
            }
            .source {
              margin: 10px 0 0;
              font-size: 12px;
              color: var(--muted);
            }
            hr {
              border: 0;
              border-top: 1px solid var(--line);
              margin: 2px 0 0;
            }
            @media print {
              @page {
                size: A4;
                margin: 14mm;
              }
              .page {
                max-width: none;
                margin: 0;
                padding: 0;
              }
              h1 { font-size: 24px; }
              .note h2 { font-size: 18px; }
              .content { font-size: 14px; }
              .source { font-size: 10px; }
            }
          </style>
        </head>
        <body>
          <main class="page">
            <h1>${escapeHtml(t('Import / Export'))}</h1>
            <p class="meta">${escapeHtml(`${data.length} ${t('Notes')} | ${new Date().toLocaleDateString()}`)}</p>
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
      alert(t('Export Failed'));
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
      alert(t('Backup Success'));
    } catch (e: any) {
      alert(e.message || t('Export Failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDriveDownload = async () => {
    if (!confirm(t('Restore Confirmation'))) return;
    setLoading(true);
    try {
      const res = await fetch('/api/drive/download', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      alert(t('Restore Success'));
      if (onUpdate) onUpdate();
    } catch (e: any) {
      alert(e.message || t('Export Failed'));
    } finally {
      setLoading(false);
    }
  };

  const tabClass = (section: Section) =>
    `flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${
      activeSection === section
        ? 'bg-[#5A5A40] dark:bg-zinc-700 text-white shadow-md'
        : 'text-[#8E8E8E] dark:text-gray-400 hover:bg-[#F5F5F0] dark:hover:bg-zinc-800'
    }`;

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-serif font-bold text-[#1A1A1A] dark:text-white">{t('Import / Export')}</h2>
        <p className="text-[#8E8E8E] dark:text-gray-400 mt-2">{t('Import Export Description')}</p>
      </header>

      {/* Section tabs */}
      <div className="flex p-1 bg-white dark:bg-zinc-900 border border-[#E5E5E0] dark:border-zinc-800 rounded-xl w-fit gap-1">
        <button onClick={() => setActiveSection('import-export')} className={tabClass('import-export')}>
          <Download className="w-4 h-4" /> {t('Import / Export')}
        </button>
        <button onClick={() => setActiveSection('pdf')} className={tabClass('pdf')}>
          <FileDown className="w-4 h-4" /> {t('Print to PDF')}
        </button>
        <button onClick={() => setActiveSection('drive')} className={tabClass('drive')}>
          <CloudUpload className="w-4 h-4" /> {t('Google Drive Sync')}
        </button>
      </div>

      {/* Section A: Import / Export */}
      {activeSection === 'import-export' && (
        <div className="space-y-6">
          {/* Sub-toggle: Export / Import */}
          <div className="flex p-1 bg-[#F5F5F0] dark:bg-zinc-800 rounded-lg w-fit">
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

          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E5E0] dark:border-zinc-800 shadow-sm max-w-2xl">
            {mode === 'export' ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Filter Science Optional')}</label>
                  <select
                    value={exportFilters.scienceId}
                    onChange={e => setExportFilters({...exportFilters, scienceId: e.target.value})}
                    className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
                  >
                    <option value="">{t('All Sciences')}</option>
                    {sciences?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
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
                            ? 'border-[#5A5A40] dark:border-zinc-500 bg-[#5A5A40]/5 dark:bg-zinc-800 text-[#5A5A40] dark:text-zinc-300'
                            : 'border-[#E5E5E0] dark:border-zinc-700 hover:border-[#5A5A40]/50 dark:hover:border-zinc-600 text-[#8E8E8E] dark:text-gray-500'
                        }`}
                      >
                        <fmt.icon className="w-6 h-6" />
                        <span className="text-xs font-bold">{fmt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleExport}
                  disabled={loading}
                  className="w-full bg-[#5A5A40] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#5A5A40]/20 dark:shadow-none hover:bg-[#4A4A30] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  {t('Download Export')}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* File upload */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Upload File')}</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-[#5A5A40] file:text-white hover:file:bg-[#4A4A30]"
                  />
                </div>

                {/* Or paste JSON */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Or Paste JSON')}</label>
                  <textarea
                    value={importData}
                    onChange={e => { setImportData(e.target.value); setImportPreview(null); setParsedImportData(null); }}
                    rows={8}
                    className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600 font-mono text-xs"
                    placeholder='[{"title": "Note Title", "content": "...", ...}]'
                  />
                  {importData && !importPreview && (
                    <button
                      onClick={handlePreviewFromText}
                      disabled={loading}
                      className="px-4 py-2 bg-[#F5F5F0] dark:bg-zinc-800 text-[#5A5A40] dark:text-zinc-300 rounded-xl text-sm font-bold hover:bg-[#E5E5E0] dark:hover:bg-zinc-700 transition-all"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                      {t('Import Preview')}
                    </button>
                  )}
                </div>

                {/* Preview results */}
                {importPreview && (
                  <div className="bg-[#F5F5F0] dark:bg-zinc-800 rounded-2xl p-5 space-y-3">
                    <h4 className="text-sm font-bold text-[#1A1A1A] dark:text-white flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> {t('Import Preview')}
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-[#5A5A40] dark:text-zinc-300">{importPreview.total}</div>
                        <div className="text-xs text-[#8E8E8E] dark:text-gray-500">{t('Items')}</div>
                      </div>
                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-green-600">{importPreview.newCount}</div>
                        <div className="text-xs text-[#8E8E8E] dark:text-gray-500">{t('New Items')}</div>
                      </div>
                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-amber-500">{importPreview.duplicateCount}</div>
                        <div className="text-xs text-[#8E8E8E] dark:text-gray-500">{t('Duplicates Skipped')}</div>
                      </div>
                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-[#5A5A40] dark:text-zinc-300">{importPreview.sciences}</div>
                        <div className="text-xs text-[#8E8E8E] dark:text-gray-500">{t('Sciences')}</div>
                      </div>
                    </div>
                    <button
                      onClick={handleConfirmImport}
                      disabled={loading || importPreview.newCount === 0}
                      className="w-full bg-[#5A5A40] dark:bg-zinc-700 text-white font-bold py-3 rounded-2xl shadow-lg shadow-[#5A5A40]/20 dark:shadow-none hover:bg-[#4A4A30] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E5E0] dark:border-zinc-800 shadow-sm max-w-2xl space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] dark:text-gray-500">{t('Filter Science Optional')}</label>
            <select
              value={pdfFilters.scienceId}
              onChange={e => setPdfFilters({...pdfFilters, scienceId: e.target.value})}
              className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
            >
              <option value="">{t('All Sciences')}</option>
              {sciences?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <button
            onClick={handleGeneratePDF}
            disabled={loading}
            className="w-full bg-[#5A5A40] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#5A5A40]/20 dark:shadow-none hover:bg-[#4A4A30] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />}
            {t('Generate PDF')}
          </button>
        </div>
      )}

      {/* Section C: Google Drive Sync */}
      {activeSection === 'drive' && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E5E0] dark:border-zinc-800 shadow-sm max-w-2xl space-y-6">
          {/* Status */}
          <div className="flex items-center gap-3 bg-[#F5F5F0] dark:bg-zinc-800 rounded-2xl p-4">
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
              className="w-full bg-[#5A5A40] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#5A5A40]/20 dark:shadow-none hover:bg-[#4A4A30] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2"
            >
              <CloudUpload className="w-5 h-5" />
              {t('Connect to Google Drive')}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleDriveUpload}
                disabled={loading}
                className="bg-[#5A5A40] dark:bg-zinc-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#5A5A40]/20 dark:shadow-none hover:bg-[#4A4A30] dark:hover:bg-zinc-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudUpload className="w-5 h-5" />}
                {t('Backup to Drive')}
              </button>
              <button
                onClick={handleDriveDownload}
                disabled={loading}
                className="bg-white dark:bg-zinc-800 text-[#5A5A40] dark:text-zinc-300 font-bold py-4 rounded-2xl border-2 border-[#5A5A40] dark:border-zinc-600 hover:bg-[#F5F5F0] dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudDownload className="w-5 h-5" />}
                {t('Restore from Drive')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
