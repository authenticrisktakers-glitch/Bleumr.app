// ─── VisionService — Camera capture for voice agent vision ─────────────────
// Handles getUserMedia (front/rear), frame capture to base64 JPEG,
// and camera lifecycle. Works in both Electron and PWA.

export interface VisionFrame {
  base64: string;   // JPEG base64 (no data: prefix)
  width: number;
  height: number;
  timestamp: number;
}

const CAPTURE_WIDTH = 640;
const CAPTURE_HEIGHT = 480;
const JPEG_QUALITY = 0.7; // ~30-60KB per frame

let activeStream: MediaStream | null = null;

/** Start the camera. Returns a MediaStream to attach to a <video> element. */
export async function startCamera(facingMode: 'user' | 'environment' = 'environment'): Promise<MediaStream> {
  // Stop any existing stream first
  stopCamera();

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode,
      width: { ideal: CAPTURE_WIDTH },
      height: { ideal: CAPTURE_HEIGHT },
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

/** Capture a single frame from the video element as base64 JPEG. */
export function captureFrame(video: HTMLVideoElement): VisionFrame | null {
  if (!video || video.readyState < 2) return null; // HAVE_CURRENT_DATA

  const canvas = document.createElement('canvas');
  const w = video.videoWidth || CAPTURE_WIDTH;
  const h = video.videoHeight || CAPTURE_HEIGHT;

  // Scale down if too large
  const scale = Math.min(1, CAPTURE_WIDTH / w);
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

/** Check if camera is currently active. */
export function isCameraActive(): boolean {
  return activeStream !== null && activeStream.active;
}

/** Flip between front and rear camera. Returns the new stream. */
export async function flipCamera(currentFacing: 'user' | 'environment'): Promise<MediaStream> {
  const next = currentFacing === 'user' ? 'environment' : 'user';
  return startCamera(next);
}
