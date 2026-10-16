// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — BARCODE SCANNING (V4.1)
//  Two ways in, one result:
//   • Camera — the browser's native BarcodeDetector when it has one (Chrome
//     on Android / macOS / ChromeOS), otherwise ZXing in JavaScript (Chrome
//     on Windows, Firefox, Safari). ZXing is lazy-loaded, nothing on boot.
//   • Scanner gun — a USB / Bluetooth scanner is a keyboard that types very
//     fast and presses Enter. `createWedge` tells it apart from a human by
//     the gap between keystrokes.
// ═══════════════════════════════════════════════════════════════════════════
import { checkOrder } from './service';

const NATIVE_FORMATS = ['code_128', 'code_39', 'code_93', 'codabar', 'itf', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'data_matrix', 'pdf417'];
const PRODUCT_FORMATS = /^(ean_13|ean_8|upc_a|upc_e)$/i;

export const cameraSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

async function nativeDetector() {
  try {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    return formats.includes('code_128') ? new window.BarcodeDetector({ formats }) : null;
  } catch { return null; }
}

export async function listCameras() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch { return []; }
}

/**
 * Start the camera on `video` and call `onCode(text, format)` for every read.
 * Resolves to { engine, torch, setTorch(on), stop() }.
 */
export async function startCamera(video, { deviceId, onCode }) {
  if (!cameraSupported()) throw new Error(typeof window !== 'undefined' && !window.isSecureContext ? 'The camera needs HTTPS (or localhost).' : 'This browser has no camera access.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    // HD frames: built-in laptop cameras (MacBook FaceTime) are fixed-focus, so more pixels = more reads
    video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  video.srcObject = stream; video.muted = true; video.setAttribute('playsinline', ''); video.playsInline = true;
  await video.play().catch(() => {});
  const track = stream.getVideoTracks()[0];
  let stopped = false; let timer = null; let controls = null; let engine = 'native';

  const native = await nativeDetector();
  if (native) {
    const loop = async () => {
      if (stopped) return;
      try { if (video.readyState >= 2) { const found = await native.detect(video); if (found.length && !stopped) onCode(found[0].rawValue, found[0].format); } } catch { /* frame not ready */ }
      timer = setTimeout(loop, 110);
    };
    loop();
  } else {
    engine = 'zxing';
    const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.CODABAR, BarcodeFormat.ITF, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 90, delayBetweenScanSuccess: 500 });
    if (stopped) return { engine, stop() {} };
    controls = await reader.decodeFromVideoElement(video, (res) => { if (res && !stopped) onCode(res.getText(), String(BarcodeFormat[res.getBarcodeFormat()] || '').toLowerCase()); });
  }
  const caps = track?.getCapabilities?.() || {};
  const settings = track?.getSettings?.() || {};
  return {
    engine,
    label: track?.label || '',
    // laptop / front cameras: mirror the preview so aiming feels natural (decoding uses the real frames)
    mirror: settings.facingMode === 'user' || (!settings.facingMode && /facetime|front|integrated|webcam|built-in/i.test(track?.label || '')),
    torch: !!caps.torch,
    setTorch: (on) => track.applyConstraints({ advanced: [{ torch: !!on }] }).catch(() => {}),
    stop() {
      stopped = true; clearTimeout(timer);
      try { controls?.stop(); } catch { /* ignore */ }
      stream.getTracks().forEach((t) => t.stop());
      if (video.srcObject === stream) video.srcObject = null;
    },
  };
}

/**
 * What did we scan? → { value, raw, kind: 'order' | 'product' | 'other', format }
 * Order numbers are pulled out of longer payloads (QR codes, prefixed labels).
 */
export function parseScan(raw, format = '', management = {}) {
  const text = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const fmt = String(format || '').toLowerCase();
  if (PRODUCT_FORMATS.test(fmt) || (/^\d{12,13}$/.test(text) && !fmt.startsWith('code'))) return { value: text, raw: text, kind: 'product', format: fmt };
  if (checkOrder(text, { ...management, orderCheck: 'warn' }) === 'ok') return { value: text, raw: text, kind: 'order', format: fmt };
  // longest digit run that looks like an order number (QR payloads, "ORD#1095847721")
  const runs = (text.match(/\d{6,12}/g) || []).sort((a, b) => b.length - a.length);
  const hit = runs.find((r) => checkOrder(r, { ...management, orderCheck: 'warn' }) === 'ok');
  if (hit) return { value: hit, raw: text, kind: 'order', format: fmt };
  return { value: text.slice(0, 40), raw: text, kind: 'other', format: fmt };
}

/**
 * Keyboard-wedge detector. Feed it every keydown (capture phase).
 * Calls onScan(code, targetElement) when ≥ minLength characters arrive with an
 * average gap ≤ avgGap ms and end in Enter / Tab. Returns true when it handled
 * (and swallowed) the terminating key.
 */
export function createWedge({ onScan, minLength = 6, avgGap = 32, maxGap = 80 }) {
  let buf = ''; let last = 0; let gaps = []; let target = null;
  const reset = () => { buf = ''; gaps = []; target = null; };
  return {
    /** true while a fast burst is in progress (lets the app hold single-key shortcuts) */
    get bursting() { return buf.length >= 2 && performance.now() - last < maxGap; },
    handle(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) { reset(); return false; }
      const now = performance.now();
      if (e.key === 'Enter' || e.key === 'Tab') {
        const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : Infinity;
        if (buf.length >= minLength && avg <= avgGap && now - last <= maxGap * 2) {
          const code = buf; const el = target; reset();
          e.preventDefault(); e.stopPropagation();
          onScan(code, el);
          return true;
        }
        reset(); return false;
      }
      if (e.key && e.key.length === 1) {
        if (!buf || now - last > maxGap) { buf = ''; gaps = []; target = e.target; }
        else gaps.push(now - last);
        buf += e.key; last = now;
      }
      return false;
    },
  };
}
