'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QRCanvas({ value, title, subtitle }: { value: string; title?: string; subtitle?: string }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      margin: 1,
      width: 360,
      color: { dark: '#17120f', light: '#ffffff' }
    }).then((url) => {
      if (active) setSrc(url);
    });
    return () => { active = false; };
  }, [value]);

  return (
    <div className="qr-box text-center">
      {title && <h5 className="fw-bold mb-1">{title}</h5>}
      {subtitle && <p className="text-muted small mb-3">{subtitle}</p>}
      {src ? (
        <img src={src} alt={title || 'QR Code'} className="img-fluid rounded-4 border p-2 bg-white" />
      ) : (
        <div className="placeholder-glow"><span className="placeholder rounded-4" style={{ width: 260, height: 260 }} /></div>
      )}
    </div>
  );
}
