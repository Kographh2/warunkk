(function () {
  const APP_NAME = 'Pratapa Mart';

  function isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  async function register() {
    if (!('serviceWorker' in navigator)) return { ok: false, reason: 'service_worker_unsupported' };
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      return { ok: true, registration };
    } catch (error) {
      return { ok: false, reason: error?.message || 'register_failed' };
    }
  }

  async function request() {
    const registered = await register();
    if (!registered.ok) return 'unsupported';
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.requestPermission();
  }

  async function show(title, options) {
    const permission = await request();
    if (permission !== 'granted') return false;
    const ready = await navigator.serviceWorker.ready;
    await ready.showNotification(title || APP_NAME, {
      icon: '/logo.svg',
      badge: '/logo.svg',
      ...options
    });
    return true;
  }

  function getInstallInfo() {
    const ua = navigator.userAgent || '';
    const ios = /iphone|ipad|ipod/i.test(ua);
    const android = /android/i.test(ua);
    return {
      standalone: isStandalone(),
      ios,
      android,
      title: ios ? 'Install di iPhone/iPad' : android ? 'Install di Android' : 'Install App',
      steps: ios
        ? ['Tap tombol Share di Safari', 'Pilih Add to Home Screen', 'Buka Pratapa Mart dari Home Screen', 'Aktifkan notifikasi dari Settings']
        : ['Tap tombol Install jika muncul', 'Atau buka menu ⋮ browser', 'Pilih Install app / Add to Home Screen', 'Aktifkan notifikasi dari Settings']
    };
  }

  window.PrataPaNotify = { register, request, show, getInstallInfo, isStandalone };
})();
