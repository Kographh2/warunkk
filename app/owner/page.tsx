'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@/components/LoadingScreen';

export default function OwnerShortcut() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/reports'); }, [router]);
  return <LoadingScreen label="Membuka laporan owner..." />;
}
