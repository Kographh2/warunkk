import { Suspense } from 'react';
import { LoadingScreen } from '@/components/LoadingScreen';
import OrderClient from './OrderClient';

export default function OrderPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OrderClient />
    </Suspense>
  );
}
