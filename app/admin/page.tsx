'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@/components/LoadingScreen';

export default function AdminShortcut() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return <LoadingScreen label="Membuka dashboard..." />;
}
