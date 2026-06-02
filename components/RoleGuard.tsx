'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Profile, Role } from '@/lib/types';
import { LoadingScreen } from './LoadingScreen';

export function RoleGuard({
  allow,
  children
}: {
  allow: Role[];
  children: (profile: Profile) => React.ReactNode;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setLoading(false);
        return;
      }
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', auth.user.id)
        .single();
      if (profileError || !data) {
        setError(profileError?.message || 'Profil tidak ditemukan.');
      } else {
        setProfile(data as Profile);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <LoadingScreen label="Memeriksa akses dashboard..." />;

  if (!profile) {
    return (
      <main className="container py-5">
        <div className="soft-card p-5 text-center mx-auto" style={{ maxWidth: 520 }}>
          <i className="bi bi-lock display-4 text-warunk" />
          <h1 className="fw-bold mt-3">Login diperlukan</h1>
          <p className="text-muted">{error || 'Masuk sebagai owner, admin, atau kasir untuk membuka dashboard.'}</p>
          <Link href="/login" className="btn btn-warunk rounded-pill px-4">Login Staff</Link>
        </div>
      </main>
    );
  }

  if (!profile.is_active || !allow.includes(profile.role)) {
    return (
      <main className="container py-5">
        <div className="alert alert-danger rounded-4">
          Akun <strong>{profile.full_name}</strong> tidak memiliki akses ke halaman ini.
        </div>
      </main>
    );
  }

  return <>{children(profile)}</>;
}
