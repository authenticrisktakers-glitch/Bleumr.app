/**
 * ScriptSanitizer - Sanitizes user input before interpolation into executed scripts
 * Prevents XSS and code injection attacks
 */

export class ScriptSanitizer {
  /**
   * Escapes special characters in strings that will be interpolated into JS code
   */
  static escapeForJS(input: string): string {
    return input
      .replace(/\\/g, '\\\\')   // Escape backslashes
      .replace(/'/g, "\\'")     // Escape single quotes
      .replace(/"/g, '\\"')     // Escape double quotes
      .replace(/`/g, '\\`')     // Escape backticks
      .replace(/\n/g, '\\n')    // Escape newlines
      .replace(/\r/g, '\\r')    // Escape carriage returns
      .replace(/\t/g, '\\t')    // Escape tabs
      .replace(/\$/g, '\\$');   // Escape dollar signs (template literals)
  }

  /**
   * Validates and sanitizes CSS selectors
   */
  static sanitizeSelector(selector: string): string {
    // Remove any script tags or event handlers
    if (selector.includes('<') || selector.includes('javascript:') || selector.includes('on')) {
      console.warn('[ScriptSanitizer] Potentially malicious selector detected:', selector);
      return selector.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '');
    }
    return selector;
  }

  /**
   * Validates URLs to prevent javascript: and data: URIs
   */
  static sanitizeURL(url: string): string {
    const trimmed = url.trim().toLowerCase();
    
    // Block dangerous protocols
    const blocked = ['javascript:', 'data:', 'file:', 'vbscript:', 'chrome:', 'chrome-extension:']
    if (blocked.some(p => trimmed.startsWith(p))) {
      console.warn('[ScriptSanitizer] Blocked potentially malicious URL:', url);
      return 'about:blank';
    }

    // Block local/internal network addresses
    const localPatterns = [
      /^https?:\/\/localhost/i,
      /^https?:\/\/127\./,
      /^https?:\/\/0\./,
      /^https?:\/\/10\./,
      /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
      /^https?:\/\/192\.168\./,
      /^https?:\/\/\[::1\]/,
    ]
    if (localPatterns.some(p => p.test(trimmed))) {
      console.warn('[ScriptSanitizer] Blocked internal network URL:', url);
      return 'about:blank';
    }

    // Ensure URL has a valid protocol
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('orbit://')) {
      // Auto-add https:// for bare domains
      return 'https://' + url.trim();
    }

    return url.trim();
  }

  /**
   * Builds a safe script for element interaction
   */
  static buildSafeClickScript(selector: string): string {
    const safeSelector = this.escapeForJS(this.sanitizeSelector(selector));
    return `
      (() => {
        const element = document.querySelector('${safeSelector}');
        if (element) {
          element.click();
          return { success: true };
        }
        return { success: false, error: 'Element not found' };
      })();
    `;
  }

  /**
   * Builds a safe script for typing text
   */
  static buildSafeTypeScript(selector: string, text: string): string {
    const safeSelector = this.escapeForJS(this.sanitizeSelector(selector));
    const safeText = this.escapeForJS(text);
    return `
      (() => {
        const element = document.querySelector('${safeSelector}');
        if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
          element.value = '${safeText}';
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true };
        }
        return { success: false, error: 'Element not found or not an input' };
      })();
    `;
  }

  /**
   * Validates arbitrary script before execution (basic checks)
   */
  static validateScript(script: string): { safe: boolean; reason?: string } {
    // Block obvious eval/Function constructor patterns
    if (script.includes('eval(') || script.includes('Function(')) {
      return { safe: false, reason: 'Script contains eval or Function constructor' };
    }

    // Block attempts to access sensitive APIs
    const dangerousPatterns = [
      /require\s*\(/,
      /import\s*\(/,
      /__dirname/,
      /__filename/,
      /process\./,
      /child_process/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(script)) {
        return { safe: false, reason: 'Script attempts to access restricted APIs' };
      }
    }

    return { safe: true };
  }

  /**
   * Sanitizes user input text (for display, not for script injection)
   */
  static sanitizeText(text: string): string {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
