import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';

export default function NewItemModal({ 
  isOpen, 
  onClose, 
  onSave, 
  type 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (data: { title: string, author?: string }) => void,
  type: 'book' | 'sharh'
}) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const { t } = useSettings();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
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
          className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-[#E5E5E0] dark:border-zinc-800"
        >
          <h3 className="text-lg font-serif font-bold mb-4 dark:text-white">
            {type === 'book' ? t('Add New Book') : t('Add New Sharh')}
          </h3>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'book' ? t('Enter Book Name') : t('Enter Sharh Name')}
            className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 mb-3 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
            autoFocus
          />
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder={`${t('Author Name')} (${t('Optional')})`}
            className="w-full bg-[#F5F5F0] dark:bg-zinc-800 dark:text-white border-none rounded-xl px-4 py-3 mb-4 focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-zinc-600"
          />
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-bold text-[#8E8E8E] hover:bg-[#F5F5F0] dark:hover:bg-zinc-800 transition-all"
            >
              {t('Cancel')}
            </button>
            <button
              onClick={() => {
                onSave({ title, author });
                setTitle('');
                setAuthor('');
                onClose();
              }}
              disabled={!title.trim()}
              className="px-4 py-2 bg-[#5A5A40] text-white rounded-xl text-sm font-bold hover:bg-[#4A4A30] transition-all disabled:opacity-50"
            >
              {t('Save')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
