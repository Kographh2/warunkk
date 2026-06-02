'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@/components/LoadingScreen';

export default function CustomerLoginRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/login?next=/'); }, [router]);
  return <LoadingScreen label="Membuka halaman masuk..." />;
}
