(function () {
  const SOUND_URL = '/sound.mp3';

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      return registration;
    } catch (error) {
      console.warn('[WARUNK] Service worker gagal aktif:', error);
      return null;
    }
  }

  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }

  async function playSound() {
    try {
      const audio = new Audio(SOUND_URL);
      audio.volume = 0.72;
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  async function notify(payload) {
    const title = payload?.title || 'WARUNK ONLINE';
    const body = payload?.body || 'Ada update pesanan baru.';
    const tag = payload?.tag || 'warunk-update';
    const url = payload?.url || '/';

    await playSound();

    if (!('Notification' in window) || Notification.permission !== 'granted') return false;

    const registration = await registerServiceWorker();
    if (registration?.active) {
      registration.active.postMessage({ type: 'WARUNK_SHOW_NOTIFICATION', title, body, tag, url });
      return true;
    }

    try {
      const notification = new Notification(title, { body, tag, icon: '/logo.svg', data: { url } });
      notification.onclick = function () {
        window.focus();
        if (url) window.location.href = url;
        notification.close();
      };
      return true;
    } catch {
      return false;
    }
  }

  function getDevice() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    return { isIOS, isAndroid, isStandalone, supportsInstallPrompt: 'BeforeInstallPromptEvent' in window };
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function subscribeToPush(vapidPublicKey) {
    if (!vapidPublicKey) return null;
    const permission = await requestPermission();
    if (permission !== 'granted') return null;
    const registration = await registerServiceWorker();
    if (!registration?.pushManager) return null;
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
  }

  window.WarunkPush = {
    registerServiceWorker,
    requestPermission,
    notify,
    playSound,
    getDevice,
    subscribeToPush
  };
})();
