'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@/components/LoadingScreen';
import { supabase } from '@/lib/supabase';

type AuthMode = 'login' | 'register';
const STAFF_ROLES = ['owner', 'admin', 'kasir'];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const title = useMemo(() => (mode === 'login' ? 'Masuk Akun' : 'Daftar Akun'), [mode]);

  useEffect(() => {
    const initialMode = new URLSearchParams(window.location.search).get('mode');
    if (initialMode === 'register') setMode('register');

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user.id) {
        await routeAfterAuth(data.session.user.id);
        return;
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function routeAfterAuth(userId: string) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,is_active')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.is_active && STAFF_ROLES.includes(profile.role)) {
      router.replace('/dashboard');
      return;
    }

    router.replace('/');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (mode === 'register' && password !== confirmPassword) {
      setError('Konfirmasi password belum sama.');
      return;
    }

    setSubmitting(true);

    if (mode === 'login') {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (loginError || !data.user) {
        setError('Email atau password belum sesuai. Coba cek lagi ya.');
        return;
      }
      await routeAfterAuth(data.user.id);
      return;
    }

    const { data, error: signupError } = await supabase.auth.signUp({
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
    if (signupError) {
      setError(signupError.message);
      return;
    }

    if (data.user && data.session) {
      await routeAfterAuth(data.user.id);
      return;
    }

    setMessage('Akun berhasil dibuat. Cek email kalau konfirmasi aktif, lalu masuk memakai akunmu.');
    setMode('login');
    setPassword('');
    setConfirmPassword('');
  }

  if (loading) return <LoadingScreen label="Membuka akses..." />;

  return (
    <main className="customer-page">
      <div className="customer-shell auth-customer-shell unified-login-shell">
        <div className="auth-customer-hero text-center">
          <Link href="/" className="auth-back"><i className="bi bi-arrow-left" /> Home</Link>
          <div className="loading-logo mx-auto mb-3"><span className="loading-mark">P</span></div>
          <h1>{title}</h1>
          <p>Satu halaman masuk untuk semua akun. Customer bisa order tanpa login; login hanya membuat history lebih aman dan tersimpan.</p>
        </div>

        <div className="p-3 p-sm-4">
          <div className="auth-mode-switch mb-3" role="tablist" aria-label="Pilih mode login atau register">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Masuk</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Daftar</button>
          </div>

          {error && <div className="alert alert-danger rounded-4 small">{error}</div>}
          {message && <div className="alert alert-success rounded-4 small">{message}</div>}

          <form onSubmit={submit} className="auth-customer-card vstack gap-3">
            {mode === 'register' && (
              <div>
                <label className="form-label fw-bold">Nama</label>
                <input className="form-control form-control-lg rounded-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kamu" autoComplete="name" />
              </div>
            )}
            <div>
              <label className="form-label fw-bold">Email</label>
              <input type="email" className="form-control form-control-lg rounded-4" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nama@email.com" autoComplete="email" />
            </div>
            <div>
              <label className="form-label fw-bold">Password</label>
              <div className="input-group input-group-lg auth-password-group">
                <input type={showPassword ? 'text' : 'password'} minLength={6} className="form-control rounded-start-4" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Minimal 6 karakter" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                <button type="button" className="btn btn-outline-secondary rounded-end-4" onClick={() => setShowPassword((value) => !value)} aria-label="Tampilkan password">
                  <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
                </button>
              </div>
            </div>
            {mode === 'register' && (
              <div>
                <label className="form-label fw-bold">Konfirmasi Password</label>
                <input type={showPassword ? 'text' : 'password'} minLength={6} className="form-control form-control-lg rounded-4" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Ulangi password" autoComplete="new-password" />
              </div>
            )}
            <button disabled={submitting} className="btn btn-warunk btn-lg rounded-pill">
              {submitting ? 'Memproses...' : mode === 'login' ? 'Masuk' : 'Daftar Sekarang'}
            </button>
          </form>

          <div className="auth-safe-note mt-3">
            <i className="bi bi-shield-lock-fill" />
            <span>Order tetap bisa tanpa login. Login dipakai agar history tidak hilang saat ganti perangkat.</span>
          </div>
        </div>
      </div>
    </main>
  );
}
