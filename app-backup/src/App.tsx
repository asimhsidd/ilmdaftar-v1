import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
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
  PanelLeftOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Science, Stats } from './types';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';

// Components
import Dashboard from './components/Dashboard';

import ReviewMode from './components/ReviewMode';
import ImportExport from './components/ImportExport';
import Capture from './components/Capture';

function AppContent() {
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
  const { theme, setTheme, language, setLanguage, t, apiKey, setApiKey } = useSettings();

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

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
      case 'search':
      case 'explorer':
        return <Dashboard sciences={sciences} stats={stats} onNavigate={setActiveTab} onUpdate={fetchInitialData} />;
      case 'capture':
        return (
          <div className="flex flex-col h-full bg-[#F5F5F0] dark:bg-black p-8 overflow-y-auto">
            <Capture sciences={sciences} onSave={() => setActiveTab('review')} />
          </div>
        );
      case 'review':
        return <ReviewMode sciences={sciences} />;
      case 'import-export':
        return <ImportExport sciences={sciences} onUpdate={fetchInitialData} />;
      default:
        return <Dashboard sciences={sciences} stats={stats} onNavigate={setActiveTab} onUpdate={fetchInitialData} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#F5F5F0] dark:bg-black text-[#1A1A1A] dark:text-white font-sans transition-colors duration-300">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white dark:bg-zinc-900 border-r border-[#E5E5E0] dark:border-zinc-800 flex flex-col transition-all duration-300 relative z-20`}>
        <div className={`p-6 border-b border-[#E5E5E0] dark:border-zinc-800 flex flex-col justify-center ${isSidebarCollapsed ? 'items-center px-2' : ''}`}>
          <div className="flex justify-between items-center w-full">
            <h1 className={`text-xl font-serif font-bold tracking-tight flex items-center gap-2 dark:text-white ${isSidebarCollapsed ? 'justify-center mx-auto' : ''}`}>
              <BookMarked className="w-6 h-6 text-[#5A5A40] dark:text-zinc-400 flex-shrink-0" />
              {!isSidebarCollapsed && <span>Fawāʾid</span>}
            </h1>
            {!isSidebarCollapsed && (
              <button 
                onClick={() => setIsSidebarCollapsed(true)} 
                className="text-[#8E8E8E] hover:text-[#5A5A40] dark:hover:text-white transition-colors"
                title={t('Collapse Sidebar')}
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            )}
          </div>
          {!isSidebarCollapsed && (
            <p className="text-xs text-[#8E8E8E] dark:text-gray-500 mt-1 italic truncate">{t('Knowledge Manager')}</p>
          )}
          {isSidebarCollapsed && (
            <button 
              onClick={() => setIsSidebarCollapsed(false)} 
              className="text-[#8E8E8E] hover:text-[#5A5A40] dark:hover:text-white transition-colors mt-4"
              title={t('Expand Sidebar')}
            >
              <PanelLeftOpen className="w-5 h-5 flex-shrink-0" />
            </button>
          )}
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
          />
          <NavItem
            icon={<ArrowLeftRight className="w-5 h-5" />}
            label={t('Import / Export')}
            active={activeTab === 'import-export'}
            onClick={() => setActiveTab('import-export')}
            isCollapsed={isSidebarCollapsed}
          />
        </nav>

        <div className={`border-t border-[#E5E5E0] dark:border-zinc-800 space-y-4 ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>
          {/* API Key Settings */}
          <div className={`bg-[#F5F5F0] dark:bg-zinc-800 rounded-xl transition-colors relative group ${isSidebarCollapsed ? 'p-2 flex justify-center' : 'p-3'}`}>
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
              <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-2'} text-[#5A5A40] dark:text-zinc-400 relative`}>
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
                    className="w-full bg-white dark:bg-zinc-700 border border-[#E5E5E0] dark:border-zinc-600 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E8E8E] hover:text-[#5A5A40]"
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
                    className="flex-1 bg-[#5A5A40] dark:bg-zinc-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-[#4A4A30] dark:hover:bg-zinc-500 transition-all"
                  >
                    {apiKeySaved ? t('API Key Saved') : t('Save')}
                  </button>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-zinc-700 border border-[#E5E5E0] dark:border-zinc-600 rounded-lg text-xs font-medium text-[#5A5A40] dark:text-zinc-300 hover:bg-[#F5F5F0] dark:hover:bg-zinc-600 transition-all"
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
              className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-[#F5F5F0] dark:bg-zinc-800 hover:bg-[#E5E5E0] dark:hover:bg-zinc-700 transition-all text-sm font-medium group relative`}
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
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className={`flex items-center justify-center p-2 rounded-lg bg-[#F5F5F0] dark:bg-zinc-800 hover:bg-[#E5E5E0] dark:hover:bg-zinc-700 transition-all relative group ${isSidebarCollapsed ? 'w-full' : ''}`}
            >
              <Languages className="w-4 h-4 flex-shrink-0" />
              {!isSidebarCollapsed && <span className="ml-1 text-xs font-bold">{language === 'en' ? t('Arabic') : t('English')}</span>}
              {isSidebarCollapsed && (
                <div className="absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                  {language === 'en' ? t('Arabic') : t('English')}
                </div>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <div className="max-w-5xl mx-auto p-8">
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
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, isCollapsed }: { icon: any, label: string, active: boolean, onClick: () => void, isCollapsed?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={isCollapsed ? label : undefined}
      className={`relative w-full flex items-center ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'} rounded-xl transition-all duration-200 group ${
        active 
          ? 'bg-[#5A5A40] text-white shadow-lg shadow-[#5A5A40]/20 dark:bg-zinc-700 dark:shadow-none' 
          : 'text-[#5A5A40] dark:text-zinc-400 hover:bg-[#F5F5F0] dark:hover:bg-zinc-800'
      }`}
    >
      <div className="flex-shrink-0">{icon}</div>
      {!isCollapsed && <span className="font-medium truncate">{label}</span>}
      {!isCollapsed && active && <ChevronRight className="w-4 h-4 ml-auto opacity-50 flex-shrink-0" />}
      {isCollapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
          {label}
        </div>
      )}
    </button>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}
