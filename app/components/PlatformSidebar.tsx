import React, { useState, useMemo, useCallback } from 'react';
import { Search, Edit3, Trash2, MessageSquare, Globe, X, UserPlus, Pencil, Settings, LayoutGrid, Layers3, Puzzle } from 'lucide-react';
import { ChatThreadMeta } from '../services/ChatStorage';
import { UserProfile, getInitials, getFirstName } from '../services/UserProfile';
import { IS_ELECTRON } from '../services/Platform';

interface PlatformSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBrowser: () => void;
  chatThreads: ChatThreadMeta[];
  currentThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  userProfile: UserProfile | null;
  onEditProfile: () => void;
  onAddNewProfile: () => void;
  onOpenSettings: () => void;
  onOpenScheduler?: () => void;
  onOpenWorkspace?: () => void;
  onOpenVoiceChat?: () => void;
  onOpenApps?: () => void;
  onSchedule?: (dateStr: string) => void;
}


function groupThreads(threads: ChatThreadMeta[] = []) {
  const now = Date.now();
  const day = 86400000;
  const today: ChatThreadMeta[] = [];
  const yesterday: ChatThreadMeta[] = [];
  const last7: ChatThreadMeta[] = [];
  const older: ChatThreadMeta[] = [];

  threads.forEach(t => {
    const age = now - t.updatedAt;
    if (age < day) today.push(t);
    else if (age < 2 * day) yesterday.push(t);
    else if (age < 7 * day) last7.push(t);
    else older.push(t);
  });

  return { today, yesterday, last7, older };
}

