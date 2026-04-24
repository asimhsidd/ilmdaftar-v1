import React, { useState, useEffect } from 'react';
import { StudyPlan, BookPlan, PlanMode, PlanPhase, ReadingProgress } from '../types';

export default function StudyPlanner() {
  const [plans, setPlans] = useState<StudyPlan[]>(() => {
    const saved = localStorage.getItem('study_plans');
    return saved ? JSON.parse(saved) : [];
  });
  const [activePlanId, setActivePlanId] = useState<string | null>(plans.length > 0 ? plans[0].id : null);

  useEffect(() => {
    localStorage.setItem('study_plans', JSON.stringify(plans));
  }, [plans]);

  const activePlan = plans.find(p => p.id === activePlanId);

  // Stats calculation
  const totalBooks = activePlan?.books?.length || 0;
  const totalPages = activePlan?.books?.reduce((acc, b) => acc + (b.totalPages || 0), 0) || 0;
  
  const totalPagesRead = activePlan?.books?.reduce((acc, b) => acc + (b.currentPageNumber || 0), 0) || 0;
  const totalRemainingPages = Math.max(0, totalPages - totalPagesRead);

  const createNewPlan = () => {
    const newPlan: StudyPlan = {
      id: crypto.randomUUID(),
      name: 'New Study Plan',
      startDate: new Date().toISOString().split('T')[0],
      targetEndDate: '',
      books: []
    };
    setPlans(prev => [...prev, newPlan]);
    setActivePlanId(newPlan.id);
  };

  const updateActivePlan = (updates: Partial<StudyPlan>) => {
    if (!activePlan) return;
    setPlans(prev => prev.map(p => p.id === activePlan.id ? { ...p, ...updates } : p));
  };
  
  const updateBook = (bookId: string, updates: Partial<BookPlan>) => {
    if (!activePlan) return;
    setPlans(prev => prev.map(p => {
      if (p.id !== activePlan.id) return p;
      return {
        ...p,
        books: p.books.map(b => b.id === bookId ? { ...b, ...updates } : b)
      };
    }));
  };

  const addBook = () => {
    if (!activePlan) return;
    const newBook: BookPlan = {
      id: crypto.randomUUID(),
      bookTitle: 'New Book',
      totalPages: 100,
      startDate: activePlan.startDate,
      includeInRevision: false,
      mode: 'fixed-pace',
      fixedPagesPerDay: 10,
      targetEndDate: '',
      phases: [],
      progress: [],
      currentPageNumber: 0,
      collapsed: false
    };
    updateActivePlan({ books: [...activePlan.books, newBook] });
  };
  
  // A helper function to compute projected dates
  const calculateBookStats = (b: BookPlan) => {
    let projectedEnd = b.startDate;
    let requiredPace = b.fixedPagesPerDay || 1;
    let msPerDay = 1000 * 60 * 60 * 24;
    let remaining = b.totalPages - b.currentPageNumber;
    
    if (b.mode === 'fixed-pace') {
      let daysReq = Math.ceil(remaining / (b.fixedPagesPerDay || 1));
      let startD = new Date(b.startDate).getTime();
      let now = Date.now();
      let startFrom = now > startD ? now : startD; 
      projectedEnd = new Date(startFrom + daysReq * msPerDay).toISOString().split('T')[0];
    } else if (b.mode === 'fixed-deadline' && b.targetEndDate) {
      let endD = new Date(b.targetEndDate).getTime();
      let startD = new Date(b.startDate).getTime();
      let now = Date.now();
      let remainDays = Math.ceil((endD - now) / msPerDay);
      if (remainDays <= 0) remainDays = 1;
      requiredPace = Math.ceil(remaining / remainDays);
      projectedEnd = b.targetEndDate;
    }
    
    return { projectedEnd, requiredPace, remaining };
  };

  if (!activePlan) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4 dark:text-white">Study Planner</h2>
        <button className="bg-zinc-800 dark:bg-zinc-200 text-white dark:text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 dark:hover:bg-white transition-colors" onClick={createNewPlan}>Create New Plan</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto h-full pb-20 mt-4">
      
      {/* 1. TOP SECTION - OVERVIEW */}
      <div className="bg-white dark:bg-zinc-900 border border-[#E5E5E0] dark:border-zinc-800 p-6 rounded-xl shadow-sm flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <input 
            className="text-2xl font-bold border-b border-transparent hover:border-[#E5E5E0] focus:border-[#5A5A40] focus:outline-none w-full bg-transparent dark:text-white"
            value={activePlan.name}
            onChange={e => updateActivePlan({ name: e.target.value })}
            placeholder="Plan Name"
          />
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Start Date</label>
              <input type="date" className="p-2 border border-[#E5E5E0] dark:border-zinc-700 bg-transparent rounded-lg text-sm w-full dark:text-white" value={activePlan.startDate} onChange={e => updateActivePlan({ startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Target End Date (Optional)</label>
              <input type="date" className="p-2 border border-[#E5E5E0] dark:border-zinc-700 bg-transparent rounded-lg text-sm w-full dark:text-white" value={activePlan.targetEndDate || ''} onChange={e => updateActivePlan({ targetEndDate: e.target.value })} />
            </div>
          </div>
          <button 
             onClick={createNewPlan}
             className="text-xs text-[#5A5A40] hover:underline"
          >
            + Create another plan
          </button>
        </div>
        
        <div className="flex-1 bg-[#F5F5F0] dark:bg-zinc-800/50 border border-[#E5E5E0] dark:border-zinc-800 p-4 rounded-xl grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-zinc-500 text-xs mb-1">Total Books</div>
            <div className="text-xl font-bold dark:text-white">{totalBooks}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-xs mb-1">Total Pages</div>
            <div className="text-xl font-bold dark:text-white">{totalPages}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-xs mb-1">Remaining</div>
            <div className="text-xl font-bold dark:text-white">{totalRemainingPages}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-xs mb-1">Overall Status</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">On Track</div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center px-1">
        <h2 className="text-xl font-bold dark:text-white">Planning Modules</h2>
        <button onClick={addBook} className="bg-[#5A5A40] text-white hover:bg-[#6A6A4E] transition-colors px-4 py-2 text-sm rounded-lg shadow-sm">+ Add Book</button>
      </div>

      {/* 2. BOOKS LIST */}
      <div className="space-y-4">
        {activePlan.books?.map(book => {
          const stats = calculateBookStats(book);
          const pct = book.totalPages > 0 ? Math.min(100, Math.round((book.currentPageNumber / book.totalPages) * 100)) : 0;
          
          return (
            <div key={book.id} className="bg-white dark:bg-zinc-900 border border-[#E5E5E0] dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden transition-all duration-200">
              <div 
                className="p-4 bg-[#F5F5F0]/50 dark:bg-zinc-800/20 border-b border-[#E5E5E0] dark:border-zinc-800 flex justify-between items-center cursor-pointer hover:bg-[#F5F5F0] dark:hover:bg-zinc-800/50 transition-colors"
                onClick={() => updateBook(book.id, { collapsed: !book.collapsed })}
              >
                <div>
                  <h3 className="font-bold text-lg dark:text-white">{book.bookTitle || 'Untitled Book'}</h3>
                  <div className="text-xs text-zinc-500 mt-1">{book.currentPageNumber} / {book.totalPages} pages &bull; {pct}% complete</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-md">On Track</span>
                  <svg className={`w-5 h-5 text-zinc-400 transform transition-transform ${!book.collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              
              {!book.collapsed && (
                <div className="p-5 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Basic Info */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Book Name</label>
                        <input className="border border-[#E5E5E0] dark:border-zinc-700 bg-transparent p-2.5 rounded-lg w-full text-sm dark:text-white" value={book.bookTitle} onChange={e => updateBook(book.id, { bookTitle: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Total Pages</label>
                          <input type="number" className="border border-[#E5E5E0] dark:border-zinc-700 bg-transparent p-2.5 rounded-lg w-full text-sm dark:text-white" value={book.totalPages || ''} onChange={e => updateBook(book.id, { totalPages: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Start Date</label>
                          <input type="date" className="border border-[#E5E5E0] dark:border-zinc-700 bg-transparent p-2.5 rounded-lg w-full text-sm dark:text-white" value={book.startDate} onChange={e => updateBook(book.id, { startDate: e.target.value })} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 pt-2">
                        <input type="checkbox" id={`rev-${book.id}`} checked={book.includeInRevision} onChange={e => updateBook(book.id, { includeInRevision: e.target.checked })} className="rounded text-[#5A5A40] focus:ring-[#5A5A40]" />
                        <label htmlFor={`rev-${book.id}`} className="text-sm dark:text-zinc-300 cursor-pointer">Include in Revision Cycle?</label>
                      </div>
                    </div>

                    {/* Planning Mode */}
                    <div className="space-y-4 bg-[#F5F5F0]/50 dark:bg-zinc-800/30 p-5 rounded-xl border border-[#E5E5E0] dark:border-zinc-700/50">
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">Planning Mode</label>
                      <select 
                        className="w-full p-2.5 border border-[#E5E5E0] dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm dark:text-white"
                        value={book.mode}
                        onChange={e => updateBook(book.id, { mode: e.target.value as PlanMode })}
                      >
                        <option value="fixed-pace">Mode A — Fixed Pace</option>
                        <option value="fixed-deadline">Mode B — Fixed Deadline</option>
                        <option value="phased">Mode C — Phased Plan</option>
                      </select>
                      
                      {book.mode === 'fixed-pace' && (
                        <div className="pt-2">
                          <label className="block text-xs text-zinc-500 mb-1">Fixed Pages / Day</label>
                          <input type="number" className="border border-[#E5E5E0] dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 rounded-lg w-full text-sm dark:text-white" value={book.fixedPagesPerDay || ''} onChange={e => updateBook(book.id, { fixedPagesPerDay: parseInt(e.target.value) || 1 })} />
                          <div className="mt-3 text-xs text-[#5A5A40] dark:text-[#8E8E70] bg-[#5A5A40]/10 dark:bg-[#5A5A40]/20 p-2.5 rounded-lg border border-[#5A5A40]/20">Auto-calculated end: <b className="ml-1">{stats.projectedEnd}</b></div>
                        </div>
                      )}
                      
                      {book.mode === 'fixed-deadline' && (
                        <div className="pt-2">
                          <label className="block text-xs text-zinc-500 mb-1">Target End Date</label>
                          <input type="date" className="border border-[#E5E5E0] dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 rounded-lg w-full text-sm dark:text-white" value={book.targetEndDate || ''} onChange={e => updateBook(book.id, { targetEndDate: e.target.value })} />
                          <div className="mt-3 text-xs text-[#5A5A40] dark:text-[#8E8E70] bg-[#5A5A40]/10 dark:bg-[#5A5A40]/20 p-2.5 rounded-lg border border-[#5A5A40]/20">Auto-calculated pace: <b className="ml-1">{stats.requiredPace} pgs/day</b></div>
                        </div>
                      )}
                      
                      {book.mode === 'phased' && (
                        <div className="text-sm text-zinc-500 dark:text-zinc-400 italic p-4 bg-white dark:bg-zinc-900 border border-dashed border-[#E5E5E0] dark:border-zinc-700 rounded-lg mt-2">
                          Phases configurator UI (Phase 1: X pages/day from Y to Z...)
                        </div>
                      )}
                    </div>
                  </div>

                  <hr className="border-[#E5E5E0] dark:border-zinc-800" />
                  
                  {/* Progress Input & Display */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#F5F5F0]/80 dark:bg-zinc-800/40 p-5 rounded-xl">
                    <div className="flex flex-col justify-center">
                      <h4 className="font-bold text-sm mb-3 dark:text-white">Daily Progress Input</h4>
                      <div className="flex gap-2">
                        <input type="number" placeholder="Enter current page..." className="border border-[#E5E5E0] dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 rounded-lg flex-1 text-sm dark:text-white" id={`inp-cur-${book.id}`} defaultValue={book.currentPageNumber || ''} />
                        <button className="bg-[#5A5A40] text-white hover:bg-[#6A6A4E] transition-colors px-4 py-2.5 rounded-lg text-sm font-medium" onClick={() => {
                          const val = (document.getElementById(`inp-cur-${book.id}`) as HTMLInputElement).value;
                          if (val) updateBook(book.id, { currentPageNumber: parseInt(val) || 0 });
                        }}>Update</button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm bg-white dark:bg-zinc-900 p-4 rounded-xl border border-[#E5E5E0] dark:border-zinc-800 shadow-sm">
                      <div><div className="text-zinc-500 text-xs mb-1">Current Page</div><div className="font-bold text-lg dark:text-white">{book.currentPageNumber}</div></div>
                      <div><div className="text-zinc-500 text-xs mb-1">Remaining</div><div className="font-bold text-lg dark:text-white">{stats.remaining}</div></div>
                      <div className="col-span-2 mt-1">
                        <div className="flex justify-between text-xs mb-2 dark:text-zinc-400 font-medium"><span>{pct}% Progress</span><span>{book.totalPages} pages</span></div>
                        <div className="w-full bg-[#E5E5E0] dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                          <div className="bg-[#5A5A40] dark:bg-[#8E8E70] h-2.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Smart Recalculation Engine */}
                  <div className="bg-amber-50 dark:bg-amber-900/10 p-5 rounded-xl border border-amber-200 dark:border-amber-900/30">
                    <h4 className="font-bold text-sm text-amber-800 dark:text-amber-500 mb-1">Smart Recalculation Engine</h4>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mb-4">If you fall behind or get ahead, recalculate your plan intelligently.</p>
                    <div className="flex flex-wrap gap-2.5">
                      <button className="bg-white dark:bg-zinc-800 border border-amber-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium px-4 py-2 rounded-lg shadow-sm hover:bg-amber-50 dark:hover:bg-zinc-700 transition-colors">1. Stay in Deadline</button>
                      <button className="bg-white dark:bg-zinc-800 border border-amber-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium px-4 py-2 rounded-lg shadow-sm hover:bg-amber-50 dark:hover:bg-zinc-700 transition-colors">2. Extend Deadline</button>
                      <button className="bg-white dark:bg-zinc-800 border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-500 text-xs font-bold px-4 py-2 rounded-lg shadow-sm hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors">3. Smart Rebalance</button>
                    </div>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
