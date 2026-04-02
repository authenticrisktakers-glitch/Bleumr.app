/**
 * DeviceFingerprint — generates a stable hardware-based fingerprint
 * that survives PWA uninstall/reinstall, cache clears, and incognito.
 *
 * Combines signals that DON'T change between installs:
 *   - Canvas rendering (GPU-specific pixel output)
 *   - WebGL renderer + vendor strings
 *   - Screen dimensions + color depth + pixel ratio
 *   - Timezone + language
 *   - Platform + CPU cores + memory
 *   - Installed media codecs
 *
 * The fingerprint is a SHA-256 hex string.
 * It's NOT personally identifiable — it's a device class identifier.
 * Same device = same fingerprint, even after uninstall.
 */

// ── Simple hash (SHA-256 via SubtleCrypto) ──────────────────────────────────

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Canvas fingerprint ──────────────────────────────────────────────────────

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

    // Draw text with specific styling — GPU renders this differently per device
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Bleumr🌀device', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('fingerprint✨test', 4, 37);

    // Add some geometry
    ctx.beginPath();
    ctx.arc(50, 25, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7';
    ctx.fill();

    return canvas.toDataURL();
  } catch {
    return 'canvas-error';
  }
}

// ── WebGL fingerprint ───────────────────────────────────────────────────────

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';

    const glCtx = gl as WebGLRenderingContext;
    const debugInfo = glCtx.getExtension('WEBGL_debug_renderer_info');

    const renderer = debugInfo
      ? glCtx.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : 'unknown';
    const vendor = debugInfo
      ? glCtx.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : 'unknown';

    const maxTextureSize = glCtx.getParameter(glCtx.MAX_TEXTURE_SIZE);
    const maxVertexAttribs = glCtx.getParameter(glCtx.MAX_VERTEX_ATTRIBS);
    const maxVaryingVectors = glCtx.getParameter(glCtx.MAX_VARYING_VECTORS);
    const shadingLangVersion = glCtx.getParameter(glCtx.SHADING_LANGUAGE_VERSION);
    const extensions = (glCtx.getSupportedExtensions() || []).sort().join(',');

    return `${vendor}|${renderer}|${maxTextureSize}|${maxVertexAttribs}|${maxVaryingVectors}|${shadingLangVersion}|${extensions.length}`;
  } catch {
    return 'webgl-error';
  }
}

// ── Audio fingerprint ───────────────────────────────────────────────────────

function getAudioFingerprint(): Promise<string> {
  return new Promise((resolve) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) { resolve('no-audio'); return; }

      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const analyser = ctx.createAnalyser();
      const gain = ctx.createGain();
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      gain.gain.value = 0; // silent
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(10000, ctx.currentTime);

      oscillator.connect(analyser);
      analyser.connect(processor);
      processor.connect(gain);
      gain.connect(ctx.destination);

      let fingerprint = '';
      processor.onaudioprocess = (e) => {
        const data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(data);
        // Use a subset of frequency data as fingerprint
        fingerprint = data.slice(0, 30).reduce((a, b) => a + Math.abs(b), 0).toFixed(4);
        processor.disconnect();
        gain.disconnect();
        oscillator.stop();
        ctx.close().catch(() => {});
        resolve(fingerprint || 'audio-empty');
      };

      oscillator.start(0);

      // Timeout fallback
      setTimeout(() => {
        try { oscillator.stop(); ctx.close(); } catch {}
        resolve(fingerprint || 'audio-timeout');
      }, 500);
    } catch {
      resolve('audio-error');
    }
  });
}

// ── Media codec fingerprint ─────────────────────────────────────────────────

function getCodecFingerprint(): string {
  const codecs = [
    'video/mp4; codecs="avc1.42E01E"',
    'video/mp4; codecs="avc1.4D401E"',
    'video/mp4; codecs="hev1.1.6.L93.B0"',
    'video/webm; codecs="vp8"',
    'video/webm; codecs="vp9"',
    'video/webm; codecs="av01.0.01M.08"',
    'audio/mp4; codecs="mp4a.40.2"',
    'audio/webm; codecs="opus"',
    'audio/ogg; codecs="vorbis"',
    'audio/flac',
  ];

  try {
    const video = document.createElement('video');
    return codecs.map(c => {
      const r = video.canPlayType(c);
      return r === 'probably' ? 'P' : r === 'maybe' ? 'M' : 'N';
    }).join('');
  } catch {
    return 'codec-error';
  }
}

// ── System signals ──────────────────────────────────────────────────────────

function getSystemSignals(): string {
  const signals = [
    `${screen.width}x${screen.height}`,
    `${screen.colorDepth}`,
    `${window.devicePixelRatio}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.languages?.join(',') || '',
    navigator.platform,
    `${navigator.hardwareConcurrency || 0}`,
    `${(navigator as any).deviceMemory || 0}`,
    `${navigator.maxTouchPoints || 0}`,
    `${(screen as any).availWidth}x${(screen as any).availHeight}`,
  ];
  return signals.join('|');
}

// ── Generate full fingerprint ───────────────────────────────────────────────

let cachedFingerprint: string | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  // Return cached value if available (stable within session)
  if (cachedFingerprint) return cachedFingerprint;

  // Check localStorage for previously computed fingerprint
  // (optimization — avoids recomputing every page load)
  const stored = localStorage.getItem('bleumr_device_fp');
  if (stored) {
    cachedFingerprint = stored;
    return stored;
  }

  const [audioFP] = await Promise.all([
    getAudioFingerprint(),
  ]);

  const raw = [
    getCanvasFingerprint(),
    getWebGLFingerprint(),
    audioFP,
    getCodecFingerprint(),
    getSystemSignals(),
  ].join(':::');

  const hash = await sha256(raw);
  cachedFingerprint = hash;

  // Cache in localStorage for faster subsequent loads
  localStorage.setItem('bleumr_device_fp', hash);

  return hash;
}

/**
 * Get the fingerprint synchronously if already computed,
 * otherwise fall back to localStorage cache or return null.
 */
export function getDeviceFingerprintSync(): string | null {
  if (cachedFingerprint) return cachedFingerprint;
  return localStorage.getItem('bleumr_device_fp');
}

/**
 * Force recompute the fingerprint (e.g., after hardware change detection).
 */
export async function refreshDeviceFingerprint(): Promise<string> {
  cachedFingerprint = null;
  localStorage.removeItem('bleumr_device_fp');
  return getDeviceFingerprint();
}
