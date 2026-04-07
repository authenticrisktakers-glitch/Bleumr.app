// ─── VisionModes — 7 specialized vision capabilities with auto-detection ─────
// Each mode has: trigger detection, specialized system prompt, and behaviors.
// JUMARI auto-detects which mode to use from user speech + what she sees.

export type VisionMode =
  | 'general'        // default — identify, describe, react
  | 'shop'           // Snap & Shop — product ID + price lookup
  | 'cook'           // Ingredient scan → recipe → step-by-step cooking guide
  | 'safety'         // Proactive hazard/safety alerts (always-on layer)
  | 'compare'        // Before/After snapshot comparison
  | 'fitness'        // Workout form coaching + rep counting
  | 'reader'         // Text/code/label/serial number reading
  | 'inventory';     // Scan and catalog objects for later recall

export interface VisionModeState {
  active: VisionMode;
  /** Snapshot stored for before/after compare */
  compareSnapshot: string | null;
  /** Timestamp of snapshot */
  compareTimestamp: number | null;
  /** Inventory items cataloged during inventory mode */
  inventoryItems: string[];
  /** Fitness rep count */
  fitnessReps: number;
  /** Fitness exercise name */
  fitnessExercise: string | null;
  /** Shopping product identified */
  shopProduct: string | null;
  /** Cooking ingredients identified */
  cookIngredients: string[];
}

// ─── Create ──────────────────────────────────────────────────────────────────

export function createModeState(): VisionModeState {
  return {
    active: 'general',
    compareSnapshot: null,
    compareTimestamp: null,
    inventoryItems: [],
    fitnessReps: 0,
    fitnessExercise: null,
    shopProduct: null,
    cookIngredients: [],
  };
}

// ─── Auto-detect mode from user speech ───────────────────────────────────────
// Analyzes what the user said to figure out which vision mode to activate.
// Returns null if no specific mode detected (stays in current mode).

