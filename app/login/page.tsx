'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LoadingScreen } from '@/components/LoadingScreen';

type AuthMode = 'login' | 'register';

function safeName(email: string) {
  return email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'Customer';
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile && ['owner', 'admin', 'kasir'].includes(String(profile.role))) router.replace('/dashboard');
      else router.replace('/');
    }
    checkSession();
  }, [router]);

  async function routeByRole(userId: string) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profile && ['owner', 'admin', 'kasir'].includes(String(profile.role))) router.replace('/dashboard');
    else router.replace('/');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    if (mode === 'register') {
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name.trim() || safeName(email),
            role: 'customer'
          }
        }
      });

      if (signupError) {
        setSubmitting(false);
        setError(signupError.message);
        return;
      }

      if (data.user && data.session) {
        setSubmitting(false);
        router.replace('/');
        return;
      }

      setSubmitting(false);
      setMode('login');
      setMessage('Akun berhasil dibuat. Kalau verifikasi email aktif, cek inbox dulu, lalu masuk di sini.');
      return;
    }

    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError || !data.user) {
      setSubmitting(false);
      setError(loginError?.message || 'Login gagal. Cek email dan password kamu.');
      return;
    }

    setSubmitting(false);
    await routeByRole(data.user.id);
  }

  if (loading) return <LoadingScreen label="Membuka akun Pratapa..." />;

  return (
    <main className="auth-unified-page">
      <div className="auth-unified-shell">
        <section className="auth-unified-hero">
          <Link href="/" className="auth-back-link"><i className="bi bi-arrow-left" /> Kembali ke warung</Link>
          <div className="auth-logo"><span>P</span></div>
          <p className="auth-kicker">PRATAPA MART</p>
          <h1>{mode === 'login' ? 'Masuk Akun' : 'Daftar Akun'}</h1>
          <p className="auth-desc">
            Satu pintu masuk untuk customer dan tim warung. Sistem akan mengenali role akun secara otomatis dari database.
          </p>
        </section>

        <section className="auth-unified-card">
          <div className="auth-mode-switch" role="tablist" aria-label="Pilih mode akun">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setMessage(''); }}>Masuk</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setMessage(''); }}>Daftar</button>
          </div>

          {error && <div className="alert alert-danger rounded-4 small mb-3">{error}</div>}
          {message && <div className="alert alert-success rounded-4 small mb-3">{message}</div>}

          <form onSubmit={submit} className="vstack gap-3">
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
              <input type="password" minLength={mode === 'register' ? 8 : 6} className="form-control form-control-lg rounded-4" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder={mode === 'register' ? 'Minimal 8 karakter' : 'Password akun'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
            </div>

            <button disabled={submitting} className="btn btn-warunk btn-lg rounded-pill auth-submit-btn">
              {submitting ? 'Memproses...' : mode === 'login' ? 'Masuk' : 'Buat Akun'}
            </button>
          </form>

          <div className="auth-safe-note mt-3">
            <i className="bi bi-shield-check" />
            <span>Customer bisa belanja tanpa login. Login membantu menyimpan history, level, dan invoice secara permanen.</span>
          </div>
        </section>
      </div>
    </main>
  );
}
