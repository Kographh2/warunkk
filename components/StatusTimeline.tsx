'use client';

import { OrderStatus } from '@/lib/types';

const steps: { key: OrderStatus; label: string; helper: string; icon: string }[] = [
  { key: 'waiting_payment', label: 'Bayar di kasir', helper: 'Tunjukkan QR pembayaran', icon: 'bi-qr-code' },
  { key: 'paid', label: 'Terverifikasi', helper: 'Kasir sudah scan QR', icon: 'bi-check2-circle' },
  { key: 'preparing', label: 'Dimasak', helper: 'Dapur menyiapkan pesanan', icon: 'bi-fire' },
  { key: 'ready', label: 'Siap', helper: 'Pesanan siap', icon: 'bi-bag-check' },
  { key: 'completed', label: 'Selesai', helper: 'Terima kasih', icon: 'bi-stars' }
];

export function StatusTimeline({ status }: { status: OrderStatus }) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === status));
  const isCancelled = status === 'cancelled';

  if (isCancelled) {
    return (
      <div className="alert alert-danger rounded-4 mb-0">
        <i className="bi bi-x-circle me-2" /> Pesanan dibatalkan. Silakan hubungi kasir.
      </div>
    );
  }

  return (
    <div className="row g-3">
      {steps.map((step, index) => {
        const active = index <= activeIndex;
        return (
          <div className="col-6 col-lg" key={step.key}>
            <div className={`h-100 p-3 rounded-4 border ${active ? 'bg-white shadow-sm' : 'bg-light text-muted'}`}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className={`timeline-dot ${active ? 'active' : ''}`} />
                <i className={`bi ${step.icon} ${active ? 'text-warunk' : ''}`} />
              </div>
              <div className="fw-bold small">{step.label}</div>
              <div className="small text-muted">{step.helper}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
