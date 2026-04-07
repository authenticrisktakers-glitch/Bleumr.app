// ─── VisionService — Camera capture for voice agent vision ─────────────────
// Handles getUserMedia (front/rear), frame capture to base64 JPEG,
// and camera lifecycle. Works in both Electron and PWA.

export interface VisionFrame {
  base64: string;   // JPEG base64 (no data: prefix)
  width: number;
  height: number;
  timestamp: number;
}

// Stream resolution — request full 1080p from the camera hardware (crisp display)
const STREAM_WIDTH = 1920;
const STREAM_HEIGHT = 1080;

// AI capture resolution — what gets sent to the vision model
// 720p is the sweet spot: enough detail to read text/part numbers, small enough for fast upload
// 1280x720 @ 0.65 quality ≈ 40-70KB per frame vs 150-200KB at 1080p — 3x faster upload
const AI_CAPTURE_WIDTH = 1280;
const AI_CAPTURE_HEIGHT = 720;
const JPEG_QUALITY = 0.65;

let activeStream: MediaStream | null = null;

/** Start the camera at 1080p. Returns a MediaStream to attach to a <video> element. */
export async function startCamera(facingMode: 'user' | 'environment' = 'environment'): Promise<MediaStream> {
  // Stop any existing stream first
  stopCamera();

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode,
      width: { ideal: STREAM_WIDTH },
      height: { ideal: STREAM_HEIGHT },
    },
    audio: false,
  });

  activeStream = stream;
  return stream;
}

/** Stop the camera and release all tracks. */
export function stopCamera(): void {
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
}

/** Capture a single frame from the video element as base64 JPEG.
 *  Downscales to 720p for AI — fast upload, still enough detail to read text. */
export function captureFrame(video: HTMLVideoElement): VisionFrame | null {
  if (!video || video.readyState < 2) return null; // HAVE_CURRENT_DATA

  const canvas = document.createElement('canvas');
  const w = video.videoWidth || AI_CAPTURE_WIDTH;
  const h = video.videoHeight || AI_CAPTURE_HEIGHT;

  // Scale to 720p for AI (camera may be 1080p or higher)
  const scale = Math.min(1, AI_CAPTURE_WIDTH / w);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64 = dataUrl.split(',')[1]; // strip "data:image/jpeg;base64,"

  return {
    base64,
    width: canvas.width,
    height: canvas.height,
    timestamp: Date.now(),
  };
}

/** Start continuous frame capture at given FPS. Returns stop function. */
export function startContinuousCapture(
  video: HTMLVideoElement,
  onFrame: (frame: VisionFrame) => void,
  fps: number = 3,
): () => void {
  const interval = setInterval(() => {
    const frame = captureFrame(video);
    if (frame) onFrame(frame);
  }, Math.round(1000 / fps));
  return () => clearInterval(interval);
}

/** Check if camera is currently active. */
export function isCameraActive(): boolean {
  return activeStream !== null && activeStream.active;
}

/** Flip between front and rear camera. Returns the new stream. */
export async function flipCamera(currentFacing: 'user' | 'environment'): Promise<MediaStream> {
  const next = currentFacing === 'user' ? 'environment' : 'user';
  return startCamera(next);
}
