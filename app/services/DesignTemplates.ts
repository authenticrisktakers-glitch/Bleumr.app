/**
 * DesignTemplates — 65 pre-built site templates for JUMARI Web Designer.
 * Each template includes a name, category, description, color palette,
 * suggested layout sections, and starter Tailwind config.
 * The AI uses these as a blueprint to generate complete sites.
 */

export interface DesignTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  /** Tailwind color palette */
  colors: { primary: string; secondary: string; accent: string; bg: string; surface: string };
  /** Google Font families to use */
  fonts: string[];
  /** Ordered list of page sections */
  sections: string[];
  /** Pages to generate */
  pages: string[];
  /** Design mood / aesthetic keywords */
  aesthetic: string;
  /** Starter Tailwind config override */
  tailwindConfig?: string;
  /** Preview emoji for the picker UI */
  emoji: string;
}

export type TemplateCategory =
  | 'business'
  | 'ecommerce'
  | 'portfolio'
  | 'saas'
  | 'restaurant'
  | 'agency'
  | 'blog'
  | 'landing'
  | 'personal'
  | 'event'
  | 'nonprofit'
  | 'education'
  | 'health'
  | 'real-estate'
  | 'entertainment';

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  business: 'Business',
  ecommerce: 'E-Commerce',
  portfolio: 'Portfolio',
  saas: 'SaaS',
  restaurant: 'Restaurant',
  agency: 'Agency',
  blog: 'Blog',
  landing: 'Landing Page',
  personal: 'Personal',
  event: 'Event',
  nonprofit: 'Nonprofit',
  education: 'Education',
  health: 'Health',
  'real-estate': 'Real Estate',
  entertainment: 'Entertainment',
};

export const CATEGORY_EMOJIS: Record<TemplateCategory, string> = {
  business: '\u{1F3E2}',
  ecommerce: '\u{1F6D2}',
  portfolio: '\u{1F3A8}',
  saas: '\u{1F680}',
  restaurant: '\u{1F37D}',
  agency: '\u{1F4BC}',
  blog: '\u{1F4DD}',
  landing: '\u{26A1}',
  personal: '\u{1F464}',
  event: '\u{1F389}',
  nonprofit: '\u{1F49A}',
  education: '\u{1F393}',
  health: '\u{1FA7A}',
  'real-estate': '\u{1F3E0}',
  entertainment: '\u{1F3AC}',
};

// ─── 65 Templates ─────────────────────────────────────────────────────────

