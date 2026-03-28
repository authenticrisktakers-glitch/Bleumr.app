// ─── Perceiver.ts ──── DOM scanning, Set-of-Marks vision, and page perception, extracted from App.tsx.

import { buildVisionPrompt } from './Prompts';

// ─── Constants ───

export const analyzeWithVision = async (base64: string, prompt: string, secureApiKey: string | null): Promise<string> => {
    if (!secureApiKey) return 'Vision unavailable: no API key configured.';
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secureApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
            ],
          }],
          max_tokens: 1500,
          temperature: 0.2,
        }),
      });
      if (!res.ok) {
        // Fall back to llama-4-maverick if scout is unavailable
        const retry = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${secureApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
            messages: [{ role: 'user', content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
            ]}],
            max_tokens: 1500, temperature: 0.2,
          }),
        });
        if (!retry.ok) return `Vision analysis failed (${res.status})`;
        const d = await retry.json();
        return d.choices?.[0]?.message?.content || 'No analysis returned.';
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No analysis returned.';
    } catch (e: any) {
      return `Vision error: ${e.message}`;
    }
  };

  // ─── PERCEIVER ENGINE ─────────────────────────────────────────────────────
  // Runs before each ACTOR decision. Combines DOM scanning + Set-of-Marks (SoM)
  // annotated vision to give the actor a grounded view of the page.

  // DOM scan script — extracted so it's reusable by both perceiver and read_page action
  // Comprehensive scanner: catches inputs, buttons, links, ARIA roles, contenteditable,
  // SVG icon buttons, class-based buttons, media controls, and click-handler elements.
