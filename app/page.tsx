import { Suspense } from 'react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { CustomerApp } from '@/components/CustomerApp';

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingScreen label="Membuka home warung digital..." />}>
      <CustomerApp />
    </Suspense>
  );
}
