// ─── Code Bleu Design Library ────────────────────────────────────────────────
//
// Curated palettes, font pairings, and stack defaults for the design toolkit.
// All hand-picked — no API required, no model guessing. The agent calls
// get_color_palette() / get_font_pairing() and gets back something that
// actually works together visually.

export interface ColorPalette {
  name: string;
  vibe: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryHover: string;
  accent: string;
  border: string;
  /** CSS gradient string ready to drop into a `background:` rule */
  gradient: string;
  /** Tailwind hex string for `bg-[#...]` style usage, in case Tailwind isn't set up */
  tailwindHexes: { bg: string; surface: string; primary: string; accent: string };
}

export const PALETTES: Record<string, ColorPalette> = {
  'modern-tech': {
    name: 'Modern Tech',
    vibe: 'Clean, indigo-on-near-black, Linear/Vercel territory',
    background: '#0a0a0f',
    surface: '#16161f',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    primary: '#6366f1',
    primaryHover: '#818cf8',
    accent: '#22d3ee',
    border: 'rgba(255,255,255,0.08)',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #22d3ee 100%)',
    tailwindHexes: { bg: '#0a0a0f', surface: '#16161f', primary: '#6366f1', accent: '#22d3ee' },
  },
  'warm-cozy': {
    name: 'Warm Cozy',
    vibe: 'Coffee shop, bakery, lifestyle blog — cream and terracotta',
    background: '#fdf6ec',
    surface: '#ffffff',
    text: '#3a2e25',
    textMuted: '#8a7666',
    primary: '#c2410c',
    primaryHover: '#9a3412',
    accent: '#d4a574',
    border: '#eadfd0',
    gradient: 'linear-gradient(135deg, #fdf6ec 0%, #f5e6d3 100%)',
    tailwindHexes: { bg: '#fdf6ec', surface: '#ffffff', primary: '#c2410c', accent: '#d4a574' },
  },
  'playful': {
    name: 'Playful',
    vibe: 'Bright, friendly, kid-app or fun consumer product',
    background: '#fff8f0',
    surface: '#ffffff',
    text: '#1a1a2e',
    textMuted: '#6b6b80',
    primary: '#ec4899',
    primaryHover: '#db2777',
    accent: '#fbbf24',
    border: '#fce7f3',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #fbbf24 100%)',
    tailwindHexes: { bg: '#fff8f0', surface: '#ffffff', primary: '#ec4899', accent: '#fbbf24' },
  },
  'luxury': {
    name: 'Luxury',
    vibe: 'High-end, gold on black, fashion or premium services',
    background: '#0c0c0c',
    surface: '#1a1a1a',
    text: '#fafaf9',
    textMuted: '#a3a3a3',
    primary: '#d4af37',
    primaryHover: '#eac96b',
    accent: '#a855f7',
    border: '#262626',
    gradient: 'linear-gradient(135deg, #d4af37 0%, #a855f7 100%)',
    tailwindHexes: { bg: '#0c0c0c', surface: '#1a1a1a', primary: '#d4af37', accent: '#a855f7' },
  },
  'minimal': {
    name: 'Minimal',
    vibe: 'Pure white, black text, single accent — Apple or Stripe energy',
    background: '#ffffff',
    surface: '#fafafa',
    text: '#0a0a0a',
    textMuted: '#737373',
    primary: '#000000',
    primaryHover: '#262626',
    accent: '#3b82f6',
    border: '#e5e5e5',
    gradient: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)',
    tailwindHexes: { bg: '#ffffff', surface: '#fafafa', primary: '#000000', accent: '#3b82f6' },
  },
  'dark-neon': {
    name: 'Dark Neon',
    vibe: 'Cyberpunk, gaming, music — black with electric magenta + cyan',
    background: '#050510',
    surface: '#0e0e1a',
    text: '#f0f0ff',
    textMuted: '#7c7c9c',
    primary: '#ff00ff',
    primaryHover: '#ff5cff',
    accent: '#00f0ff',
    border: 'rgba(255,0,255,0.2)',
    gradient: 'linear-gradient(135deg, #ff00ff 0%, #00f0ff 100%)',
    tailwindHexes: { bg: '#050510', surface: '#0e0e1a', primary: '#ff00ff', accent: '#00f0ff' },
  },
  'earthy': {
    name: 'Earthy',
    vibe: 'Sustainable, natural, outdoor — sage green and warm brown',
    background: '#f5f1ea',
    surface: '#ffffff',
    text: '#2d2a24',
    textMuted: '#7a7466',
    primary: '#5a7c50',
    primaryHover: '#456340',
    accent: '#c47d5a',
    border: '#e0d8c8',
    gradient: 'linear-gradient(135deg, #5a7c50 0%, #c47d5a 100%)',
    tailwindHexes: { bg: '#f5f1ea', surface: '#ffffff', primary: '#5a7c50', accent: '#c47d5a' },
  },
  'pastel': {
    name: 'Pastel',
    vibe: 'Soft, calming, wellness or journaling app',
    background: '#fdfcff',
    surface: '#ffffff',
    text: '#3d3a4e',
    textMuted: '#8e8aa3',
    primary: '#a78bfa',
    primaryHover: '#9333ea',
    accent: '#fda4af',
    border: '#ede9fe',
    gradient: 'linear-gradient(135deg, #a78bfa 0%, #fda4af 100%)',
    tailwindHexes: { bg: '#fdfcff', surface: '#ffffff', primary: '#a78bfa', accent: '#fda4af' },
  },
  'editorial': {
    name: 'Editorial',
    vibe: 'Magazine, news, longform — serif headlines, off-white background',
    background: '#fafaf7',
    surface: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#525252',
    primary: '#dc2626',
    primaryHover: '#991b1b',
    accent: '#1e40af',
    border: '#e5e5e5',
    gradient: 'linear-gradient(180deg, #fafaf7 0%, #ffffff 100%)',
    tailwindHexes: { bg: '#fafaf7', surface: '#ffffff', primary: '#dc2626', accent: '#1e40af' },
  },
  'ocean': {
    name: 'Ocean',
    vibe: 'Travel, beach, water — sky blues and sandy beige',
    background: '#f0f9ff',
    surface: '#ffffff',
    text: '#0c4a6e',
    textMuted: '#64748b',
    primary: '#0284c7',
    primaryHover: '#0369a1',
    accent: '#fbbf24',
    border: '#bae6fd',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
    tailwindHexes: { bg: '#f0f9ff', surface: '#ffffff', primary: '#0284c7', accent: '#fbbf24' },
  },
};

