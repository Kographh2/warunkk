'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LoadingScreen } from '@/components/LoadingScreen';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
      if (profile && ['owner', 'admin', 'kasir'].includes(profile.role)) {
        router.replace('/dashboard');
        return;
      }
      await supabase.auth.signOut();
      setError('Akun customer sudah dikeluarkan. Silakan login memakai akun staff owner/admin/kasir.');
      setLoading(false);
    }
    checkSession();
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (loginError) setError(loginError.message);
    else router.replace('/dashboard');
  }

  if (loading) return <LoadingScreen label="Membuka pintu dashboard..." />;

  return (
    <main className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-7 col-lg-5">
          <div className="soft-card p-4 p-lg-5">
            <Link href="/" className="text-decoration-none small text-muted"><i className="bi bi-arrow-left me-1" />Kembali</Link>
            <div className="text-center my-4">
              <div className="brand-gradient rounded-4 mx-auto d-grid text-white" style={{ width: 76, height: 76, placeItems: 'center' }}>
                <i className="bi bi-shop fs-1" />
              </div>
              <h1 className="fw-bold mt-3 mb-1">Login Staff</h1>
              <p className="text-muted mb-0">Owner, admin, dan kasir menggunakan akses Supabase Auth.</p>
            </div>
            {error && <div className="alert alert-danger rounded-4">{error}</div>}
            <form onSubmit={submit} className="vstack gap-3">
              <div>
                <label className="form-label fw-semibold">Email</label>
                <input type="email" className="form-control form-control-lg rounded-4" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="form-label fw-semibold">Password</label>
                <input type="password" className="form-control form-control-lg rounded-4" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <button disabled={submitting} className="btn btn-warunk btn-lg rounded-pill">
                {submitting ? 'Masuk...' : 'Masuk Dashboard'}
              </button>
            </form>
            <div className="alert alert-warning rounded-4 small mt-4 mb-0">
              Buat user di Supabase Auth terlebih dahulu, lalu set role pada tabel <code>profiles</code> menjadi <code>owner</code>, <code>admin</code>, atau <code>kasir</code>.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
