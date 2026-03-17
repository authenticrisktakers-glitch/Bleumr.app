import { AutomationLogger } from './AutomationLogger';
import { ElectronRPC } from './ElectronRPC';

export interface SelectorFallback {
  primary: string;
  cssFallback?: string[];
  textMatch?: string;
  xpath?: string;
}

export class SmartSelector {
  static findElement(strategy: SelectorFallback, context: Document | Element | ShadowRoot = document): Element | null {
    AutomationLogger.log('DEBUG', 'LOCATING_ELEMENT', { strategy });

    // 1. Primary CSS
    try {
      const el = context.querySelector(strategy.primary);
      if (el) return el;
    } catch (e) { /* ignore invalid selectors */ }

    // 2. CSS Fallbacks
    if (strategy.cssFallback) {
      for (const fallback of strategy.cssFallback) {
        try {
          const el = context.querySelector(fallback);
          if (el) return el;
        } catch (e) {}
      }
    }

    // 3. Text Matching (Fuzzy)
    if (strategy.textMatch) {
      // Find all elements that might contain text
      const elements = Array.from(context.querySelectorAll('button, a, span, div, p, input, label'));
      const textMatch = strategy.textMatch.toLowerCase();
      
      for (const el of elements) {
        if (el.textContent?.toLowerCase().includes(textMatch) || 
            (el as HTMLInputElement).value?.toLowerCase().includes(textMatch)) {
          return el;
        }
      }
    }

    // 4. XPath fallback (if strictly specified)
    if (strategy.xpath && context === document) {
      try {
        const result = document.evaluate(strategy.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue) return result.singleNodeValue as Element;
      } catch (e) {}
    }

    // 5. Check inside open shadow DOMs (naive traversal - extended in real env)
    
    AutomationLogger.log('WARN', 'ELEMENT_NOT_FOUND', { strategy });
    return null;
  }
}