import type { Metadata, Viewport } from 'next';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';
import { PwaNotifier } from '@/components/PwaNotifier';

export const metadata: Metadata = {
  title: 'WARUNK ONLINE',
  description: 'Warung digital realtime dengan QR meja dan pembayaran kasir.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Warunk' },
  icons: { icon: '/logo.svg', apple: '/logo.svg' }
};

export const viewport: Viewport = {
  themeColor: '#1f55d6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        {children}
        <PwaNotifier />
      </body>
    </html>
  );
}
