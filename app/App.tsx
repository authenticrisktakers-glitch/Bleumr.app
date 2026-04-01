import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Settings, Send, Globe, ChevronLeft, ChevronRight, ChevronDown, X, Terminal, Zap, Lock, RefreshCw, MousePointer2, FileText, ArrowDown, CheckCircle2, CircleDashed, Plus, Bookmark, Mic, MicOff, ShieldCheck, Database, Briefcase, Home, Volume2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Resizable } from 're-resizable';
import orbitLogo from 'figma:asset/54880fbad4bd9a1a3b62b3ccc000931000c0afc2.png';
import nlp from 'compromise';
import { LocalLinter, binaryInlined } from 'harper.js';
import { 
  LocalLLMEngine, 
  SafetyMiddleware, 
  AgentWebSocket, 
  AssistantSSE, 
  AssistantChannel,
  ExtensionTransport
} from './engine';
import './engine'; // Initialize JUMARI automation engine layers
import { ChatErrorBoundary, BrowserErrorBoundary, AgentErrorBoundary } from './components/ErrorBoundary';
import { useBrowserEngine } from './hooks/useBrowserEngine';
import { ScriptSanitizer } from './services/ScriptSanitizer';
import { detectIntent, parseCommandToQueue, parseAction } from './engine/IntentParser';
import { analyzeWithVision, READ_PAGE_SCRIPT, SOM_INJECT_SCRIPT, SOM_REMOVE_SCRIPT, perceivePage } from './engine/Perceiver';
import { callAI } from './engine/ModelOrchestrator';
import { callLocalBrain } from './engine/LocalBrain';
import { BrowserService } from './services/BrowserService';
import { SecureStorage } from './services/SecureStorage';
import SubscriptionService, { SubscriptionTier } from './services/SubscriptionService';
import { runChatAgent, generateFollowUps } from './services/ChatAgent';
import { CodePlayground } from './components/CodePlayground';
import { AppsPage } from './components/AppsPage';
import { WebDesignerPage } from './components/WebDesignerPage';
import { SettingsModal } from './components/SettingsModal';
import { FormulaModule, detectFormulas } from './components/FormulaModule';
import { memoryService } from './services/MemoryService';
import {
  ChatThreadMeta,
  createThreadId,
  loadThreadsMeta,
  loadThreadMessages,
  saveThreadMessages,
  upsertThreadMeta,
  deleteThread as deleteStoredThread,
  deriveTitle,
  derivePreview,
} from './services/ChatStorage';

// --- Initialize Background Communications ---
const agentWs = new AgentWebSocket();
agentWs.connect();

const extTransport = ExtensionTransport.connect('content_script');
extTransport.onMessage.addListener((msg: any) => {
   console.log("[ExtTransport] Received from background:", msg);
});

let harperLinter: LocalLinter | null = null;
(async () => {
  try {
    const linter = new LocalLinter({ binary: binaryInlined });
    await linter.setup();
    harperLinter = linter;
    console.log("Harper engine initialized.");
  } catch (e) {
    console.error("Failed to initialize Harper:", e);
  }
})();

import { Cron } from 'croner';
import { StarSphereLoader } from './components/StarSphereLoader';
import localforage from 'localforage';
import { MiniStarSphereButton } from './components/MiniStarSphereButton';
import { InlineStarSphere } from './components/InlineStarSphere';
import { OrbitHome } from './components/OrbitHome';
import { cpuCores } from './services/CPUAccelerator';

// --- Types ---
type Role = 'user' | 'assistant' | 'system';

import { AIParticleOverlay } from './components/AIParticleOverlay';

interface Message {
  id: string;
  role: Role;
  content: string;
  action?: any;
  isBrowserFeedback?: boolean;
  responseTimeMs?: number;
  imageBase64?: string;
  imagePreview?: string;
  sources?: import('./services/ChatAgent').WebSource[];
  followUps?: string[];
  generatedImage?: string;
  /** Which agent pipeline created this message */
  agent?: 'chat' | 'browser';
}

interface OrbitConfig {
  engine: 'local' | 'cloud' | 'local_llm_max' | 'max';
  endpoint: string;
  model: string;
  maxMemoryMode: boolean;
}

// --- Default Configuration ---
const DEFAULT_CONFIG: OrbitConfig = {
  engine: 'local',
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'llama-3.3-70b-versatile',
  maxMemoryMode: true,
};

import { PlatformView } from './components/PlatformView';
import { IS_ELECTRON, IS_PWA, getPWAKeys } from './services/Platform';
import { JumariApprovalModal } from './components/JumariApprovalModal';
import { Onboarding } from './components/Onboarding';
import { SchedulerPage, SchedulingToast, addScheduleEvent } from './components/CalendarPage';
// Prompts (SYSTEM_PROMPT, AGENT_MODELS, buildVisionPrompt) used by ModelOrchestrator + Perceiver
import { WorkspacePage } from './components/WorkspacePage';
import { VoiceChatModal } from './components/VoiceChatModal';
import { CodingPage } from './components/CodingPage';
import { TradingDashboard } from './components/TradingDashboard';
import { initTrading } from './services/trading';
import { getProfile, saveProfile, clearProfile, restoreProfileFromStore, UserProfile } from './services/UserProfile';

// Detect if running as installed PWA (standalone) vs regular browser tab
// Lightweight starfield for PWA install gate (no sphere barrier, no cursor lines — just drifting stars)
const PWA_STAR_COUNT = cpuCores >= 8 ? 300 : cpuCores >= 4 ? 180 : 100;

function PWAInstallStarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let W = 0, H = 0;
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const stars = Array.from({ length: PWA_STAR_COUNT }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.3 + 0.2,
      baseAlpha: Math.random() * 0.5 + 0.08,
      twinkleSpd: Math.random() * 0.0008 + 0.0003,
      twinklePhase: Math.random() * Math.PI * 2,
      driftSpd: Math.random() * 0.012 + 0.003,
    }));
    let startTs: number | null = null;
    let raf: number;
    const draw = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = ts - startTs;
      ctx.fillStyle = '#020208';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < PWA_STAR_COUNT; i++) {
        const s = stars[i];
        const tw = Math.sin(t * s.twinkleSpd + s.twinklePhase) * 0.5 + 0.5;
        const sx = ((s.x * W) + t * s.driftSpd) % W;
        const sy = s.y * H;
        ctx.globalAlpha = s.baseAlpha * (0.4 + 0.6 * tw);
        ctx.fillRect(sx, sy, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

function isStandaloneMode(): boolean {
  if (IS_ELECTRON) return true; // Electron is always "installed"
  // iOS standalone
  if ((navigator as any).standalone === true) return true;
  // Android / desktop PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  return false;
}

export default function App() {
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode());
  const [appMode, setAppMode] = useState<'platform' | 'browser'>('platform');
  const [agentMode, setAgentMode] = useState<'chat' | 'browser' | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [browserInput, setBrowserInput] = useState('');
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  const [workSessionId, setWorkSessionId] = useState(0);
  const [config, setConfig] = useState<OrbitConfig>(() => {
    try {
      const saved = localStorage.getItem('bleumr_config');
      if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_CONFIG;
  });
  // ── API keys — loaded from SecureStorage (fetched from Supabase on license activation) ──
  const [secureApiKey, setSecureApiKey] = useState('');
  const [deepgramKey, setDeepgramKey] = useState('');
  const [chatThreads, setChatThreads] = useState<ChatThreadMeta[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const currentThreadIdRef = useRef<string | null>(null);

  // ── User Profile & Onboarding ─────────────────────────────────────────────
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => getProfile());
  // Start hidden — async restore below will reveal onboarding only if truly new device
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);

  // ── On mount: restore profile from Electron store if localStorage was wiped ──
  useEffect(() => {
    restoreProfileFromStore().then(({ profile, everOnboarded }) => {
      if (profile) {
        setUserProfile(profile);
        setShowOnboarding(false);
      } else if (!everOnboarded) {
        // Truly new device — show onboarding
        setShowOnboarding(true);
      }
      // everOnboarded && !profile = cleared profile via "Add New Profile"
      // handled separately by handleAddNewProfile
    });
  }, []);

  const handleOnboardingComplete = useCallback((profile: UserProfile) => {
    setUserProfile(profile);
    setShowOnboarding(false);
  }, []);

  const handleEditProfile = useCallback(() => {
    setShowOnboarding(true);
  }, []);

  const handleAddNewProfile = useCallback(() => {
    clearProfile();
    setUserProfile(null);
    setShowOnboarding(true);
  }, []);

  useEffect(() => {
    // Load API keys from SecureStorage (previously fetched from Supabase on license activation)
    SubscriptionService.getStoredApiKeys().then(keys => {
      if (keys.groq) setSecureApiKey(keys.groq);
      if (keys.deepgram) setDeepgramKey(keys.deepgram);
      // Auto-switch to cloud engine if we have a key
      if (keys.groq) {
        setConfig(prev => {
          if (prev.engine === 'local') {
            const updated = { ...prev, engine: 'cloud' as const };
            try { localStorage.setItem('bleumr_config', JSON.stringify(updated)); } catch {}
            return updated;
          }
          return prev;
        });
      }
      // PWA: If no keys from SecureStorage, auto-provision from Supabase
      if (IS_PWA && !keys.groq) {
        getPWAKeys().then(pwaKeys => {
          if (pwaKeys.groq) setSecureApiKey(pwaKeys.groq);
          if (pwaKeys.deepgram) setDeepgramKey(pwaKeys.deepgram);
          if (pwaKeys.groq) {
            setConfig(prev => {
              if (prev.engine === 'local') {
                const updated = { ...prev, engine: 'cloud' as const };
                try { localStorage.setItem('bleumr_config', JSON.stringify(updated)); } catch {}
                return updated;
              }
              return prev;
            });
          }
        });
      }
    });

    // Initialize trading module (price feeds, alert engine, exchange connectors)
    initTrading();

    // Load persisted chat threads and auto-restore the most recent conversation
    const threads = loadThreadsMeta();
    setChatThreads(threads);

    if (threads.length > 0) {
      const latest = threads[0]; // already sorted newest-first
      const msgs = loadThreadMessages(latest.id);
      if (msgs.length > 0) {
        currentThreadIdRef.current = latest.id;
        setCurrentThreadId(latest.id);
        // Sanitize any leaked hidden tags from older saved messages
        const sanitized = (msgs as any[]).map((m: any) =>
          m.role === 'assistant' && m.content
            ? { ...m, content: m.content
                .replace(/<schedule>[\s\S]*?<\/schedule>/gi, '')
                .replace(/<open>[\s\S]*?<\/open>/gi, '')
                .replace(/<workspace>[\s\S]*?<\/workspace>/gi, '')
                .trimEnd() }
            : m
        );
        setMessages(sanitized);
        setAgentMode('chat');
      }
    }
  }, []);

  const [showSettings, setShowSettings] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [showCoding, setShowCoding] = useState(false);
  const [showTrading, setShowTrading] = useState(false);
  const [showWebDesigner, setShowWebDesigner] = useState(false);
  const [showApps, setShowApps] = useState(false);
  const [workspaceAutoTask, setWorkspaceAutoTask] = useState<string | null>(null);
  const [schedulerJumpDate, setSchedulerJumpDate] = useState<Date | null>(null);
  const [schedulingToast, setSchedulingToast] = useState<{ title: string; date: string; startHour: number; endHour: number } | null>(null);
  const [agentStep, setAgentStep] = useState(0);
  const [agentTotalSteps, setAgentTotalSteps] = useState(50);
  const [agentCurrentAction, setAgentCurrentAction] = useState('');
  const agentAbortRef = useRef(false);
  const agentCorrectionRef = useRef<string | null>(null); // mid-task user correction
  const chatAbortRef = useRef<AbortController | null>(null);

  // Approve All Actions — user opted in, disables safety modals
  const [approveAll, setApproveAll] = useState(() => {
    try { return localStorage.getItem('orbit_approve_all') === 'true'; } catch { return false; }
  });

  // API call rate limiting — max 30 requests per minute
  const apiCallTimestamps = useRef<number[]>([]);
  const checkRateLimit = () => {
    const now = Date.now();
    apiCallTimestamps.current = apiCallTimestamps.current.filter(t => now - t < 60000);
    if (apiCallTimestamps.current.length >= 30) return false;
    apiCallTimestamps.current.push(now);
    return true;
  };

  // Persist config (engine, model, etc.) whenever it changes
  useEffect(() => {
    try { localStorage.setItem('bleumr_config', JSON.stringify(config)); } catch {}
  }, [config]);

  // Sync approveAll to SafetyMiddleware whenever it changes
  useEffect(() => {
    SafetyMiddleware.bypassAll = approveAll;
    try { localStorage.setItem('orbit_approve_all', String(approveAll)); } catch {}
  }, [approveAll]);

  // Refresh Solar Energy + tier whenever settings opens (picks up localStorage changes)
  // Also hide/restore the native WebContentsView — it sits above all renderer z-index
  // so modals would appear behind it without this.
  useEffect(() => {
    const orbitBrowser = (window as any).orbit?.browser;
    if (showSettings) {
      setDailyUsage(SubscriptionService.getDailyUsage());
      setTier(SubscriptionService.getTier());
      // Push browser off-screen so the settings modal is not covered
      orbitBrowser?.hideAll?.();
    } else {
      // Restore browser position if we're in browser mode with an active tab
      if (appMode === 'browser' && activeTabId) {
        // Small delay to let the modal animate out before repositioning
        setTimeout(() => {
          orbitBrowser?.setActive?.(activeTabId);
          // Trigger a bounds update via the existing mechanism
          window.dispatchEvent(new Event('resize'));
        }, 180);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings]);

  const [showDOMEvents, setShowDOMEvents] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'engine' | 'mdm' | 'plan'>('engine');

  // ── Subscription / tier state ──────────────────────────────────────────────
  const [tier, setTier] = useState<SubscriptionTier>(() => SubscriptionService.getTier());
  const [dailyUsage, setDailyUsage] = useState(() => SubscriptionService.getDailyUsage());
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'limit' | 'browser_agent'>('limit');
  const [updateReady, setUpdateReady] = useState(false);

  // Hide WebContentsView when ANY full-screen overlay is open.
  // The native WebContentsView sits above all renderer z-index so modals/settings
  // render behind it unless we explicitly push it off-screen first.
  useEffect(() => {
    const orbitBrowser = (window as any).orbit?.browser;
    const anyOverlayOpen = showScheduler || showWorkspace || showCoding || showTrading || showApps || showWebDesigner || showVoiceChat || showUpgradeModal;
    if (anyOverlayOpen) {
      orbitBrowser?.hideAll?.();
    } else if (appMode === 'browser' && activeTabId) {
      setTimeout(() => {
        orbitBrowser?.setActive?.(activeTabId);
        window.dispatchEvent(new Event('resize'));
      }, 180);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScheduler, showWorkspace, showCoding, showTrading, showApps, showWebDesigner, showVoiceChat, showUpgradeModal]);

  // Code Editor Panel
  const [codePanel, setCodePanel] = useState<{ language: string; code: string; title: string } | null>(null);

  // Voice State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Agent Selection State for Landing Page
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('Jumari 1.0');
  const availableAgents = ['Jumari 1.0', 'Bleumr v1.0', 'Nova 2.0', 'Atlas Pro'];
  
  // webviewRefs — keyed by tabId, used for executeJS fallback
  const webviewRefs = useRef<{ [key: string]: any }>({});
  // browserContainerRef — measures the viewport rect so we can position the WebContentsView correctly
  const browserContainerRef = useRef<HTMLDivElement>(null);

  // Browser State - Using useBrowserEngine hook
  const {
    tabs,
    activeTabId,
    currentUrl,
    isLoadingUrl,
    setIsLoadingUrl,
    createTab,
    closeTab,
    switchTab,
    navigate,
    reload,
    goBack,
    goForward,
    executeJS,
    setTabs,
  } = useBrowserEngine(webviewRefs);
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      const saved = localStorage.getItem('orbit_bookmarks');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return [
      { title: 'Google', url: 'https://www.google.com' },
      { title: 'GitHub', url: 'https://github.com' },
      { title: 'JUMARI Docs', url: 'https://jumari.ai' }
    ];
  });

  useEffect(() => {
    localforage.setItem('orbit_bookmarks', bookmarks).catch(() => {
      localStorage.setItem('orbit_bookmarks', JSON.stringify(bookmarks));
    });
  }, [bookmarks]);

  useEffect(() => {
    if (config.engine === 'local_llm_max') {
      LocalLLMEngine.initialize();
    }
  }, [config.engine]);

  useEffect(() => {
    // Silently swallow runtime errors in production — no user-facing display
    const handleErr = (e: ErrorEvent) => { console.warn('[App] runtime error:', e.message); };
    const handleRejection = (e: PromiseRejectionEvent) => { console.warn('[App] unhandled rejection:', e.reason); };
    window.addEventListener('error', handleErr);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleErr);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // Global link interceptor — open all external links inside Bleumr browser tab
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      // Only intercept http/https links (skip anchors, javascript:, mailto:, etc.)
      if (!/^https?:\/\//i.test(href)) return;
      // Skip links that are already handled by onClick (source citations etc.)
      if (anchor.dataset.internal) return;
      e.preventDefault();
      e.stopPropagation();
      createTab(href);
      setAppMode('browser');
    };
    document.addEventListener('click', handleLinkClick, true);
    return () => document.removeEventListener('click', handleLinkClick, true);
  }, [createTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data?.title) setSchedulingToast(data);
    };
    const openHandler = () => setShowScheduler(true);
    window.addEventListener('orbit_scheduling_toast', handler);
    window.addEventListener('orbit_open_scheduler', openHandler);
    return () => {
      window.removeEventListener('orbit_scheduling_toast', handler);
      window.removeEventListener('orbit_open_scheduler', openHandler);
    };
  }, []);

  // Auto-updater listeners (Electron only)
  useEffect(() => {
    const orbit = (window as any).orbit;
    if (!orbit?.updater) return;
    const offDownloaded = orbit.updater.onUpdateDownloaded(() => setUpdateReady(true));
    return () => { offDownloaded?.(); };
  }, []);

  useEffect(() => {
    setTabs(prev => {
      const activeTab = prev.find(t => t.id === activeTabId);
      if (activeTab && activeTab.url !== currentUrl) {
         let newTitle = activeTab.title;
         if (currentUrl === 'orbit://home') {
           newTitle = 'Bleumr Home';
         } else {
           try {
             newTitle = new URL(currentUrl).hostname.replace('www.', '') || 'New Tab';
           } catch(e) {}
         }
         return prev.map(t => t.id === activeTabId ? { ...t, url: currentUrl, title: newTitle } : t);
      }
      return prev;
    });
  }, [currentUrl, activeTabId]);

  // ── WebContentsView bounds sync ───────────────────────────────────────────
  // Measures the browser container div and tells the main process exactly where
  // to position the Electron WebContentsView so it sits inside our UI chrome.
  const updateBrowserBounds = useCallback(() => {
    const orbitBrowser = (window as any).orbit?.browser;
    if (!orbitBrowser?.setBounds || !activeTabId || !browserContainerRef.current) return;
    // orbit:// internal URLs have no WebContentsView — skip
    if (!currentUrl || currentUrl.startsWith('orbit://')) return;
    const rect = browserContainerRef.current.getBoundingClientRect();
    orbitBrowser.setBounds(activeTabId, {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, [activeTabId, currentUrl]);

  // Re-position whenever the active tab or URL changes
  useEffect(() => { updateBrowserBounds(); }, [updateBrowserBounds]);

  // Re-position whenever the container is resized (window resize, panel drag, etc.)
  useEffect(() => {
    const container = browserContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => updateBrowserBounds());
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateBrowserBounds]);

  // Keep a stable ref to activeTabId so the appMode effect never needs it as a dep
  const activeTabIdForModeRef = useRef(activeTabId);
  useEffect(() => { activeTabIdForModeRef.current = activeTabId; }, [activeTabId]);

  // Hide all WebContentsViews when browser panel is closed so they don't bleed
  // through behind the platform UI. Re-activate the current tab when returning.
  // Depends ONLY on appMode — never fires on tab changes to avoid resetting bounds.
  useEffect(() => {
    const orbitBrowser = (window as any).orbit?.browser;
    if (!orbitBrowser) return;
    if (appMode === 'platform') {
      orbitBrowser.hideAll?.();
    } else if (appMode === 'browser') {
      // Re-add the active WebContentsView to the window after hideAll removed it.
      // Only if the current tab has a real WebContentsView (not a renderer-only orbit:// tab).
      const tabId = activeTabIdForModeRef.current;
      if (tabId && !tabId.startsWith('tab-')) {
        orbitBrowser.setActive?.(tabId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appMode]); // intentionally omit activeTabId — use ref above

  // --- Chat Thread Management ---
  // useCallback prevents PlatformView (which is React.memo'd) from re-rendering
  // every time App re-renders from an unrelated state change.
  const handleNewChat = useCallback(() => {
    currentThreadIdRef.current = null;
    setCurrentThreadId(null);
    setMessages([]);
    setAgentMode(null);
    setIsAgentWorking(false);
  }, []);

  const handleSelectThread = useCallback((threadId: string) => {
    const msgs = loadThreadMessages(threadId);
    if (msgs.length === 0) return;
    currentThreadIdRef.current = threadId;
    setCurrentThreadId(threadId);
    // Sanitize any leaked hidden tags from older saved messages
    const sanitized = (msgs as any[]).map((m: any) =>
      m.role === 'assistant' && m.content
        ? { ...m, content: m.content
            .replace(/<schedule>[\s\S]*?<\/schedule>/gi, '')
            .replace(/<open>[\s\S]*?<\/open>/gi, '')
            .replace(/<workspace>[\s\S]*?<\/workspace>/gi, '')
            .trimEnd() }
        : m
    );
    setMessages(sanitized);
    setAgentMode('chat');
    setIsAgentWorking(false);
  }, []);

  const handleDeleteThread = useCallback((threadId: string) => {
    deleteStoredThread(threadId);
    setChatThreads(loadThreadsMeta());
    if (currentThreadIdRef.current === threadId) {
      currentThreadIdRef.current = null;
      setCurrentThreadId(null);
      setMessages([]);
      setAgentMode(null);
      setIsAgentWorking(false);
    }
  }, []);

  const handleVoiceToggle = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = false;
          recognition.lang = 'en-US';
          recognition.maxAlternatives = 1;

          recognition.onstart = () => {
            setIsListening(true);
          };

          recognition.onresult = (event: any) => {
            try {
              const results = event.results;
              if (results && results.length > 0 && results[0].length > 0) {
                const transcript = results[0][0].transcript;
                if (transcript?.trim()) setVoiceTranscript(transcript.trim());
              }
            } catch { /* ignore parse failures */ }
          };

          recognition.onerror = (event: any) => {
            setIsListening(false);
            // Ignore no-speech (user just didn't say anything) and aborted (we stopped it)
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            // For mic permission errors show a friendly message
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
              setVoiceTranscript('Mic access is blocked — check your system permissions.');
            }
          };

          recognition.onend = () => {
            setIsListening(false);
          };

          recognitionRef.current = recognition;
          recognition.start();
        } else {
          // Web Speech API unavailable in this environment — silently ignore
        }
      } catch {
        setIsListening(false);
      }
    }
  };

  const handleTabChange = (id: string) => {
    switchTab(id);
  };

  const handleAddTab = () => {
    createTab('orbit://home');
  };

  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    closeTab(id);
  };

  const handleBookmarkClick = (url: string) => {
    navigate(url);
  };

  const handleAddBookmark = () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && !bookmarks.find(b => b.url === activeTab.url)) {
      try {
        const title = new URL(activeTab.url).hostname.replace('www.', '');
        setBookmarks([...bookmarks, { title, url: activeTab.url }]);
      } catch (e) {
        setBookmarks([...bookmarks, { title: activeTab.url, url: activeTab.url }]);
      }
    }
  };

  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(420);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Local Coded Brain State
  const brainRef = useRef<{ queue: any[] }>({ queue: [] });
  const [taskQueue, setTaskQueue] = useState<any[]>([]);
  const [initialTasks, setInitialTasks] = useState<any[]>([]);
  
  // Background Scheduler State (Offline Cron Jobs)
  const [scheduledJobs, setScheduledJobs] = useState<{id: string, name: string, pattern: string, nextRun: string}[]>([]);
  const cronJobsRef = useRef<{ [key: string]: Cron }>({});


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleUserSubmit = async (text: string, imageBase64?: string, imagePreview?: string) => {
    if (!text.trim() && !imageBase64) return;

    // If the BROWSER agent is mid-task, treat user input as a correction/redirect.
    // Do NOT do this for the chat agent — those are separate pipelines and routing
    // a chat-mode message into agentCorrectionRef would corrupt the browser agent loop.
    if (isAgentWorking && agentMode === 'browser') {
      agentCorrectionRef.current = text.trim();
      // Show the correction in chat immediately so user sees it
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '-correction',
        role: 'user' as const,
        content: text.trim(),
      }]);
      return;
    }

    // ── UI command intercepts — fire FIRST before anything else ──────────────
    // These open panels directly without needing the AI or an API key.
    const uiCmd = text.trim().toLowerCase();
    const isOpenScheduler = /\b(open|show|launch|pull up|go to|view|see)\s+(the\s+)?(scheduler|calendar|schedule)\b|^(scheduler|calendar)$/i.test(uiCmd);
    const isOpenVoice     = /\b(open|start|launch)\s+(the\s+)?voice(\s+chat)?\b/i.test(uiCmd);
    const isOpenWorkspace = /\b(open|launch|show)\s+(the\s+)?(workspace|cowork|mission\s+team|research\s+team)\b/i.test(uiCmd);
    const isOpenSettings  = /\b(open|go\s+to|show)\s+(the\s+)?settings\b/i.test(uiCmd);
    const isOpenTrading   = /\b(open|show|launch|go to|view)\s+(the\s+)?(trading|trade|stocks?|crypto|portfolio|market)\b|^(trading|trade|crypto|portfolio)$/i.test(uiCmd);

    if (isOpenScheduler || isOpenVoice || isOpenWorkspace || isOpenSettings || isOpenTrading) {
      const msgId = Date.now().toString();
      const replies: Record<string, string> = {
        scheduler: 'Opening your scheduler.',
        voice:     'Launching voice chat.',
        workspace: 'Opening Workspace.',
        settings:  'Opening Settings.',
        trading:   'Opening Trading dashboard.',
      };
      const which = isOpenScheduler ? 'scheduler' : isOpenVoice ? 'voice' : isOpenWorkspace ? 'workspace' : isOpenTrading ? 'trading' : 'settings';
      setMessages(prev => [
        ...prev,
        { id: msgId + '-u', role: 'user' as const, content: text.trim() },
        { id: msgId + '-a', role: 'assistant' as const, content: replies[which] },
      ]);
      setTimeout(() => {
        if (isOpenScheduler) setShowScheduler(true);
        else if (isOpenVoice) setShowVoiceChat(true);
        else if (isOpenWorkspace) setShowWorkspace(true);
        else if (isOpenTrading) setShowTrading(true);
        else if (isOpenSettings) setShowSettings(true);
      }, 200);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    let processedInput = text;

    // --- Harper Integration for Chat Grammar Correction ---
    try {
       if (harperLinter) {
           const issues = await harperLinter.lint(text);
           if (issues && issues.length > 0) {
               let correctedInput = text;

               // Sort issues by start index descending to avoid shifting issues
               const sortedIssues = [...issues].sort((a, b) => {
                   const spanA = a.span();
                   const spanB = b.span();
                   return spanB.start - spanA.start;
               });

               for (const issue of sortedIssues) {
                   // Ensure 'dm' is not auto-corrected to 'dam' or similar when dealing with instagram intents
                   const origText = text.substring(issue.span().start, issue.span().end).toLowerCase();
                   if (origText === 'dm' || origText === 'dms') {
                       continue;
                   }

                   const suggestions = issue.suggestions();
                   if (suggestions && suggestions.length > 0) {
                       const suggestion = suggestions[0];
                       const span = issue.span();
                       const replacement = suggestion.get_replacement_text();

                       correctedInput = correctedInput.substring(0, span.start) + replacement + correctedInput.substring(span.end);
                   }
               }

               if (correctedInput !== text) {
                   processedInput = correctedInput;
                   setMessages(prev => [
                     ...prev,
                     { id: Date.now().toString() + '-grammar', role: 'system', content: `[Harper Engine] Auto-corrected input: "${text}" → "${processedInput}"`, isBrowserFeedback: true }
                   ]);
               }
           }
       }
    } catch (e) {
       console.warn("Harper check failed:", e);
    }

    let currentMessages: Message[] = [];

    // --- Routing: Comet-style unified agent ---
    // If the user has a real page open AND is on cloud/max engine,
    // ALL messages go through the browser-aware agent (JUMARI reads the page if needed).
    // Local (heuristic) engine still uses the queue-based path.
    // Home screen / no tab always routes to Chat Agent.
    const browserPatterns = /^(go to|navigate to|open (the )?browser|browse to|click( on)?|type into|fill (in|out)|scroll (down|up|the)|find on the (web|page|site)|take a screenshot|go back|reload|refresh (the )?page|open (a )?new tab|close (the )?tab|download|visit (the )?website|search (the )?(web|internet|online) for)/i;
    const isBrowserCommand = browserPatterns.test(processedInput.trim());
    const universalQueue = isBrowserCommand ? parseCommandToQueue(processedInput, userProfile) : [];

    // True when the user has a real page loaded (not Bleumr home screen)
    const isOnRealPage = !!currentUrl && currentUrl !== 'orbit://home' && !currentUrl.startsWith('orbit://');
    // Cloud-capable engines can handle conversational + page-aware queries
    const isCloudEngine = config.engine === 'cloud' || config.engine === 'max';
    // Route to browser agent for all messages when on a real page with a cloud engine
    const routeToBrowserAgent = isOnRealPage && isCloudEngine;

    if (universalQueue.length === 0 && !routeToBrowserAgent) {
       // ── Subscription gate — blocks ALL engines at the real send point ──────
       const subCheck = SubscriptionService.canSendMessage();
       if (!subCheck.allowed) {
         setUpgradeReason('limit');
         setShowUpgradeModal(true);
         // Remove the optimistically added user message bubble
         setMessages(prev => prev.filter(m => m.role !== 'user' || m.content !== processedInput));
         return;
       }
       SubscriptionService.incrementUsage();
       setDailyUsage(SubscriptionService.getDailyUsage());

       // No browser context — route to Chat Agent
       setAgentMode('chat');
       setIsAgentWorking(true);
       const messageId = Date.now().toString();
       const createdAt = Date.now();

       // Create or continue a thread
       let threadId = currentThreadIdRef.current;
       if (!threadId) {
         threadId = createThreadId();
         currentThreadIdRef.current = threadId;
         setCurrentThreadId(threadId);
       }
       const activeThreadId = threadId;

       // Add user message; assistant message is created lazily on first token (avoids React timing bug)
       setMessages(prev => [
         ...prev,
         { id: messageId + '-u', role: 'user', content: processedInput, agent: 'chat', ...(imageBase64 ? { imageBase64, imagePreview } : {}) },
       ]);

       // Build full conversation history (last 20 exchanges for context)
       const history = messages
         .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.isBrowserFeedback))
         .slice(-20)
         .map(m => ({
           role: m.role === 'assistant' ? 'assistant' : 'user',
           content: m.role === 'assistant' ? (m.action?.message || m.content) : m.content,
         }));

       let saveTimer: ReturnType<typeof setTimeout> | null = null;
       const debouncedSave = (msgs: any[]) => {
         if (saveTimer) clearTimeout(saveTimer);
         saveTimer = setTimeout(() => {
           const chatMsgs = msgs.filter(
             (m: any) => (m.role === 'user' || m.role === 'assistant') && !m.isBrowserFeedback && m.content?.trim()
           );
           if (chatMsgs.length > 0) saveThreadMessages(activeThreadId, chatMsgs);
         }, 800);
       };

       // ── RAF-throttled streaming ─────────────────────────────────────────
       // All tokens received between animation frames are batched into a
       // single setMessages call (max 60 re-renders/sec instead of per-token).
       type TokenOp = { token: string; replace: boolean };
       const tokenQueue: TokenOp[] = [];
       let rafPending: number | null = null;

      // rawContent accumulates the FULL unstripped response so onDone can parse
      // <schedule> and <open> tags even though they're hidden from display.
      let rawContent = '';
      // Sources collected from web search — attached to the message in onDone
      let pendingSources: import('./services/ChatAgent').WebSource[] = [];
      let pendingImage: string | undefined;

      // Strip hidden XML tags and raw HTML dumps from streaming content.
      // Handles complete tags, partial mid-stream tags, and raw HTML responses.
      const stripStreamingTags = (content: string): string => {
        // If the entire response is a raw HTML document, show a placeholder
        const trimmed = content.trimStart();
        if (trimmed.match(/^<!DOCTYPE\s+html/i) || trimmed.match(/^<html[\s>]/i)) {
          return 'Opening your page in the browser now ✓';
        }
        // Remove complete hidden blocks
        let s = content
          .replace(/<schedule>[\s\S]*?<\/schedule>/gi, '')
          .replace(/<open>[\s\S]*?<\/open>/gi, '')
          .replace(/<workspace>[\s\S]*?<\/workspace>/gi, '')
          .replace(/<followups>[\s\S]*?<\/followups>/gi, '')
          // Catch orphaned closing tags (model sometimes forgets opening tag)
          .replace(/<\/followups>/gi, '')
          .replace(/<\/schedule>/gi, '')
          .replace(/<\/open>/gi, '')
          .replace(/<\/workspace>/gi, '');
        // Hide partial opening tags still mid-stream
        s = s.replace(/<schedule[\s\S]*$/i, '').replace(/<open[\s\S]*$/i, '').replace(/<workspace[\s\S]*$/i, '').replace(/<followups[\s\S]*$/i, '');
        return s.trimEnd();
      };

       const flushTokenQueue = () => {
         rafPending = null;
         if (tokenQueue.length === 0) return;
         const ops = tokenQueue.splice(0); // drain queue
         setMessages(prev => {
           let next = prev;
           for (const { token, replace } of ops) {
             // Accumulate raw (unstripped) content for onDone parsing
             rawContent = replace ? token : rawContent + token;
             const exists = next.some((m: any) => m.id === messageId);
             if (!exists) {
               next = [...next, { id: messageId, role: 'assistant' as const, content: stripStreamingTags(rawContent), agent: 'chat' as const }];
             } else {
               next = next.map((m: any) =>
                 m.id === messageId
                   ? { ...m, content: stripStreamingTags(rawContent) }
                   : m
               );
             }
           }
           debouncedSave(next);
           return next;
         });
       };

       const upsertAssistant = (token: string, replace = false) => {
         tokenQueue.push({ token, replace });
         if (!rafPending) {
           rafPending = requestAnimationFrame(flushTokenQueue);
         }
       };

       // Create a new AbortController for this chat request
       const chatAbort = new AbortController();
       chatAbortRef.current = chatAbort;

       runChatAgent(processedInput, history, {
         apiKey: secureApiKey,
         useMax: config.engine === 'max',
         signal: chatAbort.signal,
         userProfile: userProfile ? {
           name: userProfile.name,
           birthday: userProfile.birthday,
           email: userProfile.email,
           phone: userProfile.phone,
           address: userProfile.address,
         } : null,
         onSearching: () => upsertAssistant(`Orbiting....`, true),
         onSources: (sources) => { console.log('[App] Got sources:', sources.length, sources.map(s => s.url)); pendingSources = sources; },
         onImage: (dataUrl) => { pendingImage = dataUrl; },
         onToken: (token, replace) => upsertAssistant(token, replace ?? false),
         onDone: () => {
           const responseTimeMs = Date.now() - createdAt;
           setIsAgentWorking(false);
           // Cancel any pending RAF flush so it can't overwrite parseSchedule results
           if (rafPending !== null) {
             cancelAnimationFrame(rafPending);
             rafPending = null;
           }
           // Drain any tokens queued but not yet flushed
           const remainingOps = tokenQueue.splice(0);
           // Apply remaining tokens to rawContent too
           for (const { token, replace } of remainingOps) {
             rawContent = replace ? token : rawContent + token;
           }
           // ── Parse special tags from raw (unstripped) content BEFORE setMessages ──
           // Side effects (events, setTimeout, setState) must NOT live inside a React state updater.
           const parseScheduleFromRaw = (raw: string) => {
             const scheduleRegex = /<schedule>([\s\S]*?)<\/schedule>/gi;
             let match;
             let foundAny = false;
             while ((match = scheduleRegex.exec(raw)) !== null) {
               try {
                 const data = JSON.parse(match[1].trim());
                 if (data.title && data.date) {
                   addScheduleEvent(data);
                   window.dispatchEvent(new Event('orbit_schedule_update'));
                   window.dispatchEvent(new CustomEvent('orbit_scheduling_toast', { detail: data }));
                   const [y, m, d] = data.date.split('-').map(Number);
                   setSchedulerJumpDate(new Date(y, m - 1, d));
                   foundAny = true;
                 }
               } catch (err) {
                 console.warn('[Scheduler] Failed to parse schedule tag:', match[1], err);
               }
             }
             if (foundAny) {
               setTimeout(() => setShowScheduler(true), 800);
             }
           };

           const openHtmlInBrowser = (raw: string): boolean => {
             const loadHtml = (html: string) => {
               setTimeout(async () => {
                 setAppMode('browser');
                 await BrowserService.loadHTML(html);
               }, 400);
             };
             const openTagMatch = raw.match(/<open>([\s\S]*?)<\/open>/i);
             if (openTagMatch) {
               const target = openTagMatch[1].trim();
               if (target === 'html') {
                 const htmlMatch = raw.match(/```(?:html|HTML)\n?([\s\S]*?)```/s);
                 if (htmlMatch) { loadHtml(htmlMatch[1].trim()); return true; }
                 const stripped = raw.replace(/<open>[\s\S]*?<\/open>/gi, '').replace(/<schedule>[\s\S]*?<\/schedule>/gi, '').trim();
                 if (stripped.length > 30) { loadHtml(stripped); return true; }
               } else if (target.startsWith('http://') || target.startsWith('https://')) {
                 setTimeout(() => { createTab(target); setAppMode('browser'); }, 400);
                 return true;
               }
               return false;
             }
             const htmlBlockRegex = /```(?:html|HTML)\n?([\s\S]*?)```/gs;
             let htmlMatch;
             while ((htmlMatch = htmlBlockRegex.exec(raw)) !== null) {
               if (htmlMatch[1].trim().length > 30) { loadHtml(htmlMatch[1].trim()); return true; }
             }
             const trimmed = raw.trim();
             if (trimmed.match(/^<!DOCTYPE\s+html/i) || trimmed.match(/^<html[\s>]/i)) { loadHtml(trimmed); return true; }
             return false;
           };

           const parseWorkspaceFromRaw = (raw: string) => {
             const match = raw.match(/<workspace>([\s\S]*?)<\/workspace>/i);
             if (!match) return;
             const task = match[1].trim();
             if (!task) return;
             setTimeout(() => { setWorkspaceAutoTask(task); setShowWorkspace(true); }, 800);
           };

           // Fire parsers OUTSIDE setMessages — these have side effects
           console.log('[onDone] rawContent length:', rawContent.length, 'has <schedule>:', /<schedule>/i.test(rawContent));
           if (/<schedule>/i.test(rawContent)) console.log('[onDone] rawContent snippet:', rawContent.slice(rawContent.indexOf('<schedule>')));
           parseScheduleFromRaw(rawContent);

           // ── Fallback: if the user asked to schedule something but the model didn't
           // output a <schedule> tag, attempt to extract the event from the user message.
           if (!/<schedule>/i.test(rawContent) && /\b(schedule|remind|reminder|block (off|time)|set.*reminder|add.*calendar)\b/i.test(processedInput)) {
             console.log('[Scheduler fallback] Model did not emit <schedule> tag — attempting extraction from user input');
             const today = new Date();
             const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
             const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);

             // Parse date
             let eventDate = today;
             if (/\btomorrow\b/i.test(processedInput)) eventDate = tomorrow;
             else if (/\bnext\s+week\b/i.test(processedInput)) eventDate = nextWeek;
             else {
               // Try to find explicit date like "March 30" or "3/30"
               const monthMatch = processedInput.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i);
               if (monthMatch) {
                 const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
                 const mIdx = monthNames.findIndex(m => monthMatch[1].toLowerCase().startsWith(m));
                 if (mIdx >= 0) eventDate = new Date(today.getFullYear(), mIdx, parseInt(monthMatch[2]));
               }
             }

             // Parse time
             let startHour = 9;
             const timeMatch = processedInput.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i);
             if (timeMatch) {
               startHour = parseInt(timeMatch[1]);
               const isPM = /pm|p\.m\./i.test(timeMatch[3]);
               if (isPM && startHour < 12) startHour += 12;
               if (!isPM && startHour === 12) startHour = 0;
             } else {
               const hourMatch = processedInput.match(/\bfor\s+(\d{1,2})\b/);
               if (hourMatch) startHour = parseInt(hourMatch[1]);
             }

             // Extract title — strip scheduling verbs and time references
             let title = processedInput
               .replace(/\b(can you |please |could you )?(schedule|remind me( to)?|set a reminder( to)?|add to calendar|block (off )?time for)\b/gi, '')
               .replace(/\b(tomorrow|today|next week|this week)\b/gi, '')
               .replace(/\b(at |for |by )?\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\b/gi, '')
               .replace(/\b(nothing much|hey|oh|um|uh)\b/gi, '')
               .trim()
               .replace(/^[\s,]+|[\s,]+$/g, '');
             if (!title || title.length < 2) title = 'Reminder';
             // Capitalize first letter
             title = title.charAt(0).toUpperCase() + title.slice(1);

             const dateStr = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
             const fallbackEvent = { title, date: dateStr, startHour, endHour: startHour + 1 };
             console.log('[Scheduler fallback] Created event:', fallbackEvent);
             addScheduleEvent(fallbackEvent);
             window.dispatchEvent(new Event('orbit_schedule_update'));
             window.dispatchEvent(new CustomEvent('orbit_scheduling_toast', { detail: fallbackEvent }));
             const [y, mo, d] = dateStr.split('-').map(Number);
             setSchedulerJumpDate(new Date(y, mo - 1, d));
             setTimeout(() => setShowScheduler(true), 800);
           }

           parseWorkspaceFromRaw(rawContent);
           openHtmlInBrowser(rawContent);

           const isRawHtmlDump = rawContent.trim().match(/^<!DOCTYPE\s+html/i) || rawContent.trim().match(/^<html[\s>]/i);
           const cleanHtmlMsg = "Opening your page in the browser now ✓";

           // Parse follow-up questions from <followups> tag
           const followUpsMatch = rawContent.match(/<followups>([\s\S]*?)<\/followups>/i);
           let followUps: string[] = followUpsMatch
             ? followUpsMatch[1].split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.length < 80).slice(0, 3)
             : [];

           // Build extras to attach to the assistant message
           const msgExtras: Record<string, any> = { responseTimeMs };
           if (pendingSources.length > 0) msgExtras.sources = pendingSources;
           if (followUps.length > 0) msgExtras.followUps = followUps;
           if (pendingImage) msgExtras.generatedImage = pendingImage;
           if (isRawHtmlDump) msgExtras.content = cleanHtmlMsg;

           // If no follow-ups from model, generate them async (non-blocking)
           if (followUps.length === 0 && rawContent.length > 30 && secureApiKey) {
             generateFollowUps(processedInput, rawContent.slice(0, 500), secureApiKey).then(fups => {
               if (fups.length > 0) {
                 setMessages(prev => prev.map(m => m.id === messageId ? { ...m, followUps: fups } : m));
               }
             });
           }

           // Persist thread after response is complete (pure state update only)
           setMessages(prev => {
             let base = prev;
             for (const { token, replace } of remainingOps) {
               const exists = base.some((m: any) => m.id === messageId);
               if (!exists) {
                 base = [...base, { id: messageId, role: 'assistant' as const, content: stripStreamingTags(rawContent) }];
               } else {
                 base = base.map((m: any) =>
                   m.id === messageId
                     ? { ...m, content: stripStreamingTags(rawContent) }
                     : m
                 );
               }
             }

             const hasResponse = base.some((m: any) => m.id === messageId && m.content?.trim()) || rawContent.trim().length > 0;

             const next: any[] = hasResponse
               ? base.map((m: any) => m.id === messageId
                   ? { ...m, ...msgExtras }
                   : m)
               : [...base, { id: messageId, role: 'assistant' as const, content: "I didn't receive a response. Please try again.", ...msgExtras }];

             const chatMsgs = next.filter(
               (m: any) => (m.role === 'user' || m.role === 'assistant') && !m.isBrowserFeedback && m.content?.trim()
             );
             if (chatMsgs.length === 0) return next;
             saveThreadMessages(activeThreadId, chatMsgs);
             const firstUser = chatMsgs.find((m: any) => m.role === 'user');
             const lastMsg = chatMsgs[chatMsgs.length - 1];
             const preview = lastMsg ? derivePreview(lastMsg.content) : '';
             const immediateTitle = firstUser ? deriveTitle(firstUser.content) : 'New Chat';
             upsertThreadMeta(activeThreadId, immediateTitle, preview, createdAt);
             setChatThreads(loadThreadsMeta());
             if (chatMsgs.length === 2 && firstUser && secureApiKey) {
               const userMsg = firstUser.content.slice(0, 300);
               const assistantMsg = (chatMsgs.find((m: any) => m.role === 'assistant')?.content ?? '').slice(0, 300);
               fetch('https://api.groq.com/openai/v1/chat/completions', {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${secureApiKey}`, 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                   model: 'llama-3.1-8b-instant',
                   messages: [
                     { role: 'system', content: 'You generate ultra-short chat titles. Reply with ONLY 3-5 words that capture the topic. No punctuation, no quotes, no explanation. Examples: "Python web scraper", "Birthday party ideas", "Fix login bug"' },
                     { role: 'user', content: `User said: "${userMsg}"\nAssistant replied: "${assistantMsg}"\n\nGenerate a 3-5 word title:` },
                   ],
                   stream: false,
                   max_tokens: 20,
                   temperature: 0.3,
                 }),
               })
                 .then(r => r.json())
                 .then(data => {
                   const aiTitle = data?.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');
                   if (aiTitle && aiTitle.length > 2 && aiTitle.length < 60) {
                     upsertThreadMeta(activeThreadId, aiTitle, preview, createdAt);
                     setChatThreads(loadThreadsMeta());
                   }
                 })
                 .catch(() => { /* silently ignore — immediate title stays */ });
             }
             return next;
           });
         },
         onError: (err) => {
           // Never expose raw technical errors — always a clean user-facing message
           const friendly = err && !err.match(/HTTP \d+|fetch|undefined|null|Error:|stack|at Object|\.ts:|\.js:/)
             ? err
             : "Something went wrong. Try again.";
           upsertAssistant(friendly, true);
           setIsAgentWorking(false);
         },
       }, imageBase64);
       return;
    }

    // ── Subscription gate for browser-agent path ─────────────────────────────
    {
      const subCheck = SubscriptionService.canSendMessage();
      if (!subCheck.allowed) {
        setUpgradeReason('limit');
        setShowUpgradeModal(true);
        setMessages(prev => prev.filter(m => m.role !== 'user' || m.content !== processedInput));
        return;
      }
      SubscriptionService.incrementUsage();
      setDailyUsage(SubscriptionService.getDailyUsage());
    }

    if (config.engine === 'local' || config.engine === 'local_llm_max') {
       // Local heuristic engine — requires explicit browser commands (queue-based)
       if (!SubscriptionService.canUseBrowserAgent()) {
         setUpgradeReason('browser_agent');
         setShowUpgradeModal(true);
         return;
       }
       setAgentMode('browser');

       // Handle SCHEDULE_TASK creation
       const scheduleTask = universalQueue.find(t => t.action_data?.type === 'create_schedule');
       if (scheduleTask) {
           const { pattern, name } = scheduleTask.action_data;
           const jobId = Date.now().toString();
           
           try {
               const job = new Cron(pattern, () => {
                   console.log(`[Background Task Triggered] ${name}`);
                   setMessages(prev => [
                     ...prev,
                     { id: Date.now().toString() + '-cron', role: 'system', content: `[APScheduler Equivalent] 🕒 Background job triggered: "${name}"`, isBrowserFeedback: true }
                   ]);
               });
               cronJobsRef.current[jobId] = job;
               const nextRun = job.nextRun()?.toLocaleString() || 'Unknown';
               setScheduledJobs(prev => [...prev, { id: jobId, name, pattern, nextRun }]);
           } catch (e) {
               console.error("Failed to parse cron pattern", e);
           }
       }

       brainRef.current.queue = universalQueue;
       setTaskQueue([...universalQueue]);
       setInitialTasks([...universalQueue]);

       setMessages(prev => [
          ...prev,
          { id: Date.now().toString(), role: 'user', content: processedInput, agent: 'browser' }
       ]);
       currentMessages = [...messages,
         { id: Date.now().toString(), role: 'user', content: processedInput, agent: 'browser' }
       ] as Message[];
    } else {
       // Cloud / Max engines — Comet-style unified agent
       // Handles both browser automation and conversational page questions
       setAgentMode('browser');
       currentMessages = [...messages, { id: Date.now().toString(), role: 'user', content: processedInput, agent: 'browser' } as Message];
       setMessages([...currentMessages]);
    }

    const userText = processedInput;
    setIsAgentWorking(true);
    setWorkSessionId(Date.now());

    let stepCount = 0;
    const MAX_STEPS = 50;
    const AGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (50 steps need more time)
    const agentStartTime = Date.now();
    let hasError = false;
    let consecutiveNudges = 0; // tracks back-to-back plain-text responses so we can bail
    let consecutiveErrors = 0; // tracks back-to-back action errors (dead tab detection)
    agentAbortRef.current = false;
    const loopAbort = new AbortController();
    chatAbortRef.current = loopAbort; // wire Stop button into the loop's abort controller
    setAgentStep(0);
    setAgentTotalSteps(MAX_STEPS);
    setAgentCurrentAction('Thinking...');
    let completionForceBreak = false;
    // Repeat-action detector: tracks last N actions to detect stuck loops
    const actionHistory: string[] = [];
    // Cycle detector: catches alternating patterns (A→B→A→B)
    let totalActionsWithoutReply = 0;

    // Track the real page URL mutably inside the loop.
    // React state (currentUrl) doesn't update between iterations because the
    // while-loop runs synchronously between renders. This mutable var does.
    let liveUrl = currentUrl;

    // 2-Engine flag: should we perceive the page before the next actor decision?
    // true on first step after a page-changing action (navigate, click, type, scroll)
    // false when page hasn't changed (wait, key_press, reply)
    let needsPerception = false; // first step may not have a page yet (home screen)

    // Abortable delay — resolves immediately if Stop is pressed
    const abortableWait = (ms: number) => new Promise<void>(resolve => {
      const timer = setTimeout(resolve, ms);
      const check = setInterval(() => { if (shouldAbort()) { clearTimeout(timer); clearInterval(check); resolve(); } }, 100);
      setTimeout(() => clearInterval(check), ms + 50);
    });
    const shouldAbort = () => agentAbortRef.current || loopAbort.signal.aborted;

    try {
      while (stepCount < MAX_STEPS) {
        stepCount++;
        setAgentStep(stepCount);

        // Check abort signal (from Stop button or agentAbortRef)
        if (shouldAbort()) {
          if (!loopAbort.signal.aborted) loopAbort.abort();
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: '[Agent stopped by user.]', isBrowserFeedback: true }]);
          break;
        }

        // Check global timeout
        if (Date.now() - agentStartTime > AGENT_TIMEOUT_MS) {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: '[Agent stopped: 5-minute timeout reached.]', isBrowserFeedback: true }]);
          break;
        }

        // ── USER CORRECTION CHECK (RLHF) ────────────────────────────────────
        // If user sent a message while agent was working, inject it as a high-priority redirect.
        // This is the core feedback loop — user says "wrong button", "that's the subject not body",
        // "stop", "go back", etc. and the agent adjusts immediately.
        if (agentCorrectionRef.current) {
          const correction = agentCorrectionRef.current;
          agentCorrectionRef.current = null;

          // Check if user wants to stop
          const isStopCmd = /^(stop|cancel|quit|abort|halt|nevermind|never mind)$/i.test(correction.trim());
          if (isStopCmd) {
            agentAbortRef.current = true;
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: '[Agent stopped by user correction.]', isBrowserFeedback: true }]);
            break;
          }

          // Invalidate all previous perception — force re-scan after correction
          currentMessages = currentMessages.filter(m => !m.content?.startsWith('[PERCEPTION]'));

          // Inject correction as a user message with strong override language
          currentMessages = [...currentMessages, {
            id: Date.now().toString() + '-usercorrect',
            role: 'user',
            content: `[USER FEEDBACK]: ${correction}\n\nIMPORTANT: The user is correcting your previous action. What you just did was WRONG. Adjust based on this feedback:\n- If user says you clicked the wrong thing → use read_page to find the RIGHT element\n- If user says you typed in the wrong field → find the correct field and re-type\n- If user gives new instructions → follow THOSE instructions now\n- Re-perceive the page first (read_page) before your next action.\nOutput one JSON action.`,
          }];
          setMessages([...currentMessages]);

          // Force re-perception so agent sees fresh element IDs
          needsPerception = true;
          // Reset loop counters since user is actively guiding
          consecutiveNudges = 0;
          consecutiveErrors = 0;
          totalActionsWithoutReply = Math.max(0, totalActionsWithoutReply - 3); // give some steps back
        }

        // ── PERCEIVER ENGINE PHASE ──────────────────────────────────────────────
        // Runs automatically when the page likely changed. Provides the ACTOR with
        // a grounded view: DOM elements + SoM-annotated vision screenshot.
        if (needsPerception && liveUrl && !liveUrl.startsWith('orbit://')) {
          try {
            setAgentCurrentAction('Analyzing page...');
            const perception = await perceivePage({ executeJS, secureApiKey, activeTabId }, userText);
            // Remove any previous perception to keep context clean
            currentMessages = currentMessages.filter(m => !m.content?.startsWith('[PERCEPTION]'));
            currentMessages = [...currentMessages, {
              id: Date.now().toString() + '-percept',
              role: 'system',
              content: `[PERCEPTION]\n${perception}`,
              isBrowserFeedback: true,
            }];
            setMessages([...currentMessages]);
          } catch (percErr: any) {
            console.warn('[Perceiver] Failed:', percErr.message);
          }
          needsPerception = false;
        }
        if (shouldAbort()) { if (!loopAbort.signal.aborted) loopAbort.abort(); setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: '[Agent stopped by user.]', isBrowserFeedback: true }]); break; }

        // ── ACTOR ENGINE PHASE ──────────────────────────────────────────────────
        // Uses the perception context + conversation history to decide the next action.
        setAgentCurrentAction('Deciding next action...');
        let aiResponseText = '';
        if (config.engine === 'local' || config.engine === 'local_llm_max') {
           // Use sanitized executeJS from useBrowserEngine hook
           const safeExecuteJS = async (code: string) => {
              try {
                 return await executeJS(code);
              } catch (error: any) {
                 console.error('[App] Script execution blocked:', error.message);
                 return null;
              }
           };
           aiResponseText = await callLocalBrain(safeExecuteJS, currentMessages, brainRef.current);
           setTaskQueue([...brainRef.current.queue]);
        } else {
           aiResponseText = await callAI(currentMessages, secureApiKey, checkRateLimit, loopAbort.signal, liveUrl);
        }
        if (shouldAbort()) { if (!loopAbort.signal.aborted) loopAbort.abort(); setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: '[Agent stopped by user.]', isBrowserFeedback: true }]); break; }

        const action = parseAction(aiResponseText);
        
        // Safety Layer Intercept
        if (action?.action) {
           // Detect action type based on the NATURE of the action, not text content.
           // IMPORTANT: typing an email address is NOT a SEND_EMAIL action — that's just
           // filling a form field. SEND_EMAIL only fires when the agent clicks a Send button.
           const isClick = action.action === 'click';
           const clickText = (action.text || action.label || '').toLowerCase();

           const isInjectScript = action.action === 'inject_script';
           const isSendEmail   = isClick && /\bsend\b/.test(clickText);
           const isPostContent = isClick && /\b(post|publish|tweet|share)\b/.test(clickText);
           const isPurchase    = isClick && /\b(buy now|place order|confirm order|checkout|pay now|purchase)\b/.test(clickText);
           const isDeleteData  = isClick && /\b(delete|remove|discard|trash)\b/.test(clickText);

           let actionType = 'GENERAL_ACTION';
           if (isInjectScript) actionType = 'MODIFY_DATA';
           if (isSendEmail)    actionType = 'SEND_EMAIL';
           if (isPostContent)  actionType = 'POST_CONTENT';
           if (isPurchase)     actionType = 'PURCHASE';
           if (isDeleteData)   actionType = 'DELETE_DATA';

           // Build a plain-English message — never show raw code or JSON
           const actionVerb = action.action ?? 'perform an action';
           const actionTarget = action.url ?? action.selector ?? action.text?.slice(0, 40) ?? '';
           const humanMessages: Record<string, string> = {
             inject_script: 'JUMARI is about to run a script on this page.',
             click:         'JUMARI is about to click something on the page.',
             type:          'JUMARI is about to type into a form field.',
             navigate:      `JUMARI is about to navigate${actionTarget ? ' to ' + actionTarget : ''}.`,
             fill_form:     'JUMARI is about to fill out a form.',
             SEND_EMAIL:    'JUMARI is about to send an email.',
             PURCHASE:      'JUMARI is about to complete a purchase.',
             POST_CONTENT:  'JUMARI is about to post content.',
             DELETE_DATA:   'JUMARI is about to delete data.',
             MODIFY_DATA:   'JUMARI is about to modify data on this page.',
           };
           const humanMsg = humanMessages[actionType] ?? humanMessages[actionVerb] ?? `JUMARI is about to ${actionVerb}.`;

           const result = await SafetyMiddleware.requestApproval({
              actionType,
              context: action,
              message: humanMsg,
           });

           if (!result.approved) {
              hasError = true;
              let msg = `[Safety Layer] Action blocked by user.`;
              if (result.reason === 'TIMEOUT') {
                 msg = `[Safety Layer] Action auto-denied due to a 10s timeout waiting for approval. Check the JUMARI logs or ensure UI is ready.`;
              }
              setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: msg, isBrowserFeedback: true }]);
              break;
           }
        }
        
        const assistantMsg: Message = {
          id: Date.now().toString() + '-ai',
          role: 'assistant',
          content: aiResponseText,
          action,
          agent: 'browser',
        };
        currentMessages = [...currentMessages, assistantMsg];
        setMessages([...currentMessages]);

        if (!action) {
          // Model output plain text (narration) instead of a JSON action.
          // Push a firm correction and continue — don't let narration kill the loop.
          consecutiveNudges++;
          if (consecutiveNudges >= 4) {
            // Model is stuck after 4 corrections — bail gracefully
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: '[Agent] Could not determine next action after multiple attempts. Please try rephrasing your request.', isBrowserFeedback: true }]);
            break;
          }
          currentMessages = [...currentMessages, {
            id: Date.now().toString() + '-nudge',
            role: 'system',
            content: `[NUDGE ${consecutiveNudges}/3] Stop narrating. Output ONLY a raw JSON action object — no text before or after. The task is not complete. Next action:`,
            isBrowserFeedback: true,
          }];
          setMessages([...currentMessages]);
          continue;
        }
        // Model gave valid JSON — reset nudge counter
        consecutiveNudges = 0;

        if (action.action === 'reply') {
          // AI is done!
          break;
        }

        // Update live status label — use descriptive text where available
        const getActionLabel = (a: any): string => {
          switch (a.action) {
            case 'navigate': return `Navigating to ${a.url || '...'}`;
            case 'read_page': return 'Scanning all page elements...';
            case 'find_element': return `Finding "${a.text || 'element'}"...`;
            case 'click': {
              // Try to resolve element text from DOM for richer label
              const el = document.querySelector(`[data-orbit-id="${a.element_id}"]`);
              const elLabel = el ? (el.getAttribute('aria-label') || el.textContent || '').trim().substring(0, 40) : '';
              return elLabel ? `Clicking "${elLabel}"` : `Clicking element #${a.element_id}`;
            }
            case 'click_at': return `Clicking at (${a.x}, ${a.y})`;
            case 'type': {
              const el2 = document.querySelector(`[data-orbit-id="${a.element_id}"]`);
              const elLabel2 = el2 ? (el2.getAttribute('aria-label') || el2.getAttribute('placeholder') || '').trim().substring(0, 30) : '';
              return elLabel2 ? `Typing into "${elLabel2}"` : `Typing "${(a.text||'').substring(0,30)}"`;
            }
            case 'wait': return 'Waiting for page to load...';
            case 'scroll': return `Scrolling ${a.direction || 'down'}`;
            case 'inject_script': return 'Running automation script';
            case 'go_back': return 'Going back';
            case 'refresh': return 'Refreshing page';
            case 'screenshot': return 'Taking screenshot + vision scan';
            case 'select_option': return `Selecting "${a.value || 'option'}"`;
            case 'key_press': return `Pressing ${a.key}`;
            case 'reply': return 'Sending reply...';
            default: return a.action;
          }
        };
        setAgentCurrentAction(getActionLabel(action));

        // Clean SoM markers before executing — user should never see them
        try { await executeJS(SOM_REMOVE_SCRIPT); } catch {}

        // Execute Browser Action
        let systemResult = '';

        if (action.action === 'navigate') {
          try {
            // Ensure we're in browser mode — otherwise WebContentsView is hidden behind renderer
            setAppMode('browser');
            await navigate(action.url);
            liveUrl = action.url; // update mutable URL tracker so callAI gets the real URL going forward
            await abortableWait(2500);
            // Resize so the WebContentsView appears correctly after mode switch
            window.dispatchEvent(new Event('resize'));
            // Return a minimal result — do NOT describe page elements here.
            systemResult = `Navigated to ${action.url}. Page loaded. STOP — respond with {"action":"reply","message":"..."} now unless the user's original request requires additional steps on THIS page.`;
          } catch (e: any) {
            systemResult = `Failed to navigate to ${action.url}: ${e.message}`;
          }
        } 
        else if (action.action === 'go_back') {
           try {
              await goBack();
              await new Promise(r => setTimeout(r, 1000));
              systemResult = "Navigated to previous page successfully.";
           } catch(e: any) { systemResult = "Failed to go back: " + e.message; }
        }
        else if (action.action === 'refresh') {
           try {
              await reload();
              await new Promise(r => setTimeout(r, 1000));
              systemResult = "Refreshed the page successfully.";
           } catch(e: any) { systemResult = "Failed to refresh: " + e.message; }
        }
        else if (action.action === 'read_page') {
          // Manual re-scan — uses the shared READ_PAGE_SCRIPT constant
          try {
            const result = await executeJS(READ_PAGE_SCRIPT);
            if (result && result.length > 0) {
              systemResult = 'Page Elements (' + result.length + ' found):\n' + result.join('\n').substring(0, 6000);
            } else {
              systemResult = 'No interactive elements found. Try screenshot to see the page visually.';
            }
            needsPerception = false; // we just scanned, no need to auto-perceive again
          } catch (e: any) {
            systemResult = `Error mapping page: ${e.message}`;
          }
        }
        else if (action.action === 'find_element') {
          // Fuzzy DOM search by text / aria-label / placeholder / testid — returns element ID + coords
          try {
            const searchText = ScriptSanitizer.escapeForJS(String(action.text || ''));
            const found = await executeJS(`
              (function() {
                const lower = '${searchText}'.toLowerCase().trim();
                if (!lower) return null;
                const all = Array.from(document.querySelectorAll('*'));
                let best = null, bestScore = 0;
                for (const el of all) {
                  const rect = el.getBoundingClientRect();
                  if (rect.width < 2 || rect.height < 2) continue;
                  const style = window.getComputedStyle(el);
                  if (style.display === 'none' || style.visibility === 'hidden') continue;
                  const a = (el.getAttribute('aria-label') || '').toLowerCase();
                  const p = (el.placeholder || '').toLowerCase();
                  const t = (el.getAttribute('title') || '').toLowerCase();
                  const txt = (el.innerText || el.textContent || '').trim().toLowerCase().substring(0, 100);
                  const tid = (el.getAttribute('data-testid') || '').toLowerCase();
                  let score = 0;
                  if (a === lower || p === lower || t === lower) score = 100;
                  else if (a.includes(lower) || p.includes(lower)) score = 70;
                  else if (txt === lower) score = 80;
                  else if (txt.startsWith(lower)) score = 50;
                  else if (txt.includes(lower) || tid.includes(lower) || t.includes(lower)) score = 30;
                  if (score > bestScore) { bestScore = score; best = el; }
                }
                if (!best || bestScore === 0) return null;
                let id = best.getAttribute('data-orbit-id');
                if (!id) {
                  id = 'fe_' + Date.now();
                  best.setAttribute('data-orbit-id', id);
                }
                const r = best.getBoundingClientRect();
                return { id, tag: best.tagName, text: (best.getAttribute('aria-label') || best.placeholder || best.innerText || '').substring(0, 60), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
              })();
            `);
            if (found && found.id) {
              systemResult = `Found element [${found.id}] ${found.tag}: "${found.text}" at (${found.x},${found.y}). Use click with element_id ${found.id}, or click_at x:${found.x} y:${found.y}.`;
            } else {
              systemResult = `No element found matching "${action.text}". Try read_page to see all elements, or screenshot to view the page.`;
            }
          } catch (e: any) {
            systemResult = `Error finding element: ${e.message}`;
          }
        }
        else if (action.action === 'click_at') {
          // Click by screen coordinates — works on SPAs, shadow DOM, canvas elements
          try {
            const cx = Number(action.x) || 0;
            const cy = Number(action.y) || 0;
            const result = await executeJS(`
              (function() {
                const el = document.elementFromPoint(${cx}, ${cy});
                if (!el) return 'No element at (${cx}, ${cy})';
                el.focus && el.focus();
                ['mouseover','mouseenter','mousedown','mouseup','click'].forEach(type => {
                  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: ${cx}, clientY: ${cy}, view: window }));
                });
                const desc = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.tagName).substring(0, 50);
                return 'Clicked ' + el.tagName + ': "' + desc + '" at (${cx},${cy})';
              })();
            `);
            systemResult = String(result);
            await new Promise(r => setTimeout(r, 600));
          } catch (e: any) {
            systemResult = `Error clicking at coords: ${e.message}`;
          }
        }
        else if (action.action === 'wait') {
          // Pause for dynamic UI transitions (compose popups, modals, loading)
          const ms = Math.min(Number(action.ms) || 1500, 5000);
          await new Promise(r => setTimeout(r, ms));
          systemResult = `Waited ${ms}ms. Page should be ready now. Use read_page or find_element to continue.`;
        }
        else if (action.action === 'scroll') {
          try {
            const amount = action.direction === 'up' ? -600 : 600;
            await executeJS(`window.scrollBy({ top: ${amount}, behavior: 'smooth' });`);
            systemResult = `Scrolled ${action.direction} successfully.`;
            await new Promise(r => setTimeout(r, 800)); // Wait for visual scroll
          } catch (e: any) {
            systemResult = `Error scrolling: ${e.message}`;
          }
        }
        else if (action.action === 'click') {
          try {
            if (action.element_id) {
              const safeId = ScriptSanitizer.escapeForJS(String(action.element_id));
              const result = await executeJS(`
                (function() {
                  return new Promise((resolve) => {
                    let targetEl = document.querySelector('[data-orbit-id="${safeId}"]');
                    if (!targetEl) return resolve(false);

                    // If target is SVG/path/icon, bubble up to nearest clickable parent (a, button, [role=button])
                    let clickTarget = targetEl;
                    const svgTags = ['SVG','PATH','CIRCLE','RECT','LINE','POLYGON','G','USE','SYMBOL'];
                    if (svgTags.includes(clickTarget.tagName.toUpperCase()) || clickTarget.tagName.toUpperCase() === 'IMG') {
                      const parent = clickTarget.closest('a, button, [role="button"], [role="link"], [tabindex]');
                      if (parent) clickTarget = parent;
                    }

                    // Brief visual highlight then click
                    const origOutline = targetEl.style.outline;
                    const origTransition = targetEl.style.transition;
                    targetEl.style.transition = 'all 0.15s';
                    targetEl.style.outline = '3px solid #ef4444';
                    targetEl.style.outlineOffset = '2px';

                    setTimeout(() => {
                      // Full event sequence for maximum compatibility
                      const rect = clickTarget.getBoundingClientRect();
                      const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
                      clickTarget.focus && clickTarget.focus();
                      ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(type => {
                        clickTarget.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
                      });
                      targetEl.style.outline = origOutline;
                      targetEl.style.transition = origTransition;
                      resolve(true);
                    }, 300);
                  });
                })();
              `);

              if (result) {
                // Report what was clicked — helps agent know if task-completing action was performed
                let clickedDesc = '';
                try {
                  clickedDesc = await executeJS(`
                    (function() {
                      const el = document.querySelector('[data-orbit-id="${safeId}"]');
                      if (!el) return '';
                      const aria = el.getAttribute('aria-label') || '';
                      const txt = (el.innerText || el.textContent || '').trim().substring(0, 40);
                      return aria || txt || el.tagName;
                    })();
                  `) || '';
                } catch {}
                const isFinalAction = /\b(send|submit|post|publish|save|confirm|done|sign in|log in|sign up|place order|checkout|pay now|tweet|reply|forward|discard|delete|archive|mark as read|apply|update|upload|add to cart|buy now|subscribe|unsubscribe|accept|decline|allow|block|report|finish)\b/i.test(clickedDesc.trim());
                systemResult = `Successfully clicked [${action.element_id}]${clickedDesc ? ': "' + clickedDesc + '"' : ''}.`;
                if (isFinalAction) {
                  // HARD BREAK — completion button was clicked, task is done
                  const confirmMsg = `Done — clicked "${clickedDesc.trim()}".`;
                  setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: confirmMsg, agent: 'browser' }]);
                  completionForceBreak = true;
                }
                await abortableWait(2000); // Wait for click effects to register naturally
              } else {
                systemResult = `Error: Could not find any clickable element with ID: ${action.element_id}. Use read_page or find_element to get valid IDs.`;
              }
            } else {
              systemResult = "Error: Cannot access webview or missing 'element_id' parameter in action.";
            }
          } catch (e: any) {
            systemResult = `Error clicking element: ${e.message}`;
          }
        }
        else if (action.action === 'type') {
           try {
            if (action.element_id && action.text !== undefined) {
              const safeText = ScriptSanitizer.escapeForJS(action.text);
              const safeId = ScriptSanitizer.escapeForJS(String(action.element_id));
              const result = await executeJS(`
                (function() {
                  return new Promise((resolve) => {
                    const targetEl = document.querySelector('[data-orbit-id="${safeId}"]');
                    // Accept INPUT, TEXTAREA, contentEditable, and also role="textbox" / role="combobox" (Gmail, Slack, etc.)
                    const role = targetEl ? targetEl.getAttribute('role') : '';
                    const isEditable = targetEl && (
                      targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA' ||
                      targetEl.isContentEditable ||
                      role === 'textbox' || role === 'combobox'
                    );
                    if (targetEl && isEditable) {
                      const originalOutline = targetEl.style.outline;
                      const originalTransition = targetEl.style.transition;
                      targetEl.style.transition = 'all 0.2s';
                      targetEl.style.outline = '4px solid #3b82f6';
                      targetEl.style.outlineOffset = '2px';

                      setTimeout(() => {
                        // Click then focus — some apps (Gmail) need a real click to activate the field
                        targetEl.click();
                        targetEl.focus();

                        if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
                            // Standard form inputs — use native setter to bypass React/framework protections
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                            const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;

                            if (targetEl.tagName === 'INPUT' && nativeInputValueSetter) {
                                nativeInputValueSetter.call(targetEl, \`${safeText}\`);
                            } else if (targetEl.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
                                nativeTextAreaValueSetter.call(targetEl, \`${safeText}\`);
                            } else {
                                targetEl.value = \`${safeText}\`;
                            }
                            targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                            targetEl.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            // Contenteditable / role="textbox" — used by Gmail compose, Slack, Notion, etc.
                            // SAFE approach: place cursor at end and insert. Do NOT selectAll+delete
                            // as that can nuke Gmail's compose DOM and cause a black tab.
                            try {
                              const sel = window.getSelection();
                              // Place cursor at end of the editable element
                              const range = document.createRange();
                              if (targetEl.childNodes.length > 0) {
                                range.selectNodeContents(targetEl);
                                range.collapse(false); // collapse to end
                              } else {
                                range.setStart(targetEl, 0);
                                range.collapse(true);
                              }
                              sel.removeAllRanges();
                              sel.addRange(range);
                              // Insert text at cursor using execCommand (preserves editor state)
                              document.execCommand('insertText', false, \`${safeText}\`);
                            } catch(ceErr) {
                              // Fallback: set textContent directly (less ideal but safe)
                              targetEl.textContent = \`${safeText}\`;
                            }
                            // Fire input event for frameworks listening
                            targetEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: \`${safeText}\` }));
                        }

                        if (${action.press_enter ? 'true' : 'false'}) {
                           targetEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                           targetEl.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                           targetEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

                           // If it's a form input, try to submit the form properly
                           if (targetEl.form) {
                              setTimeout(() => {
                                 try {
                                     if (typeof targetEl.form.requestSubmit === 'function') {
                                         targetEl.form.requestSubmit();
                                     } else {
                                         targetEl.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                                     }
                                 } catch(e) {}
                              }, 150);
                           }
                        }

                        targetEl.style.outline = originalOutline;
                        targetEl.style.transition = originalTransition;
                        resolve(true);
                      }, 600);
                    } else {
                      resolve(false);
                    }
                  });
                })();
              `);

              if (result) {
                // Report what field was typed into — helps agent know if it hit the right field
                let fieldDesc = '';
                try {
                  fieldDesc = await executeJS(`
                    (function() {
                      const el = document.querySelector('[data-orbit-id="${safeId}"]');
                      if (!el) return '';
                      const tag = el.tagName;
                      const aria = el.getAttribute('aria-label') || '';
                      const ph = el.placeholder || '';
                      const name = el.getAttribute('name') || '';
                      const type = el.getAttribute('type') || '';
                      const role = el.getAttribute('role') || '';
                      const isContent = el.isContentEditable;
                      const parts = [tag];
                      if (aria) parts.push('aria-label="' + aria + '"');
                      if (ph) parts.push('placeholder="' + ph + '"');
                      if (name) parts.push('name="' + name + '"');
                      if (type) parts.push('type="' + type + '"');
                      if (isContent) parts.push('(contenteditable)');
                      if (role) parts.push('role="' + role + '"');
                      return parts.join(' ');
                    })();
                  `) || '';
                } catch {}
                systemResult = `Successfully typed "${action.text}" into element [${action.element_id}]${fieldDesc ? ' → ' + fieldDesc : ''}. If this was the WRONG field (e.g. you typed the email body into the Subject line), use find_element to locate the correct field and re-type there.`;
                await new Promise(r => setTimeout(r, 1000));
              } else {
                systemResult = `Error: Could not find any input element with ID: ${action.element_id}. Use read_page or find_element to get valid IDs.`;
              }
            } else {
              systemResult = "Error: Missing 'element_id' or 'text' parameter in action.";
            }
          } catch (e: any) {
            systemResult = `Error typing into element: ${e.message}`;
          }
        }
        else if (action.action === 'wait_for_element') {
            setIsLoadingUrl(true);
            try {
                if (!action.selector) throw new Error("Missing selector.");
                
                const safeSelector = ScriptSanitizer.escapeForJS(action.selector);
                const result = await executeJS(`
                    (function() {
                      return new Promise((resolve) => {
                          let attempts = 0;
                          const check = () => {
                              if (document.querySelector('${safeSelector}')) {
                                  resolve(true);
                              } else {
                                  attempts++;
                                  if (attempts > 30) resolve(false); // 15 seconds max
                                  else setTimeout(check, 500);
                              }
                          };
                          check();
                      });
                    })();
                `);
                
                if (result) {
                    systemResult = `Element matching "${action.selector}" successfully loaded.`;
                } else {
                    systemResult = `Timeout: Element matching "${action.selector}" did not appear after 15 seconds.`;
                }
            } catch (e: any) {
                systemResult = `Error waiting for element: ${e.message}`;
            } finally {
                setIsLoadingUrl(false);
            }
        }
        else if (action.action === 'verify') {
            setIsLoadingUrl(true);
            try {
                // A generic heuristic verify injected script that returns the state
                const result = await executeJS(`
                    (function() {
                        const text = document.body.innerText.substring(0, 5000);
                        const expected = "${ScriptSanitizer.escapeForJS(action.expected || '')}";
                        // We do a basic heuristic: pass the visible text and state back
                        return "Current visible page summary (first 5k chars):\\n" + text;
                    })();
                `);
                
                systemResult = `Verification request for: "${action.expected}". The current DOM state is:\n${result}\n\nAnalyze this to determine if the task was completed successfully.`;
            } catch (e: any) {
                systemResult = `Error verifying state: ${e.message}`;
            } finally {
                setIsLoadingUrl(false);
            }
        }
        else if (action.action === 'inject_script') {
            try {
                // Validate script before execution
                const validation = ScriptSanitizer.validateScript(action.script);
                if (!validation.safe) {
                    throw new Error(`Script blocked: ${validation.reason}`);
                }
                
                let result = '';
                const SCRIPT_TIMEOUT_MS = 10000;
                try {
                    const scriptExec = executeJS(`
                        (async function(){
                            let lastError = null;
                            // Attempt execution up to 3 times to allow for dynamic DOM hydration
                            for (let i = 0; i < 3; i++) {
                                try {
                                    const fn = async () => {
                                        ${action.script}
                                    };
                                    let res = await fn();

                                    // If script executed but returned an error string or 'not found' message,
                                    // treat as a soft fail to give the DOM more time to render.
                                    if (typeof res === 'string') {
                                        const lowerRes = res.toLowerCase();
                                        if (lowerRes.includes("error:") || lowerRes.includes("cannot read") || lowerRes.includes("not found") || lowerRes.includes("could not find") || lowerRes.includes("no elements") || lowerRes.includes("no contact") || lowerRes.includes("no images")) {
                                            lastError = new Error(res);
                                            await new Promise(r => setTimeout(r, 1500));
                                            continue;
                                        }
                                    }

                                    return res;
                                } catch(e) {
                                    lastError = e;
                                    await new Promise(r => setTimeout(r, 1500));
                                }
                            }
                            return "Error after multiple retries (DOM might be missing elements): " + (lastError ? lastError.message : "Unknown error");
                        })();
                    `);
                    const timeoutPromise = new Promise<string>((_, rej) =>
                      setTimeout(() => rej(new Error('Script timed out after 10s')), SCRIPT_TIMEOUT_MS));
                    result = await Promise.race([scriptExec, timeoutPromise]);

                    // Give the script a realistic moment to visually complete before moving on
                    await new Promise(r => setTimeout(r, 1500));
                } catch (execError: any) {
                    result = `Execution failed: ${execError.message}`;
                }
                
                // Handle open_urls payload — open URLs as Bleumr tabs instead of window.open
                try {
                  const parsed = JSON.parse(result);
                  if (parsed?.open_urls && Array.isArray(parsed.open_urls)) {
                    for (const u of parsed.open_urls.slice(0, 5)) {
                      await createTab(u);
                      await new Promise(r => setTimeout(r, 300));
                    }
                    result = `Opened ${parsed.open_urls.length} links as Bleumr tabs.`;
                  }
                } catch { /* not JSON — that's fine */ }

                systemResult = `Script Execution: ${result}`;

                // Add visible code execution block to chat
                currentMessages = [...currentMessages, {
                  id: Date.now().toString() + '-script',
                  role: 'system',
                  content: `Executed Real DOM Script:\n\`\`\`javascript\n${action.script}\n\`\`\`\nResult: ${result}`,
                  isBrowserFeedback: true
                }];
                setMessages([...currentMessages]);
                await abortableWait(2000); // Pause after script execution

            } catch (e: any) {
                systemResult = `Failed to execute script: ${e.message}`;
            }
        }
        else if (action.action === 'screenshot') {
          try {
            const orbitBrowser = (window as any).orbit?.browser;
            if (!orbitBrowser?.screenshot) {
              systemResult = 'Screenshot not available in this environment.';
            } else {
              const snap = await orbitBrowser.screenshot(activeTabId);
              if (snap?.success && snap.base64) {
                // Also grab the live element map so vision can reference real IDs + coords
                let elementMapStr = '';
                try {
                  const liveEls = await executeJS(`
                    (function() {
                      const els = Array.from(document.querySelectorAll('[data-orbit-id]'));
                      return els.slice(0, 80).map(el => {
                        const r = el.getBoundingClientRect();
                        const desc = el.getAttribute('aria-label') || el.placeholder || (el.innerText||'').trim().substring(0,40) || el.tagName;
                        return '[' + el.getAttribute('data-orbit-id') + '] ' + el.tagName + ': "' + desc + '" @(' + Math.round(r.x+r.width/2) + ',' + Math.round(r.y+r.height/2) + ')';
                      });
                    })();
                  `);
                  if (liveEls && liveEls.length > 0) {
                    elementMapStr = '\n\nKnown element IDs on this page (reference these IDs when clicking):\n' + liveEls.join('\n');
                  }
                } catch { /* ignore — element map is bonus context */ }

                const visionPrompt = (action.prompt ||
                  'You are a browser automation agent analyzing a screenshot. Identify: (1) What page/site is shown, (2) ALL visible interactive elements — buttons, inputs, links, text areas — with their approximate x,y positions, (3) Form fields and their labels, (4) Current page state (loaded, login wall, error, etc). For each element give its label and screen position.') +
                  elementMapStr;
                const analysis = await analyzeWithVision(snap.base64, visionPrompt, secureApiKey);
                systemResult = `[Vision Analysis]\n${analysis}${elementMapStr}`;
                // Show screenshot preview in chat
                currentMessages = [...currentMessages, {
                  id: Date.now().toString() + '-vision',
                  role: 'system',
                  content: `📸 Vision scan complete:\n${analysis}`,
                  isBrowserFeedback: true,
                }];
                setMessages([...currentMessages]);
              } else {
                systemResult = 'Screenshot capture failed: ' + (snap?.reason || snap?.error || 'unknown');
              }
            }
          } catch (e: any) {
            systemResult = `Screenshot error: ${e.message}`;
          }
        }
        else if (action.action === 'select_option') {
          try {
            const safeId = ScriptSanitizer.escapeForJS(String(action.element_id));
            const safeVal = ScriptSanitizer.escapeForJS(String(action.value || ''));
            const result = await executeJS(`
              (function() {
                const el = document.querySelector('[data-orbit-id="${safeId}"]');
                if (!el || el.tagName !== 'SELECT') return 'Not found or not a select element';
                const opts = Array.from(el.options);
                const match = opts.find(o => o.value === '${safeVal}' || o.text.toLowerCase().includes('${safeVal}'.toLowerCase()));
                if (!match) return 'Option not found: ${safeVal}';
                el.value = match.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return 'Selected: ' + match.text;
              })();
            `);
            systemResult = `Select option result: ${result}`;
            await new Promise(r => setTimeout(r, 600));
          } catch (e: any) { systemResult = `Error selecting option: ${e.message}`; }
        }
        else if (action.action === 'key_press') {
          try {
            const key = action.key || 'Enter';
            const safeKey = ScriptSanitizer.escapeForJS(key);
            await executeJS(`
              (function() {
                const el = document.activeElement || document.body;
                const keyCode = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39 }['${safeKey}'] || 0;
                const evtInit = { key: '${safeKey}', code: '${safeKey}', keyCode: keyCode, which: keyCode, bubbles: true, cancelable: true };
                el.dispatchEvent(new KeyboardEvent('keydown', evtInit));
                el.dispatchEvent(new KeyboardEvent('keypress', evtInit));
                el.dispatchEvent(new KeyboardEvent('keyup', evtInit));

                // Tab — move focus to next tabbable element (event dispatch alone doesn't move focus)
                if ('${safeKey}' === 'Tab') {
                  const focusable = Array.from(document.querySelectorAll(
                    'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"], [contenteditable=""]'
                  )).filter(e => e.offsetParent !== null);
                  const idx = focusable.indexOf(el);
                  const next = focusable[idx + 1] || focusable[0];
                  if (next) { next.focus(); next.click && next.click(); }
                }
              })();
            `);
            systemResult = `Key "${key}" pressed on focused element.`;
            await new Promise(r => setTimeout(r, 800));
          } catch (e: any) { systemResult = `Error pressing key: ${e.message}`; }
        }
        else if (action.action === 'hover') {
          try {
            const safeId = ScriptSanitizer.escapeForJS(String(action.element_id));
            const result = await executeJS(`
              (function() {
                const el = document.querySelector('[data-orbit-id="${safeId}"]');
                if (!el) return false;
                el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                el.style.outline = '2px dashed #a78bfa';
                setTimeout(() => { el.style.outline = ''; }, 1200);
                return true;
              })();
            `);
            systemResult = result ? `Hovered element #${action.element_id}.` : `Element #${action.element_id} not found.`;
            await new Promise(r => setTimeout(r, 1200));
          } catch (e: any) { systemResult = `Error hovering: ${e.message}`; }
        }
        else if (action.action === 'extract_data') {
          try {
            const safeSelector = ScriptSanitizer.escapeForJS(action.selector || '*');
            const attr = ScriptSanitizer.escapeForJS(action.attribute || 'text');
            const result = await executeJS(`
              (function() {
                const els = Array.from(document.querySelectorAll('${safeSelector}')).slice(0, 100);
                return els.map(el => {
                  if ('${attr}' === 'text') return el.innerText?.trim();
                  return el.getAttribute('${attr}') || el.innerText?.trim();
                }).filter(Boolean);
              })();
            `);
            const data = Array.isArray(result) ? result : [String(result)];
            systemResult = `Extracted ${data.length} items:\n${data.slice(0, 50).join('\n')}`;
          } catch (e: any) { systemResult = `Error extracting data: ${e.message}`; }
        }
        else if (action.action === 'new_tab') {
          try {
            await createTab(action.url || 'about:blank');
            await abortableWait(2000);
            systemResult = `Opened new tab: ${action.url || 'blank'}`;
          } catch (e: any) { systemResult = `Error opening new tab: ${e.message}`; }
        }
        else if (action.action === 'get_url') {
          try {
            const url = await executeJS(`window.location.href`);
            systemResult = `Current URL: ${url}`;
          } catch (e: any) { systemResult = `Error getting URL: ${e.message}`; }
        }
        else if (action.action === 'clipboard_write') {
          try {
            const safeText = ScriptSanitizer.escapeForJS(action.text || '');
            await executeJS(`
              navigator.clipboard.writeText('${safeText}').catch(() => {
                const ta = document.createElement('textarea');
                ta.value = '${safeText}';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
              });
            `);
            systemResult = `Copied to clipboard: "${action.text}"`;
          } catch (e: any) { systemResult = `Error copying to clipboard: ${e.message}`; }
        }
        else if (action.action === 'fill_form') {
          try {
            const fields = action.fields || [];
            let filledCount = 0;
            for (const field of fields) {
              const safeId = ScriptSanitizer.escapeForJS(String(field.element_id));
              const safeVal = ScriptSanitizer.escapeForJS(String(field.value || ''));
              await executeJS(`
                (function() {
                  const el = document.querySelector('[data-orbit-id="${safeId}"]');
                  if (!el) return;
                  el.focus();
                  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    const setter = Object.getOwnPropertyDescriptor(el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')?.set;
                    if (setter) setter.call(el, '${safeVal}'); else el.value = '${safeVal}';
                  } else { el.innerText = '${safeVal}'; }
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                })();
              `);
              filledCount++;
            }
            systemResult = `Filled ${filledCount} form fields successfully.`;
            await new Promise(r => setTimeout(r, 800));
          } catch (e: any) { systemResult = `Error filling form: ${e.message}`; }
        }
        else if (action.action === 'drag_drop') {
          try {
            const safeFrom = ScriptSanitizer.escapeForJS(action.from_selector || '');
            const safeTo = ScriptSanitizer.escapeForJS(action.to_selector || '');
            const result = await executeJS(`
              (function() {
                const from = document.querySelector('${safeFrom}');
                const to = document.querySelector('${safeTo}');
                if (!from || !to) return 'Element not found';
                const fromRect = from.getBoundingClientRect();
                const toRect = to.getBoundingClientRect();
                from.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
                to.dispatchEvent(new DragEvent('dragover', { bubbles: true }));
                to.dispatchEvent(new DragEvent('drop', { bubbles: true }));
                from.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
                return 'Drag completed';
              })();
            `);
            systemResult = `Drag & drop result: ${result}`;
            await new Promise(r => setTimeout(r, 1000));
          } catch (e: any) { systemResult = `Error dragging: ${e.message}`; }
        }
        else {
          systemResult = `Error: Unknown action '${action.action}'`;
        }

        // ── COMPLETION FORCE-BREAK ─────────────────────────────────────────
        // If a completion button (Send/Submit/Post) was clicked, stop the loop immediately.
        // Don't ask the LLM — it will just try to "verify" and loop.
        if (completionForceBreak) {
          console.log('[Agent] Completion force-break: task done.');
          break;
        }

        // ── ACTION COUNTER (without reply) ──────────────────────────────
        totalActionsWithoutReply++;
        // Safety cap: if the agent has performed 12+ actions without ever issuing a reply,
        // it's almost certainly stuck in a loop. Force stop.
        if (totalActionsWithoutReply >= 12) {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Task appears complete — stopping after multiple steps.', agent: 'browser' }]);
          break;
        }

        // ── REPEAT-ACTION DETECTION ──────────────────────────────────────────
        // Track action signatures to detect stuck loops
        const actionSig = JSON.stringify({ a: action.action, id: action.element_id, url: action.url, text: action.text?.substring(0, 30) });
        actionHistory.push(actionSig);
        if (actionHistory.length >= 3) {
          const last3 = actionHistory.slice(-3);
          // Same exact action 3 times in a row
          if (last3[0] === last3[1] && last3[1] === last3[2]) {
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'I seem to be stuck repeating the same action. Stopping.', agent: 'browser' }]);
            break;
          }
        }
        // Cycle detector: catches A→B→A→B patterns (alternating actions)
        if (actionHistory.length >= 4) {
          const last4 = actionHistory.slice(-4);
          if (last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1]) {
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Detected a repeating cycle. Stopping to avoid infinite loop.', agent: 'browser' }]);
            break;
          }
        }

        // Flag perceiver to run next iteration if the page likely changed
        const PAGE_CHANGING_ACTIONS = ['navigate', 'click', 'click_at', 'type', 'scroll', 'go_back', 'inject_script'];
        if (action?.action && PAGE_CHANGING_ACTIONS.includes(action.action)) {
          needsPerception = true;
        }

        // Dead-tab detection: if 4+ consecutive actions return errors, the page is likely dead
        if (systemResult.startsWith('Error') || systemResult.includes('Error:') || systemResult.includes('failed') || systemResult.includes('not found')) {
          consecutiveErrors++;
          if (consecutiveErrors >= 4) {
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: '[Agent stopped] The page appears unresponsive after multiple errors. Try refreshing or restarting the task.', isBrowserFeedback: true }]);
            break;
          }
        } else {
          consecutiveErrors = 0; // reset on success
        }

        // Add System Feedback Message — re-anchor to original task
        // Step count pressure: as steps increase, push harder for completion
        const stepsLeft = 12 - totalActionsWithoutReply;
        const urgency = stepsLeft <= 3 ? ` WARNING: Only ${stepsLeft} steps remain before auto-stop. Finish NOW or reply.` : '';
        const taskReminder = `\n[TASK] "${userText}". Done? → reply action. Not done? → ONE action only.${urgency}`;
        currentMessages = [...currentMessages, {
          id: Date.now().toString() + '-sys',
          role: 'system',
          content: `[Result]: ${systemResult}${taskReminder}`,
          isBrowserFeedback: true
        }];
        setMessages([...currentMessages]);
        
      }
    } catch (err: any) {
      hasError = true;
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: `Critical Error: ${err.message}`,
        isBrowserFeedback: true
      }]);
    } finally {
      // Always clean up SoM markers so users never see red overlays
      try { await executeJS(SOM_REMOVE_SCRIPT); } catch {}
      setIsAgentWorking(false);
      setAgentStep(0);
      setAgentCurrentAction('');
      agentAbortRef.current = false;
      agentCorrectionRef.current = null;
      if (!hasError && (config.engine === 'local' || config.engine === 'local_llm_max')) {
         setTaskQueue([]);
      }
    }
  };

  // --- Render Helpers ---
  const renderActionBadge = (action: any) => {
    switch (action?.action) {
      case 'navigate':
        return <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-blue-400" /> Navigating to {action.url}</div>;
      case 'read_page':
        return <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-emerald-400" /> Deep-scanning all page elements</div>;
      case 'find_element':
        return <div className="flex items-center gap-2"><Search className="w-3.5 h-3.5 text-cyan-400" /> Finding "{action.text}"</div>;
      case 'scroll':
        return <div className="flex items-center gap-2"><ArrowDown className="w-3.5 h-3.5 text-orange-400" /> Scrolling {action.direction}</div>;
      case 'click':
        return <div className="flex items-center gap-2"><MousePointer2 className="w-3.5 h-3.5 text-pink-400" /> Clicking Element #{action.element_id}</div>;
      case 'click_at':
        return <div className="flex items-center gap-2"><MousePointer2 className="w-3.5 h-3.5 text-rose-400" /> Clicking at ({action.x},{action.y})</div>;
      case 'type':
        return <div className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5 text-purple-400" /> Typing "{action.text}" into #{action.element_id}</div>;
      case 'inject_script':
        return <div className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-yellow-400" /> Executing DOM Script</div>;
      default:
        return null;
    }
  };

  // ── PWA Install Gate — block usage unless added to home screen ──
  if (IS_PWA && !isInstalled) {
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
    return (
      <div className="fixed inset-0 z-[99999] overflow-hidden text-white font-sans"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', background: '#020208' }}>
        {/* Starfield canvas */}
        <PWAInstallStarField />
        {/* Content overlay */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
          <div className="flex flex-col items-center gap-5 max-w-sm text-center">
            {/* Animated sphere */}
            <div className="mb-2">
              <InlineStarSphere size={120} />
            </div>

            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-300 via-indigo-300 to-cyan-300 bg-clip-text text-transparent">
              Install Bleumr
            </h1>
            <p className="text-sm text-slate-400/80 leading-relaxed max-w-xs">
              Add to your home screen for the full experience — offline access, faster loads, and a native feel.
            </p>

            {isIOS ? (
              <div className="flex flex-col gap-3 w-full mt-2">
                {[
                  { n: '1', text: <>Tap the <span className="inline-flex items-center mx-1 px-1.5 py-0.5 bg-white/10 rounded text-white text-xs font-semibold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> Share button</> },
                  { n: '2', text: <>Scroll and tap <span className="font-semibold text-white">"Add to Home Screen"</span></> },
                  { n: '3', text: <>Tap <span className="font-semibold text-white">"Add"</span> to install</> },
                ].map((step) => (
                  <div key={step.n} className="flex items-center gap-3 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl px-4 py-3 text-left">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-400/20 flex items-center justify-center shrink-0">
                      <span className="text-violet-300 text-sm font-bold">{step.n}</span>
                    </div>
                    <p className="text-[13px] text-slate-300">{step.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3 w-full mt-2">
                {[
                  { n: '1', text: <>Tap the <span className="font-semibold text-white">menu</span> (three dots) in your browser</> },
                  { n: '2', text: <>Tap <span className="font-semibold text-white">"Add to Home Screen"</span> or <span className="font-semibold text-white">"Install App"</span></> },
                ].map((step) => (
                  <div key={step.n} className="flex items-center gap-3 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl px-4 py-3 text-left">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-400/20 flex items-center justify-center shrink-0">
                      <span className="text-violet-300 text-sm font-bold">{step.n}</span>
                    </div>
                    <p className="text-[13px] text-slate-300">{step.text}</p>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-slate-500/60 mt-3">Open Bleumr from your home screen to get started.</p>
            <p className="text-[9px] text-slate-600/40 mt-1">Created by Jumar Washington</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AgentErrorBoundary>
      {/* Onboarding — shown on first launch or when "Add New Profile" is requested */}
      {showOnboarding && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}

      <AnimatePresence>
        {appMode === 'platform' && !showOnboarding && (
          <PlatformView
            messages={messages}
            onSubmit={handleUserSubmit}
            voiceTranscript={voiceTranscript}
            onVoiceTranscriptConsumed={() => setVoiceTranscript('')}
            isAgentWorking={isAgentWorking}
            isListening={isListening}
            handleVoiceToggle={handleVoiceToggle}
            onOpenBrowser={() => setAppMode('browser')}
            agentMode={agentMode}
            chatThreads={chatThreads}
            currentThreadId={currentThreadId}
            onNewChat={handleNewChat}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
            userProfile={userProfile}
            onEditProfile={handleEditProfile}
            onAddNewProfile={handleAddNewProfile}
            onOpenSettings={() => setShowSettings(true)}
            onOpenScheduler={() => setShowScheduler(true)}
            onOpenWorkspace={() => setShowWorkspace(true)}
            onOpenVoiceChat={() => setShowVoiceChat(true)}
            onOpenApps={() => setShowApps(true)}
            onSchedule={(text) => handleUserSubmit(text)}
            agentStep={agentStep}
            agentTotalSteps={agentTotalSteps}
            agentCurrentAction={agentCurrentAction}
            onStopAgent={() => {
              agentAbortRef.current = true;
              chatAbortRef.current?.abort();
            }}
            onNavigateInternal={(url) => { createTab(url); setAppMode('browser'); }}
          />
        )}
      </AnimatePresence>

      {/* Scheduler full-page overlay */}
      <AnimatePresence>
        {showScheduler && (
          <motion.div
            key="scheduler"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', inset: 0, zIndex: 10001 }}
          >
            <SchedulerPage
              onClose={() => setShowScheduler(false)}
              onAskJumari={(text) => { setShowScheduler(false); handleUserSubmit(text); }}
              jumpToDate={schedulerJumpDate}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scheduling toast — appears when AI schedules an event */}
      <AnimatePresence>
        {schedulingToast && (
          <SchedulingToast
            event={schedulingToast}
            onDone={() => setSchedulingToast(null)}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-row-reverse h-screen w-full bg-[#0d0d0d] text-slate-200 overflow-hidden font-sans selection:bg-indigo-500/30">
      
      {/* Sidebar / Chat Panel */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: chatWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="z-20 shrink-0 border-l border-slate-800/60 bg-[#121212] overflow-hidden flex"
          >
            <Resizable
              size={{ width: chatWidth, height: '100%' }}
              onResizeStop={(e, direction, ref, d) => {
                setChatWidth(ref.offsetWidth);
              }}
              minWidth={320}
              maxWidth={1200}
              enable={{ left: true, top: false, right: false, bottom: false, topRight: false, bottomRight: false, bottomLeft: false, topLeft: false }}
              handleStyles={{ left: { width: '8px', left: '-4px', cursor: 'ew-resize', zIndex: 50 } }}
              className="flex flex-col h-full shrink-0"
            >
              <div className="flex flex-col h-full w-full min-w-[320px]">
                <div className="flex items-center justify-between p-4 border-b border-slate-800/60 shrink-0">
              <div className="flex items-center gap-3">
                
                <div>
                  <div className="relative inline-flex items-center group">
                    <>
                      <label className="absolute -top-3.5 left-0 text-[9px] font-bold text-slate-500 uppercase tracking-widest pointer-events-none">Agent</label>
                      <select 
                        className="appearance-none bg-transparent text-sm font-semibold tracking-tight text-white leading-none outline-none cursor-pointer pr-4 hover:text-indigo-400 transition-colors"
                        defaultValue="jumari"
                      >
                        <option value="jumari" className="text-slate-900 bg-white">Jumari 1.0</option>
                      </select>
                    </>
                    <svg className="w-3 h-3 text-slate-400 group-hover:text-indigo-400 transition-colors absolute right-0 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">
                     {config.engine === 'local_llm_max' ? 'Local LLM (Max Memory)' : config.engine === 'local' ? 'Local Engine' : 'Cloud Engine'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAppMode('platform')}
                  className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md transition-colors"
                  title="Return to Orbit Platform"
                >
                  Platform Mode
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-md transition-colors"
                  title="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Task Progress — local engine queue tracker */}
            <AnimatePresence>
              {initialTasks.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-slate-800/60 bg-[#161616] px-4 py-3 overflow-hidden shrink-0"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Task Status</span>
                    <div className="flex items-center gap-1">
                      {isAgentWorking && <span className="flex w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>}
                      <span className="text-[10px] text-indigo-400 font-medium">
                        {isAgentWorking ? 'Processing' : 'Completed'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {initialTasks.map((task, idx) => {
                      const isCompleted = idx < (initialTasks.length - taskQueue.length);
                      const isActive = isAgentWorking && idx === (initialTasks.length - taskQueue.length);
                      return (
                        <div key={idx} className={`flex items-start gap-2 text-sm ${isCompleted ? 'opacity-60' : ''}`}>
                          {isCompleted ? (
                             <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                          ) : isActive ? (
                             <Zap className="w-4 h-4 text-indigo-400 mt-0.5 animate-pulse shrink-0" />
                          ) : (
                             <CircleDashed className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                          )}
                          <span className={`${isCompleted ? 'text-slate-500 line-through' : isActive ? 'text-slate-200 font-medium' : 'text-slate-500'} leading-tight`}>
                            {task.desc || task.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Task Progress — cloud engine live step tracker */}
            <AnimatePresence>
              {isAgentWorking && agentMode === 'browser' && initialTasks.length === 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-slate-800/60 bg-[#161616] px-4 py-3 overflow-hidden shrink-0"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Agent Working</span>
                    <span className="flex w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  </div>
                  {/* Indeterminate progress bar */}
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <motion.div
                      className="h-full bg-indigo-500 rounded-full"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ width: '40%' }}
                    />
                  </div>
                  {/* Current action */}
                  {agentCurrentAction && (
                    <div className="flex items-center gap-2">
                      <Zap className="w-3 h-3 text-indigo-400 animate-pulse shrink-0" />
                      <span className="text-[11px] text-slate-300 truncate">{agentCurrentAction}</span>
                    </div>
                  )}
                  {/* Stop button */}
                  <button
                    onClick={() => { agentAbortRef.current = true; chatAbortRef.current?.abort(); }}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
                  >
                    <X className="w-3 h-3" /> Stop Agent
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat History — scroll locked while agent is working */}
            <div className={`flex-1 p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800 relative ${isAgentWorking ? 'overflow-hidden' : 'overflow-y-auto'}`}>
              <div>
                {messages.filter(m => !m.agent || m.agent === 'browser').length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60 mt-16">
                    <InlineStarSphere size={48} active={false} />
                    <p className="font-medium text-slate-500 text-xs mt-4 tracking-wide">Ask JUMARI to browse or automate</p>
                  </div>
                )}
                {messages.filter(m => !m.agent || m.agent === 'browser').map((msg, index) => {
                // Formatting User Messages
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex flex-col items-end gap-1 mb-2 mt-4">
                      <div className="max-w-[85%] px-4 py-2.5 bg-indigo-600 text-white rounded-2xl rounded-tr-sm text-sm shadow-md">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                // Formatting System (Browser Feedback) Messages
                if (msg.role === 'system') {
                  if (msg.content.includes('Executed Real DOM Script:')) {
                      if (!showDOMEvents) return null;
                      // Show actual script executions to the user to prove it's real
                      const codeMatch = msg.content.match(/\`\`\`javascript\n([\s\S]*?)\n\`\`\`/);
                      const resultMatch = msg.content.match(/Result: (.*)$/);
                      return (
                         <div key={msg.id} className="flex flex-col items-start gap-1 mb-2 mt-4 px-2">
                           <div className="flex items-center gap-2 text-yellow-500 mb-1">
                             <Zap className="w-4 h-4" />
                             <span className="text-xs font-bold uppercase tracking-wider">DOM Injection Executed</span>
                           </div>
                           <div className="bg-[#111] border border-slate-800 rounded-lg p-3 w-full shadow-inner">
                              <pre className="text-[11px] text-slate-400 font-mono overflow-x-auto whitespace-pre-wrap">
                                {codeMatch ? codeMatch[1] : msg.content}
                              </pre>
                           </div>
                           {resultMatch && (
                              <div className="text-xs text-emerald-400 font-medium mt-1 pl-1">
                                {resultMatch[0]}
                              </div>
                           )}
                         </div>
                      );
                  }
                  
                  const isError = msg.content.toLowerCase().includes('error') || msg.content.toLowerCase().includes('failed');
                  if (isError) {
                    // Never show raw technical errors to users
                    return null;
                  }

                  return null; // Hide other standard internal browser feedback from user
                }

                // Formatting AI Messages
                if (msg.role === 'assistant') {
                  const actionData = msg.action;
                  let chatText = "";

                  if (!actionData) {
                    chatText = msg.content.replace(/\`\`\`json\s*[\s\S]*?\s*\`\`\`/, '').trim();
                  } else if (actionData.action === 'reply') {
                    chatText = actionData.message;
                  } else {
                    switch (actionData.action) {
                      case 'navigate':
                        try {
                          const hostname = new URL(actionData.url).hostname.replace('www.', '');
                          chatText = `Okay, going to ${hostname} now...`;
                        } catch(e) {
                          chatText = `Okay, going to that webpage now...`;
                        }
                        break;
                      case 'type':
                        chatText = `Entering "${actionData.text}"...`;
                        break;
                      case 'click':
                        chatText = `Clicking on that for you...`;
                        break;
                      case 'scroll':
                        chatText = `Scrolling ${actionData.direction}...`;
                        break;
                      case 'inject_script':
                        chatText = `Executing automation script in browser frame...`;
                        break;
                      case 'read_page':
                        // Don't clutter the chat with page scanning messages
                        return null;
                    }
                  }

                  if (!chatText) return null;

                  // Extract ALL code blocks and replace with editor buttons
                  const codeBlockRegex = /`{3,}\s*(javascript|js|typescript|ts|python|html|css|sql|go|rust|bash|sh|json|java|cpp|c|swift|kotlin|ruby|php|r|matlab|scala|haskell)\s*\r?\n([\s\S]*?)`{3,}/gi;
                  const codeBlocks: { language: string; code: string }[] = [];
                  let cleanedText = chatText.replace(codeBlockRegex, (_, lang, code) => {
                    codeBlocks.push({ language: lang.toLowerCase(), code: code.trim() });
                    return `[[CODE_BLOCK_${codeBlocks.length - 1}]]`;
                  });

                  // Detect and extract formula expressions
                  const formulaMatches = detectFormulas(cleanedText);
                  const formulaBlocks: { expression: string; title: string }[] = [];
                  for (const fm of formulaMatches) {
                    formulaBlocks.push({ expression: fm.expression, title: fm.title });
                    cleanedText = cleanedText.replace(fm.expression, fm.placeholder);
                  }

                  const isLatestVisibleBotMsg = messages.slice(index + 1).findIndex(m => m.role === 'assistant' && m.action?.action !== 'read_page') === -1;

                  // Split cleanedText around [[CODE_BLOCK_N]] and [[FORMULA_N]] placeholders
                  const parts = cleanedText.split(/(\[\[CODE_BLOCK_\d+\]\]|\[\[FORMULA_\d+\]\])/);

                  return (
                    <div key={msg.id} className="flex flex-col items-start gap-1.5 mb-2">
                      {isLatestVisibleBotMsg && (
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 ml-1 opacity-70">
                          JUMARI 1.0
                        </div>
                      )}

                      {parts.length === 1 ? (
                        // No code blocks — render normally
                        <div className="max-w-[90%] px-4 py-3 bg-slate-800 text-slate-200 border border-slate-700/50 rounded-2xl rounded-tl-sm text-sm leading-relaxed shadow-sm prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown>{chatText}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="max-w-[90%] flex flex-col gap-2">
                          {parts.map((part, pi) => {
                            // Check if this part is a placeholder
                            const codeMatch = part.match(/^\[\[CODE_BLOCK_(\d+)\]\]$/);
                            const formulaMatch = part.match(/^\[\[FORMULA_(\d+)\]\]$/);

                            if (!codeMatch && !formulaMatch) {
                              if (!part.trim()) return null;
                              return (
                                <div key={pi} className="px-4 py-3 bg-slate-800 text-slate-200 border border-slate-700/50 rounded-2xl rounded-tl-sm text-sm leading-relaxed shadow-sm prose prose-invert prose-sm max-w-none">
                                  <ReactMarkdown>{part}</ReactMarkdown>
                                </div>
                              );
                            } else if (formulaMatch) {
                              const fIdx = parseInt(formulaMatch[1]);
                              const fb = formulaBlocks[fIdx];
                              if (!fb) return null;
                              return <FormulaModule key={pi} expression={fb.expression} title={fb.title} />;
                            } else {
                              const blockIdx = parseInt(codeMatch![1]);
                              const block = codeBlocks[blockIdx];
                              if (!block) return null;
                              const firstLine = block.code.split('\n')[0];
                              const langLabels: Record<string, {icon: string; label: string; color: string}> = {
                                python: {icon: '🐍', label: 'Python', color: 'text-blue-400 bg-blue-500/10 border-blue-500/25'},
                                javascript: {icon: '⚡', label: 'JavaScript', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25'},
                                js: {icon: '⚡', label: 'JavaScript', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25'},
                                typescript: {icon: '🔷', label: 'TypeScript', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25'},
                                ts: {icon: '🔷', label: 'TypeScript', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25'},
                                html: {icon: '🌐', label: 'HTML', color: 'text-orange-400 bg-orange-500/10 border-orange-500/25'},
                                css: {icon: '🎨', label: 'CSS', color: 'text-pink-400 bg-pink-500/10 border-pink-500/25'},
                                sql: {icon: '🗄️', label: 'SQL', color: 'text-green-400 bg-green-500/10 border-green-500/25'},
                                go: {icon: '🐹', label: 'Go', color: 'text-teal-400 bg-teal-500/10 border-teal-500/25'},
                                rust: {icon: '🦀', label: 'Rust', color: 'text-orange-400 bg-orange-500/10 border-orange-500/25'},
                                bash: {icon: '📟', label: 'Bash', color: 'text-green-400 bg-green-500/10 border-green-500/25'},
                                sh: {icon: '📟', label: 'Shell', color: 'text-green-400 bg-green-500/10 border-green-500/25'},
                                json: {icon: '{}', label: 'JSON', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25'},
                              };
                              const lm = langLabels[block.language] ?? {icon: '📄', label: block.language.toUpperCase(), color: 'text-slate-400 bg-slate-500/10 border-slate-500/25'};
                              const title = firstLine.startsWith('#') || firstLine.startsWith('//') || firstLine.startsWith('--')
                                ? firstLine.replace(/^[#\/\-!\s]+/, '').slice(0, 60) || `${lm.label} code`
                                : firstLine.slice(0, 60) || `${lm.label} code`;
                              const canRun = ['javascript', 'js', 'html', 'css'].includes(block.language);
                              return (
                                <button
                                  key={pi}
                                  onClick={() => setCodePanel({ language: block.language, code: block.code, title })}
                                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all hover:scale-[1.01] ${lm.color}`}
                                >
                                  <span className="text-2xl">{lm.icon}</span>
                                  <div className="flex flex-col gap-0.5">
                                    <span className={`text-xs font-bold tracking-wide ${lm.color.split(' ')[0]}`}>
                                      {lm.label}{canRun ? ' — click to run' : ' — click to edit'}
                                    </span>
                                    <span className="text-[11px] text-slate-400 font-mono truncate max-w-[280px]">{title}</span>
                                  </div>
                                </button>
                              );
                            }
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
              })}
              
              {/* Animated sphere while agent works */}
              <AnimatePresence>
                {isAgentWorking && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col items-center justify-center py-6"
                  >
                    <div className="pointer-events-none drop-shadow-[0_0_25px_rgba(99,102,241,0.3)]">
                      <InlineStarSphere key={`sphere-browser-${workSessionId}`} size={100} />
                    </div>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-[10px] font-semibold text-slate-500 mt-2 tracking-wide"
                    >
                      {agentCurrentAction || 'JUMARI 1.0 is working...'}
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-[#121212] border-t border-slate-800/60">
              <form
                onSubmit={(e) => { e.preventDefault(); if (browserInput.trim()) { handleUserSubmit(browserInput); setBrowserInput(''); } }}
                className="relative flex items-center bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all"
              >
                <input
                  type="text"
                  value={browserInput}
                  onChange={(e) => setBrowserInput(e.target.value)}
                  placeholder={isListening ? "Listening offline..." : isAgentWorking ? "Send correction or redirect..." : "Ask JUMARI to browse or search..."}
                  className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 py-3 pl-4 pr-20 outline-none"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleVoiceToggle}
                    className={`p-1.5 rounded-md transition-colors ${isListening ? 'text-red-400 bg-red-400/10 hover:bg-red-400/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    type="submit"
                    disabled={!browserInput.trim()}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-indigo-600 rounded-md disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
            </div>
          </Resizable>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Main Browser View */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a] relative">
        
        {/* Browser Chrome (Header) */}
        <div className="flex flex-col border-b border-slate-800/60 bg-[#121212] shrink-0" style={{ WebkitAppRegion: 'drag' } as any}>
          {/* Tabs Row — pl-[80px] clears macOS hiddenInset traffic lights (~68px wide at x:12) */}
          <div className="flex items-end pl-[80px] pr-2 pt-2 gap-1 overflow-x-auto scrollbar-none" style={{ WebkitAppRegion: 'no-drag' } as any}>
            {tabs.map(tab => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`group flex items-center gap-2 max-w-[200px] min-w-[120px] px-3 py-1.5 rounded-t-lg cursor-pointer transition-all border border-b-0 text-xs font-medium ${
                    isActive 
                      ? 'bg-slate-900/60 border-slate-800 text-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.2)]' 
                      : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-800/30'
                  }`}
                >
                  <div className="flex-1 truncate">
                    {tab.title}
                  </div>
                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => handleCloseTab(e, tab.id)}
                      className={`p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-slate-700 transition-all ${isActive ? 'text-slate-400 hover:text-white' : 'text-slate-500'}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              onClick={handleAddTab}
              className="p-1.5 mb-1.5 ml-1 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Row */}
          <div className="h-12 flex items-center px-4 gap-4 bg-[#121212]" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <div className="flex gap-1.5 shrink-0 items-center">
              <button
                onClick={() => setAppMode('platform')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 transition-colors"
                title="Back to JUMARI"
              >
                <Home className="w-3.5 h-3.5" />
                Home
              </button>
              <div className="w-px h-5 bg-slate-700/60 mx-1" />
              <button
                onClick={() => goBack()}
                className="p-1.5 text-slate-500 hover:text-slate-300 rounded-md transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => goForward()}
                className="p-1.5 text-slate-500 hover:text-slate-300 rounded-md transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => reload()}
                className="p-1.5 text-slate-400 hover:text-white rounded-md transition-colors"
              >
                <RefreshCw className={"w-4 h-4 " + (isLoadingUrl ? 'animate-spin text-indigo-400' : '')} />
              </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto flex items-center bg-slate-900/80 border border-slate-800 rounded-full px-3 py-1.5 shadow-inner">
              <Lock className="w-3.5 h-3.5 text-slate-500 mr-2 shrink-0" />
              <div className="flex-1 text-xs text-slate-300 truncate font-medium tracking-wide">
                {currentUrl}
              </div>
              <button
                onClick={handleAddBookmark}
                className="p-1 text-slate-400 hover:text-indigo-400 transition-colors ml-2"
                title="Bookmark this tab"
              >
                <Bookmark className={`w-3.5 h-3.5 ${bookmarks.some(b => b.url === currentUrl) ? 'fill-indigo-400 text-indigo-400' : ''}`} />
              </button>
            </div>
            
            <div className="flex justify-end w-24 shrink-0">
              {isSidebarOpen ? (
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors bg-slate-900 text-slate-200 border border-slate-700/50 hover:bg-slate-800 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  Close
                </button>
              ) : (
                <MiniStarSphereButton 
                  onClick={() => setIsSidebarOpen(true)}
                  size={32}
                />
              )}
            </div>
          </div>

          {/* Bookmarks Bar */}
          {bookmarks.length > 0 && (
            <div className="flex items-center px-4 py-1.5 gap-3 bg-[#161616] border-t border-slate-800/40 text-[11px]">
              {bookmarks.map((b, i) => (
                <button
                  key={i}
                  onClick={() => handleBookmarkClick(b.url)}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors bg-transparent px-2 py-0.5 rounded-sm hover:bg-slate-800/50"
                  title={b.url}
                >
                  <Globe className="w-3 h-3" />
                  <span className="truncate max-w-[120px]">{b.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Webview Container — WebContentsView from main process renders here via setBounds */}
        <div
          ref={browserContainerRef}
          className="flex-1 relative rounded-tl-lg overflow-hidden border-t border-l border-slate-800/60 shadow-2xl bg-[#0a0a0c]"
        >
          <AIParticleOverlay isActive={isAgentWorking || isLoadingUrl} />

          {/* OrbitHome: shown for orbit:// tabs (no WebContentsView for those) */}
          {tabs.map(tab => (
            tab.url.startsWith('orbit://') && tab.id === activeTabId ? (
              <div key={tab.id} className="w-full h-full absolute inset-0">
                <OrbitHome />
              </div>
            ) : null
          ))}

          {/* Empty state: no tabs open yet */}
          {tabs.length === 0 && (
            <div className="w-full h-full absolute inset-0">
              <OrbitHome />
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <SettingsModal
            onClose={() => { setShowSettings(false); setSettingsInitialTab('engine'); }}
            config={config}
            onConfigChange={setConfig}
            initialTab={settingsInitialTab}
            tier={tier}
            setTier={setTier}
            dailyUsage={dailyUsage}
            setDailyUsage={setDailyUsage}
            secureApiKey={secureApiKey}
            approveAll={approveAll}
            setApproveAll={setApproveAll}
            scheduledJobs={scheduledJobs}
            onOpenStripe={(url) => { setShowSettings(false); createTab(url); setAppMode('browser'); }}
            onLicenseActivated={() => {
              SubscriptionService.getStoredApiKeys().then(keys => {
                if (keys.groq) setSecureApiKey(keys.groq);
                if (keys.deepgram) setDeepgramKey(keys.deepgram);
                setConfig(prev => {
                  if (prev.engine === 'local') {
                    const updated = { ...prev, engine: 'cloud' as const };
                    try { localStorage.setItem('bleumr_config', JSON.stringify(updated)); } catch {}
                    return updated;
                  }
                  return prev;
                });
              });
            }}
          />
        )}
      </AnimatePresence>
      {/* ── Upgrade / Paywall Notification ──────────────────────────────── */}
      <AnimatePresence>
        {showUpgradeModal && (
          <div className="fixed inset-0 z-[10001] flex items-end justify-center pb-24 px-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="pointer-events-auto w-full max-w-xs"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 60%, rgba(255,255,255,0.07) 100%)',
                backdropFilter: 'blur(40px) saturate(180%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.13)',
                borderTop: '1px solid rgba(255,255,255,0.22)',
                borderLeft: '1px solid rgba(255,255,255,0.16)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.04) inset',
                borderRadius: '4px',
              }}
            >
              <div className="flex items-center gap-3 px-4 py-3.5">
                {/* Icon */}
                <span className="text-base shrink-0">⚡</span>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/90 leading-snug">
                    {upgradeReason === 'browser_agent'
                      ? 'Browser Agent requires STELLUR'
                      : "You've used all your energy"}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5 leading-snug">
                    {upgradeReason === 'browser_agent'
                      ? 'Upgrade to automate the web with JUMARI.'
                      : 'Upgrade your plan for more usage.'}
                  </p>
                </div>

                {/* Upgrade button */}
                <button
                  onClick={() => { setShowUpgradeModal(false); setSettingsInitialTab('plan'); setShowSettings(true); }}
                  className="shrink-0 px-3 py-1.5 text-[11px] font-semibold text-white/90 transition-all hover:text-white whitespace-nowrap"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: '3px',
                  }}
                >
                  Upgrade
                </button>

                {/* Dismiss */}
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="shrink-0 text-white/25 hover:text-white/60 transition-colors ml-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <JumariApprovalModal />

      {/* Update ready banner */}
      <AnimatePresence>
        {updateReady && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-4 px-5 py-3 bg-indigo-600 text-white rounded-2xl shadow-2xl text-sm font-medium"
          >
            <span>A new version of Bleumr is ready to install.</span>
            <button
              onClick={() => (window as any).orbit?.updater?.install()}
              className="bg-white text-indigo-700 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-indigo-50 transition-colors"
            >
              Restart &amp; Update
            </button>
            <button onClick={() => setUpdateReady(false)} className="opacity-60 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Code Playground Panel */}
      <AnimatePresence>
        {codePanel && (
          <CodePlayground
            panel={codePanel}
            onClose={() => setCodePanel(null)}
            onCodeChange={(code) => setCodePanel(prev => prev ? { ...prev, code } : null)}
          />
        )}
      </AnimatePresence>
    </div>

    {/* Workspace — rendered last so it sits above everything */}
    <AnimatePresence>
      {showWorkspace && (
        <motion.div
          key="workspace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
        >
          <WorkspacePage
            onClose={() => { setShowWorkspace(false); setWorkspaceAutoTask(null); }}
            apiKey={secureApiKey}
            initialTask={workspaceAutoTask ?? undefined}
          />
        </motion.div>
      )}
    </AnimatePresence>

    {/* Coding Page */}
    <AnimatePresence>
      {showCoding && (
        <motion.div
          key="coding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
        >
          <CodingPage
            onClose={() => setShowCoding(false)}
            apiKey={secureApiKey}
          />
        </motion.div>
      )}
    </AnimatePresence>

    {/* Trading Dashboard */}
    <AnimatePresence>
      {showTrading && (
        <motion.div
          key="trading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
        >
          <TradingDashboard onClose={() => setShowTrading(false)} />
        </motion.div>
      )}
    </AnimatePresence>

    {/* Web Designer */}
    <AnimatePresence>
      {showWebDesigner && (
        <motion.div
          key="webdesigner"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
        >
          <WebDesignerPage onClose={() => setShowWebDesigner(false)} />
        </motion.div>
      )}
    </AnimatePresence>

    {/* Apps Page */}
    <AnimatePresence>
      {showApps && (
        <motion.div
          key="apps"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
        >
          <AppsPage
            onClose={() => setShowApps(false)}
            onOpenCoding={() => { setShowApps(false); setShowCoding(true); }}
            onOpenTrading={() => { setShowApps(false); setShowTrading(true); }}
            onOpenWebDesigner={() => { setShowApps(false); setShowWebDesigner(true); }}
          />
        </motion.div>
      )}
    </AnimatePresence>


    {/* Voice Chat */}
    <AnimatePresence>
      {showVoiceChat && (
        <motion.div
          key="voicechat"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
        >
          <VoiceChatModal
            apiKey={secureApiKey}
            deepgramKey={deepgramKey}
            onClose={() => setShowVoiceChat(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>

    </AgentErrorBoundary>
  );
}