export const READ_PAGE_SCRIPT = `(function() {
    let idCounter = 1;
    const seen = new WeakSet();
    const results = [];
    document.querySelectorAll('[data-orbit-id]').forEach(el => el.removeAttribute('data-orbit-id'));

    // ── TIER 1: standard interactive elements ──
    const SELECTORS = [
      'input:not([type="hidden"])', 'button', 'a[href]', 'textarea', 'select', 'option',
      '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
      '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
      '[role="option"]', '[role="tab"]', '[role="switch"]', '[role="slider"]',
      '[role="textbox"]', '[role="combobox"]', '[role="searchbox"]', '[role="spinbutton"]',
      '[role="listbox"]', '[role="dialog"]', '[role="alertdialog"]', '[role="toolbar"]',
      '[role="navigation"]', '[role="treeitem"]',
      '[contenteditable="true"]', '[contenteditable=""]', '[contenteditable="plaintext-only"]',
      '[tabindex]:not([tabindex="-1"])',
      'label', 'summary', 'details',
      'h1', 'h2', 'h3', 'h4',
      '[data-testid]', '[onclick]', '[data-action]', '[data-click]', '[data-handler]',
      '[aria-haspopup]', '[aria-expanded]', '[aria-controls]', '[aria-pressed]',
      'img[alt]', 'svg[aria-label]', 'video', 'audio',
    ];

    // ── TIER 2: heuristic scan for click-handler elements that look interactive ──
    // Catches modern SPA elements: divs/spans with cursor:pointer, icon buttons, etc.
    const CLICKABLE_CURSOR_STYLES = ['pointer'];
    const BUTTON_CLASS_PATTERNS = /btn|button|clickable|toggle|action|icon-|toolbar|compose|send|attach|emoji|upload|submit/i;

    function scoreEl(el) {
      const tag = el.tagName.toLowerCase();
      if (['input','textarea','select'].includes(tag)) return 12;
      if (tag === 'button') return 11;
      if (tag === 'a') return 10;
      const role = el.getAttribute('role') || '';
      if (['textbox','searchbox','combobox','spinbutton'].includes(role)) return 12;
      if (['button','link','tab','menuitem','menuitemcheckbox','menuitemradio','checkbox','option','switch','radio','slider'].includes(role)) return 10;
      if (el.getAttribute('contenteditable') !== null) return 11;
      if (['img','svg','video','audio'].includes(tag)) return 7;
      if (el.getAttribute('aria-haspopup') || el.getAttribute('aria-expanded') !== null) return 8;
      if (el.getAttribute('tabindex') !== null) return 7;
      if (el.getAttribute('data-testid')) return 6;
      if (el.getAttribute('onclick') || el.getAttribute('data-action') || el.getAttribute('data-click')) return 6;
      if (['h1','h2','h3','h4','label','summary'].includes(tag)) return 3;
      return 2;
    }

    function getDesc(el) {
      const tag = el.tagName.toLowerCase();
      const ariaLabel = el.getAttribute('aria-label') || '';
      const placeholder = el.placeholder || el.getAttribute('placeholder') || '';
      const title = el.getAttribute('title') || '';
      const alt = el.getAttribute('alt') || '';
      const ariaDesc = el.getAttribute('aria-description') || '';
      const testId = el.getAttribute('data-testid') || '';
      const name = el.getAttribute('name') || '';
      const type = el.getAttribute('type') || '';
      const value = el.value && typeof el.value === 'string' ? el.value.trim().substring(0, 30) : '';
      // For text content, prefer direct child text to avoid pulling long nested content
      let rawText = '';
      if (el.childNodes.length <= 3) {
        rawText = (el.innerText || el.textContent || '').trim().replace(/\\s+/g,' ').substring(0, 80);
      } else {
        // Complex element — take only direct text nodes
        for (const child of el.childNodes) {
          if (child.nodeType === 3) rawText += child.textContent;
        }
        rawText = rawText.trim().replace(/\\s+/g,' ').substring(0, 80);
        if (!rawText) rawText = (el.innerText || '').trim().replace(/\\s+/g,' ').substring(0, 80);
      }
      // For SVGs, try to find a child <title> element
      if (tag === 'svg' && !ariaLabel) {
        const svgTitle = el.querySelector('title');
        if (svgTitle) return svgTitle.textContent.trim().substring(0, 60);
      }
      // Build description with most informative field first
      const desc = ariaLabel || placeholder || alt || title || ariaDesc || rawText || testId || name || value;
      if (!desc || desc.length === 0) {
        // Last resort: check parent for context
        const parent = el.parentElement;
        if (parent) {
          const pLabel = parent.getAttribute('aria-label') || parent.getAttribute('title') || '';
          if (pLabel) return pLabel.substring(0, 60) + ' (child ' + tag + ')';
        }
        return type || tag;
      }
      return desc;
    }

    function processEl(el) {
      if (seen.has(el)) return;
      seen.add(el);
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.05) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      if (rect.top > window.innerHeight + 300 || rect.bottom < -100) return;
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type') || '';
      const desc = getDesc(el);
      if (!desc || desc.length === 0) return;

      const orbId = idCounter++;
      el.setAttribute('data-orbit-id', String(orbId));
      const hints = [];
      if (type) hints.push('type=' + type);
      const testId = el.getAttribute('data-testid') || '';
      if (testId) hints.push('testid=' + testId);
      if (el.id) hints.push('#' + el.id);
      const role = el.getAttribute('role');
      if (role) hints.push('role=' + role);
      if (el.getAttribute('contenteditable') !== null) hints.push('editable');
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') hints.push('DISABLED');
      if (el.getAttribute('aria-expanded') !== null) hints.push('expanded=' + el.getAttribute('aria-expanded'));
      const elTag = type ? type.toUpperCase() : tag.toUpperCase();
      results.push({
        id: orbId, score: scoreEl(el),
        tag: elTag,
        text: desc.substring(0, 100),
        hints: hints.join(' '),
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    }

    // Phase 1: explicit selectors
    SELECTORS.forEach(sel => { try { document.querySelectorAll(sel).forEach(processEl); } catch(e) {} });

    // Phase 2: shadow DOM traversal
    document.querySelectorAll('*').forEach(host => {
      if (host.shadowRoot) { SELECTORS.forEach(sel => { try { host.shadowRoot.querySelectorAll(sel).forEach(processEl); } catch(e) {} }); }
    });

    // Phase 3: heuristic scan — elements with cursor:pointer or button-like classes
    // that weren't caught by the explicit selectors above
    document.querySelectorAll('div, span, li, td, svg, img, i, path').forEach(el => {
      if (seen.has(el)) return;
      const style = window.getComputedStyle(el);
      const hasPointerCursor = style.cursor === 'pointer';
      const className = (el.className && typeof el.className === 'string') ? el.className : '';
      const hasButtonClass = BUTTON_CLASS_PATTERNS.test(className);
      const hasClickEvent = el.getAttribute('onclick') || el.getAttribute('data-action') || el.getAttribute('data-click');
      if (hasPointerCursor || hasButtonClass || hasClickEvent) processEl(el);
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 200).map(e =>
      '[' + e.id + '] ' + e.tag + ': "' + e.text + '"' +
      (e.hints ? ' (' + e.hints + ')' : '') +
      ' @(' + e.x + ',' + e.y + ') ' + e.w + 'x' + e.h
    );
  })();`;

  // SoM (Set-of-Marks) overlay — draws numbered markers on every detected element for vision model
  // Markers are bright for screenshot readability but get removed immediately after capture
