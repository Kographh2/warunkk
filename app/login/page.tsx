'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingScreen } from '@/components/LoadingScreen';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [mode, setMode] = useState<Mode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        setLoading(false);
        return;
      }
      await routeByProfile(data.session.user.id);
    }
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function routeByProfile(userId: string) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (profile && ['owner', 'admin', 'kasir'].includes(profile.role)) router.replace('/dashboard');
    else router.replace(next.startsWith('/') ? next : '/');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    if (mode === 'register') {
      const { data, error: registerError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || email.split('@')[0], role: 'customer' } }
      });
      setSubmitting(false);
      if (registerError) {
        setError(registerError.message);
        return;
      }
      if (data.session?.user) {
        await routeByProfile(data.session.user.id);
        return;
      }
      setSuccess('Akun berhasil dibuat. Cek email kamu untuk verifikasi, lalu masuk kembali.');
      setMode('login');
      return;
    }

    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (loginError || !data.user) {
      setError(loginError?.message || 'Email atau password belum sesuai.');
      return;
    }
    await routeByProfile(data.user.id);
  }

  if (loading) return <LoadingScreen label="Membuka akses akun..." />;

  return (
    <main className="login-page clean-auth-page">
      <div className="auth-card shadow-lg">
        <Link href="/" className="auth-back"><i className="bi bi-arrow-left" /> Kembali</Link>
        <div className="auth-logo mx-auto mb-3">WO</div>
        <p className="auth-kicker mb-1">WARUNK ONLINE</p>
        <h1 className="auth-title">{mode === 'login' ? 'Masuk Akun' : 'Daftar Akun'}</h1>
        <p className="auth-subtitle">
          Masuk atau daftar dari satu halaman. Sistem akan mengarahkan otomatis sesuai akses akunmu.
        </p>

        <div className="auth-switch mb-4" role="tablist" aria-label="Pilih mode akun">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>Masuk</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setSuccess(''); }}>Daftar</button>
        </div>

        <form onSubmit={submit} className="vstack gap-3">
          {mode === 'register' && (
            <div>
              <label className="form-label fw-semibold">Nama</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="form-control form-control-lg rounded-4" placeholder="Nama kamu" autoComplete="name" />
            </div>
          )}
          <div>
            <label className="form-label fw-semibold">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="form-control form-control-lg rounded-4" placeholder="nama@email.com" autoComplete="email" required />
          </div>
          <div>
            <label className="form-label fw-semibold">Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="form-control form-control-lg rounded-4" placeholder="Minimal 6 karakter" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={6} />
          </div>
          {error && <div className="alert alert-danger rounded-4 py-2 small mb-0">{error}</div>}
          {success && <div className="alert alert-success rounded-4 py-2 small mb-0">{success}</div>}
          <button disabled={submitting} className="btn btn-warunk btn-lg rounded-pill fw-bold mt-2">
            {submitting ? 'Memproses...' : mode === 'login' ? 'Masuk' : 'Daftar'}
          </button>
        </form>

        <div className="auth-footnote mt-4">
          Customer bisa tetap pesan tanpa login. Login berguna agar history pesanan tersimpan dan bisa dibuka lagi dari perangkat lain.
        </div>
      </div>
    </main>
  );
}
