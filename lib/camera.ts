export type QrCameraSession = {
  stop: () => void;
};

function readQrResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && 'data' in result) {
    return String((result as { data?: string }).data || '');
  }
  return '';
}

export async function startQrCamera(
  video: HTMLVideoElement,
  onResult: (value: string) => void,
  onError?: (message: string) => void
): Promise<QrCameraSession> {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error('Browser belum mengizinkan akses kamera. Buka lewat HTTPS atau localhost, lalu izinkan kamera.');
  }

  const mod = await import('qr-scanner');
  const QrScanner = mod.default as any;

  const scanner = new QrScanner(
    video,
    (result: unknown) => {
      const value = readQrResult(result).trim();
      if (value) onResult(value);
    },
    {
      preferredCamera: 'environment',
      maxScansPerSecond: 8,
      highlightScanRegion: false,
      highlightCodeOutline: false
    }
  );

  try {
    await scanner.start();
  } catch (error) {
    scanner.destroy?.();
    const message = error instanceof Error ? error.message : 'Kamera tidak bisa dibuka. Pastikan izin kamera aktif.';
    onError?.(message);
    throw error;
  }

  return {
    stop() {
      scanner.stop?.();
      scanner.destroy?.();
    }
  };
}

export async function scanQrFromImage(source: File | Blob | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): Promise<string> {
  const mod = await import('qr-scanner');
  const QrScanner = mod.default as any;
  const result = await QrScanner.scanImage(source);
  return readQrResult(result).trim();
}