export interface FontPairing {
  name: string;
  style: string;
  /** Heading font — Google Fonts family name */
  headingFamily: string;
  /** Body font — Google Fonts family name */
  bodyFamily: string;
  /** Ready-to-paste Google Fonts <link> URL */
  googleFontsUrl: string;
  /** CSS rule for body */
  bodyCss: string;
  /** CSS rule for headings */
  headingCss: string;
}

export const FONT_PAIRINGS: Record<string, FontPairing> = {
  'modern': {
    name: 'Modern',
    style: 'Geist + Inter — the new Vercel/Linear standard',
    headingFamily: 'Geist',
    bodyFamily: 'Inter',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap',
    bodyCss: "font-family: 'Inter', system-ui, -apple-system, sans-serif;",
    headingCss: "font-family: 'Geist', 'Inter', system-ui, sans-serif; letter-spacing: -0.02em;",
  },
  'classic': {
    name: 'Classic',
    style: 'Playfair Display + Source Sans Pro — magazine-grade',
    headingFamily: 'Playfair Display',
    bodyFamily: 'Source Sans Pro',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Source+Sans+Pro:wght@400;600&display=swap',
    bodyCss: "font-family: 'Source Sans Pro', Georgia, serif;",
    headingCss: "font-family: 'Playfair Display', 'Times New Roman', serif;",
  },
  'playful': {
    name: 'Playful',
    style: 'Fraunces + DM Sans — friendly with personality',
    headingFamily: 'Fraunces',
    bodyFamily: 'DM Sans',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=DM+Sans:wght@400;500;700&display=swap',
    bodyCss: "font-family: 'DM Sans', system-ui, sans-serif;",
    headingCss: "font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto;",
  },
  'tech': {
    name: 'Tech',
    style: 'Space Grotesk + JetBrains Mono — developer-friendly',
    headingFamily: 'Space Grotesk',
    bodyFamily: 'Inter',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap',
    bodyCss: "font-family: 'Inter', system-ui, sans-serif;",
    headingCss: "font-family: 'Space Grotesk', system-ui, sans-serif; letter-spacing: -0.01em;",
  },
  'editorial': {
    name: 'Editorial',
    style: 'Newsreader + IBM Plex Sans — long-form authority',
    headingFamily: 'Newsreader',
    bodyFamily: 'IBM Plex Sans',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,800&family=IBM+Plex+Sans:wght@400;500;600&display=swap',
    bodyCss: "font-family: 'IBM Plex Sans', system-ui, sans-serif;",
    headingCss: "font-family: 'Newsreader', Georgia, serif; font-optical-sizing: auto;",
  },
  'luxury': {
    name: 'Luxury',
    style: 'Cormorant Garamond + Montserrat — high-end elegance',
    headingFamily: 'Cormorant Garamond',
    bodyFamily: 'Montserrat',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;700&family=Montserrat:wght@300;400;500;600&display=swap',
    bodyCss: "font-family: 'Montserrat', system-ui, sans-serif; letter-spacing: 0.01em;",
    headingCss: "font-family: 'Cormorant Garamond', Garamond, serif; letter-spacing: 0.01em;",
  },
};

