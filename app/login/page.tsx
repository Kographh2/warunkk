import { Suspense } from 'react';
import { LoadingScreen } from '@/components/LoadingScreen';
import LoginClient from './LoginClient';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen label="Membuka halaman masuk..." />}>
      <LoginClient />
    </Suspense>
  );
}
