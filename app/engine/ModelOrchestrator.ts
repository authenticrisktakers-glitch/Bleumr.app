// ─── ModelOrchestrator.ts ──── AI model calling with fallback logic, extracted from App.tsx.

import { SYSTEM_PROMPT, AGENT_MODELS } from './Prompts';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  action?: any;
  isBrowserFeedback?: boolean;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const callAI = async (
  currentMessages: Message[],
  secureApiKey: string | null,
  checkRateLimit: () => boolean,
  signal?: AbortSignal,
  pageUrl?: string,
): Promise<string> => {
  if (!checkRateLimit()) throw new Error('Rate limit reached — max 30 requests/min. Please wait a moment.');

  // Inject current page URL + domain lock rule so the AI never leaves the current site
  let pageContext = '';
  const isHomePage = !pageUrl || pageUrl === 'orbit://home' || pageUrl.startsWith('orbit://');

  if (!isHomePage) {
    try {
      const domain = new URL(pageUrl!).hostname;
      pageContext = `\n\nCurrent page URL: ${pageUrl}\nCurrent domain: ${domain}\n\n⚠️ DOMAIN LOCK: The user is on ${domain}. If the user asks to search, find, look up, or do ANYTHING on this page — do it ON THIS SITE (${domain}) using the site's own search. NEVER navigate to Google, Bing, or any other site unless the user explicitly says "go to [different site]" or "open [different URL]". Stay on ${domain} until explicitly told to leave.`;
    } catch {
      pageContext = `\n\nCurrent page URL: ${pageUrl}`;
    }
  } else {
    // Home screen — check if user's last message has navigation intent.
    // If so, inject a browser-start context so the model enters browser action mode
    // instead of falling into conversational "platform mode".
    const lastUserMsg = currentMessages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    const hasNavIntent = /\b(go to|navigate|open|search|find|browse|visit|look up|check|reddit|youtube|twitter|google|amazon|instagram|facebook|github|wikipedia|news|site|website|url|http)\b/i.test(lastUserMsg);
    if (hasNavIntent) {
      pageContext = `\n\nCurrent page URL: about:blank\nBrowser status: ready, no page loaded yet.\n\n⚠️ BROWSER MODE ACTIVE: The user wants you to navigate somewhere. You MUST output a JSON navigate action as your very first response. Do NOT reply conversationally. Output only: {"action":"navigate","url":"https://..."}`;
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const systemContent = SYSTEM_PROMPT.replace('TODAY_DATE_PLACEHOLDER', `Today is ${todayStr}`) + pageContext;

  // Build message history for the browser agent.
  // CRITICAL: Only include the last 12 messages to prevent old chat-mode responses
  // from contaminating the browser agent context.

  // Always extract the latest [PERCEPTION] message — it must be in context regardless of window
  const latestPerception = currentMessages.slice().reverse().find(m => m.content?.startsWith('[PERCEPTION]'));
  const recentMessages = currentMessages.filter(m => !m.content?.startsWith('[PERCEPTION]')).slice(-12);

  const history: { role: string; content: string }[] = [];

  // Inject perception first so the actor always has grounded page knowledge
  if (latestPerception) {
    history.push({ role: 'user', content: latestPerception.content });
  }

  for (const m of recentMessages) {
    if (m.role === 'user') {
      history.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      if (m.action) {
        // Browser action message — keep the JSON so the LLM knows what was done
        const actionSummary = m.action.action === 'reply'
          ? m.action.message || m.content
          : m.content; // raw JSON action
        history.push({ role: 'assistant', content: actionSummary });
      } else {
        // Pure chat-mode response — strip it to prevent contaminating the browser agent.
        // Replace with a neutral "acknowledged" so the turn alternation stays valid.
        history.push({ role: 'assistant', content: '[Previous conversational response — browser mode now active]' });
      }
    } else if (m.role === 'system' && m.isBrowserFeedback) {
      // Append browser feedback to the last user message or as a new user turn
      if (history.length > 0 && history[history.length - 1].role === 'user') {
        history[history.length - 1].content += `\n${m.content}`;
      } else {
        history.push({ role: 'user', content: m.content });
      }
    }
  }

  const apiMessages = [
    { role: 'system', content: systemContent },
    ...history,
  ];

  const authKey = secureApiKey;
  if (!authKey) throw new Error('No API key configured. Add your key in Settings.');

  let res: Response | null = null;
  for (const model of AGENT_MODELS) {
    const attempt = await fetch(GROQ_URL, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authKey}` },
      body: JSON.stringify({ model, messages: apiMessages, temperature: 0.1, max_tokens: 2000 }),
    });
    if (attempt.ok || attempt.status === 429) { res = attempt; break; }
    const err = await attempt.json().catch(() => ({}));
    const msg = err.error?.message || '';
    const isModelError = attempt.status === 403 || attempt.status === 404 ||
      (attempt.status === 400 && (msg.includes('model') || msg.includes('not found') || msg.includes('blocked')));
    if (!isModelError) { res = attempt; break; } // non-model error — surface it
  }
  if (!res) throw new Error('No available Groq models. Check your API key.');

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `AI request failed (${res.status})`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
};