export const DESIGN_TEMPLATES: DesignTemplate[] = [

  // ━━━ SAAS (8) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'saas-dark-gradient',
    name: 'Nebula SaaS',
    category: 'saas',
    emoji: '\u{1F30C}',
    description: 'Dark SaaS landing with gradient orbs, glass cards, and animated hero. Think Linear/Vercel.',
    colors: { primary: '#8b5cf6', secondary: '#6366f1', accent: '#a78bfa', bg: '#030014', surface: 'rgba(255,255,255,0.03)' },
    fonts: ['Inter', 'JetBrains Mono'],
    sections: ['hero-gradient-orbs', 'logo-ticker', 'feature-grid-3col', 'product-screenshot', 'testimonials-carousel', 'pricing-3tier', 'faq-accordion', 'cta-banner', 'footer-4col'],
    pages: ['index.html', 'pricing.html', 'about.html', 'contact.html'],
    aesthetic: 'dark futuristic glass-morphism gradient-mesh minimalist',
  },
  {
    id: 'saas-clean-white',
    name: 'Clarity SaaS',
    category: 'saas',
    emoji: '\u{2728}',
    description: 'Clean white SaaS with blue accents, crisp typography, and lots of whitespace. Think Stripe.',
    colors: { primary: '#2563eb', secondary: '#1d4ed8', accent: '#60a5fa', bg: '#ffffff', surface: '#f8fafc' },
    fonts: ['Inter', 'Söhne'],
    sections: ['hero-split-image', 'feature-icons-grid', 'how-it-works-steps', 'integrations-logos', 'social-proof-stats', 'pricing-cards', 'cta-simple', 'footer-minimal'],
    pages: ['index.html', 'features.html', 'pricing.html', 'contact.html'],
    aesthetic: 'clean minimal whitespace professional blue-accent',
  },
  {
    id: 'saas-ai-product',
    name: 'Neural AI',
    category: 'saas',
    emoji: '\u{1F916}',
    description: 'AI product landing page with dark theme, animated neural network bg, typing demo.',
    colors: { primary: '#10b981', secondary: '#059669', accent: '#34d399', bg: '#0a0a0a', surface: 'rgba(16,185,129,0.05)' },
    fonts: ['Inter', 'Fira Code'],
    sections: ['hero-typing-demo', 'feature-bento-grid', 'live-demo-embed', 'comparison-table', 'api-code-sample', 'testimonials', 'pricing-usage', 'footer-dark'],
    pages: ['index.html', 'docs.html', 'pricing.html'],
    aesthetic: 'dark techy ai-vibes green-accent terminal-style',
  },
  {
    id: 'saas-analytics',
    name: 'Dataflow',
    category: 'saas',
    emoji: '\u{1F4CA}',
    description: 'Analytics dashboard marketing site with chart previews and gradient purple theme.',
    colors: { primary: '#7c3aed', secondary: '#5b21b6', accent: '#c4b5fd', bg: '#0f0720', surface: 'rgba(124,58,237,0.08)' },
    fonts: ['Plus Jakarta Sans', 'IBM Plex Mono'],
    sections: ['hero-dashboard-preview', 'metrics-counter', 'feature-tabs', 'screenshot-gallery', 'integrations', 'pricing-toggle', 'cta-gradient', 'footer-4col'],
    pages: ['index.html', 'features.html', 'pricing.html', 'contact.html'],
    aesthetic: 'dark purple data-viz dashboard professional',
  },
  {
    id: 'saas-crm',
    name: 'Pipeline CRM',
    category: 'saas',
    emoji: '\u{1F4C8}',
    description: 'CRM/sales tool with warm orange accents, pipeline visualization, customer testimonials.',
    colors: { primary: '#f97316', secondary: '#ea580c', accent: '#fb923c', bg: '#fffbf5', surface: '#fff7ed' },
    fonts: ['DM Sans', 'Inter'],
    sections: ['hero-split-mockup', 'trusted-by-logos', 'feature-alternating', 'pipeline-visual', 'case-studies', 'pricing-annual', 'cta-warm', 'footer-3col'],
    pages: ['index.html', 'features.html', 'pricing.html', 'about.html'],
    aesthetic: 'warm light orange-accent friendly approachable',
  },
  {
    id: 'saas-devtools',
    name: 'DevForge',
    category: 'saas',
    emoji: '\u{1F528}',
    description: 'Developer tools landing with terminal-style hero, code snippets, and dark green theme.',
    colors: { primary: '#22c55e', secondary: '#16a34a', accent: '#4ade80', bg: '#0a0a0a', surface: 'rgba(34,197,94,0.05)' },
    fonts: ['JetBrains Mono', 'Inter'],
    sections: ['hero-terminal', 'code-example-tabs', 'feature-grid', 'benchmark-stats', 'github-stars', 'docs-preview', 'pricing-developer', 'footer-dark'],
    pages: ['index.html', 'docs.html', 'pricing.html'],
    aesthetic: 'dark hacker terminal green-on-black developer-focused',
  },
  {
    id: 'saas-fintech',
    name: 'VaultPay',
    category: 'saas',
    emoji: '\u{1F4B3}',
    description: 'Fintech/payments landing with trust-building design, security badges, dark blue theme.',
    colors: { primary: '#3b82f6', secondary: '#1e40af', accent: '#93c5fd', bg: '#020617', surface: 'rgba(59,130,246,0.05)' },
    fonts: ['Inter', 'Space Grotesk'],
    sections: ['hero-card-floating', 'security-badges', 'feature-split', 'how-it-works', 'transaction-demo', 'compliance-logos', 'pricing-enterprise', 'footer-trust'],
    pages: ['index.html', 'security.html', 'pricing.html', 'contact.html'],
    aesthetic: 'dark trustworthy secure blue professional fintech',
  },
  {
    id: 'saas-collaboration',
    name: 'TeamSync',
    category: 'saas',
    emoji: '\u{1F91D}',
    description: 'Team collaboration tool with playful gradients, avatar groups, and light theme.',
    colors: { primary: '#8b5cf6', secondary: '#ec4899', accent: '#f472b6', bg: '#fefefe', surface: '#faf5ff' },
    fonts: ['DM Sans', 'Inter'],
    sections: ['hero-avatars-floating', 'feature-cards-playful', 'workflow-steps', 'team-collaboration-demo', 'testimonials-grid', 'pricing-team', 'cta-colorful', 'footer-playful'],
    pages: ['index.html', 'features.html', 'pricing.html', 'about.html'],
    aesthetic: 'light playful colorful gradients friendly team',
  },

  // ━━━ ECOMMERCE (8) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'ecom-luxury',
    name: 'Luxe Store',
    category: 'ecommerce',
    emoji: '\u{1F48E}',
    description: 'Luxury e-commerce with dark theme, gold accents, elegant typography, and full cart system.',
    colors: { primary: '#d4a853', secondary: '#b8860b', accent: '#f5deb3', bg: '#0a0a0a', surface: 'rgba(212,168,83,0.05)' },
    fonts: ['Playfair Display', 'Inter'],
    sections: ['hero-fullwidth-image', 'category-grid', 'featured-products', 'brand-story', 'testimonials', 'newsletter', 'footer-luxury'],
    pages: ['index.html', 'products.html', 'cart.html', 'about.html', 'contact.html'],
    aesthetic: 'dark luxury gold elegant serif premium',
  },
  {
    id: 'ecom-streetwear',
    name: 'Drip Supply',
    category: 'ecommerce',
    emoji: '\u{1F525}',
    description: 'Streetwear brand with bold typography, high contrast, urban aesthetic, cart + checkout.',
    colors: { primary: '#ef4444', secondary: '#dc2626', accent: '#fbbf24', bg: '#000000', surface: '#111111' },
    fonts: ['Oswald', 'Inter'],
    sections: ['hero-video-bg', 'new-drops-carousel', 'product-grid', 'lookbook-gallery', 'size-guide', 'reviews', 'footer-minimal-dark'],
    pages: ['index.html', 'shop.html', 'cart.html', 'about.html'],
    aesthetic: 'dark bold urban streetwear high-contrast edgy',
  },
  {
    id: 'ecom-minimal',
    name: 'Muji Style',
    category: 'ecommerce',
    emoji: '\u{1F3AF}',
    description: 'Minimalist Japanese-inspired store with lots of whitespace, clean grid, earth tones.',
    colors: { primary: '#78716c', secondary: '#57534e', accent: '#a8a29e', bg: '#fafaf9', surface: '#f5f5f4' },
    fonts: ['Noto Sans', 'Inter'],
    sections: ['hero-minimal-text', 'category-horizontal', 'product-grid-clean', 'material-story', 'craftsmanship', 'footer-minimal'],
    pages: ['index.html', 'shop.html', 'cart.html', 'about.html'],
    aesthetic: 'minimal japanese clean whitespace earth-tones zen',
  },
  {
    id: 'ecom-beauty',
    name: 'Glow Beauty',
    category: 'ecommerce',
    emoji: '\u{1F338}',
    description: 'Beauty/skincare brand with soft pink palette, rounded elements, product showcases.',
    colors: { primary: '#ec4899', secondary: '#db2777', accent: '#f9a8d4', bg: '#fff5f7', surface: '#fce7f3' },
    fonts: ['Poppins', 'Inter'],
    sections: ['hero-product-center', 'bestsellers-carousel', 'ingredients-showcase', 'before-after', 'reviews-photos', 'routine-builder', 'newsletter-pink', 'footer-soft'],
    pages: ['index.html', 'shop.html', 'cart.html', 'about.html'],
    aesthetic: 'soft feminine pink beauty clean rounded friendly',
  },
  {
    id: 'ecom-tech',
    name: 'TechVault',
    category: 'ecommerce',
    emoji: '\u{1F4F1}',
    description: 'Tech/gadgets store with dark theme, product specs, comparison features, neon blue.',
    colors: { primary: '#0ea5e9', secondary: '#0284c7', accent: '#38bdf8', bg: '#0c0c0c', surface: 'rgba(14,165,233,0.05)' },
    fonts: ['Space Grotesk', 'Inter'],
    sections: ['hero-product-3d-rotate', 'deals-countdown', 'category-icons', 'product-grid-specs', 'comparison-table', 'reviews-verified', 'footer-tech'],
    pages: ['index.html', 'shop.html', 'cart.html', 'contact.html'],
    aesthetic: 'dark techy neon-blue specs-focused gadgets sleek',
  },
  {
    id: 'ecom-food',
    name: 'Farm Fresh',
    category: 'ecommerce',
    emoji: '\u{1F96C}',
    description: 'Organic food/grocery store with green palette, farm imagery, subscription boxes.',
    colors: { primary: '#16a34a', secondary: '#15803d', accent: '#4ade80', bg: '#f0fdf4', surface: '#dcfce7' },
    fonts: ['DM Sans', 'Inter'],
    sections: ['hero-farm-image', 'category-produce', 'weekly-box', 'product-grid', 'farm-story', 'delivery-info', 'reviews', 'footer-green'],
    pages: ['index.html', 'shop.html', 'cart.html', 'about.html'],
    aesthetic: 'light organic green natural farm fresh friendly',
  },
  {
    id: 'ecom-furniture',
    name: 'Haus Living',
    category: 'ecommerce',
    emoji: '\u{1FA91}',
    description: 'Modern furniture store with warm neutrals, room scenes, configurator-style shopping.',
    colors: { primary: '#92400e', secondary: '#78350f', accent: '#d97706', bg: '#fffbeb', surface: '#fef3c7' },
    fonts: ['DM Serif Display', 'Inter'],
    sections: ['hero-room-scene', 'collections-grid', 'product-gallery', 'room-planner', 'materials-swatches', 'delivery-guarantee', 'footer-warm'],
    pages: ['index.html', 'shop.html', 'cart.html', 'about.html'],
    aesthetic: 'warm neutral elegant furniture cozy scandinavian',
  },
  {
    id: 'ecom-fashion',
    name: 'Vogue Edit',
    category: 'ecommerce',
    emoji: '\u{1F457}',
    description: 'High fashion store with editorial layout, large imagery, minimal text, black & white.',
    colors: { primary: '#171717', secondary: '#404040', accent: '#737373', bg: '#ffffff', surface: '#fafafa' },
    fonts: ['Cormorant Garamond', 'Inter'],
    sections: ['hero-editorial-split', 'new-collection', 'lookbook-masonry', 'product-grid-minimal', 'designer-feature', 'instagram-feed', 'footer-fashion'],
    pages: ['index.html', 'shop.html', 'cart.html', 'lookbook.html'],
    aesthetic: 'editorial monochrome high-fashion large-imagery serif elegant',
  },

  // ━━━ PORTFOLIO (7) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'portfolio-developer',
    name: 'DevFolio',
    category: 'portfolio',
    emoji: '\u{1F468}\u{200D}\u{1F4BB}',
    description: 'Developer portfolio with terminal aesthetic, project cards, tech stack, GitHub integration.',
    colors: { primary: '#10b981', secondary: '#059669', accent: '#34d399', bg: '#0a0a0a', surface: '#111111' },
    fonts: ['JetBrains Mono', 'Inter'],
    sections: ['hero-terminal-intro', 'about-split', 'tech-stack-icons', 'projects-grid', 'experience-timeline', 'blog-recent', 'contact-form', 'footer-dark'],
    pages: ['index.html', 'projects.html', 'about.html', 'contact.html'],
    aesthetic: 'dark terminal developer green monospace techy',
  },
  {
    id: 'portfolio-designer',
    name: 'Pixel Canvas',
    category: 'portfolio',
    emoji: '\u{1F3A8}',
    description: 'Designer portfolio with large project showcases, case studies, playful cursor effects.',
    colors: { primary: '#8b5cf6', secondary: '#7c3aed', accent: '#c4b5fd', bg: '#fefefe', surface: '#f5f3ff' },
    fonts: ['Space Grotesk', 'Inter'],
    sections: ['hero-name-large', 'project-showcase-fullwidth', 'skills-marquee', 'case-study-preview', 'testimonials', 'contact-creative', 'footer-minimal'],
    pages: ['index.html', 'work.html', 'about.html', 'contact.html'],
    aesthetic: 'light creative playful large-type portfolio experimental',
  },
  {
    id: 'portfolio-photographer',
    name: 'Lens & Light',
    category: 'portfolio',
    emoji: '\u{1F4F7}',
    description: 'Photography portfolio with fullscreen galleries, masonry grid, minimal UI, dark theme.',
    colors: { primary: '#ffffff', secondary: '#a3a3a3', accent: '#e5e5e5', bg: '#000000', surface: '#0a0a0a' },
    fonts: ['Cormorant Garamond', 'Inter'],
    sections: ['hero-fullscreen-photo', 'gallery-masonry', 'about-minimal', 'series-horizontal', 'clients-logos', 'contact-simple', 'footer-invisible'],
    pages: ['index.html', 'gallery.html', 'about.html', 'contact.html'],
    aesthetic: 'dark photographic fullscreen minimal serif cinematic',
  },
  {
    id: 'portfolio-creative',
    name: 'Wild Studio',
    category: 'portfolio',
    emoji: '\u{1F308}',
    description: 'Bold creative portfolio with neon colors, animated backgrounds, experimental layout.',
    colors: { primary: '#f43f5e', secondary: '#e11d48', accent: '#fbbf24', bg: '#0a0a0a', surface: '#1a1a1a' },
    fonts: ['Clash Display', 'Inter'],
    sections: ['hero-animated-gradient', 'work-horizontal-scroll', 'manifesto', 'process-creative', 'awards', 'contact-bold', 'footer-neon'],
    pages: ['index.html', 'work.html', 'about.html', 'contact.html'],
    aesthetic: 'dark bold neon experimental creative edgy animated',
  },
  {
    id: 'portfolio-freelancer',
    name: 'Solo Pro',
    category: 'portfolio',
    emoji: '\u{1F4AA}',
    description: 'Freelancer portfolio with service packages, booking CTA, testimonials, and rates.',
    colors: { primary: '#2563eb', secondary: '#1d4ed8', accent: '#60a5fa', bg: '#ffffff', surface: '#f1f5f9' },
    fonts: ['DM Sans', 'Inter'],
    sections: ['hero-friendly-photo', 'services-cards', 'portfolio-grid', 'process-steps', 'testimonials-slider', 'pricing-packages', 'booking-cta', 'footer-professional'],
    pages: ['index.html', 'services.html', 'portfolio.html', 'contact.html'],
    aesthetic: 'clean professional friendly light approachable',
  },
  {
    id: 'portfolio-architect',
    name: 'Blueprint',
    category: 'portfolio',
    emoji: '\u{1F3D7}',
    description: 'Architecture firm portfolio with blueprint aesthetics, project timelines, 3D renders.',
    colors: { primary: '#1e3a5f', secondary: '#0f172a', accent: '#38bdf8', bg: '#f8fafc', surface: '#e2e8f0' },
    fonts: ['Archivo', 'Inter'],
    sections: ['hero-project-slideshow', 'about-firm', 'projects-case-study', 'services-architecture', 'team-grid', 'awards-timeline', 'contact-map', 'footer-professional'],
    pages: ['index.html', 'projects.html', 'about.html', 'contact.html'],
    aesthetic: 'clean architectural precise blueprint professional structured',
  },
  {
    id: 'portfolio-artist',
    name: 'Gallery One',
    category: 'portfolio',
    emoji: '\u{1F5BC}',
    description: 'Fine art portfolio with museum-like whitespace, large canvases, exhibition dates.',
    colors: { primary: '#1c1917', secondary: '#44403c', accent: '#a8a29e', bg: '#fafaf9', surface: '#f5f5f4' },
    fonts: ['EB Garamond', 'Inter'],
    sections: ['hero-artwork-fullbleed', 'exhibition-current', 'works-grid-large', 'artist-statement', 'cv-timeline', 'press-quotes', 'contact-gallery', 'footer-minimal'],
    pages: ['index.html', 'works.html', 'about.html', 'contact.html'],
    aesthetic: 'minimal gallery museum whitespace serif elegant',
  },

  // ━━━ RESTAURANT (5) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'restaurant-fine-dining',
    name: 'Maison',
    category: 'restaurant',
    emoji: '\u{1F37E}',
    description: 'Fine dining with dark moody aesthetic, parallax food photos, reservation system.',
    colors: { primary: '#b45309', secondary: '#92400e', accent: '#fbbf24', bg: '#0c0a09', surface: '#1c1917' },
    fonts: ['Playfair Display', 'Inter'],
    sections: ['hero-parallax-food', 'story-split', 'menu-elegant', 'chef-feature', 'gallery-mood', 'reservation-form', 'location-map', 'footer-restaurant'],
    pages: ['index.html', 'menu.html', 'about.html', 'reservations.html', 'contact.html'],
    aesthetic: 'dark moody elegant fine-dining serif warm gold',
  },
  {
    id: 'restaurant-cafe',
    name: 'Bean & Brew',
    category: 'restaurant',
    emoji: '\u{2615}',
    description: 'Coffee shop/cafe with warm browns, cozy aesthetic, menu board, location hours.',
    colors: { primary: '#92400e', secondary: '#78350f', accent: '#d97706', bg: '#fffbeb', surface: '#fef3c7' },
    fonts: ['Merriweather', 'Inter'],
    sections: ['hero-cozy-interior', 'menu-board', 'our-beans', 'baristas', 'gallery-instagram', 'hours-location', 'order-online-cta', 'footer-warm'],
    pages: ['index.html', 'menu.html', 'about.html', 'contact.html'],
    aesthetic: 'warm cozy brown coffee inviting rustic friendly',
  },
  {
    id: 'restaurant-fast-casual',
    name: 'Smash Burger',
    category: 'restaurant',
    emoji: '\u{1F354}',
    description: 'Fast casual burger joint with bold red/yellow, fun typography, online ordering.',
    colors: { primary: '#dc2626', secondary: '#b91c1c', accent: '#facc15', bg: '#fffbeb', surface: '#fef9c3' },
    fonts: ['Fredoka One', 'Inter'],
    sections: ['hero-burger-splash', 'menu-grid-photos', 'combo-deals', 'order-now-cta', 'locations-list', 'reviews-fun', 'app-download', 'footer-casual'],
    pages: ['index.html', 'menu.html', 'locations.html', 'order.html'],
    aesthetic: 'bold fun red-yellow fast-food energetic playful',
  },
  {
    id: 'restaurant-sushi',
    name: 'Sakura Roll',
    category: 'restaurant',
    emoji: '\u{1F363}',
    description: 'Japanese sushi restaurant with zen aesthetic, dark theme, elegant menu presentation.',
    colors: { primary: '#dc2626', secondary: '#1c1917', accent: '#fca5a5', bg: '#0c0a09', surface: '#1c1917' },
    fonts: ['Noto Serif JP', 'Inter'],
    sections: ['hero-sushi-art', 'philosophy', 'menu-omakase', 'sushi-gallery', 'chef-master', 'reservation-zen', 'location-hours', 'footer-japanese'],
    pages: ['index.html', 'menu.html', 'about.html', 'reservations.html'],
    aesthetic: 'dark zen japanese minimal elegant red-accent',
  },
  {
    id: 'restaurant-pizzeria',
    name: 'Napoli Fire',
    category: 'restaurant',
    emoji: '\u{1F355}',
    description: 'Italian pizzeria with rustic textures, wood-fire aesthetic, vibrant food photography.',
    colors: { primary: '#dc2626', secondary: '#16a34a', accent: '#fbbf24', bg: '#fffbeb', surface: '#fef3c7' },
    fonts: ['Lora', 'Inter'],
    sections: ['hero-wood-oven', 'our-story', 'menu-italian', 'pizza-builder', 'gallery-rustic', 'catering-cta', 'reviews', 'footer-italian'],
    pages: ['index.html', 'menu.html', 'about.html', 'catering.html', 'contact.html'],
    aesthetic: 'warm rustic italian red-green traditional inviting',
  },

  // ━━━ AGENCY (5) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'agency-digital',
    name: 'Pixel Forge',
    category: 'agency',
    emoji: '\u{1F3AF}',
    description: 'Digital agency with bold case studies, team grid, service breakdowns, dark theme.',
    colors: { primary: '#f43f5e', secondary: '#e11d48', accent: '#fb7185', bg: '#0a0a0a', surface: '#171717' },
    fonts: ['Space Grotesk', 'Inter'],
    sections: ['hero-agency-reel', 'clients-logos-marquee', 'services-grid', 'case-studies-featured', 'process-4step', 'team-photos', 'testimonials', 'contact-cta', 'footer-dark'],
    pages: ['index.html', 'work.html', 'services.html', 'about.html', 'contact.html'],
    aesthetic: 'dark bold agency case-studies professional edgy',
  },
  {
    id: 'agency-marketing',
    name: 'Growth Lab',
    category: 'agency',
    emoji: '\u{1F4C8}',
    description: 'Marketing agency with data-driven aesthetic, ROI stats, gradient charts.',
    colors: { primary: '#7c3aed', secondary: '#6d28d9', accent: '#a78bfa', bg: '#faf5ff', surface: '#ede9fe' },
    fonts: ['Plus Jakarta Sans', 'Inter'],
    sections: ['hero-stats-animated', 'services-marketing', 'results-counter', 'case-studies-roi', 'process-funnel', 'team-leadership', 'blog-insights', 'contact-form', 'footer-professional'],
    pages: ['index.html', 'services.html', 'case-studies.html', 'about.html', 'contact.html'],
    aesthetic: 'light data-driven purple professional growth-focused',
  },
  {
    id: 'agency-branding',
    name: 'Form & Function',
    category: 'agency',
    emoji: '\u{270D}',
    description: 'Branding agency with large typography, black & white, project deep-dives.',
    colors: { primary: '#171717', secondary: '#262626', accent: '#a3a3a3', bg: '#ffffff', surface: '#fafafa' },
    fonts: ['Clash Display', 'Inter'],
    sections: ['hero-text-massive', 'manifesto', 'selected-work-fullwidth', 'capabilities', 'brand-process', 'awards-list', 'team-culture', 'contact-minimal', 'footer-clean'],
    pages: ['index.html', 'work.html', 'about.html', 'contact.html'],
    aesthetic: 'minimal monochrome large-type editorial clean sophisticated',
  },
  {
    id: 'agency-creative',
    name: 'Wildcard Studio',
    category: 'agency',
    emoji: '\u{1F0CF}',
    description: 'Creative studio with experimental layout, mixed media, bright pops of color.',
    colors: { primary: '#f59e0b', secondary: '#d97706', accent: '#fbbf24', bg: '#18181b', surface: '#27272a' },
    fonts: ['Syne', 'Inter'],
    sections: ['hero-split-diagonal', 'reel-horizontal', 'services-stacked', 'projects-scattered', 'culture-photos', 'press-features', 'careers-cta', 'footer-experimental'],
    pages: ['index.html', 'work.html', 'studio.html', 'contact.html'],
    aesthetic: 'dark experimental creative scattered-layout yellow-accent bold',
  },
  {
    id: 'agency-web',
    name: 'Webcraft Co',
    category: 'agency',
    emoji: '\u{1F310}',
    description: 'Web development agency with clean code aesthetic, project timeline, tech stack showcase.',
    colors: { primary: '#06b6d4', secondary: '#0891b2', accent: '#22d3ee', bg: '#0f172a', surface: '#1e293b' },
    fonts: ['Inter', 'Fira Code'],
    sections: ['hero-code-animation', 'services-web', 'portfolio-grid', 'tech-stack', 'process-agile', 'testimonials', 'pricing-projects', 'contact-form', 'footer-dev'],
    pages: ['index.html', 'portfolio.html', 'services.html', 'about.html', 'contact.html'],
    aesthetic: 'dark developer cyan-accent clean code professional',
  },

  // ━━━ LANDING PAGES (6) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'landing-app',
    name: 'App Launch',
    category: 'landing',
    emoji: '\u{1F4F2}',
    description: 'Mobile app landing with phone mockup, feature highlights, app store badges.',
    colors: { primary: '#8b5cf6', secondary: '#7c3aed', accent: '#a78bfa', bg: '#0f0525', surface: 'rgba(139,92,246,0.08)' },
    fonts: ['DM Sans', 'Inter'],
    sections: ['hero-phone-mockup', 'feature-screens', 'how-it-works', 'testimonials-app', 'download-badges', 'faq', 'footer-app'],
    pages: ['index.html'],
    aesthetic: 'dark app-store phone-mockup gradient purple',
  },
  {
    id: 'landing-waitlist',
    name: 'Coming Soon',
    category: 'landing',
    emoji: '\u{23F3}',
    description: 'Pre-launch waitlist page with countdown timer, email capture, teaser animation.',
    colors: { primary: '#f43f5e', secondary: '#e11d48', accent: '#fda4af', bg: '#0a0a0a', surface: '#1a1a1a' },
    fonts: ['Space Grotesk', 'Inter'],
    sections: ['hero-countdown', 'teaser-features', 'email-capture', 'social-proof-count', 'faq-minimal', 'footer-simple'],
    pages: ['index.html'],
    aesthetic: 'dark dramatic countdown anticipation minimal',
  },
  {
    id: 'landing-product',
    name: 'Product Drop',
    category: 'landing',
    emoji: '\u{1F381}',
    description: 'Single product landing with hero video/image, specs, reviews, buy CTA.',
    colors: { primary: '#171717', secondary: '#404040', accent: '#f97316', bg: '#ffffff', surface: '#f5f5f5' },
    fonts: ['Plus Jakarta Sans', 'Inter'],
    sections: ['hero-product-center-large', 'features-icons', 'specs-table', 'gallery-360', 'reviews-stars', 'buy-cta-sticky', 'faq', 'footer-minimal'],
    pages: ['index.html'],
    aesthetic: 'clean product-focused minimal orange-accent apple-style',
  },
  {
    id: 'landing-event',
    name: 'Eventify',
    category: 'landing',
    emoji: '\u{1F3AB}',
    description: 'Event/conference landing with speaker lineup, schedule, ticket tiers.',
    colors: { primary: '#7c3aed', secondary: '#4f46e5', accent: '#818cf8', bg: '#020617', surface: 'rgba(79,70,229,0.1)' },
    fonts: ['Outfit', 'Inter'],
    sections: ['hero-event-date', 'speakers-grid', 'schedule-timeline', 'venue-map', 'ticket-tiers', 'sponsors-logos', 'faq', 'footer-event'],
    pages: ['index.html', 'speakers.html', 'schedule.html'],
    aesthetic: 'dark vibrant event conference purple-blue energetic',
  },
  {
    id: 'landing-newsletter',
    name: 'The Brief',
    category: 'landing',
    emoji: '\u{1F4E8}',
    description: 'Newsletter landing with past issues, subscriber count, clean editorial style.',
    colors: { primary: '#0f172a', secondary: '#334155', accent: '#f97316', bg: '#ffffff', surface: '#f8fafc' },
    fonts: ['Newsreader', 'Inter'],
    sections: ['hero-headline', 'past-issues-preview', 'topics-tags', 'subscriber-count', 'author-bio', 'subscribe-form', 'footer-editorial'],
    pages: ['index.html'],
    aesthetic: 'clean editorial newspaper serif whitespace professional',
  },
  {
    id: 'landing-saas-micro',
    name: 'Ship Fast',
    category: 'landing',
    emoji: '\u{26A1}',
    description: 'One-page SaaS micro-landing. Hero, 3 features, pricing, CTA. Ship in seconds.',
    colors: { primary: '#2563eb', secondary: '#1d4ed8', accent: '#3b82f6', bg: '#ffffff', surface: '#eff6ff' },
    fonts: ['Inter'],
    sections: ['hero-headline-cta', 'feature-3col', 'pricing-simple', 'testimonial-single', 'cta-final', 'footer-1line'],
    pages: ['index.html'],
    aesthetic: 'clean simple fast blue one-page conversion-focused',
  },

  // ━━━ BLOG (4) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'blog-magazine',
    name: 'The Dispatch',
    category: 'blog',
    emoji: '\u{1F4F0}',
    description: 'Magazine-style blog with featured hero post, grid layout, categories, dark theme.',
    colors: { primary: '#f43f5e', secondary: '#e11d48', accent: '#fda4af', bg: '#0a0a0a', surface: '#171717' },
    fonts: ['Newsreader', 'Inter'],
    sections: ['hero-featured-post', 'posts-grid-3col', 'category-pills', 'trending-sidebar', 'newsletter-subscribe', 'footer-magazine'],
    pages: ['index.html', 'article.html', 'about.html'],
    aesthetic: 'dark editorial magazine serif bold imagery',
  },
  {
    id: 'blog-minimal',
    name: 'Ink & Paper',
    category: 'blog',
    emoji: '\u{1F58B}',
    description: 'Minimalist writing blog with focus on typography, reading experience, light theme.',
    colors: { primary: '#1c1917', secondary: '#57534e', accent: '#a8a29e', bg: '#fafaf9', surface: '#f5f5f4' },
    fonts: ['Lora', 'Inter'],
    sections: ['posts-list-clean', 'featured-essay', 'about-author', 'subscribe-minimal', 'footer-simple'],
    pages: ['index.html', 'post.html', 'about.html'],
    aesthetic: 'minimal reading-focused serif whitespace elegant literary',
  },
  {
    id: 'blog-tech',
    name: 'Dev Journal',
    category: 'blog',
    emoji: '\u{1F4BB}',
    description: 'Tech blog with code snippets, dark theme, syntax highlighting, tag system.',
    colors: { primary: '#10b981', secondary: '#059669', accent: '#34d399', bg: '#0f172a', surface: '#1e293b' },
    fonts: ['Inter', 'JetBrains Mono'],
    sections: ['posts-grid-tags', 'featured-tutorial', 'series-list', 'newsletter-dev', 'footer-dev'],
    pages: ['index.html', 'post.html', 'about.html'],
    aesthetic: 'dark developer code-focused green terminal modern',
  },
  {
    id: 'blog-lifestyle',
    name: 'Golden Hour',
    category: 'blog',
    emoji: '\u{1F31F}',
    description: 'Lifestyle/travel blog with warm photography, Pinterest-style masonry, light theme.',
    colors: { primary: '#d97706', secondary: '#b45309', accent: '#fbbf24', bg: '#fffbeb', surface: '#fef3c7' },
    fonts: ['Playfair Display', 'Inter'],
    sections: ['hero-featured-photo', 'posts-masonry', 'categories-visual', 'about-blogger', 'instagram-grid', 'subscribe-warm', 'footer-lifestyle'],
    pages: ['index.html', 'post.html', 'about.html', 'travel.html'],
    aesthetic: 'warm lifestyle photography masonry golden inviting',
  },

  // ━━━ BUSINESS (5) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'business-corporate',
    name: 'Nexus Corp',
    category: 'business',
    emoji: '\u{1F3E2}',
    description: 'Corporate business site with professional blue, about us, services, team, contact.',
    colors: { primary: '#1e40af', secondary: '#1e3a8a', accent: '#60a5fa', bg: '#ffffff', surface: '#eff6ff' },
    fonts: ['Inter'],
    sections: ['hero-corporate', 'services-grid', 'about-mission', 'team-leadership', 'clients-logos', 'news-updates', 'contact-form', 'footer-corporate'],
    pages: ['index.html', 'about.html', 'services.html', 'team.html', 'contact.html'],
    aesthetic: 'clean professional corporate blue trustworthy',
  },
  {
    id: 'business-consulting',
    name: 'Stratego',
    category: 'business',
    emoji: '\u{1F4C8}',
    description: 'Consulting firm with authority-building design, case studies, thought leadership.',
    colors: { primary: '#0f172a', secondary: '#1e293b', accent: '#0ea5e9', bg: '#ffffff', surface: '#f8fafc' },
    fonts: ['DM Serif Display', 'Inter'],
    sections: ['hero-authority', 'expertise-areas', 'case-studies', 'methodology', 'team-partners', 'insights-blog', 'contact-consultation', 'footer-professional'],
    pages: ['index.html', 'services.html', 'case-studies.html', 'about.html', 'contact.html'],
    aesthetic: 'clean authoritative serif professional navy consulting',
  },
  {
    id: 'business-startup',
    name: 'LaunchPad',
    category: 'business',
    emoji: '\u{1F680}',
    description: 'Startup business with energetic gradients, team culture, investor-ready.',
    colors: { primary: '#8b5cf6', secondary: '#ec4899', accent: '#f472b6', bg: '#ffffff', surface: '#faf5ff' },
    fonts: ['Plus Jakarta Sans', 'Inter'],
    sections: ['hero-mission', 'problem-solution', 'product-preview', 'traction-metrics', 'team-culture-photos', 'backed-by-logos', 'careers-open', 'contact-cta', 'footer-startup'],
    pages: ['index.html', 'about.html', 'careers.html', 'contact.html'],
    aesthetic: 'light energetic startup gradient colorful young',
  },
  {
    id: 'business-law',
    name: 'Justice & Co',
    category: 'business',
    emoji: '\u{2696}',
    description: 'Law firm with dark navy, gold accents, practice areas, attorney profiles.',
    colors: { primary: '#1e3a5f', secondary: '#0f172a', accent: '#d4a853', bg: '#ffffff', surface: '#f1f5f9' },
    fonts: ['EB Garamond', 'Inter'],
    sections: ['hero-courthouse', 'practice-areas', 'attorneys-grid', 'results-verdicts', 'testimonials-clients', 'blog-legal', 'consultation-cta', 'footer-law'],
    pages: ['index.html', 'practice-areas.html', 'attorneys.html', 'about.html', 'contact.html'],
    aesthetic: 'professional navy gold serif authoritative trust law',
  },
  {
    id: 'business-accounting',
    name: 'Ledger Pro',
    category: 'business',
    emoji: '\u{1F4B0}',
    description: 'Accounting/finance firm with clean green, trust signals, service packages.',
    colors: { primary: '#15803d', secondary: '#166534', accent: '#4ade80', bg: '#ffffff', surface: '#f0fdf4' },
    fonts: ['Inter'],
    sections: ['hero-financial', 'services-accounting', 'why-choose-us', 'team-cpas', 'client-testimonials', 'resources-tax', 'consultation-booking', 'footer-finance'],
    pages: ['index.html', 'services.html', 'about.html', 'resources.html', 'contact.html'],
    aesthetic: 'clean professional green trustworthy finance numbers',
  },

  // ━━━ PERSONAL (4) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'personal-resume',
    name: 'Resume Pro',
    category: 'personal',
    emoji: '\u{1F4C4}',
    description: 'Interactive resume/CV with timeline, skills bars, downloadable PDF link.',
    colors: { primary: '#2563eb', secondary: '#1d4ed8', accent: '#60a5fa', bg: '#ffffff', surface: '#f8fafc' },
    fonts: ['Inter'],
    sections: ['hero-name-title', 'summary', 'experience-timeline', 'skills-bars', 'education', 'certifications', 'contact-info', 'download-pdf-cta'],
    pages: ['index.html'],
    aesthetic: 'clean professional resume structured blue',
  },
  {
    id: 'personal-link-bio',
    name: 'Link Hub',
    category: 'personal',
    emoji: '\u{1F517}',
    description: 'Link-in-bio page with avatar, social links, featured content. Like Linktree.',
    colors: { primary: '#8b5cf6', secondary: '#7c3aed', accent: '#c4b5fd', bg: '#0f0525', surface: 'rgba(139,92,246,0.1)' },
    fonts: ['DM Sans', 'Inter'],
    sections: ['avatar-name', 'bio-text', 'link-buttons-stack', 'featured-content', 'social-icons', 'footer-made-with'],
    pages: ['index.html'],
    aesthetic: 'dark centered links mobile-first gradient purple',
  },
  {
    id: 'personal-wedding',
    name: 'Forever & Always',
    category: 'personal',
    emoji: '\u{1F492}',
    description: 'Wedding invitation site with RSVP form, photo gallery, countdown, love story.',
    colors: { primary: '#be185d', secondary: '#9d174d', accent: '#f9a8d4', bg: '#fff1f2', surface: '#ffe4e6' },
    fonts: ['Cormorant Garamond', 'Inter'],
    sections: ['hero-couple-photo', 'love-story-timeline', 'event-details', 'rsvp-form', 'photo-gallery', 'registry-links', 'accommodation-info', 'footer-hearts'],
    pages: ['index.html', 'rsvp.html', 'gallery.html', 'details.html'],
    aesthetic: 'romantic soft pink serif elegant floral delicate',
  },
  {
    id: 'personal-musician',
    name: 'Soundwave',
    category: 'personal',
    emoji: '\u{1F3B5}',
    description: 'Musician/band site with dark theme, tour dates, music player, merch shop.',
    colors: { primary: '#ec4899', secondary: '#db2777', accent: '#f9a8d4', bg: '#0a0a0a', surface: '#171717' },
    fonts: ['Bebas Neue', 'Inter'],
    sections: ['hero-album-art', 'music-player', 'tour-dates', 'videos-section', 'merch-grid', 'about-artist', 'newsletter-fans', 'footer-music'],
    pages: ['index.html', 'tour.html', 'merch.html', 'about.html'],
    aesthetic: 'dark bold music pink energetic album-art',
  },

  // ━━━ HEALTH (3) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'health-clinic',
    name: 'Vitality Clinic',
    category: 'health',
    emoji: '\u{1F3E5}',
    description: 'Medical clinic with calming blue/teal, doctor profiles, appointment booking.',
    colors: { primary: '#0d9488', secondary: '#0f766e', accent: '#5eead4', bg: '#ffffff', surface: '#f0fdfa' },
    fonts: ['DM Sans', 'Inter'],
    sections: ['hero-caring', 'services-medical', 'doctors-grid', 'appointment-booking', 'patient-testimonials', 'insurance-accepted', 'location-hours', 'footer-medical'],
    pages: ['index.html', 'services.html', 'doctors.html', 'about.html', 'contact.html'],
    aesthetic: 'clean calming teal medical professional trustworthy',
  },
  {
    id: 'health-fitness',
    name: 'Iron Temple',
    category: 'health',
    emoji: '\u{1F4AA}',
    description: 'Gym/fitness with dark aggressive theme, class schedule, trainer profiles, membership tiers.',
    colors: { primary: '#ef4444', secondary: '#dc2626', accent: '#fbbf24', bg: '#0a0a0a', surface: '#1a1a1a' },
    fonts: ['Oswald', 'Inter'],
    sections: ['hero-gym-action', 'class-schedule', 'trainers-grid', 'membership-tiers', 'transformation-gallery', 'facilities-tour', 'free-trial-cta', 'footer-gym'],
    pages: ['index.html', 'classes.html', 'trainers.html', 'membership.html', 'contact.html'],
    aesthetic: 'dark aggressive red bold fitness high-energy',
  },
  {
    id: 'health-wellness',
    name: 'Serene Spa',
    category: 'health',
    emoji: '\u{1F9D8}',
    description: 'Wellness/spa with calming earth tones, treatment menu, booking, ambient design.',
    colors: { primary: '#65a30d', secondary: '#4d7c0f', accent: '#a3e635', bg: '#fefce8', surface: '#ecfccb' },
    fonts: ['Cormorant Garamond', 'Inter'],
    sections: ['hero-zen-nature', 'treatments-menu', 'packages-wellness', 'therapists', 'gallery-ambient', 'booking-form', 'gift-cards', 'footer-spa'],
    pages: ['index.html', 'treatments.html', 'about.html', 'book.html'],
    aesthetic: 'calm zen green natural spa organic serif peaceful',
  },

  // ━━━ REAL ESTATE (3) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'realestate-luxury',
    name: 'Prestige Realty',
    category: 'real-estate',
    emoji: '\u{1F3E0}',
    description: 'Luxury real estate with property search, agent profiles, virtual tour CTAs.',
    colors: { primary: '#1e3a5f', secondary: '#0f172a', accent: '#d4a853', bg: '#ffffff', surface: '#f8fafc' },
    fonts: ['Playfair Display', 'Inter'],
    sections: ['hero-luxury-home', 'property-search', 'featured-listings', 'neighborhoods-guide', 'agents-team', 'testimonials-buyers', 'market-report', 'contact-agent', 'footer-realty'],
    pages: ['index.html', 'listings.html', 'agents.html', 'about.html', 'contact.html'],
    aesthetic: 'professional luxury navy gold real-estate elegant',
  },
  {
    id: 'realestate-modern',
    name: 'UrbanNest',
    category: 'real-estate',
    emoji: '\u{1F3D9}',
    description: 'Modern real estate with dark theme, property cards, map view, mortgage calculator.',
    colors: { primary: '#8b5cf6', secondary: '#7c3aed', accent: '#a78bfa', bg: '#0a0a0a', surface: '#171717' },
    fonts: ['Space Grotesk', 'Inter'],
    sections: ['hero-city-skyline', 'property-grid-cards', 'map-view', 'mortgage-calculator', 'neighborhoods', 'agent-contact', 'testimonials', 'footer-modern'],
    pages: ['index.html', 'properties.html', 'about.html', 'contact.html'],
    aesthetic: 'dark modern urban purple sleek city',
  },
  {
    id: 'realestate-rental',
    name: 'StayLocal',
    category: 'real-estate',
    emoji: '\u{1F3E1}',
    description: 'Vacation rental / Airbnb-style with search, property cards, reviews, booking.',
    colors: { primary: '#f43f5e', secondary: '#e11d48', accent: '#fda4af', bg: '#ffffff', surface: '#fff1f2' },
    fonts: ['DM Sans', 'Inter'],
    sections: ['hero-search-bar', 'popular-destinations', 'property-grid-photos', 'amenity-filters', 'host-profiles', 'reviews-guests', 'become-host-cta', 'footer-travel'],
    pages: ['index.html', 'listings.html', 'property-detail.html', 'contact.html'],
    aesthetic: 'light friendly airbnb-style red travel photos',
  },

  // ━━━ EDUCATION (3) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'education-course',
    name: 'LearnFlow',
    category: 'education',
    emoji: '\u{1F4DA}',
    description: 'Online course platform with course cards, instructor profiles, progress tracking.',
    colors: { primary: '#2563eb', secondary: '#1d4ed8', accent: '#60a5fa', bg: '#ffffff', surface: '#eff6ff' },
    fonts: ['DM Sans', 'Inter'],
    sections: ['hero-learn', 'featured-courses', 'categories-grid', 'instructor-spotlight', 'student-testimonials', 'pricing-plans', 'faq', 'footer-education'],
    pages: ['index.html', 'courses.html', 'about.html', 'contact.html'],
    aesthetic: 'clean friendly educational blue approachable modern',
  },
  {
    id: 'education-school',
    name: 'Academy Plus',
    category: 'education',
    emoji: '\u{1F393}',
    description: 'School/university with campus photos, programs, admissions, events calendar.',
    colors: { primary: '#1e3a5f', secondary: '#0f172a', accent: '#f59e0b', bg: '#ffffff', surface: '#f8fafc' },
    fonts: ['Merriweather', 'Inter'],
    sections: ['hero-campus', 'programs-grid', 'admissions-info', 'campus-life', 'faculty-highlight', 'events-calendar', 'apply-cta', 'footer-academic'],
    pages: ['index.html', 'programs.html', 'admissions.html', 'about.html', 'contact.html'],
    aesthetic: 'professional academic serif navy traditional trustworthy',
  },
  {
    id: 'education-bootcamp',
    name: 'Code Camp',
    category: 'education',
    emoji: '\u{1F4BB}',
    description: 'Coding bootcamp with dark theme, curriculum breakdown, outcomes stats, apply CTA.',
    colors: { primary: '#10b981', secondary: '#059669', accent: '#34d399', bg: '#0f172a', surface: '#1e293b' },
    fonts: ['Space Grotesk', 'JetBrains Mono'],
    sections: ['hero-code-bootcamp', 'curriculum-modules', 'outcomes-stats', 'student-projects', 'instructors', 'financing-options', 'apply-form', 'footer-tech'],
    pages: ['index.html', 'curriculum.html', 'outcomes.html', 'apply.html'],
    aesthetic: 'dark developer bootcamp green code modern',
  },

  // ━━━ NONPROFIT (2) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'nonprofit-charity',
    name: 'HopeForward',
    category: 'nonprofit',
    emoji: '\u{1F49A}',
    description: 'Charity/NGO with impact stats, donation form, volunteer signup, stories.',
    colors: { primary: '#059669', secondary: '#047857', accent: '#34d399', bg: '#ffffff', surface: '#ecfdf5' },
    fonts: ['DM Sans', 'Inter'],
    sections: ['hero-impact-photo', 'mission-statement', 'impact-stats-counter', 'programs-grid', 'stories-carousel', 'donate-form', 'volunteer-cta', 'partners-logos', 'footer-nonprofit'],
    pages: ['index.html', 'programs.html', 'about.html', 'donate.html', 'contact.html'],
    aesthetic: 'warm green hopeful impact-focused approachable community',
  },
  {
    id: 'nonprofit-environment',
    name: 'Green Earth',
    category: 'nonprofit',
    emoji: '\u{1F33F}',
    description: 'Environmental nonprofit with nature imagery, petition forms, event calendar.',
    colors: { primary: '#15803d', secondary: '#166534', accent: '#86efac', bg: '#f0fdf4', surface: '#dcfce7' },
    fonts: ['Outfit', 'Inter'],
    sections: ['hero-nature-fullscreen', 'crisis-stats', 'campaigns-active', 'take-action', 'events-upcoming', 'impact-map', 'donate-green', 'footer-earth'],
    pages: ['index.html', 'campaigns.html', 'about.html', 'donate.html'],
    aesthetic: 'green nature earth organic environmental activism',
  },

  // ━━━ ENTERTAINMENT (2) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'entertainment-streaming',
    name: 'StreamVault',
    category: 'entertainment',
    emoji: '\u{1F3AC}',
    description: 'Streaming/media platform with content cards, categories, hero banner, dark theme.',
    colors: { primary: '#dc2626', secondary: '#b91c1c', accent: '#fbbf24', bg: '#0a0a0a', surface: '#1a1a1a' },
    fonts: ['Inter'],
    sections: ['hero-featured-banner', 'trending-carousel', 'category-rows', 'top-10-list', 'new-releases', 'continue-watching', 'plans-comparison', 'footer-streaming'],
    pages: ['index.html', 'browse.html'],
    aesthetic: 'dark streaming netflix-style red content-grid immersive',
  },
  {
    id: 'entertainment-gaming',
    name: 'Nexus Gaming',
    category: 'entertainment',
    emoji: '\u{1F3AE}',
    description: 'Gaming community/esports with neon accents, leaderboards, tournament brackets.',
    colors: { primary: '#06b6d4', secondary: '#0891b2', accent: '#22d3ee', bg: '#0a0a0a', surface: '#111827' },
    fonts: ['Rajdhani', 'Inter'],
    sections: ['hero-game-art', 'featured-games', 'tournament-bracket', 'leaderboard', 'team-roster', 'news-updates', 'join-community', 'footer-gaming'],
    pages: ['index.html', 'tournaments.html', 'leaderboard.html', 'about.html'],
    aesthetic: 'dark neon gaming esports cyan aggressive futuristic',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Get all unique categories from templates */
export function getCategories(): TemplateCategory[] {
  const seen = new Set<TemplateCategory>();
  for (const t of DESIGN_TEMPLATES) seen.add(t.category);
  return Array.from(seen);
}

/** Find templates by category */
export function getTemplatesByCategory(category: TemplateCategory): DesignTemplate[] {
  return DESIGN_TEMPLATES.filter(t => t.category === category);
}

/** Search templates by keyword */
export function searchTemplates(query: string): DesignTemplate[] {
  const q = query.toLowerCase();
  return DESIGN_TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.aesthetic.toLowerCase().includes(q) ||
    t.category.includes(q)
  );
}

/** Convert a template to an AI prompt that generates the site */
export function templateToPrompt(template: DesignTemplate, userRequest?: string): string {
  const colorCSS = `primary: '${template.colors.primary}', secondary: '${template.colors.secondary}', accent: '${template.colors.accent}'`;
  const fontImports = template.fonts.map(f =>
    `https://fonts.googleapis.com/css2?family=${f.replace(/\s+/g, '+')}:wght@300;400;500;600;700;800;900&display=swap`
  ).join('\n- ');

  return `Build a website using the "${template.name}" template.

## Template Specs
- **Style**: ${template.aesthetic}
- **Background**: ${template.colors.bg}
- **Surface/cards**: ${template.colors.surface}
- **Tailwind config colors**: { ${colorCSS} }
- **Fonts**: ${template.fonts.join(', ')} (import from Google Fonts)
  - ${fontImports}
- **Pages to create**: ${template.pages.join(', ')}

## Required Sections (in this order):
${template.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Description
${template.description}

${userRequest ? `## User's specific request:\n${userRequest}` : ''}

Create ALL ${template.pages.length} pages with the exact color palette, fonts, and section order above. Make it look like a professional Figma/Framer design — not a basic HTML page.`;
}
