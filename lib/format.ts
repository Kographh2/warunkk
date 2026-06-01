export function rupiah(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(numberValue);
}

export function compactDate(date?: string | null) {
  if (!date) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

export function paymentCode() {
  const now = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `WRK-${now}-${rand}`;
}

export function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    cart_created: 'Keranjang dibuat',
    waiting_payment: 'Menunggu bayar di kasir',
    paid: 'Sudah dibayar',
    preparing: 'Sedang disiapkan',
    ready: 'Siap diambil/diantar',
    completed: 'Selesai',
    cancelled: 'Dibatalkan'
  };
  return labels[status] ?? status;
}

export function orderStatusBadge(status: string) {
  const classes: Record<string, string> = {
    cart_created: 'text-bg-secondary',
    waiting_payment: 'text-bg-warning',
    paid: 'text-bg-primary',
    preparing: 'text-bg-info',
    ready: 'text-bg-success',
    completed: 'text-bg-dark',
    cancelled: 'text-bg-danger'
  };
  return classes[status] ?? 'text-bg-light';
}

export function appUrl() {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}
