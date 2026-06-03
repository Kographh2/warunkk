'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { RoleGuard } from '@/components/RoleGuard';
import { compactDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { EmailChangeRequest, Profile, Role } from '@/lib/types';

export default function UsersPage() {
  return (
    <RoleGuard allow={['owner']}>
      {(profile) => <DashboardShell profile={profile}><UserManager owner={profile} /></DashboardShell>}
    </RoleGuard>
  );
}

type EmailRequestWithProfile = EmailChangeRequest & { profile_name?: string; profile_role?: string };

function UserManager({ owner }: { owner: Profile }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<EmailRequestWithProfile[]>([]);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const [usersRes, requestsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('email_change_requests').select('*').order('created_at', { ascending: false }).limit(80)
    ]);
    const nextUsers = (usersRes.data || []) as Profile[];
    const map = new Map(nextUsers.map((item) => [item.id, item]));
    setUsers(nextUsers);
    setRequests(((requestsRes.data || []) as EmailChangeRequest[]).map((item) => ({
      ...item,
      profile_name: map.get(item.user_id)?.full_name || 'Customer',
      profile_role: map.get(item.user_id)?.role || 'customer'
    })));
  }

  useEffect(() => {
    load();
    const channel = supabase.channel('owner-user-manager')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_change_requests' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function updateRole(user: Profile, role: Role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id);
    setMessage(error ? error.message : 'Role berhasil diubah.');
    load();
  }

  async function toggle(user: Profile) {
    const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    setMessage(error ? error.message : 'Status user berhasil diubah.');
    load();
  }

  async function approveEmailRequest(request: EmailRequestWithProfile) {
    setBusyId(request.id);
    setMessage('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const response = await fetch('/api/owner/email-requests/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id: request.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || 'Gagal approve email.');
      setMessage(data?.message || 'Request email berhasil di-approve dan email akun diperbarui.');
    } catch (error: any) {
      setMessage(error?.message || 'Gagal approve email. Pastikan SUPABASE_SERVICE_ROLE_KEY sudah diisi di Vercel.');
    } finally {
      setBusyId(null);
      load();
    }
  }

  async function rejectEmailRequest(request: EmailRequestWithProfile) {
    setBusyId(request.id);
    const { error } = await supabase.from('email_change_requests').update({
      status: 'rejected',
      reviewed_by: owner.id,
      reviewed_at: new Date().toISOString()
    }).eq('id', request.id);
    setMessage(error ? error.message : 'Request email ditolak.');
    setBusyId(null);
    load();
  }

  const pending = useMemo(() => requests.filter((item) => item.status === 'pending'), [requests]);
  const reviewed = useMemo(() => requests.filter((item) => item.status !== 'pending'), [requests]);

  return (
    <div className="owner-users-page">
      <div className="pos-page-header mb-4">
        <div>
          <span className="pos-kicker"><i className="bi bi-shield-lock me-1" />Owner Security</span>
          <h1>User, Role & Approval</h1>
          <p>Kelola role, aktif/nonaktif akun, dan approve request pergantian email customer.</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <a href="#email-approval" className="btn btn-warunk rounded-pill px-3"><i className="bi bi-envelope-check me-1" />Email Approval</a>
          <a href="#user-role" className="btn btn-outline-primary rounded-pill px-3"><i className="bi bi-people me-1" />User Role</a>
        </div>
      </div>

      {message && <div className="alert alert-info rounded-4">{message}</div>}

      <div className="row g-3 mb-4">
        <OwnerMiniMetric title="Pending email" value={pending.length.toString()} icon="bi-envelope-exclamation" tone="warning" />
        <OwnerMiniMetric title="Total user" value={users.length.toString()} icon="bi-people" />
        <OwnerMiniMetric title="Staff aktif" value={users.filter((u) => u.is_active && ['owner','admin','kasir'].includes(u.role)).length.toString()} icon="bi-person-badge" tone="success" />
        <OwnerMiniMetric title="Customer" value={users.filter((u) => u.role === 'customer').length.toString()} icon="bi-person-heart" />
      </div>

      <section id="email-approval" className="pos-card p-3 p-lg-4 mb-4">
        <div className="d-flex justify-content-between align-items-start gap-3 mb-3 flex-wrap">
          <div>
            <h4 className="pos-card-title mb-1">Approve Pergantian Email</h4>
            <p className="text-muted mb-0 small">Customer bisa request email baru dari Settings. Owner yang memutuskan approve/reject.</p>
          </div>
          <span className="badge rounded-pill text-bg-warning">{pending.length} pending</span>
        </div>

        {pending.length === 0 ? (
          <div className="empty-approval-card"><i className="bi bi-check2-circle" /><strong>Tidak ada request pending</strong><span>Semua request email sudah selesai diproses.</span></div>
        ) : (
          <div className="approval-list">
            {pending.map((request) => (
              <article className="approval-card" key={request.id}>
                <div className="approval-icon"><i className="bi bi-envelope-at" /></div>
                <div className="approval-main">
                  <div className="approval-title">{request.profile_name}</div>
                  <div className="approval-meta">{request.profile_role} · {compactDate(request.created_at)}</div>
                  <div className="approval-emails">
                    <span>{request.current_email || 'email lama tidak tersedia'}</span>
                    <i className="bi bi-arrow-right" />
                    <strong>{request.requested_email}</strong>
                  </div>
                </div>
                <div className="approval-actions">
                  <button className="btn btn-sm btn-warunk rounded-pill" disabled={busyId === request.id} onClick={() => approveEmailRequest(request)}>
                    {busyId === request.id ? 'Proses...' : 'Approve'}
                  </button>
                  <button className="btn btn-sm btn-outline-danger rounded-pill" disabled={busyId === request.id} onClick={() => rejectEmailRequest(request)}>Reject</button>
                </div>
              </article>
            ))}
          </div>
        )}

        {reviewed.length > 0 && (
          <details className="mt-3">
            <summary className="fw-bold text-muted">Lihat request yang sudah diproses</summary>
            <div className="table-responsive pos-table-wrap mt-3">
              <table className="table align-middle pos-table mb-0">
                <thead><tr><th>Nama</th><th>Email baru</th><th>Status</th><th>Masuk</th><th>Review</th></tr></thead>
                <tbody>
                  {reviewed.slice(0, 20).map((request) => (
                    <tr key={request.id}>
                      <td><strong>{request.profile_name}</strong><div className="small text-muted">{request.current_email}</div></td>
                      <td>{request.requested_email}</td>
                      <td><span className={`badge rounded-pill ${request.status === 'approved' ? 'text-bg-success' : 'text-bg-secondary'}`}>{request.status}</span></td>
                      <td>{compactDate(request.created_at)}</td>
                      <td>{request.reviewed_at ? compactDate(request.reviewed_at) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <section id="user-role" className="pos-card p-3 p-lg-4">
        <div className="d-flex justify-content-between align-items-start gap-3 mb-3 flex-wrap">
          <div>
            <h4 className="pos-card-title mb-1">User & Role</h4>
            <p className="text-muted mb-0 small">Satu halaman login untuk semua role. Database yang menentukan owner/admin/kasir/customer.</p>
          </div>
        </div>
        <div className="table-responsive pos-table-wrap">
          <table className="table align-middle pos-table mb-0">
            <thead><tr><th>Nama</th><th>Role</th><th>Status</th><th>Dibuat</th><th className="text-end">Aksi</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.full_name}</strong><div className="small text-muted user-id-truncate">{user.id}</div></td>
                  <td>
                    <select className="form-select rounded-pill role-select" value={user.role} onChange={(e) => updateRole(user, e.target.value as Role)}>
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="kasir">Kasir</option>
                      <option value="customer">Customer</option>
                    </select>
                  </td>
                  <td><span className={`badge rounded-pill ${user.is_active ? 'text-bg-success' : 'text-bg-secondary'}`}>{user.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td>{compactDate(user.created_at)}</td>
                  <td className="text-end"><button onClick={() => toggle(user)} className="btn btn-sm btn-outline-dark rounded-pill">{user.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OwnerMiniMetric({ title, value, icon, tone = 'primary' }: { title: string; value: string; icon: string; tone?: 'primary' | 'warning' | 'success' }) {
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
