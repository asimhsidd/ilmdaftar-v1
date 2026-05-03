import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Calendar,
  Library,
  PlusCircle,
  RefreshCw,
  ArrowLeftRight,
  Lightbulb,
  BookMarked,
  ChevronRight,
  Moon,
  Sun,
  Languages,
  Key,
  Settings,
  ExternalLink,
  Check,
  Eye,
  EyeOff,
  PanelLeftClose,
  PanelLeftOpen,
  Tags,
  Code
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Science, Stats } from './types';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ModalProvider, useModal } from './contexts/ModalContext';

// Components
import Dashboard from './components/Dashboard';
import SearchPage from './components/SearchPage';
import ReviewMode from './components/ReviewMode';
import ImportExport from './components/ImportExport';
import Capture from './components/Capture';
import TagBrowser from './components/TagBrowser';

function AppContent() {
  const { showModal } = useModal();
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('fawaid_activeTab') || 'search';
  });
  const [sciences, setSciences] = useState<Science[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('fawaid_sidebarCollapsed') === 'true';
  });
  const [showAppearanceSettings, setShowAppearanceSettings] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [devMode, setDevMode] = useState(() => {
    return localStorage.getItem('fawaid_dev_mode') === 'true';
  });
  const { theme, setTheme, language, setLanguage, t, apiKey, setApiKey, titleFont, bodyFont, textScale, setTitleFont, setBodyFont, setTextScale } = useSettings();

  useEffect(() => {
    localStorage.setItem('fawaid_activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('fawaid_sidebarCollapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const fetchInitialData = async () => {
    try {
      const [sciRes, statsRes] = await Promise.all([
        fetch('/api/sciences', { headers: { 'Cache-Control': 'no-cache' } }),
        fetch('/api/stats', { headers: { 'Cache-Control': 'no-cache' } })
      ]);
      if (sciRes.ok) setSciences(await sciRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (error) {
      console.error("Failed to fetch initial data", error);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    const lastReminderAt = Number(localStorage.getItem('fawaid_last_backup_reminder_at') || '0');
    const reminderEveryMs = 3 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastReminderAt < reminderEveryMs) return;

    localStorage.setItem('fawaid_last_backup_reminder_at', String(Date.now()));
    showModal({
      type: 'confirm',
      title: 'Backup Reminder',
      message: 'It has been a few days since your last reminder. Would you like to open Import / Export to create a backup now?',
      confirmText: 'Open Backup',
      cancelText: 'Later'
    }).then((result) => {
      if (result === 'confirm') {
        setActiveTab('import-export');
      }
    });
  }, [showModal]);

  const openNeedsFormattingInbox = () => {
    localStorage.setItem('fawaid_open_explorer', 'true');
    localStorage.setItem('fawaid_explorer_quick_capture_inbox', 'true');
    setActiveTab('dashboard');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
      case 'explorer':
        return <Dashboard sciences={sciences} stats={stats} onNavigate={setActiveTab} onUpdate={fetchInitialData} onOpenNeedsFormatting={openNeedsFormattingInbox} />;
      case 'search':
        return (
          <div className="relative h-full">
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <Dashboard sciences={sciences} stats={stats} onNavigate={setActiveTab} onUpdate={fetchInitialData} onOpenNeedsFormatting={openNeedsFormattingInbox} />
            </div>
            <div className="relative z-10 h-full overflow-y-auto bg-white/90 dark:bg-black/90 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-[#E5E7EB] dark:border-zinc-800">
              <SearchPage sciences={sciences} stats={stats} onNavigate={setActiveTab} onUpdate={fetchInitialData} />
            </div>
          </div>
        );
      case 'capture':
        return (
          <div className="flex flex-col h-full bg-[#F5F5F7] dark:bg-black p-4 md:p-8 overflow-y-auto">
            <Capture sciences={sciences} onSave={() => { fetchInitialData(); setActiveTab('dashboard'); }} />
          </div>
        );
      case 'review':
        return <Dashboard sciences={sciences} stats={stats} onNavigate={setActiveTab} onUpdate={fetchInitialData} onOpenNeedsFormatting={openNeedsFormattingInbox} />;
      case 'import-export':
        return <ImportExport sciences={sciences} onUpdate={fetchInitialData} />;
      case 'tags':
        return (
          <div className="h-full overflow-y-auto bg-white/90 dark:bg-black/90 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-[#E5E7EB] dark:border-zinc-800">
            <TagBrowser
              onTagClick={(tag) => {
                localStorage.setItem('fawaid_search_tag', tag);
                localStorage.setItem('fawaid_search_query', '');
                setActiveTab('search');
              }}
            />
          </div>
        );
      default:
        return <Dashboard sciences={sciences} stats={stats} onNavigate={setActiveTab} onUpdate={fetchInitialData} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#F5F5F7] dark:bg-black text-[#1A1A1A] dark:text-white font-sans transition-colors duration-300">
      {/* Sidebar — hidden on mobile */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white dark:bg-zinc-900 border-r border-[#E5E7EB] dark:border-zinc-800 hidden md:flex flex-col transition-all duration-300 relative z-20`}>
        <div className={`p-6 border-b border-[#E5E7EB] dark:border-zinc-800 flex flex-col justify-center ${isSidebarCollapsed ? 'items-center px-2' : ''}`}>
          <div className="flex justify-between items-center w-full gap-6">
            <h1 className={`text-2xl tracking-tight flex items-center gap-2 dark:text-white ${isSidebarCollapsed ? 'justify-center w-full' : ''}`}>
              {isSidebarCollapsed ? (
                <button 
                  onClick={() => setIsSidebarCollapsed(false)}
                  title={t('Expand Sidebar')}
                  className="flex justify-center items-center w-full transition-transform hover:scale-105"
                >
                  <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                </button>
              ) : (
                <span className="flex items-center gap-2" style={{ fontFamily: '"Montserrat", sans-serif', fontWeight: 800 }}>
                  <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded object-contain translate-x-[4px] -translate-y-[2px]" onError={(e) => e.currentTarget.style.display = 'none'} />
                  'IlmDaftar
                </span>
              )}
            </h1>
            {!isSidebarCollapsed && (
              <button 
                onClick={() => setIsSidebarCollapsed(true)} 
                className="text-[#8E8E8E] hover:text-[#18407B] dark:hover:text-white transition-colors"
                title={t('Collapse Sidebar')}
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            )}
          </div>


        </div>

        <nav className={`flex-1 overflow-y-auto space-y-1 ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>
          <NavItem
            icon={<LayoutDashboard className="w-5 h-5" />}
            label={t('Dashboard')}
            active={activeTab === 'dashboard' || activeTab === 'explorer' || activeTab === 'search'}
            onClick={() => setActiveTab('dashboard')}
            isCollapsed={isSidebarCollapsed}
          />
          <NavItem
            icon={<PlusCircle className="w-5 h-5" />}
            label={t('Add Fāʾidah')}
            active={activeTab === 'capture'}
            onClick={() => setActiveTab('capture')}
            isCollapsed={isSidebarCollapsed}
          />
          <NavItem
            icon={<RefreshCw className="w-5 h-5" />}
            label={t('Review Mode')}
            active={activeTab === 'review'}
            onClick={() => setActiveTab('review')}
            isCollapsed={isSidebarCollapsed}
            comingSoon={!devMode}
          />
          <NavItem
            icon={<Tags className="w-5 h-5" />}
            label={t('Tags')}
            active={activeTab === 'tags'}
            onClick={() => setActiveTab('tags')}
            isCollapsed={isSidebarCollapsed}
          />
          <NavItem
            icon={<ArrowLeftRight className="w-5 h-5" />}
            label={t('Import / Export')}
            active={activeTab === 'import-export'}
            onClick={() => setActiveTab('import-export')}
            isCollapsed={isSidebarCollapsed}
          />
        </nav>

        <div className={`border-t border-[#E5E7EB] dark:border-zinc-800 space-y-4 ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>

          {/* API Key Settings */}
          <div className={`bg-[#F5F5F7] dark:bg-zinc-800 rounded-xl transition-colors relative group ${isSidebarCollapsed ? 'p-2 flex justify-center' : 'p-3'}`}>
            <button
              onClick={() => {
                if (isSidebarCollapsed) {
                  setIsSidebarCollapsed(false);
                  setShowApiKeyInput(true);
                } else {
                  setShowApiKeyInput(!showApiKeyInput);
                }
                setApiKeyInput(apiKey);
              }}
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} text-sm font-medium`}
            >
              <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-2'} text-[#18407B] dark:text-zinc-400 relative`}>
                <Key className="w-4 h-4 flex-shrink-0" />
                {!isSidebarCollapsed && <span>{t('API Key')}</span>}
                {isSidebarCollapsed && apiKey && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
                )}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                    {t('API Key')}
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && (
                apiKey ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs">
                    <Check className="w-3 h-3" /> {t('Connected')}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 text-xs">{t('Not Connected')}</span>
                )
              )}
            </button>

            {!isSidebarCollapsed && showApiKeyInput && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-[#8E8E8E] dark:text-gray-500">{t('API Key Description')}</p>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={e => setApiKeyInput(e.target.value)}
                    placeholder={t('Enter API Key')}
                    className="w-full bg-white dark:bg-zinc-700 border border-[#E5E7EB] dark:border-zinc-600 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E8E8E] hover:text-[#18407B]"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setApiKey(apiKeyInput);
                      setApiKeySaved(true);
                      setTimeout(() => setApiKeySaved(false), 2000);
                    }}
                    className="flex-1 bg-[#6197EC] dark:bg-zinc-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-[#4C81D9] dark:hover:bg-zinc-500 transition-all"
                  >
                    {apiKeySaved ? t('API Key Saved') : t('Save')}
                  </button>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-zinc-700 border border-[#E5E7EB] dark:border-zinc-600 rounded-lg text-xs font-medium text-[#18407B] dark:text-zinc-300 hover:bg-[#F5F5F7] dark:hover:bg-zinc-600 transition-all"
                  >
                    {t('Get API Key')} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Settings Toggles */}
          <div className={`flex ${isSidebarCollapsed ? 'flex-col' : ''} gap-2`}>
            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-[#F5F5F7] dark:bg-zinc-800 hover:bg-[#E5E7EB] dark:hover:bg-zinc-700 transition-all text-sm font-medium group relative`}
            >
              {theme === 'light' ? <Moon className="w-4 h-4 flex-shrink-0" /> : <Sun className="w-4 h-4 flex-shrink-0" />}
              {!isSidebarCollapsed && <span>{theme === 'light' ? t('Dark Mode') : t('Light Mode')}</span>}
              {isSidebarCollapsed && (
                <div className="absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                  {theme === 'light' ? t('Dark Mode') : t('Light Mode')}
                </div>
              )}
            </button>
            <button 
              onClick={() => {
                const langs: ('en' | 'ar' | 'ur')[] = ['en', 'ar', 'ur'];
                const next = langs[(langs.indexOf(language) + 1) % langs.length];
                setLanguage(next);
              }}
              className={`flex items-center justify-center p-2 rounded-lg bg-[#F5F5F7] dark:bg-zinc-800 hover:bg-[#E5E7EB] dark:hover:bg-zinc-700 transition-all relative group ${isSidebarCollapsed ? 'w-full' : ''}`}
            >
              <Languages className="w-4 h-4 flex-shrink-0" />
              {!isSidebarCollapsed && <span className="ml-1 text-xs font-bold">
                {language === 'en' ? t('Arabic') : language === 'ar' ? t('Urdu') : t('English')}
              </span>}
              {isSidebarCollapsed && (
                <div className="absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                  {language === 'en' ? t('Arabic') : language === 'ar' ? t('Urdu') : t('English')}
                </div>
              )}
            </button>
            <button
              onClick={() => setShowAppearanceSettings(true)}
              className={`flex items-center justify-center p-2 rounded-lg bg-[#F5F5F7] dark:bg-zinc-800 hover:bg-[#E5E7EB] dark:hover:bg-zinc-700 transition-all relative group ${isSidebarCollapsed ? 'w-full' : ''}`}
              title={t('Appearance Settings')}
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              <div className="absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                {t('Appearance')}
              </div>
            </button>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {showAppearanceSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowAppearanceSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto border border-[#E5E7EB] dark:border-zinc-800"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-serif font-bold mb-2 dark:text-white">{t('Appearance Settings')}</h3>
              <p className="text-xs text-[#8E8E8E] dark:text-gray-500 mb-4">Customize fonts and text size.</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-[#8E8E8E] dark:text-gray-400">Title Font</label>
                  <select value={titleFont} onChange={(e) => setTitleFont(e.target.value as any)} className="w-full mt-1 bg-[#F5F5F7] dark:bg-zinc-800 rounded-lg px-3 py-2 text-sm dark:text-white">
                    <option value="aref">Aref Ruqaa</option>
                    <option value="noto-naskh">Noto Naskh Arabic</option>
                    <option value="scheherazade">Scheherazade New</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#8E8E8E] dark:text-gray-400">{t('Body Font')}</label>
                  <select value={bodyFont} onChange={(e) => setBodyFont(e.target.value as any)} className="w-full mt-1 bg-[#F5F5F7] dark:bg-zinc-800 rounded-lg px-3 py-2 text-sm dark:text-white">
                    <option value="aref">Aref Ruqaa</option>
                    <option value="noto-naskh">Noto Naskh Arabic</option>
                    <option value="scheherazade">Scheherazade New</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#8E8E8E] dark:text-gray-400">Text Size</label>
                  <select value={textScale} onChange={(e) => setTextScale(e.target.value as any)} className="w-full mt-1 bg-[#F5F5F7] dark:bg-zinc-800 rounded-lg px-3 py-2 text-sm dark:text-white">
                    <option value="compact">Compact</option>
                    <option value="comfortable">Comfortable</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </div>

              {/* Mobile-only: Theme, Language, API Key */}
              <div className="md:hidden mt-4 pt-4 border-t border-[#E5E7EB] dark:border-zinc-800 space-y-3">
                <div className="flex gap-2">
                  <button 
                    onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                    className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg bg-[#F5F5F7] dark:bg-zinc-800 hover:bg-[#E5E7EB] dark:hover:bg-zinc-700 transition-all text-sm font-medium"
                  >
                    {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    <span>{theme === 'light' ? t('Dark Mode') : t('Light Mode')}</span>
                  </button>
                  <button 
                    onClick={() => {
                      const langs: ('en' | 'ar' | 'ur')[] = ['en', 'ar', 'ur'];
                      const next = langs[(langs.indexOf(language) + 1) % langs.length];
                      setLanguage(next);
                    }}
                    className="flex items-center justify-center gap-1 px-3 py-2.5 rounded-lg bg-[#F5F5F7] dark:bg-zinc-800 hover:bg-[#E5E7EB] dark:hover:bg-zinc-700 transition-all"
                  >
                    <Languages className="w-4 h-4" />
                    <span className="text-xs font-bold">
                      {language === 'en' ? t('Arabic') : language === 'ar' ? t('Urdu') : t('English')}
                    </span>
                  </button>
                </div>

                <div className="bg-[#F5F5F7] dark:bg-zinc-800 rounded-xl p-3">
                  <label className="text-xs font-bold text-[#8E8E8E] dark:text-gray-400 mb-1.5 block">{t('API Key')}</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={e => setApiKeyInput(e.target.value)}
                      placeholder={t('Enter API Key')}
                      className="w-full bg-white dark:bg-zinc-700 border border-[#E5E7EB] dark:border-zinc-600 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E8E8E] hover:text-[#18407B]"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => {
                        setApiKey(apiKeyInput);
                        setApiKeySaved(true);
                        setTimeout(() => setApiKeySaved(false), 2000);
                      }}
                      className="flex-1 bg-[#6197EC] dark:bg-zinc-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-[#4C81D9] dark:hover:bg-zinc-500 transition-all"
                    >
                      {apiKeySaved ? t('API Key Saved') : t('Save')}
                    </button>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-zinc-700 border border-[#E5E7EB] dark:border-zinc-600 rounded-lg text-xs font-medium text-[#18407B] dark:text-zinc-300 hover:bg-[#F5F5F7] dark:hover:bg-zinc-600 transition-all"
                    >
                      {t('Get API Key')} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#E5E7EB] dark:border-zinc-800 flex justify-between items-center">
                <button
                  onClick={async () => {
                    if (devMode) {
                      setDevMode(false);
                      localStorage.removeItem('fawaid_dev_mode');
                      await showModal({ type: 'alert', title: t('Developer Settings'), message: 'Developer mode disabled.' });
                      return;
                    }
                    const answer = prompt(t('Enter Developer Password'));
                    if (answer === 'blastdeveloper') {
                      setDevMode(true);
                      localStorage.setItem('fawaid_dev_mode', 'true');
                      await showModal({ type: 'alert', title: t('Developer Settings'), message: t('Developer Mode Unlocked') });
                    } else if (answer !== null) {
                      await showModal({ type: 'alert', title: t('Developer Settings'), message: t('Incorrect Password') });
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${devMode ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-[#F5F5F7] dark:bg-zinc-800 text-[#8E8E8E] hover:bg-[#E5E7EB] dark:hover:bg-zinc-700'}`}
                >
                  <Code className="w-4 h-4" />
                  {devMode ? t('Developer Mode Active') : t('Developer Settings')}
                </button>
                <button
                  onClick={() => setShowAppearanceSettings(false)}
                  className="px-4 py-2 bg-[#6197EC] text-white rounded-lg text-sm font-bold"
                >
                  {t('Close')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative flex flex-col pb-16 md:pb-0">
        <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8 flex-1 w-full">
          {/* Global Mobile Logo */}
          <div className="md:hidden flex justify-center w-full pb-6">
            <h1 className="text-2xl tracking-tight flex items-center gap-2 dark:text-white">
              <span className="flex items-center gap-2" style={{ fontFamily: '"Montserrat", sans-serif', fontWeight: 800 }}>
                <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded object-contain translate-x-[4px] -translate-y-[2px]" onError={(e) => e.currentTarget.style.display = 'none'} />
                'IlmDaftar
              </span>
            </h1>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
        
        <footer className="hidden md:block w-full text-center py-4 px-6 mt-auto border-t border-[#E5E7EB] dark:border-zinc-800">
          <p className="text-[10px] text-[#8E8E8E] dark:text-zinc-500 opacity-70">
            {t('This app is powered by Gemini, AI is not always reliable and can make mistakes')}
          </p>
          <button 
            onClick={() => showModal({
              type: 'alert',
              title: 'Copyright Notice',
              message: 'This software is provided for personal and private use only.\n\nYou may:\n- Use, modify, and run the software for personal purposes\n\nYou may NOT:\n- Sell, sublicense, or commercially distribute this software\n- Offer this software as a hosted or paid service\n- Use this software in any commercial context\n\nFor commercial licensing, contact the author.'
            })}
            className="text-[10px] text-[#8E8E8E] dark:text-zinc-500 opacity-70 mt-1 hover:underline hover:opacity-100 transition-opacity"
          >
            &copy; 2026 Ilm Daftar. All rights reserved.
          </button>
        </footer>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white dark:bg-zinc-900 border-t border-[#E5E7EB] dark:border-zinc-800 flex items-center justify-around px-1" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <MobileTabItem
          icon={<LayoutDashboard className="w-5 h-5" />}
          label={t('Home')}
          active={activeTab === 'dashboard' || activeTab === 'explorer' || activeTab === 'search'}
          onClick={() => setActiveTab('dashboard')}
        />
        <MobileTabItem
          icon={<PlusCircle className="w-5 h-5" />}
          label={t('Add')}
          active={activeTab === 'capture'}
          onClick={() => setActiveTab('capture')}
        />
        <MobileTabItem
          icon={<Tags className="w-5 h-5" />}
          label={t('Tags')}
          active={activeTab === 'tags'}
          onClick={() => setActiveTab('tags')}
        />
        <MobileTabItem
          icon={<RefreshCw className="w-5 h-5" />}
          label={t('Review')}
          active={activeTab === 'review'}
          onClick={() => setActiveTab('review')}
          comingSoon={!devMode}
        />
        <MobileTabItem
          icon={<ArrowLeftRight className="w-5 h-5" />}
          label={t('Backup')}
          active={activeTab === 'import-export'}
          onClick={() => setActiveTab('import-export')}
        />
      </nav>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, isCollapsed, comingSoon }: { icon: any, label: string, active: boolean, onClick: () => void, isCollapsed?: boolean, comingSoon?: boolean }) {
  return (
    <button
      onClick={comingSoon ? undefined : onClick}
      disabled={comingSoon}
      title={isCollapsed ? label : undefined}
      style={active ? { backgroundColor: 'var(--brand-accent)', boxShadow: '0 8px 16px color-mix(in srgb, var(--brand-accent) 30%, transparent)' } : undefined}
      className={`relative w-full flex items-center ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'} rounded-xl transition-all duration-200 group ${
        active 
          ? 'text-white dark:shadow-none' 
          : 'text-[#18407B] dark:text-zinc-400 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800'
      } ${comingSoon ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex-shrink-0">{icon}</div>
      {!isCollapsed && <span className="font-medium truncate">{label}</span>}
      {!isCollapsed && comingSoon && (
        <span className="ml-auto text-[8px] font-bold uppercase tracking-wider bg-[#E5E7EB] dark:bg-zinc-700 text-[#8E8E8E] dark:text-zinc-300 px-1.5 py-0.5 rounded">
          Soon
        </span>
      )}
      {!isCollapsed && !comingSoon && active && <ChevronRight className="w-4 h-4 ml-auto opacity-50 flex-shrink-0" />}
      {isCollapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
          {label} {comingSoon && '(Soon)'}
        </div>
      )}
    </button>
  );
}

function MobileTabItem({ icon, label, active, onClick, comingSoon }: { icon: any, label: string, active: boolean, onClick: () => void, comingSoon?: boolean }) {
  return (
    <button
      onClick={comingSoon ? undefined : onClick}
      disabled={comingSoon}
      className={`flex flex-col items-center justify-center py-2 px-1 min-w-0 flex-1 transition-colors relative ${
        active 
          ? 'text-[#18407B] dark:text-white' 
          : 'text-[#8E8E8E] dark:text-zinc-500'
      } ${comingSoon ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex-shrink-0">{icon}</div>
      <span className="text-[10px] font-medium mt-0.5 truncate w-full text-center">{label}</span>
    </button>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <ModalProvider>
        <AppContent />
      </ModalProvider>
    </SettingsProvider>
  );
}
