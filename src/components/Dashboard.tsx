import React, { useState, useEffect, useRef } from 'react';
import { Stats, Science } from '../types';
import { BookOpen, Library, GraduationCap, TrendingUp, ArrowLeft, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { formatFaidahCount } from '../utils/formatFaidahCount';
import Explorer from './Explorer';

export default function Dashboard({ stats, sciences, onNavigate, onUpdate, onOpenNeedsFormatting }: { stats: Stats | null, sciences: Science[], onNavigate: (tab: string) => void, onUpdate: () => void, onOpenNeedsFormatting?: () => void }) {
  const { t, language } = useSettings();
  const [showExplorer, setShowExplorer] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const devMode = typeof window !== 'undefined' && localStorage.getItem('fawaid_dev_mode') === 'true';

  const handleOpenNeedsFormatting = () => {
    if (onOpenNeedsFormatting) {
      onOpenNeedsFormatting();
    } else {
      localStorage.setItem('fawaid_explorer_quick_capture_inbox', 'true');
    }
    setShowExplorer(true);
  };

  useEffect(() => {
    if (localStorage.getItem('fawaid_open_explorer') === 'true') {
      setShowExplorer(true);
      localStorage.removeItem('fawaid_open_explorer');
    }
  }, []);

  useEffect(() => {
    if (searchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchExpanded]);

  const renderSearch = (isExplorer: boolean = false) => (
    <div 
      className={`fixed z-50 flex items-center justify-end ${
        isExplorer 
          ? 'top-4 right-4 md:top-8 md:right-8 lg:top-10 lg:right-10' 
          : 'top-4 right-4 md:relative md:top-auto md:right-auto md:z-auto'
      }`}
      onMouseEnter={() => setSearchExpanded(true)}
      onMouseLeave={() => { if (document.activeElement !== searchInputRef.current) setSearchExpanded(false); }}
    >
      <div
        className={`flex items-center bg-white dark:bg-zinc-900 border border-[#E5E7EB] dark:border-zinc-800 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] md:shadow-sm overflow-hidden transition-all duration-300 ease-in-out ${
          searchExpanded ? 'w-[calc(100vw-2rem)] md:w-80 lg:w-96 max-w-sm' : 'w-14 h-14 md:w-12 md:h-12'
        }`}
      >
        <button
          onClick={() => {
            if (!searchExpanded) {
              setSearchExpanded(true);
            } else {
              onNavigate('search');
            }
          }}
          className="flex-shrink-0 w-14 h-14 md:w-12 md:h-12 flex items-center justify-center text-[#18407B] md:text-[#8E8E8E] dark:text-zinc-300 md:dark:text-gray-500 hover:text-[#18407B] dark:hover:text-zinc-300 transition-colors"
        >
          <Search className="w-6 h-6 md:w-5 md:h-5" />
        </button>
        {searchExpanded && (
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('Search Notes...')}
            onFocus={() => setSearchExpanded(true)}
            onBlur={() => setTimeout(() => setSearchExpanded(false), 200)}
            onChange={(e) => {
              localStorage.setItem('fawaid_search_query', e.target.value);
              onNavigate('search');
            }}
            className="flex-1 bg-transparent border-none pr-4 py-3 md:py-3 focus:outline-none font-bold text-[#1A1A1A] dark:text-white text-base md:text-sm"
          />
        )}
      </div>
    </div>
  );

  if (!stats) return null;

  if (showExplorer) {
    return (
      <div className="h-full flex flex-col animate-in fade-in duration-300">
        <div className="mb-6">
          <button 
            onClick={() => setShowExplorer(false)}
            className="flex items-center text-sm font-bold text-[#18407B] dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
            {t('Back to Dashboard') || 'Back to Dashboard'}
          </button>
        </div>
        <Explorer sciences={sciences} onUpdate={onUpdate} />
        {renderSearch(true)}
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 relative">
        {/* Desktop Title */}
        <div className="hidden md:block">
          <h2 className="text-3xl montserrat-bold text-[#1A1A1A] dark:text-white">{t('Dashboard')}</h2>
          <p className="text-[#18407B] dark:text-[#A69DF4] mt-2 font-medium">{t('Dashboard Welcome')}</p>
        </div>
        {/* Expandable search icon */}
        {renderSearch(false)}
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
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
          label={'Needs Formatting'}
          value={stats.needsFormatting || 0}
          color="bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
          onClick={handleOpenNeedsFormatting}
        />
        <StatCard 
          icon={<Library className="w-6 h-6" />} 
          label={t('Total Fawaid')} 
          value={stats.totalFawaid} 
          color="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
        <section className="bg-white dark:bg-zinc-900 rounded-2xl md:rounded-3xl p-5 md:p-8 border border-[#E5E7EB] dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl montserrat-bold flex items-center gap-2 dark:text-white">
              <TrendingUp className="w-5 h-5 text-[#18407B] dark:text-zinc-400" />
              {t('Top Sciences')}
            </h3>
            <button 
              onClick={() => {
                localStorage.removeItem('fawaid_explorer_quick_capture_inbox');
                localStorage.setItem('fawaid_explorer_view', 'sciences');
                setShowExplorer(true);
              }}
              className="text-sm font-medium text-[#18407B] dark:text-zinc-400 hover:underline"
            >
              {t('View All')}
            </button>
          </div>
          <div className="space-y-4">
            {stats.scienceStats?.slice(0, 5).map((sci, idx) => (
              <div key={idx} className="group">
                <div className="flex justify-between mb-2">
                  <span className="font-medium text-[#4A4A4A] dark:text-gray-300">{sci.name}</span>
                  <span className="text-sm font-bold text-[#18407B] dark:text-zinc-400">{formatFaidahCount(sci.count, language)}</span>
                </div>
                <div className="w-full bg-[#F5F5F7] dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((sci.count / (stats.totalFawaid || 1)) * 100, 100)}%` }}
                    className="bg-[#6197EC] dark:bg-zinc-500 h-full rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#6197EC] dark:bg-zinc-800 rounded-2xl md:rounded-3xl p-5 md:p-8 text-white shadow-xl shadow-[#6197EC]/20 dark:shadow-none relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-2xl montserrat-bold mb-4">{t('Quick Actions')}</h3>
            <p className="text-white/70 mb-8 max-w-xs">{t('Quick Actions Description')}</p>
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => onNavigate('capture')}
                className="bg-white text-[#18407B] dark:text-zinc-900 font-bold py-4 px-6 rounded-2xl flex items-center justify-between hover:bg-opacity-90 transition-all"
              >
                <span>{t('Add Fāʾidah')}</span>
                <PlusCircleIcon className="w-5 h-5" />
              </button>
              {devMode ? (
                <button 
                  onClick={() => onNavigate('review')}
                  className="bg-white/10 text-white hover:bg-white/20 font-bold py-4 px-6 rounded-2xl flex items-center justify-center border border-white/10 relative overflow-hidden transition-all group"
                >
                  <span className="flex items-center gap-2">
                    {t('Review Mode')}
                  </span>
                </button>
              ) : (
                <button 
                  disabled
                  className="bg-white/10 text-white/50 cursor-not-allowed font-bold py-4 px-6 rounded-2xl flex items-center justify-center border border-white/10 relative overflow-hidden group"
                >
                  <div className="absolute inset-0 transition-opacity bg-black/10 opacity-0 group-hover:opacity-100" />
                  <span className="flex items-center gap-2">
                    {t('Review Mode')}
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-2 py-0.5 rounded-full">
                      {t('Coming Soon') || 'Coming Soon'}
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, onClick }: { icon: any, label: string, value: number, color: string, onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-zinc-900 rounded-2xl md:rounded-3xl p-3 md:p-6 border border-[#E5E7EB] dark:border-zinc-800 shadow-sm flex flex-row items-center gap-3 md:gap-4 hover:border-[#6197EC]/40 transition-colors overflow-hidden"
      disabled={!onClick}
    >
      <div className={`p-2.5 md:p-4 rounded-xl md:rounded-2xl ${color} flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] md:text-sm font-bold text-[#8E8E8E] dark:text-gray-500 uppercase tracking-wider" title={label}>{label}</p>
        <p className="text-xl md:text-2xl font-black text-[#1A1A1A] dark:text-white truncate">{value}</p>
      </div>
    </button>
  );
}

function PlusCircleIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
  )
}

function RefreshCwIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
  )
}
