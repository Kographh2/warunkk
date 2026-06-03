'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { QRCanvas } from '@/components/QRCanvas';
import { RoleGuard } from '@/components/RoleGuard';
import { appUrl, compactDate, orderStatusBadge, orderStatusLabel, rupiah } from '@/lib/format';
import { startQrCamera, scanQrFromImage, type QrCameraSession } from '@/lib/camera';
import { supabase } from '@/lib/supabase';
import { Order, OrderItem, Profile } from '@/lib/types';

type OrderWithItems = Order & { order_items?: OrderItem[] };

export default function KasirPage() {
  return (
    <RoleGuard allow={['owner', 'admin', 'kasir']}>
      {(profile) => <DashboardShell profile={profile}><KasirScanner profile={profile} /></DashboardShell>}
    </RoleGuard>
  );
}

function normalizeCode(raw: string) {
  const text = raw.trim();
  try {
    const url = new URL(text);
    return url.searchParams.get('code') || text;
  } catch {
    if (text.includes('code=')) return text.split('code=')[1]?.split('&')[0] || text;
    return text;
  }
}

function KasirScanner({ profile }: { profile: Profile }) {
  const params = useSearchParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrCameraSession | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [code, setCode] = useState(params.get('code') || '');
  const [message, setMessage] = useState('');
  const [found, setFound] = useState<OrderWithItems | null>(null);
  const [unpaid, setUnpaid] = useState<OrderWithItems[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadUnpaid() {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('status', 'waiting_payment')
      .order('created_at', { ascending: false })
      .limit(20);
    setUnpaid((data || []) as OrderWithItems[]);
  }

  useEffect(() => {
    loadUnpaid();
    const channel = supabase.channel('kasir-unpaid')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadUnpaid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, loadUnpaid)
      .subscribe();
    return () => { supabase.removeChannel(channel); stopCamera(); };
  }, []);

  useEffect(() => {
    if (params.get('code')) findOrder(params.get('code') || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function findOrder(value = code) {
    const paymentCode = normalizeCode(value);
    if (!paymentCode) return;
    setMessage('Mencari order...');
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('payment_code', paymentCode)
      .maybeSingle();
    if (error || !data) {
      setFound(null);
      setMessage('Order tidak ditemukan. Pastikan QR/kode benar.');
      return;
    }
    setCode(paymentCode);
    setFound(data as OrderWithItems);
    setMessage('Order ditemukan. Cocokkan total dengan pembayaran customer.');
  }

  async function markPaid(order = found) {
    if (!order) return;
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid', payment_status: 'paid', paid_at: now, cashier_id: profile.id })
      .eq('id', order.id);
    await supabase.from('order_events').insert({
      order_id: order.id,
      actor_id: profile.id,
      actor_role: profile.role,
      event: 'cashier_payment_verified',
      description: `${profile.full_name} scan QR dan memverifikasi pembayaran di kasir.`
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setMessage('Pembayaran berhasil diverifikasi. Status customer sudah realtime menjadi paid.');
      setFound({ ...order, status: 'paid', payment_status: 'paid', paid_at: now, cashier_id: profile.id });
      loadUnpaid();
    }
  }

  async function startCamera() {
    setMessage('');
    if (!videoRef.current) return;

    stopCamera();
    setScanning(true);

    try {
      scannerRef.current = await startQrCamera(
        videoRef.current,
        async (value) => {
          stopCamera();
          setCode(normalizeCode(value));
          await findOrder(value);
        },
        (errorMessage) => setMessage(errorMessage)
      );
    } catch {
      setScanning(false);
      setMessage('Kamera tidak bisa dibuka. Pastikan browser sudah mengizinkan kamera dan situs berjalan di HTTPS atau localhost.');
    }
  }

  async function handleQrImage(file?: File | null) {
    if (!file) return;
    setMessage('Membaca QR dari foto...');
    try {
      const value = await scanQrFromImage(file);
      if (!value) throw new Error('QR kosong');
      setCode(normalizeCode(value));
      await findOrder(value);
    } catch {
      setMessage('QR belum terbaca dari foto. Pastikan gambar jelas dan tidak blur.');
    }
  }

  function stopCamera() {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setScanning(false);
  }

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h1 className="fw-bold mb-1">Kasir Scan Payment</h1>
          <p className="text-muted mb-0">Customer hanya bayar di kasir dengan menunjukan QR. Kasir scan untuk membuat order sukses/paid.</p>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-xl-5">
          <div className="soft-card p-4 h-100">
            <h4 className="fw-bold mb-3"><i className="bi bi-qr-code-scan me-2 text-warunk" />Scan QR</h4>
            <div className="ratio ratio-1x1 bg-dark rounded-5 overflow-hidden mb-3 position-relative">
              <video ref={videoRef} className="w-100 h-100 object-fit-cover" autoPlay playsInline muted />
              {!scanning && <div className="position-absolute top-50 start-50 translate-middle text-white text-center"><i className="bi bi-camera display-4" /><div>Camera idle</div></div>}
              {scanning && <div className="scan-frame position-absolute top-50 start-50 translate-middle" />}
            </div>
            <div className="d-flex gap-2 mb-3 flex-wrap">
              <button onClick={startCamera} className="btn btn-warunk rounded-pill flex-fill"><i className="bi bi-camera-video me-1" />Mulai Scan</button>
              <button onClick={() => fileRef.current?.click()} className="btn btn-outline-dark rounded-pill"><i className="bi bi-image me-1" />Foto QR</button>
              <button onClick={stopCamera} className="btn btn-outline-dark rounded-pill">Stop</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="d-none" onChange={(event) => handleQrImage(event.target.files?.[0])} />
            <label className="form-label fw-semibold">Atau masukkan kode / URL QR manual</label>
            <div className="input-group input-group-lg">
              <input value={code} onChange={(e) => setCode(e.target.value)} className="form-control rounded-start-pill" placeholder="WRK-..." />
              <button onClick={() => findOrder()} className="btn btn-dark rounded-end-pill">Cari</button>
            </div>
            {message && <div className="alert alert-info rounded-4 mt-3 mb-0">{message}</div>}
          </div>
        </div>

        <div className="col-xl-7">
          {found ? (
            <div className="soft-card p-4 h-100">
              <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                <div>
                  <span className="badge rounded-pill text-bg-light border mb-2">Meja {found.table_number}</span>
                  <h3 className="fw-bold mb-1">{rupiah(found.total_amount)}</h3>
                  <div className="small text-muted">{compactDate(found.created_at)} • <code>{found.payment_code}</code></div>
                </div>
                <span className={`badge rounded-pill ${orderStatusBadge(found.status)} px-3 py-2`}>{orderStatusLabel(found.status)}</span>
              </div>
              <div className="row g-4">
                <div className="col-md-5">
                  <QRCanvas value={`${appUrl()}/kasir?code=${found.payment_code}`} title="QR Order" subtitle="Validasi order ini" />
                </div>
                <div className="col-md-7">
                  <div className="table-responsive">
                    <table className="table align-middle">
                      <tbody>
                        {(found.order_items || []).map((item) => (
                          <tr key={item.id}>
                            <td>{item.item_name_snapshot}</td>
                            <td>x{item.qty}</td>
                            <td className="text-end fw-semibold">{rupiah(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button disabled={busy || found.payment_status === 'paid'} onClick={() => markPaid()} className="btn btn-success btn-lg rounded-pill w-100">
                    <i className="bi bi-check2-circle me-2" />{found.payment_status === 'paid' ? 'Sudah Paid' : 'Konfirmasi Bayar di Kasir'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="soft-card p-4 h-100">
              <h4 className="fw-bold mb-3">Antrian Belum Bayar</h4>
              {unpaid.length === 0 ? <p className="text-muted mb-0">Belum ada pesanan menunggu pembayaran.</p> : (
                <div className="vstack gap-2">
                  {unpaid.map((order) => (
                    <button key={order.id} className="btn btn-light text-start rounded-4 p-3" onClick={() => findOrder(order.payment_code)}>
                      <div className="d-flex justify-content-between"><strong>Meja {order.table_number}</strong><strong className="text-warunk">{rupiah(order.total_amount)}</strong></div>
                      <div className="small text-muted"><code>{order.payment_code}</code> • {compactDate(order.created_at)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
