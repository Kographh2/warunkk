'use client';

import { useEffect, useMemo, useState } from 'react';

function isIos() {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

export function PwaNotifier() {
  const [visible, setVisible] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [iosGuide, setIosGuide] = useState(false);
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | 'unsupported'>('default');

  const ios = useMemo(() => isIos(), []);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    if ('Notification' in window) setNotifStatus(Notification.permission);
    else setNotifStatus('unsupported');

    const dismissed = window.localStorage.getItem('warunk-pwa-dismissed') === '1';
    if (!dismissed && !isStandalone()) setTimeout(() => setVisible(true), 1400);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
      if (!dismissed) setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
  }, []);

  async function installApp() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => undefined);
      setInstallPrompt(null);
      setVisible(false);
      return;
    }
    if (ios) {
      setIosGuide(true);
      setVisible(true);
      return;
    }
    setIosGuide(true);
  }

  async function allowNotif() {
    if (!('Notification' in window)) {
      setNotifStatus('unsupported');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifStatus(permission);
    if (permission === 'granted') {
      try {
        new Notification('WARUNK ONLINE aktif', { body: 'Notifikasi pesanan siap dipakai.', icon: '/logo.svg' });
      } catch {
        // ignore notification render errors
      }
    }
  }

  function close() {
    window.localStorage.setItem('warunk-pwa-dismissed', '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="pwa-helper-card shadow-lg" role="dialog" aria-label="Install dan notifikasi aplikasi">
      <button className="pwa-close" onClick={close} aria-label="Tutup">×</button>
      <div className="d-flex gap-3 align-items-start">
        <div className="pwa-icon"><i className="bi bi-bell-fill" /></div>
        <div className="flex-grow-1">
          <strong className="d-block">Biar pesanan tidak kelewat</strong>
          <span className="text-muted small">Install WARUNK ONLINE dan aktifkan notifikasi realtime.</span>
        </div>
      </div>
      <div className="d-flex gap-2 mt-3">
        <button onClick={allowNotif} className="btn btn-sm btn-warunk rounded-pill flex-fill">
          {notifStatus === 'granted' ? 'Notif Aktif' : 'Izinkan Notif'}
        </button>
        <button onClick={installApp} className="btn btn-sm btn-outline-primary rounded-pill flex-fill">Install</button>
      </div>
      {iosGuide && (
        <div className="ios-guide mt-3">
          <strong>iPhone/iPad:</strong> buka Safari, tekan tombol <b>Share</b>, lalu pilih <b>Add to Home Screen</b>. Setelah dibuka dari Home Screen, izinkan notifikasi dari popup aplikasi.
          <br />
          <strong>Android:</strong> tekan <b>Install</b> atau menu Chrome <b>⋮</b> → <b>Add to Home screen</b>.
        </div>
      )}
    </div>
  );
}
