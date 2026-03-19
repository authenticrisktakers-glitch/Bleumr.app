import { useState, useEffect, useRef, useCallback, MutableRefObject } from 'react';
import { BrowserService } from '../services/BrowserService';
import { ScriptSanitizer } from '../services/ScriptSanitizer';

export interface Tab {
  id: string;
  url: string;
  title: string;
}

export function useBrowserEngine(webviewRefs?: MutableRefObject<{ [key: string]: any }>) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const initRef = useRef(false);

  // Keep a ref to activeTabId so event-listener closures always see the latest value
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

  // Safety timeout: if loading doesn't clear within 15s, force-clear it
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setLoadingWithTimeout = useCallback((loading: boolean) => {
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    setIsLoadingUrl(loading);
    if (loading) {
      loadingTimeoutRef.current = setTimeout(() => setIsLoadingUrl(false), 15_000);
    }
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const unsubscribers: (() => void)[] = [];

    // URL changed — use ref so closure always has current activeTabId
    unsubscribers.push(
      BrowserService.onUrlChanged(({ tabId, url }) => {
        setTabs(prev => prev.map(tab => tab.id === tabId ? { ...tab, url } : tab));
        if (tabId === activeTabIdRef.current) {
          setCurrentUrl(url);
        }
      })
    );

    // Title changed
    unsubscribers.push(
      BrowserService.onTitleChanged(({ tabId, title }) => {
        setTabs(prev => prev.map(tab => tab.id === tabId ? { ...tab, title } : tab));
      })
    );

    // Loading state — use ref, not stale closure
    unsubscribers.push(
      BrowserService.onLoadingChanged(({ tabId, isLoading }) => {
        // Clear loading for the active tab OR when any tab finishes loading
        if (tabId === activeTabIdRef.current || !isLoading) {
          setLoadingWithTimeout(isLoading);
        }
      })
    );

    // Crash
    unsubscribers.push(
      BrowserService.onCrash(({ tabId }) => {
        console.error(`Browser tab ${tabId} crashed`);
        setTabs(prev => prev.map(tab => tab.id === tabId ? { ...tab, title: 'Crashed' } : tab));
        setLoadingWithTimeout(false);
      })
    );

    // Error
    unsubscribers.push(
      BrowserService.onError(({ tabId, error }) => {
        console.error(`Browser tab ${tabId} error:`, error);
        setLoadingWithTimeout(false);
      })
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once — use refs for live values

  const createTab = useCallback(async (url: string) => {
    const sanitizedUrl = ScriptSanitizer.sanitizeURL(url);
    const isOrbitUrl = sanitizedUrl.startsWith('orbit://');

    if (!isOrbitUrl && (window as any).orbit?.browser) {
      // Real web URL — create a WebContentsView in the main process
      const result = await (window as any).orbit.browser.open(sanitizedUrl);
      if (!result?.success || !result.tabId) return null;
      const mainTabId: string = result.tabId;
      const newTab: Tab = { id: mainTabId, url: sanitizedUrl, title: 'Loading...' };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(mainTabId);
      activeTabIdRef.current = mainTabId;
      setCurrentUrl(sanitizedUrl);
      setLoadingWithTimeout(true);
      return mainTabId;
    }

    // orbit:// URLs (home, etc.) or non-Electron dev fallback — renderer-only tab, no WebContentsView
    const newTabId = `tab-${Date.now()}`;
    const title = isOrbitUrl ? 'Bleumr Home' : 'New Tab';
    const newTab: Tab = { id: newTabId, url: sanitizedUrl, title };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTabId);
    activeTabIdRef.current = newTabId;
    setCurrentUrl(sanitizedUrl);
    // Hide any active WebContentsView by "activating" a non-existent ID
    if (isOrbitUrl && (window as any).orbit?.browser) {
      (window as any).orbit.browser.setActive(newTabId).catch(() => {});
    }
    return newTabId;
  }, [setLoadingWithTimeout]);

  const closeTab = useCallback(async (tabId: string) => {
    await BrowserService.closeTab(tabId);

    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);
      if (filtered.length === 0) {
        setActiveTabId('');
        activeTabIdRef.current = '';
        setCurrentUrl('');
        return [];
      }
      if (tabId === activeTabIdRef.current && filtered.length > 0) {
        const lastTab = filtered[filtered.length - 1];
        setActiveTabId(lastTab.id);
        activeTabIdRef.current = lastTab.id;
        setCurrentUrl(lastTab.url);
        BrowserService.setActiveTab(lastTab.id);
      }
      return filtered;
    });
  }, []);

  const switchTab = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      activeTabIdRef.current = tabId;
      setCurrentUrl(tab.url);
      setLoadingWithTimeout(false); // switching tabs clears loading indicator
      await BrowserService.setActiveTab(tabId);
    }
  }, [tabs, setLoadingWithTimeout]);

  const navigate = useCallback(async (url: string, tabId?: string) => {
    const sanitizedUrl = ScriptSanitizer.sanitizeURL(url);
    const targetTabId = tabId || activeTabIdRef.current;
    setCurrentUrl(sanitizedUrl);
    // Skip IPC for orbit:// internal URLs — they have no WebContentsView
    if (sanitizedUrl.startsWith('orbit://')) return;

    // If the current active tab is a renderer-only orbit:// tab (ID starts with 'tab-'),
    // it has no WebContentsView in the main process — create a real browser tab instead.
    if (!tabId && (targetTabId.startsWith('tab-') || !targetTabId)) {
      if ((window as any).orbit?.browser) {
        const result = await (window as any).orbit.browser.open(sanitizedUrl);
        if (result?.success && result.tabId) {
          const mainTabId: string = result.tabId;
          setTabs(prev => {
            const exists = prev.some(t => t.id === mainTabId);
            return exists ? prev : [...prev, { id: mainTabId, url: sanitizedUrl, title: 'Loading...' }];
          });
          setActiveTabId(mainTabId);
          activeTabIdRef.current = mainTabId;
          setLoadingWithTimeout(true);
        }
      }
      return;
    }

    setLoadingWithTimeout(true);
    await BrowserService.navigate(targetTabId, sanitizedUrl);
  }, [setLoadingWithTimeout]);

  const reload = useCallback(async (tabId?: string) => {
    setLoadingWithTimeout(true);
    await BrowserService.reload(tabId || activeTabIdRef.current);
  }, [setLoadingWithTimeout]);

  const goBack = useCallback(async () => {
    await BrowserService.goBack(activeTabIdRef.current);
  }, []);

  const goForward = useCallback(async () => {
    await BrowserService.goForward(activeTabIdRef.current);
  }, []);

  const executeJS = useCallback(async (code: string, tabId?: string): Promise<any> => {
    const validation = ScriptSanitizer.validateScript(code);
    if (!validation.safe) {
      console.warn('[useBrowserEngine] Blocked unsafe script:', validation.reason);
      throw new Error(`Script blocked: ${validation.reason}`);
    }
    try {
      const targetTabId = tabId || activeTabIdRef.current;
      const webview = webviewRefs?.current?.[targetTabId];
      if (webview && typeof webview.executeJavaScript === 'function') {
        return await webview.executeJavaScript(code);
      }
      return await BrowserService.executeJS(targetTabId, code);
    } catch (error: any) {
      console.error('[useBrowserEngine] Script execution failed:', error);
      throw error;
    }
  }, [webviewRefs]);

  return {
    tabs,
    activeTabId,
    currentUrl,
    isLoadingUrl,
    setIsLoadingUrl: setLoadingWithTimeout,
    createTab,
    closeTab,
    switchTab,
    navigate,
    reload,
    goBack,
    goForward,
    executeJS,
    setTabs,
  };
}