export function detectVisionMode(userText: string, currentMode: VisionMode): VisionMode | null {
  const t = userText.toLowerCase();

  // ── Shop mode triggers
  if (/how much|what brand|what is this|price|cost|where can i (buy|get|find)|identify this (product|item|thing)|what model|look.? this up|find.? (cheaper|deal|online)|compare price/i.test(t)) {
    return 'shop';
  }

  // ── Cook mode triggers
  if (/what can i (make|cook)|recipe|ingredient|cook|bake|prepare|meal|dish|food|what('?s| is) (in|on) (the|my) (counter|table|fridge|pantry)|what do i have to (cook|eat|work) with/i.test(t)) {
    return 'cook';
  }

  // ── Safety mode triggers (explicit activation — also runs passively)
  if (/is (this|that|it) safe|dangerous|hazard|warning|careful|risk|toxic|flammable|live wire|exposed|chemical|poison|voltage|electric|shock/i.test(t)) {
    return 'safety';
  }

  // ── Compare mode triggers
  if (/remember this|save this|snapshot|before.?after|how does it look now|compare|did i (fix|do|finish)|check my (work|progress)|how('?d| did) i do/i.test(t)) {
    return 'compare';
  }

  // ── Fitness mode triggers
  if (/watch my form|count my (reps?|sets?|push.?ups?|pull.?ups?|squats?|sit.?ups?|curls?)|am i doing (this|it) right|check my (form|posture|technique)|workout|exercise|rep|set|deadlift|bench|squat|plank|lunge|crunch/i.test(t)) {
    return 'fitness';
  }

  // ── Reader mode triggers
  if (/read (this|that|it)|what does (this|that|it) say|translate|serial number|model number|error (code|message)|what('?s| is) (written|printed)|scan (this|that|the)|barcode|qr.?code|label|instructions|manual|part number|expir|ingredient list|nutrition|warning label/i.test(t)) {
    return 'reader';
  }

  // ── Inventory mode triggers
  if (/scan (my|the|this)|catalog|inventory|what('?s| is) (in|inside) (my|the|this)|list everything|what do i have|check (my|the) (toolbox|drawer|cabinet|shelf|bag|kit|box|pantry|fridge|closet)|do i have a/i.test(t)) {
    return 'inventory';
  }

  return null;
}

// ─── Mode-specific system prompt additions ───────────────────────────────────
// These get appended to the VisionGuide system prompt when a mode is active.

export function getModePrompt(state: VisionModeState): string {
  switch (state.active) {
    case 'shop':
      return `
VISION MODE: SNAP & SHOP
You are identifying products for the user. Your job:
1. IDENTIFY the product precisely — brand, model, color, size, variant. Be exact: "Nike Air Max 90 in white/black, men's" not "some sneakers."
2. If you recognize it, state the typical retail price from your knowledge.
3. The app will silently search for prices — when research context is provided, naturally mention the best deal you found. Say it casually: "these usually go for $120 but I found them for $89 on StockX" — don't say "I searched" or "according to."
4. If you can read a price tag in the image, mention it and compare: "that tag says $45 but you can get it for $32 online."
5. If you can't identify the exact product, describe what you see specifically enough for the user to confirm: "looks like a DeWalt drill, maybe the DCD771? the yellow and black 20V line."
${state.shopProduct ? `\nPRODUCT IDENTIFIED: ${state.shopProduct}. Don't re-identify unless they're looking at something new.` : ''}`;

    case 'cook':
      return `
VISION MODE: KITCHEN / COOKING GUIDE
You are a chef standing in their kitchen looking at what they have. Your job:
1. SCAN everything visible — name each ingredient you can identify. Be specific: "boneless chicken thighs, a head of garlic, two lemons, jasmine rice, and fresh rosemary" not "some meat and vegetables."
2. When you've identified ingredients, suggest 2-3 recipes they can make with ONLY what you see. Don't suggest recipes requiring ingredients not visible.
3. If they pick a recipe, switch to step-by-step cooking guide mode. Watch their progress — "nice, the oil's hot enough, drop the chicken in" or "stir that, it's starting to stick."
4. Warn about food safety: undercooked meat, cross-contamination, hot surfaces.
5. Give cooking times and temperatures when relevant: "flip it in about 3 minutes" or "that needs to hit 165 inside."
${state.cookIngredients.length > 0 ? `\nINGREDIENTS ALREADY SPOTTED: ${state.cookIngredients.join(', ')}. Only announce NEW ingredients.` : ''}`;

    case 'safety':
      return `
VISION MODE: SAFETY ALERT (HIGH PRIORITY)
You are a safety inspector. SCAN THE IMAGE FOR HAZARDS FIRST before anything else. Your job:
1. CHECK for dangers: exposed wiring, water near electronics, gas leaks, structural damage, chemical hazards, tripping hazards, fire risks, improper tool use, missing safety equipment.
2. If you spot a hazard → WARN IMMEDIATELY. Lead with the warning: "hold on — that wire is live, don't touch it" or "stop, that's a gas line."
3. Rate the risk: "that's sketchy but not dangerous" vs "that could seriously hurt you, stop what you're doing."
4. If everything looks safe, say so briefly: "looks safe to me, go ahead."
5. If you see them about to do something risky, intervene: "wait — you need safety glasses for that" or "unplug it first."
6. Be DIRECT. Don't soften warnings. "That will electrocute you" not "you might want to be careful."`;

    case 'compare':
      return `
VISION MODE: BEFORE / AFTER COMPARISON
${state.compareSnapshot ? `You have a SAVED SNAPSHOT from ${Math.round((Date.now() - (state.compareTimestamp || 0)) / 1000)}s ago.
The snapshot description was: "${state.compareSnapshot}"

COMPARE the current image to your snapshot. Your job:
1. Call out SPECIFIC differences: "the gap on the left side is gone now" or "that dent is still there."
2. Rate the improvement: "way better" / "getting there" / "honestly can't tell the difference" / "that actually looks worse."
3. Point out anything they missed: "looking good but you still have that one screw poking up on the right."
4. Be honest. Don't just say "nice job" if it looks the same.` : `NO SNAPSHOT SAVED YET.
If the user says "remember this" or "save this" — describe what you see in detail. The app will save your description as the "before" snapshot.
Tell them: "got it, I'll remember how this looks. Do your thing and tell me when you want me to compare."
When they later say "how does it look now" — you'll compare against the saved description.`}`;

    case 'fitness':
      return `
VISION MODE: WORKOUT COACH
You are a personal trainer watching them exercise through the camera. Your job:
1. IDENTIFY the exercise immediately: "alright, push-ups, let's go" or "okay, squats — feet look good."
2. COUNT REPS by watching their body position cycle. Say the count naturally: "that's 5" or "8... 9... 10, nice set."
3. CORRECT FORM in real time. Be specific and spatial:
   - "your back is rounding — flatten it out"
   - "knees are going past your toes, sit back more"
   - "elbows too wide, tuck them in closer"
   - "you're not going deep enough — break parallel"
   - "good depth on that one"
4. ENCOURAGE: "strong rep" or "last three, push through" — but don't be cheesy about it.
5. Watch for injury risk: "easy, your lower back is compensating" or "if your shoulder is clicking, stop."
6. After a set: "good set, ${state.fitnessReps > 0 ? state.fitnessReps + ' reps' : 'solid reps'}. Rest for 60 seconds."
${state.fitnessExercise ? `\nCURRENT EXERCISE: ${state.fitnessExercise}` : ''}
${state.fitnessReps > 0 ? `REP COUNT: ${state.fitnessReps}` : ''}`;

    case 'reader':
      return `
VISION MODE: TEXT / CODE / LABEL READER
You are reading text, codes, labels, or markings visible in the image. Your job:
1. READ everything visible — text on screens, labels, serial numbers, error codes, printed instructions, handwritten notes, barcodes, QR codes, ingredient lists, warning labels.
2. SPEAK IT CLEARLY: "it says..." then read the text exactly as written.
3. ACT ON IT:
   - Error code? Explain what it means and how to fix it.
   - Serial/model number? Identify the product.
   - Foreign language? Translate it naturally: "that's Japanese — it says [translation]."
   - Ingredient list? Call out allergens or notable items.
   - Instructions? Summarize the key steps.
   - Expiration date? Tell them if it's expired or how long they have.
4. If text is partially visible or blurry, read what you can and flag what you can't: "I can make out 'SN-4827' but the last two digits are cut off."
5. For code on screens: identify the language, spot the bug or error, suggest the fix.`;

    case 'inventory':
      return `
VISION MODE: INVENTORY / CATALOG SCAN
You are cataloging everything visible in the image. Your job:
1. LIST every distinct item you can identify. Be specific: "10mm socket, Phillips #2 screwdriver, needle-nose pliers, electrical tape, 3 zip ties" — not "some tools."
2. ORGANIZE by category if there are many items: "screwdrivers: flathead, Phillips #1, Phillips #2. Sockets: 8mm, 10mm, 12mm. Pliers: needle-nose, channel-lock."
3. Note quantities when visible: "two rolls of tape" or "about a dozen screws, mixed sizes."
4. When the user asks "do I have a [thing]?" — check your cataloged items and answer immediately: "yeah, I saw one earlier — it was in the top left area" or "no, I didn't see one in there."
5. If they're panning slowly, keep adding to the inventory without repeating items you already listed.
6. At the end, offer a summary: "alright, I count 23 items total — want me to run through the full list?"
${state.inventoryItems.length > 0 ? `\nITEMS CATALOGED SO FAR: ${state.inventoryItems.join(', ')}\nDon't re-list these. Only announce NEW items.` : ''}`;

    default:
      return '';
  }
}

// ─── Safety overlay prompt (runs passively on ALL modes) ─────────────────────
// This gets appended regardless of active mode — safety is always on.

export const SAFETY_OVERLAY = `
PASSIVE SAFETY CHECK (always active regardless of mode):
Before responding about anything else, quickly scan for obvious dangers in the image — exposed wires, water near electronics, structural damage, gas/chemical hazards, fire risk. If you spot something dangerous, LEAD with the warning before anything else. If nothing dangerous, don't mention safety — just proceed normally.`;

// ─── Update mode state based on AI response ─────────────────────────────────

export function updateModeState(
  state: VisionModeState,
  aiResponse: string,
  userText?: string,
): VisionModeState {
  const t = (userText || '').toLowerCase();
  let next = { ...state };

  switch (state.active) {
    case 'shop': {
      // Extract product name from response
      const productMatch = aiResponse.match(/(?:that's|this is|those are|it's|these are)\s+(?:a |an |the |some )?([\w][\w\s'-]{3,40})/i);
      if (productMatch && !state.shopProduct) {
        next.shopProduct = productMatch[1].trim();
      }
      break;
    }

    case 'cook': {
      // Extract ingredients mentioned in response
      const foodWords = aiResponse.match(/\b(chicken|beef|pork|fish|salmon|shrimp|tofu|rice|pasta|bread|flour|sugar|salt|pepper|garlic|onion|tomato|potato|carrot|broccoli|spinach|lettuce|cheese|butter|oil|egg|milk|cream|lemon|lime|ginger|basil|thyme|rosemary|oregano|cilantro|parsley|cumin|paprika|cinnamon|vinegar|soy sauce|honey|mushroom|bell pepper|jalapeño|avocado|beans|corn|peas|celery|cucumber|zucchini)\b/gi);
      if (foodWords) {
        const newIngredients = [...new Set([
          ...state.cookIngredients,
          ...foodWords.map(w => w.toLowerCase()),
        ])];
        next.cookIngredients = newIngredients;
      }
      break;
    }

    case 'compare': {
      // Save snapshot when user says "remember this"
      if (/remember|save|snapshot|lock/i.test(t)) {
        next.compareSnapshot = aiResponse.slice(0, 300);
        next.compareTimestamp = Date.now();
      }
      break;
    }

    case 'fitness': {
      // Extract exercise type
      const exerciseMatch = aiResponse.match(/\b(push[- ]?ups?|pull[- ]?ups?|squats?|deadlifts?|bench|lunges?|planks?|crunches?|sit[- ]?ups?|curls?|rows?|press|dips?)\b/i);
      if (exerciseMatch) {
        next.fitnessExercise = exerciseMatch[1].toLowerCase();
      }
      // Extract rep count
      const repMatch = aiResponse.match(/(?:that's|count:?|rep(?:s)?:?)\s*(\d{1,3})/i);
      if (repMatch) {
        next.fitnessReps = parseInt(repMatch[1], 10);
      }
      break;
    }

    case 'inventory': {
      // Extract items from response
      const itemPattern = /\b(\d+(?:mm|cm|in|")?\s*(?:socket|wrench|screwdriver|pliers|hammer|drill|bit|tape|wire|cable|bolt|nut|screw|clamp|saw|file|level|ruler|knife|scissors|pen|marker|glue|bracket|hook|nail|pin|clip|battery|bulb|fuse|switch|plug|adapter|charger|phone|remote|key|card|coin|tool|container|box|bag|bottle|can|jar|tube|roll|sheet|pad|sponge|brush|rag|towel)[\w\s]*)\b/gi;
      const items = aiResponse.match(itemPattern);
      if (items) {
        next.inventoryItems = [...new Set([
          ...state.inventoryItems,
          ...items.map(i => i.trim().toLowerCase()),
        ])];
      }
      break;
    }
  }

  return next;
}
