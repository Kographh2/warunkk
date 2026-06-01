'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { RoleGuard } from '@/components/RoleGuard';
import { compactDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Profile, Role } from '@/lib/types';

export default function UsersPage() {
  return (
    <RoleGuard allow={['owner']}>
      {(profile) => <DashboardShell profile={profile}><UserManager /></DashboardShell>}
    </RoleGuard>
  );
}

function UserManager() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers((data || []) as Profile[]);
  }

  useEffect(() => {
    load();
    const channel = supabase.channel('profiles-manager')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
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

  return (
    <div>
      <div className="mb-4">
        <h1 className="fw-bold mb-1">User & Role</h1>
        <p className="text-muted mb-0">Owner full access: atur role owner/admin/kasir/customer dan aktif/nonaktifkan akun.</p>
      </div>

      {message && <div className="alert alert-info rounded-4">{message}</div>}
      <div className="alert alert-warning rounded-4">
        Pembuatan akun baru dilakukan dari Supabase Authentication. Setelah user dibuat, profil otomatis muncul di sini melalui trigger <code>handle_new_user</code>.
      </div>

      <div className="pos-card p-3 p-lg-4">
        <div className="table-responsive">
          <table className="table align-middle pos-table">
            <thead><tr><th>Nama</th><th>Role</th><th>Status</th><th>Dibuat</th><th className="text-end">Aksi</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.full_name}</strong><div className="small text-muted">{user.id}</div></td>
                  <td>
                    <select className="form-select rounded-pill" value={user.role} onChange={(e) => updateRole(user, e.target.value as Role)}>
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
      </div>
    </div>
  );
}
