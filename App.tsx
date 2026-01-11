import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ChatState, ChatMessage, LocalStats } from './types';
import { parseWhatsAppStringChunk, extractChatAndMediaFromZip } from './services/parser';
import { getChatFromCache, saveChatToCache } from './services/db';
import MessageBubble from './components/MessageBubble';

const BATCH_SIZE = 500;

const App: React.FC = () => {
  const [state, setState] = useState<ChatState>({
    rawText: '',
    messages: [],
    loading: false,
    error: null,
    stats: null,
  });

  const [displayLimit, setDisplayLimit] = useState(BATCH_SIZE);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const [meSender, setMeSender] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  
  const lastMessageRef = useRef<ChatMessage | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const accumulatedRef = useRef<ChatMessage[]>([]);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const chatTitle = useMemo(() => {
    if (!state.stats) return "PrivaGlass";
    const names = Object.keys(state.stats.participants).filter(n => n !== meSender);
    if (names.length === 0) return "My Private Chat";
    if (names.length === 1) return names[0];
    return names[0];
  }, [state.stats, meSender]);

  const galleryMedia = useMemo(() => {
    return state.messages.filter(m => m.mediaUrl);
  }, [state.messages]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !state.loading && state.messages.length > 0) {
          setDisplayLimit(prev => prev + BATCH_SIZE);
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [state.messages.length, state.loading]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (top > 10 && !scrolled) setScrolled(true);
    else if (top <= 10 && scrolled) setScrolled(false);
  };

  const computeStats = (messages: ChatMessage[]): LocalStats => {
    const participants: { [name: string]: number } = {};
    let mediaCount = 0;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      participants[m.sender] = (participants[m.sender] || 0) + 1;
      if (m.mediaUrl) mediaCount++;
    }
    return { totalMessages: messages.length, participants, mediaCount, wordCount: 0, topWords: [] };
  };

  const detectMeSender = (messages: ChatMessage[]) => {
    if (messages.length === 0) return;
    const counts: Record<string, number> = {};
    messages.slice(0, 300).forEach(m => {
      counts[m.sender] = (counts[m.sender] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) setMeSender(sorted[0][0]);
  };

  const parseComparableDate = (dateStr: string) => {
    const parts = dateStr.split(/[\/\.\-]/);
    if (parts.length < 3) return new Date(0);
    let day = parseInt(parts[0]);
    let month = parseInt(parts[1]) - 1;
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    if (month > 11) {
      const temp = day;
      day = month + 1;
      month = temp - 1;
    }
    return new Date(year, month, day);
  };

  const filteredMessages = useMemo(() => {
    let msgs = state.messages;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      msgs = msgs.filter(m => 
        m.text.toLowerCase().includes(q) || 
        m.sender.toLowerCase().includes(q)
      );
    }
    if (dateRange.from || dateRange.to) {
      const fromDate = dateRange.from ? new Date(dateRange.from) : null;
      const toDate = dateRange.to ? new Date(dateRange.to) : null;
      if (toDate) toDate.setHours(23, 59, 59, 999);
      msgs = msgs.filter(m => {
        const msgDate = parseComparableDate(m.timestamp.split(',')[0].trim());
        if (fromDate && msgDate < fromDate) return false;
        if (toDate && msgDate > toDate) return false;
        return true;
      });
    }
    return msgs;
  }, [state.messages, searchQuery, dateRange]);

  const visibleMessages = useMemo(() => {
    return filteredMessages.slice(0, displayLimit).map(msg => ({
      ...msg,
      isMe: meSender ? msg.sender === meSender : false
    }));
  }, [filteredMessages, displayLimit, meSender]);

  const groupedMessages = useMemo(() => {
    const groups: { date: string, msgs: ChatMessage[] }[] = [];
    visibleMessages.forEach(msg => {
      const dateKey = msg.timestamp.split(',')[0].trim();
      if (!groups.length || groups[groups.length - 1].date !== dateKey) {
        groups.push({ date: dateKey, msgs: [] });
      }
      groups[groups.length - 1].msgs.push(msg);
    });
    return groups;
  }, [visibleMessages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setState(prev => ({ ...prev, loading: true, error: null, messages: [], stats: null }));
    accumulatedRef.current = [];
    setDisplayLimit(BATCH_SIZE);
    setDateRange({ from: '', to: '' });
    try {
      let text = '';
      let mediaMap = new Map<string, string>();
      const cacheId = `wa-v2-${file.name}-${file.size}`;
      const cached = await getChatFromCache(cacheId);
      if (cached) {
        detectMeSender(cached);
        accumulatedRef.current = cached;
        setState(prev => ({ ...prev, messages: cached, loading: false, stats: computeStats(cached) }));
        return;
      }
      if (file.name.endsWith('.zip')) {
        const result = await extractChatAndMediaFromZip(file);
        text = result.text;
        mediaMap = result.mediaMap;
      } else {
        text = await file.text();
      }
      const { nextCharIndex, messages: firstBatch } = parseWhatsAppStringChunk(text, 0, 1000, mediaMap, lastMessageRef);
      detectMeSender(firstBatch);
      accumulatedRef.current = firstBatch;
      setState(prev => ({ ...prev, messages: firstBatch, loading: false }));
      if (nextCharIndex < text.length) {
        setIsBackgroundLoading(true);
        processInChunks(text, nextCharIndex, mediaMap, cacheId);
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }));
    }
  };

  const processInChunks = (text: string, startIdx: number, mediaMap: Map<string, string>, cacheId: string) => {
    let currentPos = startIdx;
    const parseNext = () => {
      if (abortControllerRef.current?.signal.aborted) return;
      const { nextCharIndex, messages } = parseWhatsAppStringChunk(text, currentPos, 15000, mediaMap, lastMessageRef);
      accumulatedRef.current = [...accumulatedRef.current, ...messages];
      currentPos = nextCharIndex;
      if (currentPos >= text.length || accumulatedRef.current.length % 10000 === 0) {
        setState(prev => ({ ...prev, messages: accumulatedRef.current, stats: computeStats(accumulatedRef.current) }));
      }
      if (currentPos < text.length) {
        requestAnimationFrame(parseNext);
      } else {
        setIsBackgroundLoading(false);
        saveChatToCache(cacheId, accumulatedRef.current);
      }
    };
    parseNext();
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden text-[#111b21] bg-[#f0f2f5] font-['Roboto']">
      {lightboxImage && (
        <div className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setLightboxImage(null)}>
          <img src={lightboxImage} alt="Preview" className="max-w-full max-h-full object-contain shadow-2xl animate-in" />
        </div>
      )}

      <div className="flex flex-col flex-grow relative chat-container">
        <div className="whatsapp-bg"></div>
        
        <header className={`h-[60px] px-4 flex items-center justify-between z-30 shrink-0 transition-all duration-300 ${scrolled ? 'glass-panel shadow-md h-[64px]' : 'bg-[#f0f2f5] border-b border-[#d1d7db]'}`}>
          {!isSearchOpen ? (
            <>
              <div className="flex items-center min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#dfe5e7] flex items-center justify-center shrink-0 mr-3 border border-white shadow-sm overflow-hidden transform transition-transform hover:scale-110">
                   <img src={`https://ui-avatars.com/api/?name=${chatTitle}&background=dfe5e7&color=667781&bold=true`} alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <div className="truncate">
                  <h1 className="font-semibold text-[16px] leading-tight text-[#111b21] truncate pr-4">{chatTitle}</h1>
                  <p className="text-[12px] text-[#667781] mt-0.5">
                    {isBackgroundLoading ? 'Syncing assets...' : `${state.messages.length.toLocaleString()} messages`}
                    {(dateRange.from || dateRange.to) && <span className="ml-2 text-[#00a884] font-bold">• Filtered</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[#667781]">
                {state.messages.length > 0 && (
                  <>
                    <div className="relative">
                      <button 
                        onClick={() => setIsDateFilterOpen(!isDateFilterOpen)} 
                        className={`p-2.5 rounded-full transition-all active:scale-90 ${(dateRange.from || dateRange.to) ? 'text-[#00a884] bg-[#00a884]/10' : 'hover:bg-black/5'}`}
                        title="Date Filter"
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7v-5z"></path></svg>
                      </button>
                      
                      {isDateFilterOpen && (
                        <div className="absolute right-0 top-12 w-64 glass-panel shadow-2xl rounded-2xl p-5 z-50 border border-[#d1d7db]/40 animate-in">
                          <h3 className="text-[13px] font-bold text-[#111b21] mb-4 uppercase tracking-wider opacity-60">Filter Archive</h3>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-[10px] font-bold text-[#667781] mb-1">START DATE</label>
                              <input 
                                type="date" 
                                className="w-full bg-white/50 border border-[#d1d7db] rounded-xl px-3 py-2 text-[14px] outline-none focus:border-[#00a884] transition-all"
                                value={dateRange.from}
                                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-[#667781] mb-1">END DATE</label>
                              <input 
                                type="date" 
                                className="w-full bg-white/50 border border-[#d1d7db] rounded-xl px-3 py-2 text-[14px] outline-none focus:border-[#00a884] transition-all"
                                value={dateRange.to}
                                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                              />
                            </div>
                            <div className="flex gap-2 pt-2">
                              <button 
                                className="flex-1 py-2 text-[12px] font-bold text-[#667781] hover:bg-black/5 rounded-xl transition-colors"
                                onClick={() => { setDateRange({ from: '', to: '' }); setDisplayLimit(BATCH_SIZE); }}
                              >
                                Clear
                              </button>
                              <button 
                                className="flex-1 py-2 text-[12px] font-bold bg-[#00a884] text-white rounded-xl hover:bg-[#008f72] shadow-lg shadow-[#00a884]/20 transition-all active:scale-95"
                                onClick={() => { setIsDateFilterOpen(false); setDisplayLimit(BATCH_SIZE); }}
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <button onClick={() => setIsSearchOpen(true)} className="p-2.5 hover:bg-black/5 rounded-full transition-all active:scale-90">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S3 6 3 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.9l5.1 5.1 1.5-1.5-5-5.3zm-6.2 0c-2.6 0-4.6-2.1-4.6-4.6s2.1-4.6 4.6-4.6 4.6 2.1 4.6 4.6-2 4.6-4.6 4.6z"></path></svg>
                    </button>
                    <button onClick={() => setShowMediaGallery(true)} className="p-2.5 hover:bg-black/5 rounded-full transition-all active:scale-90" title="Gallery">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54-1.96-2.36L6.5 17h11l-3.54-4.71z"></path></svg>
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center w-full animate-in search-transition">
              <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); setDisplayLimit(BATCH_SIZE); }} className="p-2 text-[#00a884] hover:bg-[#00a884]/10 rounded-full mr-2 transition-colors">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
              </button>
              <input 
                autoFocus 
                type="text" 
                placeholder="Search messages..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="w-full bg-white/70 backdrop-blur rounded-full px-5 py-2 text-[14px] focus:outline-none shadow-sm border border-[#d1d7db]/40" 
              />
            </div>
          )}
        </header>

        <main ref={scrollContainerRef} onScroll={handleScroll} className="flex-grow overflow-y-auto z-10 px-3 md:px-12 lg:px-48 xl:px-[24rem]">
          {state.loading ? (
             <div className="flex flex-col items-center justify-center h-full">
               <div className="w-12 h-12 border-[3px] border-[#00a884] border-t-transparent rounded-full animate-spin"></div>
               <p className="mt-5 text-[#667781] text-[12px] font-bold uppercase tracking-widest animate-pulse">Scanning Data...</p>
             </div>
          ) : state.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="glass-panel p-12 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] max-w-sm animate-in relative overflow-hidden group">
                <div className="mb-8 flex justify-center text-[#00a884]">
                  <svg viewBox="0 0 24 24" width="72" height="72" fill="currentColor"><path d="M12.072 1.761C6.462 1.761 1.875 6.348 1.875 11.958c0 1.792.463 3.535 1.341 5.068L1.875 22.239l5.347-1.341c1.47.8 3.12 1.22 4.85 1.22 5.61 0 10.197-4.587 10.197-10.197 0-5.61-4.587-10.197-10.197-10.197zm0 18.654c-1.577 0-3.116-.421-4.46-1.22l-.318-.188-3.321.831.846-3.238-.208-.332a8.423 8.423 0 01-1.293-4.321c0-4.665 3.796-8.461 8.461-8.461 4.665 0 8.461 3.796 8.461 8.461 0 4.665-3.796 8.461-8.461 8.461z"></path></svg>
                </div>
                <h2 className="text-2xl font-bold text-[#111b21] mb-2 tracking-tight">PrivaGlass</h2>
                <p className="text-[#667781] text-[14px] mb-12 leading-relaxed">A high-fidelity WhatsApp chat reader for your exported memories. 100% private and <b>runs locally</b> in your browser.</p>
                <label className="block w-full cursor-pointer bg-[#00a884] hover:bg-[#008f72] text-white py-4 rounded-2xl font-bold shadow-[0_10px_25px_rgba(0,168,132,0.4)] transition-all active:scale-95 mb-4 pulse-button text-[15px]">
                  Choose Archive
                  <input type="file" accept=".txt,.zip" onChange={handleFileUpload} className="hidden" />
                </label>
                <div className="pt-8 border-t border-black/5">
                  <p className="text-[10px] text-[#667781] uppercase tracking-[0.2em] font-bold">Privacy Focused • Client-Side Only</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 space-y-1">
              {groupedMessages.length > 0 ? (
                groupedMessages.map((group) => (
                  <div key={group.date}>
                    <div className="sticky top-6 flex justify-center z-20 my-8">
                      <span className="glass-panel text-[#54656f] text-[11px] px-4 py-2 rounded-xl shadow-sm uppercase font-bold tracking-wider border border-white/50">
                        {group.date}
                      </span>
                    </div>
                    {group.msgs.map((msg, idx) => (
                      <div key={`${group.date}-${idx}`} className="animate-msg">
                        <MessageBubble message={msg} onImageClick={setLightboxImage} />
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-[#667781] animate-in">
                   <div className="w-16 h-16 bg-[#dfe5e7] rounded-full flex items-center justify-center mb-4">
                     <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"></path></svg>
                   </div>
                   <p className="text-[15px] font-medium">No records found matching filters.</p>
                   <button 
                    onClick={() => { setDateRange({ from: '', to: '' }); setSearchQuery(''); }}
                    className="mt-4 text-[#00a884] font-bold text-[13px] uppercase hover:underline"
                   >
                     Reset Filters
                   </button>
                </div>
              )}
              <div ref={loadMoreRef} className="h-10" />
            </div>
          )}
        </main>

        <footer className="h-[40px] px-6 flex items-center justify-between z-30 shrink-0 bg-[#f0f2f5] border-t border-[#d1d7db] text-[11px] text-[#667781] font-medium overflow-hidden">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00a884]"></span>
              Local Only
            </span>
            <span className="opacity-40">|</span>
            <span>MIT License</span>
          </div>
          <div className="flex items-center gap-2">
            <span>© 2025 PrivaGlass Contributors</span>
            <span className="opacity-40">•</span>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-[#00a884] transition-colors">GitHub</a>
          </div>
        </footer>
      </div>

      {showMediaGallery && (
        <div 
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex justify-end animate-in" 
          onClick={() => setShowMediaGallery(false)}
        >
          <div 
            className="w-full max-w-md bg-[#f0f2f5] h-full shadow-2xl flex flex-col animate-slide-left overflow-hidden border-l border-white/20"
            onClick={e => e.stopPropagation()}
          >
            <header className="h-[64px] glass-panel px-4 flex items-center shrink-0">
              <button onClick={() => setShowMediaGallery(false)} className="p-2 hover:bg-black/5 rounded-full mr-4 text-[#667781] transition-transform active:scale-90">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"></path></svg>
              </button>
              <h2 className="font-bold text-[17px] tracking-tight">Gallery</h2>
            </header>
            
            <div className="flex-grow overflow-y-auto bg-white/80">
              <div className="grid grid-cols-3 gap-0.5 p-0.5">
                {galleryMedia.length > 0 ? (
                  galleryMedia.map((m, i) => (
                    <div 
                      key={i} 
                      className="aspect-square bg-[#f0f2f5] cursor-pointer hover:opacity-80 transition-all overflow-hidden relative group"
                      onClick={() => setLightboxImage(m.mediaUrl!)}
                    >
                      <img 
                        src={m.mediaUrl} 
                        className="w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-110" 
                        alt="Media"
                        loading="lazy"
                      />
                      {m.isViewOnce && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                           <div className="bg-white/90 p-1.5 rounded-full shadow-lg">
                              <svg viewBox="0 0 24 24" width="16" height="16" className="text-[#00a884]"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"></path></svg>
                           </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="col-span-3 py-32 text-center text-[#667781] text-[13px] font-medium opacity-60">
                    No media found.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideLeft {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-left { animation: slideLeft 0.3s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; }
        
        input[type="date"]::-webkit-calendar-picker-indicator {
          background: transparent;
          bottom: 0;
          color: transparent;
          cursor: pointer;
          height: auto;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
          width: auto;
        }
      `}</style>
    </div>
  );
};

export default App;