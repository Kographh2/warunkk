(function () {
  window.WarunkNotify = {
    async register() {
      if (!('serviceWorker' in navigator)) return null;
      return navigator.serviceWorker.register('/sw.js');
    },
    async requestPermission() {
      if (!('Notification' in window)) return 'unsupported';
      return Notification.requestPermission();
    },
    async show(title, body, url) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return false;
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (reg) await reg.showNotification(title || 'WARUNK ONLINE', { body: body || 'Ada update pesanan.', icon: '/logo.svg', data: { url: url || '/' } });
      else new Notification(title || 'WARUNK ONLINE', { body: body || 'Ada update pesanan.', icon: '/logo.svg' });
      return true;
    }
  };
})();