export interface DesignSystemPreset {
  name: string;
  description: string;
  /** Shell command(s) to scaffold this design system into a project */
  setupCommands: string[];
  /** Quick-start import the agent should use after setup */
  exampleImport: string;
}

export const DESIGN_SYSTEMS: Record<string, DesignSystemPreset> = {
  'shadcn': {
    name: 'shadcn/ui',
    description: 'The de-facto standard for modern React apps. Radix primitives + Tailwind, fully customizable, copy-paste components.',
    setupCommands: [
      'npx shadcn@latest init -d',
      'npx shadcn@latest add button card input dialog dropdown-menu',
    ],
    exampleImport: "import { Button } from '@/components/ui/button'",
  },
  'mantine': {
    name: 'Mantine',
    description: 'Full-featured component library with hooks, forms, charts. Great for dashboards.',
    setupCommands: [
      'npm install @mantine/core @mantine/hooks @mantine/form',
    ],
    exampleImport: "import { Button, Card, TextInput } from '@mantine/core'",
  },
  'chakra': {
    name: 'Chakra UI',
    description: 'Accessible, themeable components with great DX.',
    setupCommands: [
      'npm install @chakra-ui/react @emotion/react @emotion/styled framer-motion',
    ],
    exampleImport: "import { Button, Box, Heading } from '@chakra-ui/react'",
  },
  'mui': {
    name: 'Material UI',
    description: 'Google Material Design for React. Robust, mature, lots of components.',
    setupCommands: [
      'npm install @mui/material @emotion/react @emotion/styled @mui/icons-material',
    ],
    exampleImport: "import { Button, Card, TextField } from '@mui/material'",
  },
  'radix-tailwind': {
    name: 'Radix UI + Tailwind',
    description: 'Headless Radix primitives styled with Tailwind. Full control, no opinions.',
    setupCommands: [
      'npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tooltip',
      'npm install -D tailwindcss postcss autoprefixer',
      'npx tailwindcss init -p',
    ],
    exampleImport: "import * as Dialog from '@radix-ui/react-dialog'",
  },
};

export interface IconLibraryPreset {
  name: string;
  description: string;
  /** Install command */
  installCommand: string;
  /** Example import statement */
  exampleImport: string;
  /** Example usage */
  exampleUsage: string;
}

