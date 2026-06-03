'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/DashboardShell';
import { RoleGuard } from '@/components/RoleGuard';
import { compactDate, orderStatusBadge, orderStatusLabel, rupiah } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Order, OrderItem, Profile } from '@/lib/types';

type OrderWithItems = Order & { order_items?: OrderItem[] };
type SalesPoint = { label: string; total: number; count: number };

export default function DashboardPage() {
  return (
    <RoleGuard allow={['owner', 'admin', 'kasir']}>
      {(profile) => <DashboardShell profile={profile}><DashboardHome profile={profile} /></DashboardShell>}
    </RoleGuard>
  );
}

function DashboardHome({ profile }: { profile: Profile }) {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [menuCount, setMenuCount] = useState(0);
  const [tableCount, setTableCount] = useState(0);
  const [pendingEmailCount, setPendingEmailCount] = useState(0);
  const [activeAnnouncementCount, setActiveAnnouncementCount] = useState(0);

  async function load() {
    const [ordersRes, menuRes, tableRes] = await Promise.all([
      supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(250),
      supabase.from('menu_items').select('id', { count: 'exact', head: true }),
      supabase.from('tables').select('id', { count: 'exact', head: true })
    ]);
    setOrders((ordersRes.data || []) as OrderWithItems[]);
    setMenuCount(menuRes.count || 0);
    setTableCount(tableRes.count || 0);

    if (profile.role === 'owner') {
      const [emailReqRes, announceRes] = await Promise.all([
        supabase.from('email_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('is_active', true)
      ]);
      setPendingEmailCount(emailReqRes.count || 0);
      setActiveAnnouncementCount(announceRes.count || 0);
    }
  }

  useEffect(() => {
    load();
    const channel = supabase.channel('dashboard-home-pos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_change_requests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const today = new Date().toDateString();
  const todayOrders = orders.filter((order) => new Date(order.created_at).toDateString() === today);
  const paidOrders = orders.filter((order) => order.payment_status === 'paid');
  const todayPaid = todayOrders.filter((order) => order.payment_status === 'paid');
  const todayTotal = todayPaid.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const waiting = orders.filter((order) => order.status === 'waiting_payment').length;
  const active = orders.filter((order) => ['paid', 'preparing', 'ready'].includes(order.status)).length;
  const ready = orders.filter((order) => order.status === 'ready').length;
  const avgTicket = todayPaid.length ? todayTotal / todayPaid.length : 0;

  const sales = useMemo(() => buildSalesPoints(paidOrders), [orders]);
  const statusCounts = useMemo(() => buildStatusCounts(orders), [orders]);
  const topItems = useMemo(() => buildTopItems(todayPaid.length ? todayPaid : paidOrders), [orders]);
  const queue = orders.filter((order) => ['waiting_payment', 'paid', 'preparing', 'ready'].includes(order.status)).slice(0, 8);

  return (
    <div className="pos-dashboard">
      <div className="pos-page-header mb-4">
        <div>
          <span className="pos-kicker"><i className="bi bi-lightning-charge-fill me-1" />Realtime POS</span>
          <h1>Dashboard Warung</h1>
          <p>Ringkasan transaksi, diagram omzet, antrean meja, dan status order untuk {profile.role}.</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link href="/dashboard/orders" className="btn btn-warunk rounded-pill px-3"><i className="bi bi-table me-1" />Lihat Order</Link>
          <Link href="/kasir" className="btn btn-outline-primary rounded-pill px-3"><i className="bi bi-qr-code-scan me-1" />Scan Kasir</Link>
        </div>
      </div>

      {profile.role === 'owner' && (
        <div className="owner-action-strip mb-4">
          <Link href="/dashboard/users#email-approval" className="owner-action-card">
            <i className="bi bi-envelope-check" />
            <span>Approve Email</span>
            <strong>{pendingEmailCount} pending</strong>
          </Link>
          <Link href="/dashboard/broadcasts" className="owner-action-card">
            <i className="bi bi-megaphone" />
            <span>Broadcast & Ads</span>
            <strong>{activeAnnouncementCount} aktif</strong>
          </Link>
        </div>
      )}

      <div className="row g-3 mb-4">
        <Metric title="Omzet Hari Ini" value={rupiah(todayTotal)} icon="bi-cash-stack" hint={`${todayPaid.length} transaksi paid`} />
        <Metric title="Menunggu Bayar" value={waiting.toString()} icon="bi-hourglass-split" hint="Customer tunjukkan QR" tone="warning" />
        <Metric title="Order Aktif" value={active.toString()} icon="bi-activity" hint={`${ready} siap diambil`} tone="success" />
        <Metric title="Menu / Meja" value={`${menuCount} / ${tableCount}`} icon="bi-grid" hint="Data operasional" tone="info" />
      </div>

      <div className="row g-4 mb-4">
        <div className="col-xl-8">
          <div className="pos-card h-100">
            <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
              <div>
                <h4 className="pos-card-title mb-1">Diagram Omzet 7 Hari</h4>
                <div className="text-muted small">Grafik dari order dengan payment paid.</div>
              </div>
              <span className="badge rounded-pill text-bg-primary-subtle text-primary">Avg {rupiah(avgTicket)}</span>
            </div>
            <SalesChart data={sales} />
          </div>
        </div>
        <div className="col-xl-4">
          <div className="pos-card h-100">
            <h4 className="pos-card-title mb-3">Diagram Status</h4>
            <StatusDiagram counts={statusCounts} total={orders.length} />
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-xl-8">
          <div className="pos-card">
            <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
              <h4 className="pos-card-title mb-0">Table Order Terbaru</h4>
              <span className="small text-muted">Auto-update realtime</span>
            </div>
            <div className="table-responsive pos-table-wrap">
              <table className="table table-hover align-middle mb-0 pos-table">
                <thead><tr><th>Waktu</th><th>Meja</th><th>Kode</th><th>Status</th><th>Item</th><th className="text-end">Total</th></tr></thead>
                <tbody>
                  {orders.slice(0, 12).map((order) => (
                    <tr key={order.id}>
                      <td className="text-nowrap">{compactDate(order.created_at)}</td>
                      <td><span className="table-pill">Meja {order.table_number}</span></td>
                      <td><code>{order.payment_code}</code></td>
                      <td><span className={`badge rounded-pill ${orderStatusBadge(order.status)}`}>{orderStatusLabel(order.status)}</span></td>
                      <td>{(order.order_items || []).reduce((sum, item) => sum + item.qty, 0)} item</td>
                      <td className="text-end fw-semibold">{rupiah(order.total_amount)}</td>
                    </tr>
                  ))}
                  {orders.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-4">Belum ada order masuk.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <div className="pos-card h-100">
            <h4 className="pos-card-title mb-3">Antrean Meja</h4>
            {queue.length === 0 ? <div className="text-muted small">Belum ada antrean aktif.</div> : (
              <div className="vstack gap-2">
                {queue.map((order) => (
                  <div className="queue-row" key={order.id}>
                    <div className="queue-table">{order.table_number}</div>
                    <div className="flex-grow-1 min-w-0">
                      <div className="fw-bold text-truncate">{order.payment_code}</div>
                      <div className="small text-muted">{(order.order_items || []).map((item) => `${item.qty}x ${item.item_name_snapshot}`).join(', ') || 'Item belum terbaca'}</div>
                    </div>
                    <span className={`badge rounded-pill ${orderStatusBadge(order.status)}`}>{orderStatusLabel(order.status)}</span>
                  </div>
                ))}
              </div>
            )}
            <hr />
            <h5 className="fw-bold mb-3">Top item hari ini</h5>
            {topItems.length === 0 ? <div className="text-muted small">Top item muncul setelah transaksi paid.</div> : topItems.slice(0, 5).map((item, index) => (
              <div key={item.name} className="top-item-row">
                <span>{index + 1}</span>
                <strong>{item.name}</strong>
                <em>{item.qty}x</em>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value, icon, hint, tone = 'primary' }: { title: string; value: string; icon: string; hint: string; tone?: 'primary' | 'warning' | 'success' | 'info' }) {
  return (
    <div className="col-sm-6 col-xxl-3">
      <div className={`pos-metric metric-${tone}`}>
        <div>
          <div className="pos-metric-title">{title}</div>
          <div className="pos-metric-value">{value}</div>
          <div className="pos-metric-hint">{hint}</div>
        </div>
        <div className="pos-metric-icon"><i className={`bi ${icon}`} /></div>
      </div>
    </div>
  );
}

function SalesChart({ data }: { data: SalesPoint[] }) {
  const max = Math.max(...data.map((item) => item.total), 1);
  const width = 640;
  const height = 260;
  const pad = 32;
  const barGap = 14;
  const barWidth = (width - pad * 2 - barGap * (data.length - 1)) / data.length;

  return (
    <div className="sales-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Diagram omzet tujuh hari" className="sales-chart-svg">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="chart-axis" />
        {data.map((item, index) => {
          const h = Math.max(8, ((height - pad * 2) * item.total) / max);
          const x = pad + index * (barWidth + barGap);
          const y = height - pad - h;
          return (
            <g key={item.label}>
              <rect x={x} y={y} width={barWidth} height={h} rx="12" className="chart-bar" />
              <text x={x + barWidth / 2} y={height - 10} textAnchor="middle" className="chart-label">{item.label}</text>
              <text x={x + barWidth / 2} y={Math.max(18, y - 8)} textAnchor="middle" className="chart-value">{item.count}</text>
            </g>
          );
        })}
      </svg>
      <div className="d-flex justify-content-between small text-muted mt-2">
        <span>Jumlah angka di atas bar = transaksi</span>
        <strong>Total 7 hari: {rupiah(data.reduce((sum, item) => sum + item.total, 0))}</strong>
      </div>
    </div>
  );
}

function StatusDiagram({ counts, total }: { counts: { status: string; label: string; count: number }[]; total: number }) {
  return (
    <div className="status-diagram">
      <div className="status-ring" style={{ '--total': total || 1 } as CSSProperties}>
        <strong>{total}</strong>
        <span>order</span>
      </div>
      <div className="vstack gap-2 mt-3">
        {counts.map((item) => (
          <div key={item.status} className="status-progress-row">
            <div className="d-flex justify-content-between small mb-1"><span>{item.label}</span><strong>{item.count}</strong></div>
            <div className="progress rounded-pill" style={{ height: 8 }}>
              <div className="progress-bar" style={{ width: `${total ? (item.count / total) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildSalesPoints(orders: Order[]): SalesPoint[] {
  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return {
      key: date.toDateString(),
      label: new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date),
      total: 0,
      count: 0
    };
  });
  orders.forEach((order) => {
    const found = days.find((day) => day.key === new Date(order.created_at).toDateString());
    if (found) {
      found.total += Number(order.total_amount);
      found.count += 1;
    }
  });
  return days.map(({ label, total, count }) => ({ label, total, count }));
}

function buildStatusCounts(orders: Order[]) {
  return [
    { status: 'waiting_payment', label: 'Menunggu bayar', count: orders.filter((order) => order.status === 'waiting_payment').length },
    { status: 'paid', label: 'Paid', count: orders.filter((order) => order.status === 'paid').length },
    { status: 'preparing', label: 'Preparing', count: orders.filter((order) => order.status === 'preparing').length },
    { status: 'ready', label: 'Ready', count: orders.filter((order) => order.status === 'ready').length },
    { status: 'completed', label: 'Completed', count: orders.filter((order) => order.status === 'completed').length }
  ];
}

function buildTopItems(orders: OrderWithItems[]) {
  const map = new Map<string, { name: string; qty: number }>();
  orders.forEach((order) => {
    (order.order_items || []).forEach((item) => {
      const current = map.get(item.item_name_snapshot) || { name: item.item_name_snapshot, qty: 0 };
      current.qty += item.qty;
      map.set(item.item_name_snapshot, current);
    });
  });
  return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 8);
}
