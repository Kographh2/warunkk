'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { RoleGuard } from '@/components/RoleGuard';
import { compactDate, rupiah } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Order, OrderItem } from '@/lib/types';

type OrderWithItems = Order & { order_items?: OrderItem[] };

type DailyPoint = { label: string; total: number; count: number };

export default function ReportsPage() {
  return (
    <RoleGuard allow={['owner']}>
      {(profile) => <DashboardShell profile={profile}><OwnerReports /></DashboardShell>}
    </RoleGuard>
  );
}

function OwnerReports() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);

  async function load() {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(750);
    setOrders((data || []) as OrderWithItems[]);
  }

  useEffect(() => {
    load();
    const channel = supabase.channel('owner-reports-pos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const paidOrders = orders.filter((order) => order.payment_status === 'paid');
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const avg = paidOrders.length ? revenue / paidOrders.length : 0;
  const completed = orders.filter((order) => order.status === 'completed').length;
  const waiting = orders.filter((order) => order.status === 'waiting_payment').length;

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; amount: number }>();
    paidOrders.forEach((order) => {
      (order.order_items || []).forEach((item) => {
        const current = map.get(item.item_name_snapshot) || { name: item.item_name_snapshot, qty: 0, amount: 0 };
        current.qty += item.qty;
        current.amount += Number(item.subtotal);
        map.set(item.item_name_snapshot, current);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);
  }, [orders]);

  const daily = useMemo(() => buildDaily(paidOrders), [orders]);

  function exportCsv() {
    const header = ['created_at', 'table_number', 'payment_code', 'status', 'payment_status', 'subtotal', 'service_amount', 'tax_amount', 'total_amount'];
    const rows = orders.map((order) => [order.created_at, order.table_number, order.payment_code, order.status, order.payment_status, order.subtotal, order.service_amount, order.tax_amount, order.total_amount].join(','));
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warunk-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="pos-page-header mb-4">
        <div>
          <span className="pos-kicker"><i className="bi bi-bar-chart-fill me-1" />Owner Analytics</span>
          <h1>Laporan Owner</h1>
          <p>Diagram omzet, top item, dan table transaksi untuk keputusan bisnis harian.</p>
        </div>
        <button onClick={exportCsv} className="btn btn-outline-primary rounded-pill"><i className="bi bi-download me-1" />Export CSV</button>
      </div>

      <div className="row g-3 mb-4">
        <Metric title="Total omzet paid" value={rupiah(revenue)} icon="bi-wallet2" />
        <Metric title="Transaksi paid" value={paidOrders.length.toString()} icon="bi-receipt" />
        <Metric title="Rata-rata transaksi" value={rupiah(avg)} icon="bi-speedometer" />
        <Metric title="Waiting payment" value={waiting.toString()} icon="bi-hourglass" />
      </div>

      <div className="row g-4 mb-4">
        <div className="col-xl-8">
          <div className="pos-card h-100">
            <h4 className="pos-card-title mb-1">Diagram Penjualan 14 Hari</h4>
            <p className="text-muted small mb-3">Berbasis transaksi yang sudah paid.</p>
            <DailyAreaChart data={daily} />
          </div>
        </div>
        <div className="col-xl-4">
          <div className="pos-card h-100">
            <h4 className="pos-card-title mb-3">Top Item Revenue</h4>
            {topItems.length === 0 ? <div className="text-muted small">Belum ada item terjual.</div> : (
              <div className="vstack gap-3">
                {topItems.slice(0, 7).map((item, index) => {
                  const max = Math.max(...topItems.map((top) => top.amount), 1);
                  return (
                    <div key={item.name}>
                      <div className="d-flex justify-content-between align-items-center mb-1 small">
                        <strong>{index + 1}. {item.name}</strong>
                        <span>{item.qty}x</span>
                      </div>
                      <div className="progress rounded-pill" style={{ height: 10 }}>
                        <div className="progress-bar" style={{ width: `${(item.amount / max) * 100}%` }} />
                      </div>
                      <div className="small text-muted mt-1">{rupiah(item.amount)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pos-card">
        <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
          <div>
            <h4 className="pos-card-title mb-0">Table Transaksi</h4>
            <div className="text-muted small">Data terbaru, cocok dicek dari HP atau PC.</div>
          </div>
          <span className="badge rounded-pill text-bg-primary-subtle text-primary">Completed: {completed}</span>
        </div>
        <div className="table-responsive pos-table-wrap">
          <table className="table table-hover align-middle pos-table mb-0">
            <thead><tr><th>Waktu</th><th>Meja</th><th>Kode</th><th>Status</th><th>Payment</th><th className="text-end">Subtotal</th><th className="text-end">Total</th></tr></thead>
            <tbody>
              {orders.slice(0, 80).map((order) => (
                <tr key={order.id}>
                  <td className="text-nowrap">{compactDate(order.created_at)}</td>
                  <td><span className="table-pill">Meja {order.table_number}</span></td>
                  <td><code>{order.payment_code}</code></td>
                  <td>{order.status}</td>
                  <td>{order.payment_status}</td>
                  <td className="text-end">{rupiah(order.subtotal)}</td>
                  <td className="text-end fw-bold">{rupiah(order.total_amount)}</td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-4">Belum ada transaksi.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value, icon }: { title: string; value: string; icon: string }) {
  return (
    <div className="col-sm-6 col-xl-3">
      <div className="pos-metric metric-primary">
        <div>
          <div className="pos-metric-title">{title}</div>
          <div className="pos-metric-value">{value}</div>
        </div>
        <div className="pos-metric-icon"><i className={`bi ${icon}`} /></div>
      </div>
    </div>
  );
}

function DailyAreaChart({ data }: { data: DailyPoint[] }) {
  const max = Math.max(...data.map((item) => item.total), 1);
  const w = 720;
  const h = 260;
  const pad = 34;
  const points = data.map((item, index) => {
    const x = pad + (index * (w - pad * 2)) / Math.max(1, data.length - 1);
    const y = h - pad - ((h - pad * 2) * item.total) / max;
    return `${x},${y}`;
  }).join(' ');
  const area = `${pad},${h - pad} ${points} ${w - pad},${h - pad}`;

  return (
    <div className="sales-chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Diagram penjualan empat belas hari" className="sales-chart-svg">
        <polyline points={area} className="chart-area" />
        <polyline points={points} className="chart-line" />
        {data.map((item, index) => {
          const x = pad + (index * (w - pad * 2)) / Math.max(1, data.length - 1);
          const y = h - pad - ((h - pad * 2) * item.total) / max;
          return <circle key={item.label} cx={x} cy={y} r="5" className="chart-dot"><title>{item.label}: {rupiah(item.total)}</title></circle>;
        })}
      </svg>
      <div className="report-chart-labels">
        {data.filter((_, index) => index % 2 === 0 || data.length < 10).map((item) => <span key={item.label}>{item.label}</span>)}
      </div>
    </div>
  );
}

function buildDaily(orders: Order[]): DailyPoint[] {
  const days = Array.from({ length: 14 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - index));
    return {
      key: date.toDateString(),
      label: new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(date),
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
