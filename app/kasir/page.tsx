import { Suspense } from 'react';
import { LoadingScreen } from '@/components/LoadingScreen';
import KasirClient from './KasirClient';

export default function KasirPage() {
  return (
    <Suspense fallback={<LoadingScreen label="Membuka scanner kasir..." />}>
      <KasirClient />
    </Suspense>
  );
}
