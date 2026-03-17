import { useState, useEffect, useRef, useCallback, MutableRefObject } from 'react';
import { BrowserService } from '../services/BrowserService';
import { ScriptSanitizer } from '../services/ScriptSanitizer';

export interface Tab {
  id: string;
  url: string;
  title: string;
}

export function useBrowserEngine(webviewRefs?: MutableRefObject<{ [key: string]: any }>) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'tab-1', url: 'orbit://home', title: 'Bleumr Home' }]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [currentUrl, setCurrentUrl] = useState('orbit://home');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const initRef = useRef(false);

  // Initialize browser event listeners
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const unsubscribers: (() => void)[] = [];

    // URL changed listener
    unsubscribers.push(
      BrowserService.onUrlChanged(({ tabId, url }) => {
        setTabs(prev => prev.map(tab => 
          tab.id === tabId ? { ...tab, url } : tab
        ));
        if (tabId === activeTabId) {
          setCurrentUrl(url);
        }
      })
    );

    // Title changed listener
    unsubscribers.push(
      BrowserService.onTitleChanged(({ tabId, title }) => {
        setTabs(prev => prev.map(tab => 
          tab.id === tabId ? { ...tab, title } : tab
        ));
      })
    );

    // Loading state listener
    unsubscribers.push(
      BrowserService.onLoadingChanged(({ tabId, isLoading }) => {
        if (tabId === activeTabId) {
          setIsLoadingUrl(isLoading);
        }
      })
    );

    // Crash listener
    unsubscribers.push(
      BrowserService.onCrash(({ tabId }) => {
        console.error(`Browser tab ${tabId} crashed`);
        setTabs(prev => prev.map(tab => 
          tab.id === tabId ? { ...tab, title: 'Crashed' } : tab
        ));
      })
    );

    // Error listener
    unsubscribers.push(
      BrowserService.onError(({ tabId, error }) => {
        console.error(`Browser tab ${tabId} error:`, error);
      })
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [activeTabId]);

  const createTab = useCallback(async (url: string) => {
    const sanitizedUrl = ScriptSanitizer.sanitizeURL(url);
    const newTabId = `tab-${Date.now()}`;
    const newTab: Tab = {
      id: newTabId,
      url: sanitizedUrl,
      title: 'Loading...',
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTabId);
    setCurrentUrl(sanitizedUrl);

    await BrowserService.createTab(newTabId, sanitizedUrl);
    return newTabId;
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    await BrowserService.closeTab(tabId);
    
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);
      if (filtered.length === 0) {
        // Always keep at least one tab
        const homeTab: Tab = { id: 'tab-home', url: 'orbit://home', title: 'Bleumr Home' };
        setActiveTabId(homeTab.id);
        setCurrentUrl(homeTab.url);
        return [homeTab];
      }
      
      // If closing active tab, switch to the last tab
      if (tabId === activeTabId && filtered.length > 0) {
        const lastTab = filtered[filtered.length - 1];
        setActiveTabId(lastTab.id);
        setCurrentUrl(lastTab.url);
        BrowserService.setActiveTab(lastTab.id);
      }
      
      return filtered;
    });
  }, [activeTabId]);

  const switchTab = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      setCurrentUrl(tab.url);
      await BrowserService.setActiveTab(tabId);
    }
  }, [tabs]);

  const navigate = useCallback(async (url: string, tabId?: string) => {
    const sanitizedUrl = ScriptSanitizer.sanitizeURL(url);
    const targetTabId = tabId || activeTabId;
    
    setCurrentUrl(sanitizedUrl);
    setIsLoadingUrl(true);
    
    await BrowserService.navigate(targetTabId, sanitizedUrl);
  }, [activeTabId]);

  const reload = useCallback(async (tabId?: string) => {
    await BrowserService.reload(tabId || activeTabId);
  }, [activeTabId]);

  const goBack = useCallback(async () => {
    await BrowserService.goBack(activeTabId);
  }, [activeTabId]);

  const goForward = useCallback(async () => {
    await BrowserService.goForward(activeTabId);
  }, [activeTabId]);

  const executeJS = useCallback(async (code: string, tabId?: string): Promise<any> => {
    const validation = ScriptSanitizer.validateScript(code);
    if (!validation.safe) {
      console.warn('[useBrowserEngine] Blocked unsafe script:', validation.reason);
      throw new Error(`Script blocked: ${validation.reason}`);
    }

    try {
      const targetTabId = tabId || activeTabId;
      // Prefer running directly in the <webview> element when available
      const webview = webviewRefs?.current?.[targetTabId];
      if (webview && typeof webview.executeJavaScript === 'function') {
        return await webview.executeJavaScript(code);
      }
      return await BrowserService.executeJS(targetTabId, code);
    } catch (error: any) {
      console.error('[useBrowserEngine] Script execution failed:', error);
      throw error;
    }
  }, [activeTabId, webviewRefs]);

  return {
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
  };
}
