'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { RoleGuard } from '@/components/RoleGuard';
import { compactDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Announcement, AnnouncementType, Profile } from '@/lib/types';

const BUCKET = 'broadcast-assets';

export default function BroadcastsPage() {
  return (
    <RoleGuard allow={['owner']}>
      {(profile) => <DashboardShell profile={profile}><BroadcastManager profile={profile} /></DashboardShell>}
    </RoleGuard>
  );
}

function BroadcastManager({ profile }: { profile: Profile }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [type, setType] = useState<AnnouncementType>('broadcast');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Buka Warung');
  const [ctaUrl, setCtaUrl] = useState('/');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(80);
    setItems((data || []) as Announcement[]);
  }

  useEffect(() => {
    load();
    const channel = supabase.channel('owner-announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const activeCount = useMemo(() => items.filter((item) => item.is_active && !isExpired(item)).length, [items]);
  const adsCount = useMemo(() => items.filter((item) => item.type === 'ads').length, [items]);

  async function uploadImage() {
    if (!file) return null;
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${safeExt}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || `image/${safeExt}`,
      upsert: false
    });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function createAnnouncement(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    if (!title.trim() || !body.trim()) {
      setMessage('Judul dan isi wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const imageUrl = await uploadImage();
      const { error } = await supabase.from('announcements').insert({
        type,
        title: title.trim(),
        body: body.trim(),
        image_url: imageUrl,
        cta_label: ctaLabel.trim() || null,
        cta_url: ctaUrl.trim() || '/',
        is_active: true,
        publish_at: new Date().toISOString(),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        created_by: profile.id
      });
      if (error) throw error;
      setTitle('');
      setBody('');
      setCtaLabel('Buka Warung');
      setCtaUrl('/');
      setExpiresAt('');
      setFile(null);
      setMessage(type === 'ads' ? 'Ads berhasil dipublish. Customer yang mengaktifkan notifikasi akan menerima alert realtime saat app/PWA aktif.' : 'Broadcast berhasil dipublish.');
      load();
    } catch (error: any) {
      setMessage(error?.message || 'Gagal publish. Pastikan bucket Storage broadcast-assets sudah dibuat lewat schema SQL.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: Announcement) {
    const { error } = await supabase.from('announcements').update({ is_active: !item.is_active }).eq('id', item.id);
    setMessage(error ? error.message : item.is_active ? 'Konten dinonaktifkan.' : 'Konten diaktifkan lagi.');
    load();
  }

  async function remove(item: Announcement) {
    if (!confirm(`Hapus ${item.title}?`)) return;
    const { error } = await supabase.from('announcements').delete().eq('id', item.id);
    setMessage(error ? error.message : 'Konten berhasil dihapus.');
    load();
  }

  return (
    <div className="owner-broadcast-page">
      <div className="pos-page-header mb-4">
        <div>
          <span className="pos-kicker"><i className="bi bi-megaphone me-1" />Broadcast Center</span>
          <h1>Broadcast & Ads</h1>
          <p>Upload gambar manual, kirim info promo, dan munculkan ads realtime ke customer yang mengaktifkan notifikasi.</p>
        </div>
      </div>

      {message && <div className="alert alert-info rounded-4">{message}</div>}

      <div className="row g-3 mb-4">
        <OwnerStat title="Konten aktif" value={activeCount.toString()} icon="bi-broadcast-pin" />
        <OwnerStat title="Total ads" value={adsCount.toString()} icon="bi-badge-ad" tone="warning" />
        <OwnerStat title="Broadcast" value={items.filter((item) => item.type === 'broadcast').length.toString()} icon="bi-send" />
        <OwnerStat title="Nonaktif" value={items.filter((item) => !item.is_active || isExpired(item)).length.toString()} icon="bi-pause-circle" tone="danger" />
      </div>

      <div className="row g-4">
        <div className="col-xl-5">
          <form className="pos-card broadcast-form-card" onSubmit={createAnnouncement}>
            <h4 className="pos-card-title mb-1">Buat Info Baru</h4>
            <p className="text-muted small mb-3">Pilih Broadcast untuk pengumuman umum atau Ads untuk promo bergambar.</p>

            <div className="broadcast-type-tabs mb-3">
              <button type="button" className={type === 'broadcast' ? 'active' : ''} onClick={() => setType('broadcast')}><i className="bi bi-send" /> Broadcast</button>
              <button type="button" className={type === 'ads' ? 'active' : ''} onClick={() => setType('ads')}><i className="bi bi-badge-ad" /> Ads</button>
            </div>

            <label className="form-label fw-bold">Judul</label>
            <input className="form-control rounded-4 mb-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Promo es teh hari ini" />

            <label className="form-label fw-bold">Isi pesan</label>
            <textarea className="form-control rounded-4 mb-3" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Tulis info singkat yang akan muncul di notifikasi customer." />

            <label className="form-label fw-bold">Gambar manual</label>
            <div className="broadcast-upload mb-3">
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <i className="bi bi-image" />
              <strong>{file ? file.name : 'Pilih gambar dari perangkat'}</strong>
              <span>JPG, PNG, WEBP. Bukan link gambar.</span>
            </div>

            <div className="row g-2 mb-3">
              <div className="col-sm-6">
                <label className="form-label fw-bold">Label tombol</label>
                <input className="form-control rounded-4" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Buka Warung" />
              </div>
              <div className="col-sm-6">
                <label className="form-label fw-bold">Tujuan tombol</label>
                <input className="form-control rounded-4" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="/" />
              </div>
            </div>

            <label className="form-label fw-bold">Kadaluarsa opsional</label>
            <input type="datetime-local" className="form-control rounded-4 mb-3" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />

            <button className="btn btn-warunk rounded-pill w-100 py-3 fw-bold" disabled={busy}>
              {busy ? 'Publishing...' : <><i className="bi bi-bell-fill me-1" />Publish & Kirim Alert</>}
            </button>
            <p className="text-muted small mt-3 mb-0">Realtime alert aktif saat customer membuka web/PWA dan menyalakan notifikasi dari Settings. Push saat app benar-benar tertutup perlu backend push/VAPID.</p>
          </form>
        </div>

        <div className="col-xl-7">
          <div className="pos-card">
            <div className="d-flex justify-content-between align-items-start gap-3 mb-3 flex-wrap">
              <div>
                <h4 className="pos-card-title mb-1">Konten Terkirim</h4>
                <p className="text-muted small mb-0">Konten terbaru muncul di Home customer dan notification realtime.</p>
              </div>
              <button className="btn btn-sm btn-outline-primary rounded-pill" onClick={load}>Refresh</button>
            </div>

            {items.length === 0 ? (
              <div className="empty-approval-card"><i className="bi bi-megaphone" /><strong>Belum ada broadcast</strong><span>Buat broadcast/ads pertama dari form di samping.</span></div>
            ) : (
              <div className="broadcast-list">
                {items.map((item) => (
                  <article className={`broadcast-item ${!item.is_active || isExpired(item) ? 'is-muted' : ''}`} key={item.id}>
                    <div className="broadcast-thumb">
                      {item.image_url ? <img src={item.image_url} alt={item.title} /> : <i className="bi bi-megaphone" />}
                    </div>
                    <div className="broadcast-info">
                      <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                        <span className={`badge rounded-pill ${item.type === 'ads' ? 'text-bg-warning' : 'text-bg-primary'}`}>{item.type === 'ads' ? 'ADS' : 'BROADCAST'}</span>
                        <span className={`badge rounded-pill ${item.is_active && !isExpired(item) ? 'text-bg-success' : 'text-bg-secondary'}`}>{item.is_active && !isExpired(item) ? 'Aktif' : 'Nonaktif'}</span>
                      </div>
                      <h5>{item.title}</h5>
                      <p>{item.body}</p>
                      <small>{compactDate(item.created_at)}{item.expires_at ? ` · Exp ${compactDate(item.expires_at)}` : ''}</small>
                    </div>
                    <div className="broadcast-actions">
                      <button className="btn btn-sm btn-outline-dark rounded-pill" onClick={() => toggleActive(item)}>{item.is_active ? 'Matikan' : 'Aktifkan'}</button>
                      <button className="btn btn-sm btn-outline-danger rounded-pill" onClick={() => remove(item)}>Hapus</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnerStat({ title, value, icon, tone = 'primary' }: { title: string; value: string; icon: string; tone?: 'primary' | 'warning' | 'danger' }) {
  return (
    <div className="col-6 col-xl-3">
      <div className={`owner-mini-metric owner-mini-${tone}`}>
        <i className={`bi ${icon}`} />
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function isExpired(item: Announcement) {
  return Boolean(item.expires_at && new Date(item.expires_at).getTime() < Date.now());
}
