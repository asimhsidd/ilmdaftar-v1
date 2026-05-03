import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Tags,
  Search,
  Edit2,
  Trash2,
  Merge,
  Check,
  X,
  Loader2,
  AlertTriangle,
  BookOpen
} from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useModal } from '../contexts/ModalContext';
import { formatFaidahCount } from '../utils/formatFaidahCount';

interface Tag {
  id: number;
  name: string;
  normalized_name: string;
  usage_count: number;
  last_used_at: string | null;
}

interface TagBrowserProps {
  onTagClick?: (tag: string) => void;
}

export default function TagBrowser({ onTagClick }: TagBrowserProps) {
  const { t, apiKey, language } = useSettings();
  const { showModal } = useModal();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [mergeTargetName, setMergeTargetName] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags?usedOnly=true');
      if (!res.ok) throw new Error('Failed to fetch tags');
      const data = await res.json();
      setTags(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      await showModal({ type: 'alert', title: t('Error'), message: t('Failed to load tags') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    if (selectedTags.length >= 2 && !mergeTargetName.trim()) {
      const first = tags.find(tag => tag.id === selectedTags[0]);
      if (first?.name) {
        setMergeTargetName(first.name);
      }
    }
    if (selectedTags.length < 2 && mergeTargetName) {
      setMergeTargetName('');
    }
  }, [selectedTags, tags, mergeTargetName]);

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tag.normalized_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRename = async (tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
  };

  const saveRename = async (tagId: number) => {
    try {
      const res = await fetch(`/api/tags/${tagId}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: editName })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.existingTag) {
          await showModal({
            type: 'alert',
            title: t('Duplicate Tag'),
            message: t('A tag with this name already exists: ') + data.existingTag.name
          });
        } else {
          throw new Error(data.error || t('Failed to rename tag'));
        }
        return;
      }

      await showModal({
        type: 'alert',
        title: t('Success'),
        message: t('Tag renamed successfully')
      });

      setEditingId(null);
      setEditName('');
      fetchTags();
    } catch (e: any) {
      console.error(e);
      await showModal({ type: 'alert', title: t('Error'), message: e.message || t('Failed to rename tag') });
    }
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleDelete = async (tag: Tag) => {
    const confirmed = await showModal({
      type: 'confirm',
      title: t('Delete Tag'),
      message: t('Are you sure you want to delete "{{name}}"? This will remove it from {{count}} fawāʾid.').replace('{{name}}', tag.name).replace('{{count}}', String(tag.usage_count)),
      confirmText: t('Delete'),
      cancelText: t('Cancel'),
      confirmVariant: 'danger'
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('Failed to delete tag'));

      await showModal({
        type: 'alert',
        title: t('Success'),
        message: t('Tag deleted successfully')
      });

      fetchTags();
    } catch (e: any) {
      console.error(e);
      await showModal({ type: 'alert', title: t('Error'), message: e.message || t('Failed to delete tag') });
    }
  };

  const toggleTagSelection = (tagId: number) => {
    setSelectedTags(prev => {
      if (prev.includes(tagId)) {
        return prev.filter(id => id !== tagId);
      }
      return [...prev, tagId];
    });
  };

  const executeMerge = async () => {
    if (!mergeTargetName.trim() || selectedTags.length < 2) return;

    try {
      setIsMerging(true);
      const res = await fetch('/api/tags/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTagIds: selectedTags, targetTagName: mergeTargetName.trim() })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('Failed to merge tags'));
      }

      await showModal({
        type: 'alert',
        title: t('Success'),
        message: t('Tags merged successfully into "{{name}}"').replace('{{name}}', data.mergedInto.name)
      });

      setSelectedTags([]);
      setMergeTargetName('');
      fetchTags();
    } catch (e: any) {
      console.error(e);
      await showModal({ type: 'alert', title: t('Error'), message: e.message || t('Failed to merge tags') });
    } finally {
      setIsMerging(false);
    }
  };

  const cancelMerge = () => {
    setSelectedTags([]);
    setMergeTargetName('');
  };

  const handleTagClick = (tag: Tag) => {
    if (onTagClick) {
      onTagClick(tag.name);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 text-[#18407B] dark:text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif font-bold text-[#1A1A1A] dark:text-white flex items-center gap-2">
          <Tags className="w-6 h-6" />
          {t('Tag Browser')}
        </h2>
        <span className="text-sm text-[#8E8E8E] dark:text-gray-400">
          {tags.length} {t('tags')}
        </span>
      </div>

      {/* Merge Controls */}
      <AnimatePresence>
        {selectedTags.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-[#6197EC]/10 dark:bg-zinc-800 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <Merge className="w-5 h-5 text-[#18407B] dark:text-zinc-400" />
              <span className="text-sm font-bold text-[#18407B] dark:text-zinc-300">
                {t('Selected {{count}} tags for merge').replace('{{count}}', String(selectedTags.length))}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={mergeTargetName}
                onChange={(e) => setMergeTargetName(e.target.value)}
                placeholder={t('Canonical tag name')}
                className="flex-1 sm:w-48 px-3 py-2 sm:py-1.5 text-sm rounded-lg border border-[#E5E7EB] dark:border-zinc-700 bg-white dark:bg-zinc-900 dark:text-white"
              />
              <button
                onClick={executeMerge}
                disabled={isMerging || !mergeTargetName.trim()}
                className="flex-1 sm:flex-none justify-center px-3 py-2 sm:py-1.5 bg-[#6197EC] text-white text-sm font-bold rounded-lg hover:bg-[#4C81D9] transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {isMerging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('Merge {{count}} Tags').replace('{{count}}', String(selectedTags.length))}
              </button>
              <button
                onClick={cancelMerge}
                disabled={isMerging}
                className="px-3 py-2 sm:py-1.5 text-sm font-bold text-[#8E8E8E] dark:text-gray-400 hover:bg-[#F5F5F7] dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {t('Cancel')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8E8E8E] dark:text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('Search tags...')}
          className="w-full bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border border-[#E5E7EB] dark:border-zinc-700 rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-[#6197EC] dark:focus:ring-zinc-600"
        />
      </div>

      {/* Tags List */}
      <div className="space-y-2">
        {filteredTags.length === 0 ? (
          <div className="text-center py-12 text-[#8E8E8E] dark:text-gray-400">
            <Tags className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('No tags found')}</p>
          </div>
        ) : (
          filteredTags.map(tag => (
            <motion.div
              key={tag.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`bg-white dark:bg-zinc-900 rounded-xl border transition-all ${
                selectedTags.includes(tag.id)
                  ? 'border-[#6197EC] bg-[#6197EC]/5 dark:bg-[#6197EC]/10'
                  : 'border-[#E5E7EB] dark:border-zinc-800 hover:border-[#6197EC]/50'
              }`}
            >
              <div className="p-4 flex items-center gap-3">
                {/* Selection Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.id)}
                  onChange={() => toggleTagSelection(tag.id)}
                  className="w-4 h-4 rounded border-[#E5E7EB] dark:border-zinc-700 text-[#18407B] focus:ring-[#6197EC]"
                />

                {/* Tag Info */}
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => handleTagClick(tag)}
                >
                  {editingId === tag.id ? (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 bg-[#F5F5F7] dark:bg-zinc-800 dark:text-white border border-[#E5E7EB] dark:border-zinc-700 rounded-lg px-3 py-1 focus:ring-2 focus:ring-[#6197EC]"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(tag.id);
                          if (e.key === 'Escape') cancelRename();
                        }}
                      />
                      <button
                        onClick={() => saveRename(tag.id)}
                        className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={cancelRename}
                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#1A1A1A] dark:text-white aref-ruqaa-regular text-lg">
                          {tag.name}
                        </span>
                        {tag.normalized_name !== tag.name.toLowerCase() && (
                          <span className="text-xs text-[#8E8E8E] dark:text-gray-500 font-mono">
                            ({tag.normalized_name})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-[#8E8E8E] dark:text-gray-400 flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {formatFaidahCount(tag.usage_count, language)}
                        </span>
                        {tag.last_used_at && (
                          <span className="text-xs text-[#8E8E8E] dark:text-gray-500">
                            {new Date(tag.last_used_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                {editingId !== tag.id && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleRename(tag)}
                      className="p-2 text-[#8E8E8E] dark:text-gray-400 hover:text-[#18407B] dark:hover:text-zinc-300 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      title={t('Rename')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tag)}
                      className="p-2 text-[#8E8E8E] dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title={t('Delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