export const ICON_LIBRARIES: Record<string, IconLibraryPreset> = {
  'lucide': {
    name: 'Lucide',
    description: 'Beautiful, consistent, 1000+ icons. The default choice — what shadcn/ui uses.',
    installCommand: 'npm install lucide-react',
    exampleImport: "import { Home, Settings, User, Search } from 'lucide-react'",
    exampleUsage: '<Home size={20} strokeWidth={1.5} />',
  },
  'heroicons': {
    name: 'Heroicons',
    description: "Tailwind Labs' icon set. 290+ icons in solid, outline, and mini variants.",
    installCommand: 'npm install @heroicons/react',
    exampleImport: "import { HomeIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'",
    exampleUsage: '<HomeIcon className="w-5 h-5" />',
  },
  'phosphor': {
    name: 'Phosphor',
    description: 'Flexible icon family with 6 weights. 1200+ icons.',
    installCommand: 'npm install @phosphor-icons/react',
    exampleImport: "import { House, Gear, User } from '@phosphor-icons/react'",
    exampleUsage: '<House size={20} weight="duotone" />',
  },
  'tabler': {
    name: 'Tabler',
    description: 'Free, MIT-licensed, 4000+ pixel-perfect icons.',
    installCommand: 'npm install @tabler/icons-react',
    exampleImport: "import { IconHome, IconSettings } from '@tabler/icons-react'",
    exampleUsage: '<IconHome size={20} stroke={1.5} />',
  },
};

/**
 * Build a Pollinations.ai image-generation URL.
 * Pollinations is completely free and requires no API key — you just hit a URL
 * and they stream back a JPEG generated with Flux.1 (or whichever model).
 *
 * Models:
 *  - 'flux'        — Flux.1 schnell (default, fastest, best quality/speed tradeoff)
 *  - 'flux-realism'— Flux fine-tuned for photorealism
 *  - 'flux-anime'  — Flux fine-tuned for anime/illustration
 *  - 'flux-3d'     — Flux fine-tuned for 3D renders
 *  - 'turbo'       — Stable Diffusion Turbo (faster, lower quality)
 */
export function buildPollinationsUrl(opts: {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  model?: 'flux' | 'flux-realism' | 'flux-anime' | 'flux-3d' | 'turbo';
  enhance?: boolean;
  nologo?: boolean;
}): string {
  const { prompt, width = 1024, height = 1024, seed, model = 'flux', enhance = true, nologo = true } = opts;
  const encoded = encodeURIComponent(prompt);
  const params = new URLSearchParams();
  params.set('width', String(width));
  params.set('height', String(height));
  params.set('model', model);
  if (seed !== undefined) params.set('seed', String(seed));
  if (enhance) params.set('enhance', 'true');
  if (nologo) params.set('nologo', 'true');
  return `https://image.pollinations.ai/prompt/${encoded}?${params.toString()}`;
}

/**
 * Build a prompt optimized for the requested asset style. This wraps the
 * user's request with the kind of phrasing that Flux responds to best.
 */
export function styleImagePrompt(rawPrompt: string, style: string): string {
  const s = style.toLowerCase();
  if (s.includes('logo')) {
    return `${rawPrompt}, minimalist vector logo design, clean lines, professional brand identity, centered on white background, flat design, no text, 4k`;
  }
  if (s.includes('hero') || s.includes('banner')) {
    return `${rawPrompt}, cinematic hero image, professional photography, dramatic lighting, ultra detailed, 8k, photorealistic`;
  }
  if (s.includes('illustration')) {
    return `${rawPrompt}, modern flat illustration, vibrant colors, clean vector style, professional editorial illustration, white background`;
  }
  if (s.includes('icon')) {
    return `${rawPrompt}, simple icon, flat design, minimal, single color, centered on white background, vector style, no text`;
  }
  if (s.includes('background') || s.includes('texture')) {
    return `${rawPrompt}, abstract background, soft gradient, subtle texture, modern design, no people, no text`;
  }
  if (s.includes('product')) {
    return `${rawPrompt}, product photography, white seamless background, soft studio lighting, ultra sharp, commercial photography, 4k`;
  }
  if (s.includes('photo') || s.includes('photograph')) {
    return `${rawPrompt}, professional photography, natural lighting, sharp focus, photorealistic, 8k, ultra detailed`;
  }
  return `${rawPrompt}, professional, high quality, detailed, 4k`;
}