export function PlatformSidebar({
  isOpen,
  onClose,
  onOpenBrowser,
  chatThreads,
  currentThreadId,
  onNewChat,
  onSelectThread,
  onDeleteThread,
  userProfile,
  onEditProfile,
  onAddNewProfile,
  onOpenSettings,
  onOpenScheduler,
  onOpenWorkspace,
  onOpenVoiceChat,
  onOpenApps,
  onSchedule,
}: PlatformSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredThread, setHoveredThread] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const sidebarStyle = useMemo<React.CSSProperties>(() => ({
    background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%)',
    backdropFilter: 'blur(48px) saturate(180%)',
    WebkitBackdropFilter: 'blur(48px) saturate(180%)',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '4px 0 40px rgba(0,0,0,0.5), inset -1px 0 0 rgba(255,255,255,0.04)',
    borderRadius: '0 4px 4px 0',
    willChange: 'transform',
  }), []);

  const filteredThreads = useMemo(() => {
    const threads = chatThreads ?? [];
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q)
    );
  }, [chatThreads, searchQuery]);

  const grouped = useMemo(
    () => groupThreads(filteredThreads),
    [filteredThreads]
  );

  if (!isOpen) return null;

  // Profile display values
  const initials = userProfile ? getInitials(userProfile) : '?';
  const displayName = userProfile ? userProfile.name : 'Set up profile';

  const ThreadItem = ({ thread }: { thread: ChatThreadMeta }) => {
    const isActive = thread.id === currentThreadId;
    const isHovered = hoveredThread === thread.id;

    return (
      <div
        className={`relative group flex items-center px-3 py-2 rounded-lg cursor-pointer transition-colors ${
          isActive
            ? 'bg-white/10 text-white'
            : 'text-slate-400 hover:bg-white/5 hover:text-white'
        }`}
        onClick={() => {
          onSelectThread(thread.id);
          onClose();
        }}
        onMouseEnter={() => setHoveredThread(thread.id)}
        onMouseLeave={() => setHoveredThread(null)}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate leading-snug">
            {thread.title}
          </div>
          {thread.preview && (
            <div className="text-[11px] text-slate-600 truncate mt-0.5 leading-snug">
              {thread.preview}
            </div>
          )}
        </div>
        {isHovered && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteThread(thread.id);
            }}
            className="ml-2 p-1 rounded hover:bg-white/10 text-slate-600 hover:text-red-400 transition-colors shrink-0"
            title="Delete chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  const SectionLabel = ({ label }: { label: string }) => (
    <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
      {label}
    </div>
  );

  return (
    <>
      {/* Backdrop — tap anywhere outside to close */}
      <div
        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px]"
        onClick={() => { onClose(); setShowProfileMenu(false); }}
      />

      <div
        className="fixed top-0 left-0 h-full w-[260px] z-40 flex flex-col text-slate-300 font-sans animate-in slide-in-from-left-8 duration-300 ease-out"
        style={{ ...sidebarStyle, paddingTop: 'env(safe-area-inset-top)' }}
      >

      {/* Header: Search + New Chat + Close */}
      <div className="p-3 flex items-center gap-2 border-b border-white/5">
        <div className="relative flex-1">
          <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search chats"
            className="w-full text-[13px] text-white placeholder-slate-600 py-2 pl-6 pr-2 outline-none bg-transparent border-none"
          />
        </div>
        <button
          onClick={() => { onNewChat(); onClose(); }}
          className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)' }}
          title="New chat"
        >
          <Edit3 className="w-4 h-4 text-slate-300" />
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0 text-slate-500 hover:text-white"
          title="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">

        {/* Quick-action tabs */}
        <div className="flex flex-col gap-px px-2 py-2">
          {([
            ...(IS_ELECTRON ? [{ label: 'Open Browser',  icon: <Globe className="w-4 h-4 shrink-0" />, color: 'text-slate-300',   hoverBg: 'rgba(255,255,255,0.08)', action: () => { onOpenBrowser(); onClose(); } }] : []),
            { label: 'Scheduler',     icon: <LayoutGrid className="w-4 h-4 shrink-0" />, color: 'text-blue-400',    hoverBg: 'rgba(96,165,250,0.12)',  action: () => { onOpenScheduler?.(); onClose(); } },
            { label: 'Mission Team',  icon: <Layers3 className="w-4 h-4 shrink-0" />, color: 'text-violet-400',  hoverBg: 'rgba(139,92,246,0.12)',  action: () => { onOpenWorkspace?.(); onClose(); } },
            ...(IS_ELECTRON ? [{ label: 'Apps',          icon: <Puzzle className="w-4 h-4 shrink-0" />, color: 'text-indigo-400',  hoverBg: 'rgba(99,102,241,0.12)',  action: () => { onOpenApps?.(); onClose(); } }] : []),
          ] as const).map(item => (
            <button
              key={item.label}
              onClick={item.action}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium ${item.color} rounded-lg text-left w-full`}
              style={{ transition: 'background 80ms ease, transform 80ms ease' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = item.hoverBg; (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)'; }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* Chat History label */}
        <div className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
          Chat History
        </div>

        {chatThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-700 px-6 text-center">
            <MessageSquare className="w-8 h-8 opacity-40" />
            <p className="text-xs">No chats yet. Start a conversation!</p>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-700 px-6 text-center">
            <p className="text-xs">No chats match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="px-1">
            {grouped.today.length > 0 && (
              <>
                <SectionLabel label="Today" />
                {grouped.today.map(t => <ThreadItem key={t.id} thread={t} />)}
              </>
            )}
            {grouped.yesterday.length > 0 && (
              <>
                <SectionLabel label="Yesterday" />
                {grouped.yesterday.map(t => <ThreadItem key={t.id} thread={t} />)}
              </>
            )}
            {grouped.last7.length > 0 && (
              <>
                <SectionLabel label="Last 7 Days" />
                {grouped.last7.map(t => <ThreadItem key={t.id} thread={t} />)}
              </>
            )}
            {grouped.older.length > 0 && (
              <>
                <SectionLabel label="Older" />
                {grouped.older.map(t => <ThreadItem key={t.id} thread={t} />)}
              </>
            )}
          </div>
        )}
      </div>

      {/* Settings + Profile footer */}
      <div className="border-t border-white/5 relative">
        {/* Settings row */}
        <button
          onClick={() => { onOpenSettings(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-left border-b border-white/5"
        >
          <Settings className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          Settings
        </button>
      </div>

      {/* User Profile footer */}
      <div className="relative">
        {/* Profile menu popup */}
        {showProfileMenu && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-[#141414] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
            <button
              onClick={() => { setShowProfileMenu(false); onEditProfile(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              Edit Profile
            </button>
            <div className="h-px bg-white/5 mx-3" />
            <button
              onClick={() => { setShowProfileMenu(false); onAddNewProfile(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
            >
              <UserPlus className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              Add New Profile
            </button>
          </div>
        )}

        <button
          onClick={() => setShowProfileMenu(v => !v)}
          className="w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-colors"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
            {initials}
          </div>
          <span className="text-sm font-medium text-slate-200 truncate flex-1 text-left">
            {displayName}
          </span>
          <Pencil className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        </button>
      </div>
    </div>
    </>
  );
}
