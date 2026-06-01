'use client';

import { FormEvent, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { EmptyState } from '@/components/EmptyState';
import { RoleGuard } from '@/components/RoleGuard';
import { rupiah } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Category, MenuItem } from '@/lib/types';

type FormState = {
  name: string;
  description: string;
  price: string;
  image_url: string;
  category_id: string;
  sort_order: string;
};

const emptyForm: FormState = { name: '', description: '', price: '', image_url: '', category_id: '', sort_order: '0' };

export default function MenuPage() {
  return (
    <RoleGuard allow={['owner', 'admin']}>
      {(profile) => <DashboardShell profile={profile}><MenuManager /></DashboardShell>}
    </RoleGuard>
  );
}

function MenuManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [categoryName, setCategoryName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    const [categoryRes, menuRes] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('menu_items').select('*, categories(*)').order('sort_order')
    ]);
    setCategories((categoryRes.data || []) as Category[]);
    setMenu((menuRes.data || []) as MenuItem[]);
    if (!form.category_id && categoryRes.data?.[0]?.id) setForm((f) => ({ ...f, category_id: categoryRes.data[0].id }));
  }

  useEffect(() => {
    load();
    const channel = supabase.channel('menu-manager')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!categoryName.trim()) return;
    const { error } = await supabase.from('categories').insert({ name: categoryName.trim(), sort_order: categories.length + 1 });
    setMessage(error ? error.message : 'Kategori berhasil ditambahkan.');
    setCategoryName('');
    load();
  }

  async function saveMenu(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      image_url: form.image_url.trim() || null,
      category_id: form.category_id || null,
      sort_order: Number(form.sort_order || 0),
      is_available: true
    };
    if (!payload.name || payload.price < 0) return;
    const res = editing
      ? await supabase.from('menu_items').update(payload).eq('id', editing)
      : await supabase.from('menu_items').insert(payload);
    setMessage(res.error ? res.error.message : editing ? 'Menu berhasil diupdate.' : 'Menu berhasil ditambahkan.');
    setEditing(null);
    setForm({ ...emptyForm, category_id: categories[0]?.id || '' });
    load();
  }

  function edit(item: MenuItem) {
    setEditing(item.id);
    setForm({
      name: item.name,
      description: item.description || '',
      price: String(item.price),
      image_url: item.image_url || '',
      category_id: item.category_id || '',
      sort_order: String(item.sort_order || 0)
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggle(item: MenuItem) {
    await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id);
    load();
  }

  async function remove(item: MenuItem) {
    if (!confirm(`Hapus menu ${item.name}?`)) return;
    await supabase.from('menu_items').delete().eq('id', item.id);
    load();
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="fw-bold mb-1">Menu Manual</h1>
        <p className="text-muted mb-0">Admin/owner menambahkan semua menu secara manual, lengkap kategori, harga, dan foto URL.</p>
      </div>

      {message && <div className="alert alert-info rounded-4">{message}</div>}

      <div className="row g-4 mb-4">
        <div className="col-xl-8">
          <div className="soft-card p-4 h-100">
            <h4 className="fw-bold mb-3">{editing ? 'Edit Menu' : 'Tambah Menu'}</h4>
            <form onSubmit={saveMenu} className="row g-3">
              <div className="col-md-6">
                <label className="form-label fw-semibold">Nama menu</label>
                <input className="form-control rounded-4" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold">Harga</label>
                <input type="number" className="form-control rounded-4" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold">Urutan</label>
                <input type="number" className="form-control rounded-4" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Kategori</label>
                <select className="form-select rounded-4" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">Tanpa kategori</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">URL Foto</label>
                <input className="form-control rounded-4" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold">Deskripsi</label>
                <textarea className="form-control rounded-4" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="col-12 d-flex gap-2">
                <button className="btn btn-warunk rounded-pill px-4">{editing ? 'Update Menu' : 'Simpan Menu'}</button>
                {editing && <button type="button" className="btn btn-outline-dark rounded-pill" onClick={() => { setEditing(null); setForm({ ...emptyForm, category_id: categories[0]?.id || '' }); }}>Batal</button>}
              </div>
            </form>
          </div>
        </div>

        <div className="col-xl-4">
          <div className="soft-card p-4 h-100">
            <h4 className="fw-bold mb-3">Tambah Kategori</h4>
            <form onSubmit={addCategory} className="d-flex gap-2 mb-3">
              <input className="form-control rounded-pill" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Contoh: Paket Hemat" />
              <button className="btn btn-dark rounded-pill">Tambah</button>
            </form>
            <div className="d-flex flex-wrap gap-2">
              {categories.map((category) => <span className="badge text-bg-light border rounded-pill px-3 py-2" key={category.id}>{category.name}</span>)}
            </div>
          </div>
        </div>
      </div>

      {menu.length === 0 ? <EmptyState title="Belum ada menu" /> : (
        <div className="row g-3">
          {menu.map((item) => (
            <div className="col-md-6 col-xl-4" key={item.id}>
              <div className="card h-100 border-0 shadow-sm rounded-5 overflow-hidden">
                {item.image_url ? <img src={item.image_url} alt={item.name} className="menu-image w-100" /> : <div className="menu-image w-100 d-grid" style={{ placeItems: 'center' }}><i className="bi bi-image text-muted fs-1" /></div>}
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div>
                      <h5 className="fw-bold mb-1">{item.name}</h5>
                      <p className="small text-muted mb-2">{item.description || '-'}</p>
                    </div>
                    <span className={`badge rounded-pill ${item.is_available ? 'text-bg-success' : 'text-bg-secondary'}`}>{item.is_available ? 'Aktif' : 'Off'}</span>
                  </div>
                  <div className="fw-bold text-warunk fs-5 mb-3">{rupiah(item.price)}</div>
                  <div className="d-flex flex-wrap gap-2">
                    <button className="btn btn-sm btn-outline-dark rounded-pill" onClick={() => edit(item)}>Edit</button>
                    <button className="btn btn-sm btn-outline-warning rounded-pill" onClick={() => toggle(item)}>{item.is_available ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    <button className="btn btn-sm btn-outline-danger rounded-pill" onClick={() => remove(item)}>Hapus</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
