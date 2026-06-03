'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@/components/LoadingScreen';
import { supabase } from '@/lib/supabase';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
      else setLoading(false);
    });
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    if (mode === 'login') {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (loginError) setError(loginError.message);
      else router.replace('/');
      return;
    }

    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name || email.split('@')[0],
          role: 'customer'
        }
      }
    });
    setSubmitting(false);
    if (signupError) setError(signupError.message);
    else setMessage('Akun customer dibuat. Kalau email confirmation aktif di Supabase, cek inbox dulu; kalau nonaktif, kamu bisa langsung login.');
  }

  if (loading) return <LoadingScreen label="Membuka login customer..." />;

  return (
    <main className="customer-page">
      <div className="customer-shell auth-customer-shell">
        <div className="auth-customer-hero text-center">
          <Link href="/" className="auth-back"><i className="bi bi-arrow-left" /> Home</Link>
          <div className="loading-logo mx-auto mb-3"><span className="loading-mark">P</span></div>
          <h1>{mode === 'login' ? 'Login History' : 'Daftar Customer'}</h1>
          <p>Order tetap bisa tanpa login. Login ini hanya untuk menyimpan history agar tidak hilang saat ganti perangkat.</p>
        </div>

        <div className="p-3 p-sm-4">
          {error && <div className="alert alert-danger rounded-4 small">{error}</div>}
          {message && <div className="alert alert-success rounded-4 small">{message}</div>}

          <form onSubmit={submit} className="auth-customer-card vstack gap-3">
            {mode === 'register' && (
              <div>
                <label className="form-label fw-bold">Nama</label>
                <input className="form-control form-control-lg rounded-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kamu" />
              </div>
            )}
            <div>
              <label className="form-label fw-bold">Email</label>
              <input type="email" className="form-control form-control-lg rounded-4" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nama@email.com" />
            </div>
            <div>
              <label className="form-label fw-bold">Password</label>
              <input type="password" minLength={6} className="form-control form-control-lg rounded-4" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Minimal 6 karakter" />
            </div>
            <button disabled={submitting} className="btn btn-warunk btn-lg rounded-pill">
              {submitting ? 'Memproses...' : mode === 'login' ? 'Login Customer' : 'Buat Akun Customer'}
            </button>
          </form>

          <button className="btn btn-link w-100 text-decoration-none mt-3" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Belum punya akun? Daftar customer' : 'Sudah punya akun? Login'}
          </button>
        </div>
      </div>
    </main>
  );
}
