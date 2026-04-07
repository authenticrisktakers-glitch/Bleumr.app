// ─── VisionGuide — Stateful vision agent with memory, change detection, step tracking ──
// Turns JUMARI from a frame-by-frame describer into an interactive guide that
// remembers what it's seen, tracks what changed, and walks users through tasks.

import type { VisionFrame } from './VisionService';
import { detectVisionMode, getModePrompt, updateModeState, createModeState, SAFETY_OVERLAY, type VisionMode, type VisionModeState } from './VisionModes';

// ─── State Machine ───────────────────────────────────────────────────────────

export type GuidePhase = 'observe' | 'identify' | 'task' | 'guide' | 'complete';

export interface VisionGuideState {
  phase: GuidePhase;
  /** What JUMARI identified as the subject (e.g. "MacBook Pro logic board") */
  subject: string | null;
  /** What the user wants help with (e.g. "replace the battery") */
  task: string | null;
  /** Current step index (0-based) */
  currentStep: number;
  /** Steps JUMARI has given so far */
  steps: string[];
  /** Objects detected and registered — won't be re-announced */
  objectRegistry: Map<string, ObjectEntry>;
  /** Last N frame descriptions for change detection */
  frameBuffer: FrameMemory[];
  /** Conversation context built across frames */
  conversationContext: string[];
  /** Active vision mode (shop, cook, safety, compare, fitness, reader, inventory) */
  modeState: VisionModeState;
}

export interface ObjectEntry {
  name: string;
  firstSeen: number;
  lastSeen: number;
  description: string;
  position?: string;
}

