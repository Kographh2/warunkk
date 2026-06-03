window.PrataPaNotify = {
  async register() {
    if (!('serviceWorker' in navigator)) return false;
    try {
      await navigator.serviceWorker.register('/sw.js');
      return true;
    } catch {
      return false;
    }
  },
  async request() {
    await this.register();
    if (!('Notification' in window)) return 'unsupported';
    return Notification.requestPermission();
  }
};
