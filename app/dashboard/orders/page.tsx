'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { EmptyState } from '@/components/EmptyState';
import { RoleGuard } from '@/components/RoleGuard';
import { compactDate, orderStatusBadge, orderStatusLabel, rupiah } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Order, OrderItem, OrderStatus, Profile } from '@/lib/types';

type OrderWithItems = Order & { order_items?: OrderItem[] };

export default function OrdersPage() {
  return (
    <RoleGuard allow={['owner', 'admin', 'kasir']}>
      {(profile) => <DashboardShell profile={profile}><OrdersBoard profile={profile} /></DashboardShell>}
    </RoleGuard>
  );
}

function OrdersBoard({ profile }: { profile: Profile }) {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [filter, setFilter] = useState('active');
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState<OrderWithItems | null>(null);

  async function load() {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(150);
    const next = (data || []) as OrderWithItems[];
    setOrders(next);
    setSelected((current) => current ? next.find((order) => order.id === current.id) || null : next[0] || null);
  }

  useEffect(() => {
    load();
    const channel = supabase.channel('orders-board-table')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'active') return orders.filter((order) => ['waiting_payment', 'paid', 'preparing', 'ready'].includes(order.status));
    return orders.filter((order) => order.status === filter);
  }, [orders, filter]);

  const counts = {
    active: orders.filter((order) => ['waiting_payment', 'paid', 'preparing', 'ready'].includes(order.status)).length,
    waiting_payment: orders.filter((order) => order.status === 'waiting_payment').length,
    paid: orders.filter((order) => order.status === 'paid').length,
    preparing: orders.filter((order) => order.status === 'preparing').length,
    ready: orders.filter((order) => order.status === 'ready').length
  };

  async function setStatus(order: Order, status: OrderStatus) {
    setBusy(order.id + status);
    const patch: Partial<Order> = { status };
    if (status === 'paid') {
      patch.payment_status = 'paid';
      patch.cashier_id = profile.id;
      patch.paid_at = new Date().toISOString();
    }
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    await supabase.from('orders').update(patch).eq('id', order.id);
    await supabase.from('order_events').insert({
      order_id: order.id,
      actor_id: profile.id,
      actor_role: profile.role,
      event: `status_${status}`,
      description: `${profile.full_name} mengubah status menjadi ${orderStatusLabel(status)}.`
    });
    setBusy('');
    load();
  }

  return (
    <div className="pos-orders-page">
      <div className="pos-page-header mb-4">
        <div>
          <span className="pos-kicker"><i className="bi bi-broadcast-pin me-1" />Live Kitchen Queue</span>
          <h1>Order Table</h1>
          <p>Format POS: table order di kiri, detail pesanan dan tombol status di kanan.</p>
        </div>
        <select className="form-select rounded-pill pos-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="active">Order aktif ({counts.active})</option>
          <option value="waiting_payment">Menunggu bayar ({counts.waiting_payment})</option>
          <option value="paid">Paid ({counts.paid})</option>
          <option value="preparing">Preparing ({counts.preparing})</option>
          <option value="ready">Ready ({counts.ready})</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">Semua</option>
        </select>
      </div>

      <div className="row g-4">
        <div className="col-12 col-xxl-8">
          <div className="pos-card p-0 overflow-hidden">
            {filtered.length === 0 ? <div className="p-4"><EmptyState title="Belum ada order" subtitle="Order dari customer akan muncul realtime di sini." /></div> : (
              <div className="table-responsive pos-table-wrap">
                <table className="table table-hover align-middle mb-0 pos-table pos-order-table">
                  <thead><tr><th>Kode</th><th>Meja</th><th>Waktu</th><th>Status</th><th>Payment</th><th>Items</th><th className="text-end">Total</th></tr></thead>
                  <tbody>
                    {filtered.map((order) => (
                      <tr key={order.id} onClick={() => setSelected(order)} className={selected?.id === order.id ? 'selected-row' : ''} role="button">
                        <td><code>{order.payment_code}</code></td>
                        <td><span className="table-pill">Meja {order.table_number}</span></td>
                        <td className="text-nowrap">{compactDate(order.created_at)}</td>
                        <td><span className={`badge rounded-pill ${orderStatusBadge(order.status)}`}>{orderStatusLabel(order.status)}</span></td>
                        <td><span className={`badge rounded-pill ${order.payment_status === 'paid' ? 'text-bg-success' : 'text-bg-light border'}`}>{order.payment_status}</span></td>
                        <td>{(order.order_items || []).reduce((sum, item) => sum + item.qty, 0)}</td>
                        <td className="text-end fw-bold">{rupiah(order.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="col-12 col-xxl-4">
          <OrderDetail order={selected} busy={busy} setStatus={setStatus} />
        </div>
      </div>
    </div>
  );
}

function OrderDetail({ order, busy, setStatus }: { order: OrderWithItems | null; busy: string; setStatus: (order: Order, status: OrderStatus) => void }) {
  if (!order) {
    return (
      <div className="pos-card h-100">
        <EmptyState title="Pilih order" subtitle="Klik salah satu baris table untuk melihat detail POS." />
      </div>
    );
  }

  return (
    <div className="pos-card order-detail-card sticky-xxl-top">
      <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
        <div>
          <span className="badge rounded-pill text-bg-primary-subtle text-primary mb-2">Meja {order.table_number}</span>
          <h3 className="fw-black mb-1">{rupiah(order.total_amount)}</h3>
          <div className="small text-muted"><code>{order.payment_code}</code> • {compactDate(order.created_at)}</div>
        </div>
        <span className={`badge rounded-pill px-3 py-2 ${orderStatusBadge(order.status)}`}>{orderStatusLabel(order.status)}</span>
      </div>

      <div className="order-items-list mb-3">
        {(order.order_items || []).map((item) => (
          <div className="order-item-row" key={item.id}>
            <strong>{item.qty}x</strong>
            <div className="flex-grow-1">
              <div className="fw-bold">{item.item_name_snapshot}</div>
              {item.note ? <div className="small text-muted">Catatan: {item.note}</div> : null}
            </div>
            <span>{rupiah(item.subtotal)}</span>
          </div>
        ))}
      </div>

      {order.customer_note && <div className="alert alert-info rounded-4 small"><strong>Catatan customer:</strong><br />{order.customer_note}</div>}

      <div className="pos-total-box mb-3">
        <div><span>Subtotal</span><strong>{rupiah(order.subtotal)}</strong></div>
        <div><span>Service</span><strong>{rupiah(order.service_amount)}</strong></div>
        <div><span>Pajak</span><strong>{rupiah(order.tax_amount)}</strong></div>
        <div className="grand"><span>Total</span><strong>{rupiah(order.total_amount)}</strong></div>
      </div>

      <div className="d-grid gap-2">
        <Action disabled={busy === order.id + 'paid' || order.status !== 'waiting_payment'} onClick={() => setStatus(order, 'paid')} icon="bi-check-circle" label="Set Paid" />
        <Action disabled={busy === order.id + 'preparing' || !['paid'].includes(order.status)} onClick={() => setStatus(order, 'preparing')} icon="bi-fire" label="Preparing" />
        <Action disabled={busy === order.id + 'ready' || !['preparing'].includes(order.status)} onClick={() => setStatus(order, 'ready')} icon="bi-bag-check" label="Ready" />
        <Action disabled={busy === order.id + 'completed' || !['ready', 'paid', 'preparing'].includes(order.status)} onClick={() => setStatus(order, 'completed')} icon="bi-stars" label="Completed" />
        <Action disabled={busy === order.id + 'cancelled' || ['completed', 'cancelled'].includes(order.status)} onClick={() => setStatus(order, 'cancelled')} icon="bi-x-circle" label="Cancel" danger />
      </div>
    </div>
  );
}

function Action({ label, icon, disabled, danger, onClick }: { label: string; icon: string; disabled: boolean; danger?: boolean; onClick: () => void }) {
  return <button disabled={disabled} onClick={onClick} className={`btn rounded-pill ${danger ? 'btn-outline-danger' : 'btn-outline-primary'}`}><i className={`bi ${icon} me-1`} />{label}</button>;
}
