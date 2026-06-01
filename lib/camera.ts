export function qrPayload(result: unknown): string {
  if (typeof result === 'string') return result.trim();
  if (result && typeof result === 'object' && 'data' in result) {
    const value = (result as { data?: unknown }).data;
    return typeof value === 'string' ? value.trim() : '';
  }
  return '';
}

function cameraConstraints(): MediaStreamConstraints[] {
  return [
    {
      audio: false,
      video: {
        facingMode: { exact: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 1 }
      }
    },
    {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    },
    {
      audio: false,
      video: {
        facingMode: 'environment',
        width: { ideal: 960 },
        height: { ideal: 960 }
      }
    },
    {
      audio: false,
      video: {
        width: { ideal: 960 },
        height: { ideal: 960 }
      }
    },
    { audio: false, video: true }
  ];
}

export async function openBestCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Camera API is not available on this browser context.');
    error.name = 'NotSupportedError';
    throw error;
  }

  let lastError: unknown;
  for (const constraint of cameraConstraints()) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraint);
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      await video.play().catch(() => undefined);
      return stream;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function friendlyCameraError(error: unknown, fallbackContext: 'meja' | 'kasir' = 'meja') {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Akses kamera belum diizinkan. Tekan tombol kamera lalu pilih Izinkan pada popup browser.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Kamera belum ditemukan. Coba kamera belakang/depan lain, atau pakai tombol ambil foto QR.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera/meeting lalu coba lagi.';
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Browser hanya menyalakan kamera di HTTPS atau localhost. Untuk sementara pakai tombol ambil foto QR.';
  }
  return fallbackContext === 'kasir'
    ? 'Kamera belum aktif. Pilih Izinkan pada popup browser, atau masukkan kode order manual.'
    : 'Kamera belum aktif. Pilih Izinkan pada popup browser, atau ambil foto QR meja.';
}

export async function scanQrFromImage(source: File | HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): Promise<string> {
  const { default: QrScanner } = await import('qr-scanner');
  const result = await QrScanner.scanImage(source, {
    returnDetailedScanResult: true,
    alsoTryWithoutScanRegion: true
  });
  const payload = qrPayload(result);
  if (!payload) throw new Error('QR tidak terbaca.');
  return payload;
}