export interface FrameMemory {
  timestamp: number;
  description: string;
  detectedObjects: string[];
  userAction?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FRAME_BUFFER = 10;
const MAX_CONTEXT_LINES = 16;
const MAX_STEPS = 30;

// ─── Create / Reset ──────────────────────────────────────────────────────────

export function createGuideState(): VisionGuideState {
  return {
    phase: 'observe',
    subject: null,
    task: null,
    currentStep: 0,
    steps: [],
    objectRegistry: new Map(),
    frameBuffer: [],
    conversationContext: [],
    modeState: createModeState(),
  };
}

export function resetGuideState(state: VisionGuideState): VisionGuideState {
  return createGuideState();
}

// ─── Phase Transitions ───────────────────────────────────────────────────────

export function advancePhase(state: VisionGuideState, input: {
  userText?: string;
  aiResponse?: string;
}): VisionGuideState {
  const { userText, aiResponse } = input;
  const t = (userText || '').toLowerCase();

  // Auto-detect vision mode from user speech
  if (userText) {
    const detectedMode = detectVisionMode(userText, state.modeState.active);
    if (detectedMode && detectedMode !== state.modeState.active) {
      state = { ...state, modeState: { ...state.modeState, active: detectedMode } };
      console.log('[VisionGuide] Mode switched to:', detectedMode);
    }
  }

  // Update mode-specific state from AI response
  if (aiResponse) {
    state = { ...state, modeState: updateModeState(state.modeState, aiResponse, userText) };
  }

  switch (state.phase) {
    case 'observe':
      // Move to identify once JUMARI has seen and described something
      if (aiResponse && aiResponse.length > 10) {
        return { ...state, phase: 'identify' };
      }
      // User directly states a task — skip to guide
      if (userText) {
        const taskIntent = extractTaskIntent(t);
        if (taskIntent) {
          return { ...state, phase: 'guide', task: taskIntent, subject: state.subject || extractSubject(t) };
        }
      }
      break;

    case 'identify':
      if (userText) {
        const taskIntent = extractTaskIntent(t);
        if (taskIntent) {
          return { ...state, phase: 'guide', task: taskIntent, subject: state.subject || extractSubject(t) };
        }
        const subj = extractSubject(t);
        if (subj) {
          return { ...state, phase: 'task', subject: subj };
        }
        // Any substantial user input moves forward — don't get stuck
        if (t.length > 3) {
          return { ...state, phase: 'task', subject: state.subject || t };
        }
      }
      break;

    case 'task':
      if (userText) {
        const taskIntent = extractTaskIntent(t);
        if (taskIntent) {
          return { ...state, phase: 'guide', task: taskIntent };
        }
        // Any instruction-like input transitions to guide
        if (t.length > 5) {
          return { ...state, phase: 'guide', task: userText };
        }
      }
      break;

    case 'guide':
      if (userText && isDoneSignal(t)) {
        return { ...state, phase: 'complete' };
      }
      if (aiResponse && state.currentStep < MAX_STEPS) {
        return { ...state, currentStep: state.currentStep + 1, steps: [...state.steps, aiResponse] };
      }
      break;

    case 'complete':
      if (userText && userText.length > 5) {
        return createGuideState();
      }
      break;
  }

  return state;
}

// ─── Frame Memory ────────────────────────────────────────────────────────────

export function addFrameMemory(
  state: VisionGuideState,
  description: string,
  detectedObjects: string[],
  userAction?: string,
): VisionGuideState {
  const entry: FrameMemory = {
    timestamp: Date.now(),
    description,
    detectedObjects,
    userAction,
  };

  const buffer = [...state.frameBuffer, entry].slice(-MAX_FRAME_BUFFER);

  const registry = new Map(state.objectRegistry);
  for (const obj of detectedObjects) {
    const key = obj.toLowerCase().trim();
    const existing = registry.get(key);
    if (existing) {
      registry.set(key, { ...existing, lastSeen: Date.now() });
    } else {
      registry.set(key, { name: obj, firstSeen: Date.now(), lastSeen: Date.now(), description: '' });
    }
  }

  return { ...state, frameBuffer: buffer, objectRegistry: registry };
}

// ─── Change Detection ────────────────────────────────────────────────────────

export function detectChanges(state: VisionGuideState): string {
  if (state.frameBuffer.length < 2) return '';

  const prev = state.frameBuffer[state.frameBuffer.length - 2];
  const curr = state.frameBuffer[state.frameBuffer.length - 1];

  const prevSet = new Set(prev.detectedObjects.map(o => o.toLowerCase()));
  const currSet = new Set(curr.detectedObjects.map(o => o.toLowerCase()));

  const added = curr.detectedObjects.filter(o => !prevSet.has(o.toLowerCase()));
  const removed = prev.detectedObjects.filter(o => !currSet.has(o.toLowerCase()));

  const parts: string[] = [];
  if (removed.length) parts.push(`GONE/REMOVED: ${removed.join(', ')}`);
  if (added.length) parts.push(`NOW VISIBLE: ${added.join(', ')}`);
  if (curr.userAction) parts.push(`User did: ${curr.userAction}`);

  return parts.join('. ');
}

// ─── Conversation Context ────────────────────────────────────────────────────

export function addContext(state: VisionGuideState, line: string): VisionGuideState {
  const context = [...state.conversationContext, line].slice(-MAX_CONTEXT_LINES);
  return { ...state, conversationContext: context };
}

// ─── Frame History as Text (the KEY missing piece) ───────────────────────────
// Since the vision model only sees the current frame, we inject previous
// frame descriptions as text so it knows what it saw before.

function buildFrameHistoryBlock(state: VisionGuideState): string {
  if (state.frameBuffer.length === 0) return '';

  const recent = state.frameBuffer.slice(-4);
  const lines = recent.map((f, i) => {
    const ago = Math.round((Date.now() - f.timestamp) / 1000);
    const label = i === recent.length - 1 ? 'YOUR LAST RESPONSE' : `${ago}s ago`;
    return `[${label}]: ${f.description.slice(0, 150)}`;
  });

  // In guide phase, make step comparison crystal clear
  if (state.phase === 'guide' && state.steps.length > 0) {
    const lastStep = state.steps[state.steps.length - 1];
    return `\n\nYOUR LAST INSTRUCTION TO THEM WAS: "${lastStep.slice(0, 120)}"

NOW LOOK AT THE CURRENT IMAGE AND DECIDE:
- Did they FINISH that step? → Say "good, that's done" or "nice, got it" then give the NEXT step.
- Are they STILL WORKING on it? → Encourage: "almost" or "keep going" or give a tip.
- Did something go WRONG? → Warn them immediately.
- Did they SKIP ahead or do something different? → Acknowledge what they did and adjust.

YOUR MEMORY (what you said before):
${lines.join('\n')}`;
  }

  return `\n\nYOUR MEMORY (what you said before — don't repeat):
${lines.join('\n')}
IMPORTANT: Compare the current image to your memory. React to what CHANGED. If the user did something, acknowledge it. Don't describe the same scene again.`;
}

// ─── System Prompt Builder ───────────────────────────────────────────────────

export function buildVisionSystemPrompt(state: VisionGuideState): string {
  const base = `You're JUMARI — physically present, looking through the camera at the same thing they are.

ABSOLUTE RULES:
- Spoken out loud through a speaker. Write like you talk.
- 1-3 sentences. No markdown, no lists, no asterisks, no bullets.
- Be SPECIFIC — name the exact part, brand, color, position.
- React like a person: "oh nice, you got that screw out" not "I can observe that the screw has been removed from the assembly."

BANNED PHRASES (never say these):
- "zoom in" / "zoom out" / "move closer" / "get a better angle" — unless you genuinely cannot identify ANYTHING
- "I can see" / "I notice" / "I observe" / "it appears" / "the image shows"
- "based on what I can see" / "from this angle" / "in the frame"
- Don't narrate the image. React to it. There's a difference.

YOU HAVE MEMORY. You remember what you saw in previous frames. When the user does something (removes a part, moves something, flips the device), ACKNOWLEDGE THE CHANGE instead of describing everything from scratch.`;

  let phasePrompt = '';

  switch (state.phase) {
    case 'observe':
      phasePrompt = `\n\nFIRST LOOK — Identify what you see specifically. "Alright, that's a [specific thing]" — then ask what they need. One sentence ID, one sentence ask.`;
      break;

    case 'identify':
      phasePrompt = `\n\nYou already looked at this${state.subject ? ` — it's ${state.subject}` : ''}. The user is talking to you about it. Respond to what they said. Don't re-describe the object. Ask what they need help with if they haven't said.`;
      break;

    case 'task':
      phasePrompt = `\n\nYou're looking at${state.subject ? ` ${state.subject}` : ' something'} but they haven't told you what they need yet. Ask: "what are we doing with this?" or "what do you need help with?"`;
      break;

    case 'guide': {
      const lastStep = state.steps.length > 0 ? state.steps[state.steps.length - 1] : null;
      const stepList = state.steps.length > 0
        ? `\nSTEPS COMPLETED SO FAR:\n${state.steps.map((s, i) => `  ${i + 1}. ${s.slice(0, 80)}`).join('\n')}`
        : '';

      phasePrompt = `\n\nACTIVE TASK: ${state.task || 'helping them'}${state.subject ? ` on ${state.subject}` : ''}
YOU ARE ON STEP: ${state.currentStep + 1}${stepList}
${lastStep ? `\nYOUR LAST INSTRUCTION: "${lastStep.slice(0, 120)}"` : ''}

YOUR JOB RIGHT NOW:
1. LOOK at the current image
2. ${lastStep ? `DECIDE: did they finish "${lastStep.slice(0, 60)}"?` : 'Figure out what step they need first'}
3. If YES → say "good, that's done" or "nice" then give the NEXT step
4. If NO → help them finish it: point to the exact part, tell them exactly what to do
5. If WRONG → warn immediately: "wait, stop" + what's wrong

RESPONSE FORMAT: [acknowledge what happened] + [next instruction]
Example: "alright that screw's out — now pull the ribbon cable connector up gently, it's right there on the left"
Example: "good you got the cover off — see those two Phillips screws holding the battery? start with the one on the right"

NEVER give generic instructions. Reference what you SEE in the image.`;
      break;
    }

    case 'complete':
      phasePrompt = `\n\nTask done. Quick confirmation — "looks good" or note anything that needs attention.`;
      break;
  }

  // Known objects — don't re-announce
  let memoryBlock = '';
  if (state.objectRegistry.size > 0) {
    const known = Array.from(state.objectRegistry.values()).map(o => o.name).slice(0, 12).join(', ');
    memoryBlock = `\n\nALREADY IDENTIFIED (don't re-announce): ${known}`;
  }

  // Frame history as text — gives the model memory
  const frameHistory = buildFrameHistoryBlock(state);

  // Change detection
  const changes = detectChanges(state);
  const changeBlock = changes
    ? `\n\nCHANGES DETECTED: ${changes}. REACT TO THIS — acknowledge what the user did.`
    : '';

  // Conversation context
  let contextBlock = '';
  if (state.conversationContext.length > 0) {
    contextBlock = `\n\nCONVERSATION SO FAR:\n${state.conversationContext.slice(-8).join('\n')}`;
  }

  // Vision mode — specialized capability prompt
  const modePrompt = getModePrompt(state.modeState);
  const safetyLayer = state.modeState.active !== 'safety' ? SAFETY_OVERLAY : '';

  return base + phasePrompt + modePrompt + safetyLayer + frameHistory + memoryBlock + changeBlock + contextBlock;
}

// ─── Guide Loop Prompt (for automatic 2s tick) ──────────────────────────────
// Separate from the main prompt because guide ticks are autonomous (no user speech)

export function buildGuideTickPrompt(state: VisionGuideState, target: string): string {
  const lastStep = state.steps.length > 0 ? state.steps[state.steps.length - 1] : null;
  const stepList = state.steps.length > 0
    ? state.steps.slice(-4).map((s, i) => `${state.currentStep - state.steps.slice(-4).length + i + 1}. ${s.slice(0, 80)}`).join('\n')
    : '(no steps yet)';

  const frameHistory = state.frameBuffer.slice(-3).map((f, i) => {
    const ago = Math.round((Date.now() - f.timestamp) / 1000);
    return `[${ago}s ago]: ${f.description.slice(0, 120)}`;
  }).join('\n');

  return `You're JUMARI, physically guiding someone step by step through their camera.

TASK: ${target}
${state.subject ? `WORKING ON: ${state.subject}` : ''}
STEP NUMBER: ${state.currentStep + 1}

${lastStep ? `YOUR LAST INSTRUCTION WAS: "${lastStep.slice(0, 120)}"

LOOK AT THE IMAGE NOW. Did they do it?
- YES → Say "good" or "nice" + give the NEXT step
- NO/STILL WORKING → Encourage or clarify what to do
- SOMETHING WRONG → Warn them immediately` : 'FIRST LOOK — identify what you see and give the first instruction.'}

STEPS SO FAR:
${stepList}

WHAT YOU SAW BEFORE:
${frameHistory || '(first look)'}

RULES:
- ALWAYS acknowledge progress before giving the next step. "good, that's out — now [next thing]"
- Be spatial and specific. "the Phillips screw top-right" not "remove the screw"
- Reference things IN the image. "next to the black cable", "under that bracket"
- If the task is done/target found: end with FOUND
- ONE step at a time. Short. Spoken out loud. No markdown.
- NEVER say "zoom in", "get closer", "better angle"`;
}

// ─── Intent Detection Helpers ────────────────────────────────────────────────

function extractTaskIntent(text: string): string | null {
  const taskPatterns = [
    /(?:help me|i need to|i want to|how do i|can you help|walk me through|guide me through|show me how to)\s+(.+)/i,
    /(?:take .+ apart|disassemble|reassemble|replace|remove|install|fix|repair|clean|open|close|connect|disconnect|attach|detach)\b/i,
    /(?:step by step|instructions for|guide for|how to)\s+(.+)/i,
    /(?:what'?s next|next step|what do i do|now what)/i,
  ];

  for (const pattern of taskPatterns) {
    const match = text.match(pattern);
    if (match) return match[1] || text;
  }
  return null;
}

function extractSubject(text: string): string | null {
  const subjectPatterns = [
    /(?:it'?s|that'?s|this is|looking at|i have|it is)\s+(?:a |an |the |my )?(.+)/i,
    /^(?:a |an |the |my )?([a-z][\w\s]{2,30})$/i,
  ];

  for (const pattern of subjectPatterns) {
    const match = text.match(pattern);
    if (match) return match[1]?.trim() || null;
  }
  return null;
}

function isDoneSignal(text: string): boolean {
  return /(?:done|finished|that'?s it|all good|perfect|thanks|thank you|we'?re? good|completed|nailed it|got it done)/.test(text);
}

// ─── Parse AI response for detected objects ──────────────────────────────────

export function extractObjectsFromResponse(response: string): string[] {
  const objects: string[] = [];

  // Quoted items
  const quoted = response.match(/["']([^"']{3,40})["']/g);
  if (quoted) objects.push(...quoted.map(q => q.replace(/["']/g, '')));

  // Hardware/object patterns — expanded list
  const patterns = [
    /\b((?:the |a |this |that )?(?:screw|bolt|nut|washer|cable|wire|connector|ribbon|board|chip|fan|battery|screen|panel|cover|bracket|clip|latch|tab|hinge|port|slot|button|switch|LED|capacitor|resistor|fuse|heatsink|thermal pad|speaker|antenna|SSD|HDD|RAM|SIM|flex cable|logic board|motherboard|display|digitizer|housing|bezel|gasket|adhesive|motor|pump|filter|valve|pipe|tube|gear|spring|shaft|bearing|piston|rotor|stator|coil|relay|sensor|thermostat|compressor|condenser|evaporator|radiator|alternator|carburetor|spark plug|brake pad|caliper|rotor disc|belt|chain|pulley|handle|knob|lever|dial|gauge|meter|faucet|nozzle|fitting|joint|seal|o-ring|clamp|bracket)(?:\s+\w+)?)\b/gi,
  ];

  for (const pattern of patterns) {
    const matches = response.match(pattern);
    if (matches) objects.push(...matches.map(m => m.trim()));
  }

  return [...new Set(objects.map(o => o.toLowerCase().replace(/^(the|a|this|that)\s+/, '')))].slice(0, 10);
}
