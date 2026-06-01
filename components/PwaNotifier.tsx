'use client';

import { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

declare global {
  interface Window {
    WarunkPush?: {
      registerServiceWorker: () => Promise<ServiceWorkerRegistration | null>;
      requestPermission: () => Promise<NotificationPermission | 'unsupported'>;
      notify: (payload: { title: string; body?: string; tag?: string; url?: string }) => Promise<boolean>;
      playSound: () => Promise<boolean>;
      getDevice: () => { isIOS: boolean; isAndroid: boolean; isStandalone: boolean; supportsInstallPrompt: boolean };
    };
  }
}

function loadPushScript() {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined') return resolve();
    if (window.WarunkPush) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-warunk-push]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = '/push-notification.js';
    script.async = true;
    script.dataset.warunkPush = 'true';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

export function PwaNotifier() {
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [device, setDevice] = useState({ isIOS: false, isAndroid: false, isStandalone: false, supportsInstallPrompt: false });

  useEffect(() => {
    const hidden = window.localStorage.getItem('warunk-pwa-prompt-dismissed') === '1';
    setDismissed(hidden);

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setDevice((current) => ({ ...current, supportsInstallPrompt: true }));
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    loadPushScript().then(async () => {
      await window.WarunkPush?.registerServiceWorker();
      const nextDevice = window.WarunkPush?.getDevice?.();
      if (nextDevice) setDevice(nextDevice);
      if (!('Notification' in window)) setPermission('unsupported');
      else setPermission(Notification.permission);
      setReady(true);
    });

    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  const shouldShow = useMemo(() => {
    if (!ready || dismissed) return false;
    if (device.isStandalone && permission === 'granted') return false;
    return true;
  }, [device.isStandalone, dismissed, permission, ready]);

  async function enableNotification() {
    const result = await window.WarunkPush?.requestPermission?.();
    setPermission(result || 'unsupported');
    if (result === 'granted') {
      await window.WarunkPush?.notify?.({
        title: 'Notifikasi Warunk aktif',
        body: 'Kamu akan mendapat info realtime saat status pesanan berubah.',
        tag: 'warunk-permission-ok',
        url: '/'
      });
    }
  }

  async function installApp() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      setDeferredPrompt(null);
      return;
    }
    setShowSteps(true);
  }

  function closePrompt() {
    window.localStorage.setItem('warunk-pwa-prompt-dismissed', '1');
    setDismissed(true);
  }

  if (!shouldShow) return null;

  return (
    <div className="pwa-smart-prompt" role="dialog" aria-label="Aktifkan aplikasi warung">
      <button className="pwa-close" onClick={closePrompt} aria-label="Tutup">×</button>
      <div className="pwa-icon"><i className="bi bi-bell-fill" /></div>
      <div className="pwa-content">
        <strong>Info pesanan realtime</strong>
        <p>
          Aktifkan notifikasi dan pasang aplikasi ke Home Screen supaya update pesanan lebih mudah dipantau.
        </p>
        {showSteps && (
          <div className="pwa-steps">
            {device.isIOS ? (
              <>
                <span><b>iPhone/iPad:</b> buka Safari, tekan Share, lalu pilih Add to Home Screen.</span>
                <span>Setelah dibuka dari Home Screen, tekan Izinkan Notifikasi.</span>
              </>
            ) : (
              <>
                <span><b>Android/Chrome:</b> tekan menu browser, lalu pilih Install app atau Add to Home screen.</span>
                <span>Jika popup install muncul, tekan Install.</span>
              </>
            )}
          </div>
        )}
        <div className="pwa-actions">
          {permission !== 'granted' && permission !== 'unsupported' && (
            <button className="btn btn-pratapa btn-sm rounded-pill" onClick={enableNotification}>Izinkan Notifikasi</button>
          )}
          {!device.isStandalone && (
            <button className="btn btn-light btn-sm rounded-pill fw-bold" onClick={installApp}>Install App</button>
          )}
        </div>
      </div>
    </div>
  );
}
