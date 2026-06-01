'use client';

import { FormEvent, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { QRCanvas } from '@/components/QRCanvas';
import { RoleGuard } from '@/components/RoleGuard';
import { appUrl } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { TableRow } from '@/lib/types';

export default function TablesPage() {
  return (
    <RoleGuard allow={['owner', 'admin']}>
      {(profile) => <DashboardShell profile={profile}><TableQrManager /></DashboardShell>}
    </RoleGuard>
  );
}

function TableQrManager() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [tableNumber, setTableNumber] = useState('');
  const [tableName, setTableName] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const { data } = await supabase.from('tables').select('*').order('table_number');
    setTables((data || []) as TableRow[]);
  }

  useEffect(() => {
    load();
    const channel = supabase.channel('tables-manager')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function addTable(e: FormEvent) {
    e.preventDefault();
    if (!tableNumber.trim()) return;
    const { error } = await supabase.from('tables').insert({ table_number: tableNumber.trim(), table_name: tableName.trim() || `Meja ${tableNumber.trim()}` });
    setMessage(error ? error.message : 'Meja dan QR berhasil dibuat.');
    setTableNumber('');
    setTableName('');
    load();
  }

  async function toggle(table: TableRow) {
    await supabase.from('tables').update({ is_active: !table.is_active }).eq('id', table.id);
    load();
  }

  async function regenerate(table: TableRow) {
    if (!confirm(`Generate ulang QR untuk ${table.table_name || table.table_number}? QR lama tidak berlaku.`)) return;
    const qrSlug = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    await supabase.from('tables').update({ qr_slug: qrSlug }).eq('id', table.id);
    load();
  }

  async function remove(table: TableRow) {
    if (!confirm(`Hapus meja ${table.table_number}?`)) return;
    await supabase.from('tables').delete().eq('id', table.id);
    load();
  }

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h1 className="fw-bold mb-1">Generate QR Meja</h1>
          <p className="text-muted mb-0">Admin membuat QR untuk nomor meja. Customer scan QR ini untuk langsung masuk ke halaman order meja tersebut.</p>
        </div>
        <button onClick={() => window.print()} className="btn btn-outline-dark rounded-pill"><i className="bi bi-printer me-1" />Print QR</button>
      </div>

      {message && <div className="alert alert-info rounded-4">{message}</div>}

      <div className="soft-card p-4 mb-4">
        <form onSubmit={addTable} className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label fw-semibold">Nomor meja</label>
            <input className="form-control form-control-lg rounded-4" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="11" required />
          </div>
          <div className="col-md-5">
            <label className="form-label fw-semibold">Nama meja / area</label>
            <input className="form-control form-control-lg rounded-4" value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="Meja Indoor / Area Depan" />
          </div>
          <div className="col-md-3">
            <button className="btn btn-warunk btn-lg rounded-pill w-100">Buat QR</button>
          </div>
        </form>
      </div>

      <div className="row g-3">
        {tables.map((table) => {
          const url = `${appUrl()}/?slug=${encodeURIComponent(table.qr_slug)}&tableNumber=${encodeURIComponent(table.table_number)}`;
          return (
            <div className="col-md-6 col-xl-4" key={table.id}>
              <div className="soft-card p-4 h-100 text-center">
                <span className={`badge rounded-pill ${table.is_active ? 'text-bg-success' : 'text-bg-secondary'} mb-3`}>{table.is_active ? 'Aktif' : 'Nonaktif'}</span>
                <QRCanvas value={url} title={table.table_name || `Meja ${table.table_number}`} subtitle={url} />
                <div className="d-flex justify-content-center flex-wrap gap-2 mt-3">
                  <button onClick={() => toggle(table)} className="btn btn-sm btn-outline-warning rounded-pill">{table.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button onClick={() => regenerate(table)} className="btn btn-sm btn-outline-dark rounded-pill">Regenerate</button>
                  <button onClick={() => remove(table)} className="btn btn-sm btn-outline-danger rounded-pill">Hapus</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
