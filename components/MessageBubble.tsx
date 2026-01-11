import React from 'react';
import { ChatMessage } from '../types';

interface Props {
  message: ChatMessage;
  onImageClick?: (url: string) => void;
}

const MessageBubble: React.FC<Props> = React.memo(({ message, onImageClick }) => {
  const { sender, text, timestamp, isMe, mediaUrl, isViewOnce } = message;

  /**
   * Transforms numeric date strings (e.g., "5/26/23", "26/05/23") 
   * into "26 May 2023" format.
   */
  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return '';
    
    const parts = dateStr.split(/[\/\.\-]/).map(p => p.trim());
    if (parts.length < 2) return dateStr;
    
    let day: number, monthIdx: number, year: number;

    const p0 = parseInt(parts[0]);
    const p1 = parseInt(parts[1]);

    // Detection logic for DD/MM vs MM/DD
    if (p0 > 12) {
      day = p0;
      monthIdx = p1 - 1;
    } else if (p1 > 12) {
      day = p1;
      monthIdx = p0 - 1;
    } else {
      // Default to DD/MM for international exports
      day = p0;
      monthIdx = p1 - 1;
    }

    if (parts[2]) {
      year = parseInt(parts[2]);
      if (year < 100) year += 2000;
    } else {
      year = new Date().getFullYear();
    }
    
    const months = [
      "January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"
    ];
    
    const monthName = months[monthIdx] || parts[1];
    return `${day} ${monthName} ${year}`;
  };

  const cleanTimestamp = timestamp.replace(/[\[\]]/g, '');
  const commaIndex = cleanTimestamp.indexOf(',');
  
  let datePart = '';
  let timePart = '';

  if (commaIndex !== -1) {
    datePart = cleanTimestamp.substring(0, commaIndex).trim();
    timePart = cleanTimestamp.substring(commaIndex + 1).trim().toLowerCase();
  } else {
    datePart = cleanTimestamp.trim();
  }
  
  const displayTimestamp = `${formatFullDate(datePart)}${timePart ? ` • ${timePart}` : ''}`;

  const formatSenderName = (name: string) => {
    if (isMe) return sender;
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (phoneRegex.test(name)) {
      const cleaned = name.replace(/[^\d\+]/g, '');
      return `+${cleaned.replace(/^\+/, '')}`;
    }
    return name;
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getAvatarStyles = (name: string) => {
    const colors = [
      { base: '#d62976', light: '#e05291' },
      { base: '#3b82f6', light: '#60a5fa' },
      { base: '#10b981', light: '#34d399' },
      { base: '#f59e0b', light: '#fbbf24' },
      { base: '#8b5cf6', light: '#a78bfa' },
      { base: '#ef4444', light: '#f87171' },
      { base: '#00a884', light: '#00c49a' }
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorSet = colors[Math.abs(hash) % colors.length];
    return {
      background: `linear-gradient(135deg, ${colorSet.light} 0%, ${colorSet.base} 100%)`,
      color: '#ffffff'
    };
  };

  const getNameColor = (name: string) => {
    const colors = ['#d62976', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#00a884'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const formattedName = formatSenderName(sender);

  return (
    <div className={`flex w-full mb-[2px] transition-all group ${isMe ? 'justify-end pl-12' : 'justify-start pr-12'}`}>
      {!isMe && (
        <div 
          className="w-8 h-8 rounded-full shrink-0 mr-2 mt-1 flex items-center justify-center text-[10px] font-bold shadow-sm select-none border border-white/20"
          style={getAvatarStyles(sender)}
        >
          {getInitials(sender)}
        </div>
      )}

      <div 
        className={`relative max-w-full flex flex-col min-w-[70px] ${isMe ? 'message-out' : 'message-in'}`} 
        style={{ 
          borderRadius: isMe ? '12px 12px 0 12px' : '0 12px 12px 12px',
          padding: (mediaUrl || isViewOnce) ? '4px' : '6px 9px 6px 11px'
        }}
      >
        {!isMe && (
          <div 
            className={`text-[12.5px] font-bold mb-0.5 px-0.5 truncate tracking-tight select-none ${(mediaUrl || isViewOnce) ? 'pt-1 pl-2' : ''}`}
            style={{ color: getNameColor(sender) }}
          >
            {formattedName}
          </div>
        )}

        {isViewOnce && (
          <div className="flex items-center gap-3 px-3 py-2 bg-black/5 rounded-[8px] mb-1 border border-black/5 mx-0.5 mt-0.5 min-w-[200px] transition-colors hover:bg-black/10">
            <div className="relative w-9 h-9 flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="28" height="28" className="text-[#00a884]">
                <path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1-11a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V9zm1-4a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-[#111b21]">Photo</span>
              <span className="text-[11px] text-[#667781] uppercase font-bold tracking-widest opacity-60">View Once</span>
            </div>
          </div>
        )}

        {mediaUrl && !isViewOnce && (
          <div 
            className="relative rounded-[8px] overflow-hidden cursor-pointer bg-black/5 mb-1 group/media"
            onClick={() => onImageClick?.(mediaUrl)}
            style={{ minWidth: '240px' }}
          >
            <img 
              src={mediaUrl} 
              alt="Media" 
              className="max-h-[420px] min-h-[150px] object-cover w-full block" 
              loading="lazy"
            />
            {!text && (
              <div className="absolute bottom-1 right-1 flex items-center gap-[3px] select-none pointer-events-none bg-black/40 backdrop-blur px-2 py-1 rounded-full">
                <span className="text-[9px] text-white font-bold tracking-tight whitespace-nowrap">
                  {displayTimestamp}
                </span>
                {isMe && (
                  <span className="text-white flex items-center">
                    <svg viewBox="0 0 16 11" width="12" height="8" fill="none"><path d="M1 5.5L4.5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.5 5.5L9 9L14.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {text && (
          <div className={`relative flex flex-col ${mediaUrl || isViewOnce ? 'px-2 pb-1' : ''}`}>
            <div className="text-[14.5px] text-[#111b21] whitespace-pre-wrap break-words leading-[20px] pr-2">
              {text}
              <span className="inline-block w-[155px] h-[5px] pointer-events-none"></span>
            </div>
            
            <div className="absolute bottom-[-1px] right-[-3px] flex items-center gap-[3px] select-none pointer-events-none bg-inherit pl-3 pt-2 rounded-tl-[12px]">
              <span className="text-[9px] text-[#667781] font-bold opacity-60 leading-none whitespace-nowrap">
                {displayTimestamp}
              </span>
              {isMe && (
                <span className="text-[#53bdeb] flex items-center">
                  <svg viewBox="0 0 16 11" width="14" height="9" fill="none"><path d="M1 5.5L4.5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.5 5.5L9 9L14.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default MessageBubble;