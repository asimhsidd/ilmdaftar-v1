import React, { useState } from 'react';
import { Stats, Science } from '../types';
import { BookOpen, Library, GraduationCap, TrendingUp, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import Explorer from './Explorer';

export default function Dashboard({ stats, sciences, onNavigate, onUpdate }: { stats: Stats | null, sciences: Science[], onNavigate: (tab: string) => void, onUpdate: () => void }) {
  const { t } = useSettings();
  const [showExplorer, setShowExplorer] = useState(false);

  if (!stats) return null;

  if (showExplorer) {
    return (
      <div className="h-full flex flex-col animate-in fade-in duration-300">
        <div className="mb-6">
          <button 
            onClick={() => setShowExplorer(false)}
            className="flex items-center text-sm font-bold text-[#5A5A40] dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
            {t('Back to Dashboard') || 'Back to Dashboard'}
          </button>
        </div>
        <Explorer sciences={sciences} onUpdate={onUpdate} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-serif font-bold text-[#1A1A1A] dark:text-white">{t('Dashboard')}</h2>
        <p className="text-[#8E8E8E] dark:text-gray-400 mt-2">{t('Dashboard Welcome')}</p>
      </header>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#E5E5E0] dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-serif font-bold flex items-center gap-2 dark:text-white">
              <TrendingUp className="w-5 h-5 text-[#5A5A40] dark:text-zinc-400" />
              {t('Top Sciences')}
            </h3>
            <button 
              onClick={() => setShowExplorer(true)}
              className="text-sm font-medium text-[#5A5A40] dark:text-zinc-400 hover:underline"
            >
              {t('View All')}
            </button>
          </div>
          <div className="space-y-4">
            {stats.scienceStats?.slice(0, 5).map((sci, idx) => (
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

        <section className="bg-[#5A5A40] dark:bg-zinc-800 rounded-3xl p-8 text-white shadow-xl shadow-[#5A5A40]/20 dark:shadow-none relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-2xl font-serif font-bold mb-4">{t('Quick Actions')}</h3>
            <p className="text-white/70 mb-8 max-w-xs">{t('Quick Actions Description')}</p>
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => onNavigate('capture')}
                className="bg-white text-[#5A5A40] dark:text-zinc-900 font-bold py-4 px-6 rounded-2xl flex items-center justify-between hover:bg-opacity-90 transition-all"
              >
                <span>{t('Add Fāʾidah')}</span>
                <PlusCircleIcon className="w-5 h-5" />
              </button>
              <button 
                onClick={() => onNavigate('review')}
                className="bg-white/10 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-between hover:bg-white/20 transition-all border border-white/20"
              >
                <span>{t('Review Mode')}</span>
                <RefreshCwIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: any, label: string, value: number, color: string }) {
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