export const SOM_INJECT_SCRIPT = `(function() {
    document.querySelectorAll('.orbit-som-marker').forEach(el => el.remove());
    document.querySelectorAll('[data-orbit-id]').forEach(el => {
      const id = el.getAttribute('data-orbit-id');
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      if (rect.top > window.innerHeight + 50 || rect.bottom < -50) return;
      // Draw a thin outline around the element
      el.style.outline = '2px solid rgba(220,38,38,0.7)';
      el.style.outlineOffset = '1px';
      // Place numbered label
      const marker = document.createElement('div');
      marker.className = 'orbit-som-marker';
      marker.textContent = id;
      marker.style.cssText = 'position:fixed;left:' + Math.round(rect.x) + 'px;top:' + Math.max(0, Math.round(rect.y - 16)) + 'px;background:rgba(220,38,38,0.95);color:#fff;font:bold 11px/16px monospace;padding:0 4px;border-radius:3px;z-index:999999;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,0.4);';
      document.body.appendChild(marker);
    });
  })();`;

  // Aggressive cleanup — removes ALL SoM artifacts. Called after screenshot + in finally block.
export const SOM_REMOVE_SCRIPT = `(function(){
    document.querySelectorAll('.orbit-som-marker').forEach(el=>el.remove());
    document.querySelectorAll('[data-orbit-id]').forEach(el=>{
      el.style.outline='';
      el.style.outlineOffset='';
    });
  })();`;

  /**
   * perceivePage — the PERCEIVER engine.
   * Phase 1: Deep DOM scan → assigns data-orbit-id to all interactive elements.
   * Phase 2: Inject SoM numbered overlays → take annotated screenshot → send to vision model.
   * Returns a structured perception string that the ACTOR uses to decide its next action.
   */
export interface PerceiverDeps {
  executeJS: (code: string) => Promise<any>;
  secureApiKey: string | null;
  activeTabId: string | number | null;
}

export const perceivePage = async (deps: PerceiverDeps, taskContext?: string): Promise<string> => {
    const { executeJS, secureApiKey, activeTabId } = deps;
    let perception = '';

    // Always remove stale SoM markers from any previous run before starting fresh
    try { await executeJS(SOM_REMOVE_SCRIPT); } catch {}

    // Phase 1: DOM Scan
    let elementList: string[] = [];
    try {
      const elements = await executeJS(READ_PAGE_SCRIPT);
      if (elements && elements.length > 0) {
        elementList = elements;
        perception = `ELEMENTS (${elements.length} found):\n` + elements.join('\n');
      } else {
        perception = 'ELEMENTS: None found. Page may be loading or protected.';
      }
    } catch (e: any) {
      perception = `DOM scan failed: ${e.message}`;
    }

    // Phase 2: SoM Vision (only if screenshot API + API key available)
    // Markers are injected → screenshot captured → markers removed immediately.
    // Safety timeout ensures markers NEVER stay visible even if screenshot or vision fails.
    try {
      const orbitBrowser = (window as any).orbit?.browser;
      if (orbitBrowser?.screenshot && secureApiKey && elementList.length > 0) {
        // Inject numbered overlays
        await executeJS(SOM_INJECT_SCRIPT);
        await new Promise(r => setTimeout(r, 200)); // let overlays render

        // Safety: auto-remove markers after 3 seconds no matter what
        const safetyTimer = setTimeout(async () => {
          try { await executeJS(SOM_REMOVE_SCRIPT); } catch {}
        }, 3000);

        // Capture annotated screenshot
        let snap: any = null;
        try {
          snap = await orbitBrowser.screenshot(activeTabId);
        } finally {
          // Remove overlays immediately after capture — user should never see them
          clearTimeout(safetyTimer);
          try { await executeJS(SOM_REMOVE_SCRIPT); } catch {}
        }

        if (snap?.success && snap.base64) {
          const visionPrompt = buildVisionPrompt(taskContext);

          const analysis = await analyzeWithVision(snap.base64, visionPrompt, secureApiKey);
          if (analysis && !analysis.startsWith('Vision error') && !analysis.startsWith('Vision unavailable')) {
            perception += '\n\nVISION:\n' + analysis;
          }
        }
      }
    } catch (e: any) {
      // Vision failed — DOM-only perception is still useful
      perception += '\n\n(Vision scan skipped: ' + (e.message || 'unavailable') + ')';
    }

    return perception;
  };
