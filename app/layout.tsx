import type { Metadata } from 'next';
import Script from 'next/script';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'WARUNK ONLINE',
  description: 'Warung digital realtime dengan QR meja dan pembayaran kasir.',
  manifest: '/manifest.webmanifest'
};

export const viewport = {
  themeColor: '#263E70'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}<Script src="/push-notification.js" strategy="afterInteractive" /></body>
    </html>
  );
}
