'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { QRCanvas } from '@/components/QRCanvas';
import { StatusTimeline } from '@/components/StatusTimeline';
import { appUrl, compactDate, orderStatusBadge, orderStatusLabel, paymentCode, rupiah } from '@/lib/format';
import { scanQrFromImage, startQrCamera, type QrCameraSession } from '@/lib/camera';
import { supabase } from '@/lib/supabase';
import { CartItem, Category, MenuItem, Order, OrderItem, StoreSettings, TableRow } from '@/lib/types';

type BottomTab = 'home' | 'menu' | 'scan' | 'history' | 'profile' | 'settings';
type OrderWithItems = Order & { order_items?: OrderItem[] };
type LeaderboardItem = {
  rank?: number;
  username: string | null;
  masked_email: string | null;
  total_spent: number | string | null;
  total_orders: number | string | null;
  level: number | string | null;
};

type CustomerStats = {
  paidOrders: number;
  lifetimeSpend: number;
  totalItems: number;
  level: number;
  label: string;
  progress: number;
  nextTarget: number;
};

const DEFAULT_SETTINGS: StoreSettings = {
  name: 'PRATAPA MART',
  tagline: 'Mau jajan cepet tanpa ribet? Pilih menu, bayar di kasir, pesanan langsung disiapkan.',
  taxPercent: 0,
  servicePercent: 0
};

function readHistoryIds() {
  try {
    return JSON.parse(window.localStorage.getItem('warunk-order-history') || '[]') as string[];
  } catch {
    return [];
  }
}

function saveHistoryId(id: string) {
  const existing = readHistoryIds();
  const next = [id, ...existing.filter((item) => item !== id)].slice(0, 60);
  window.localStorage.setItem('warunk-order-history', JSON.stringify(next));
}

function parseQrValue(raw: string) {
  const text = raw.trim();
  if (!text) return { slug: '', tableNumber: '' };

  try {
    const url = new URL(text);
    return {
      slug: url.searchParams.get('slug') || '',
      tableNumber: url.searchParams.get('tableNumber') || ''
    };
  } catch {
    if (text.includes('slug=')) {
      const params = new URLSearchParams(text.split('?')[1] || text);
      return { slug: params.get('slug') || '', tableNumber: params.get('tableNumber') || '' };
    }
    return { slug: '', tableNumber: text };
  }
}

function maskEmail(email?: string | null) {
  if (!email || !email.includes('@')) return 'email belum tersedia';
  const [name, domain] = email.split('@');
  const safeName = name.length <= 2 ? `${name[0] || '*'}***` : `${name.slice(0, 2)}***${name.slice(-1)}`;
  const [domainName, ...rest] = domain.split('.');
  const safeDomain = `${domainName.slice(0, 1)}***${domainName.slice(-1)}${rest.length ? `.${rest.join('.')}` : ''}`;
  return `${safeName}@${safeDomain}`;
}

function profileDisplayName(value?: string | null) {
  const clean = (value || '').trim();
  return clean || 'USER';
}

function calculateStats(orders: OrderWithItems[]): CustomerStats {
  const paid = orders.filter((order) => order.payment_status === 'paid' || ['paid', 'preparing', 'ready', 'completed'].includes(order.status));
  const lifetimeSpend = paid.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const totalItems = paid.reduce((sum, order) => sum + (order.order_items || []).reduce((inner, item) => inner + Number(item.qty || 0), 0), 0);
  const level = Math.max(1, Math.floor(lifetimeSpend / 50000) + 1);
  const labels = ['Teman Warung', 'Sahabat Warung', 'Langganan Mantap', 'Juragan Jajan', 'Legenda Pratapa'];
  const label = labels[Math.min(labels.length - 1, Math.floor((level - 1) / 3))];
  const currentBase = (level - 1) * 50000;
  const nextTarget = level * 50000;
  const progress = nextTarget === 0 ? 0 : Math.min(100, Math.max(0, ((lifetimeSpend - currentBase) / (nextTarget - currentBase)) * 100));
  return { paidOrders: paid.length, lifetimeSpend, totalItems, level, label, progress, nextTarget };
}


function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function invoiceHtml(order: OrderWithItems, customerName: string, customerEmail: string | null) {
  const items = (order.order_items || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.item_name_snapshot)}</td>
      <td class="center">${item.qty}</td>
      <td class="right">${rupiah(item.unit_price)}</td>
      <td class="right">${rupiah(item.subtotal)}</td>
    </tr>
  `).join('');
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice ${escapeHtml(order.payment_code)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#122044;font-family:Inter,Arial,sans-serif}.invoice{max-width:760px;margin:32px auto;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(18,32,68,.14)}.top{background:linear-gradient(135deg,#263E70,#1B2D57);color:#fff;padding:34px}.brand{letter-spacing:.18em;font-weight:900;font-size:13px}.title{font-size:36px;font-weight:900;margin:14px 0 4px}.muted{color:#6b7280}.white-muted{color:rgba(255,255,255,.78)}.content{padding:30px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.box{border:1px solid #e5e9f2;border-radius:18px;padding:16px;background:#f8fbff}.label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#64748b;font-weight:800}.value{font-weight:900;margin-top:5px}table{width:100%;border-collapse:collapse;margin-top:24px}th{font-size:11px;letter-spacing:.14em;text-transform:uppercase;text-align:left;color:#64748b;border-bottom:1px solid #e5e9f2;padding:12px}td{padding:14px 12px;border-bottom:1px solid #eef2f7;font-weight:700}.right{text-align:right}.center{text-align:center}.total{display:flex;justify-content:space-between;align-items:center;margin-top:22px;padding:20px 22px;border-radius:20px;background:#eef4ff}.total strong{font-size:28px;color:#263E70}.footer{text-align:center;padding:22px;color:#64748b;font-size:12px}@media print{body{background:#fff}.invoice{box-shadow:none;margin:0;max-width:none;border-radius:0}.no-print{display:none}}
  </style>
</head>
<body>
  <main class="invoice">
    <section class="top">
      <div class="brand">PRATAPA MART</div>
      <div class="title">Invoice Belanja</div>
      <div class="white-muted">${escapeHtml(order.payment_code)} · Meja ${escapeHtml(order.table_number)}</div>
    </section>
    <section class="content">
      <div class="grid">
        <div class="box"><div class="label">Customer</div><div class="value">${escapeHtml(customerName)}</div><div class="muted">${customerEmail ? maskEmail(customerEmail) : 'Tanpa login'}</div></div>
        <div class="box"><div class="label">Tanggal</div><div class="value">${compactDate(order.created_at)}</div><div class="muted">Status: ${escapeHtml(orderStatusLabel(order.status))}</div></div>
      </div>
      <table>
        <thead><tr><th>Menu</th><th class="center">Qty</th><th class="right">Harga</th><th class="right">Subtotal</th></tr></thead>
        <tbody>${items || '<tr><td colspan="4">Item tidak tersedia</td></tr>'}</tbody>
      </table>
      <div class="total"><span>Total Bayar</span><strong>${rupiah(order.total_amount)}</strong></div>
      <p class="muted">Pembayaran dilakukan di kasir. Simpan invoice ini sebagai bukti riwayat belanja kamu.</p>
      <button class="no-print" onclick="window.print()" style="border:0;border-radius:999px;background:#263E70;color:#fff;padding:12px 22px;font-weight:900;cursor:pointer">Print / Save PDF</button>
    </section>
    <footer class="footer">Pratapa By FizzxDevv 2026</footer>
  </main>
</body>
</html>`;
}

export function CustomerApp() {
  const params = useSearchParams();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scannerRef = useRef<QrCameraSession | null>(null);

  const slug = params.get('slug') || '';
  const tableNumber = params.get('tableNumber') || '';

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [table, setTable] = useState<TableRow | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTab, setActiveTab] = useState<BottomTab>('home');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [historyOrders, setHistoryOrders] = useState<OrderWithItems[]>([]);
  const [customerName, setCustomerName] = useState('USER');
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [clock, setClock] = useState('00.00 AM');
  const [scannerOn, setScannerOn] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyDay, setHistoryDay] = useState('');
  const [historyMonth, setHistoryMonth] = useState('');
  const [historyYear, setHistoryYear] = useState('');
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cart.reduce((sum, item) => sum + Number(item.menu_item.price) * item.qty, 0);
  const serviceAmount = Math.round(subtotal * (settings.servicePercent || 0) / 100);
  const taxAmount = Math.round((subtotal + serviceAmount) * (settings.taxPercent || 0) / 100);
  const total = subtotal + serviceAmount + taxAmount;

  const featuredMenu = useMemo(() => menu.slice(0, 3), [menu]);
  const bestSellerMenu = useMemo(() => menu.slice(3, 12).length ? menu.slice(3, 12) : menu.slice(0, 9), [menu]);
  const filteredMenu = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return menu.filter((item) => {
      const matchCategory = activeCategory === 'all' || item.category_id === activeCategory;
      const matchKeyword = !keyword || item.name.toLowerCase().includes(keyword) || (item.description || '').toLowerCase().includes(keyword);
      return matchCategory && matchKeyword;
    });
  }, [activeCategory, menu, searchQuery]);
  const filteredHistory = useMemo(() => {
    return historyOrders.filter((historyOrder) => {
      const date = new Date(historyOrder.created_at);
      const dayOk = !historyDay || String(date.getDate()).padStart(2, '0') === historyDay;
      const monthOk = !historyMonth || String(date.getMonth() + 1).padStart(2, '0') === historyMonth;
      const yearOk = !historyYear || String(date.getFullYear()) === historyYear;
      return dayOk && monthOk && yearOk;
    });
  }, [historyDay, historyMonth, historyOrders, historyYear]);
  const historyYears = useMemo(() => {
    const years = new Set(historyOrders.map((item) => String(new Date(item.created_at).getFullYear())));
    years.add(String(new Date().getFullYear()));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [historyOrders]);
  const stats = useMemo(() => calculateStats(historyOrders), [historyOrders]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date()).replace(':', '.'));
    }, 1000);
    setClock(new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date()).replace(':', '.'));
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedName = window.localStorage.getItem('warunk-customer-name');
    if (savedName) setCustomerName(savedName);
    setNotificationEnabled(window.localStorage.getItem('warunk-notification-enabled') === 'true');

    async function initSession() {
      const { data } = await supabase.auth.getSession();
      await applySession(data.session || null);
    }
    initSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session || null);
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`customer-profile-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) => {
        const nextName = profileDisplayName((payload.new as { full_name?: string }).full_name);
        setCustomerName(nextName);
        window.localStorage.setItem('warunk-customer-name', nextName);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage('');

      const [settingsRes, categoriesRes, menuRes] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', 'store').maybeSingle(),
        supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('menu_items').select('*, categories(*)').eq('is_available', true).order('sort_order')
      ]);

      if (settingsRes.data?.value) setSettings({ ...DEFAULT_SETTINGS, ...(settingsRes.data.value as StoreSettings) });
      setCategories((categoriesRes.data || []) as Category[]);
      setMenu((menuRes.data || []) as MenuItem[]);

      let resolvedTable: TableRow | null = null;
      if (slug || tableNumber) {
        const tableQuery = supabase.from('tables').select('*').eq('is_active', true);
        const { data, error } = slug
          ? await tableQuery.eq('qr_slug', slug).maybeSingle()
          : await tableQuery.eq('table_number', tableNumber).maybeSingle();
        if (error || !data) setMessage('QR meja belum cocok. Minta QR meja terbaru ke kasir.');
        else resolvedTable = data as TableRow;
      }
      setTable(resolvedTable);

      if (resolvedTable) {
        const savedId = window.localStorage.getItem(`warunk-active-order-${resolvedTable.table_number}`);
        if (savedId) {
          const { data: savedOrder } = await supabase.from('orders').select('*').eq('id', savedId).maybeSingle();
          if (savedOrder && !['completed', 'cancelled'].includes(savedOrder.status)) {
            setOrder(savedOrder as Order);
            const { data: items } = await supabase.from('order_items').select('*').eq('order_id', savedId);
            setOrderItems((items || []) as OrderItem[]);
            setActiveTab('scan');
          }
        }
      }

      await loadHistory();
      await loadLeaderboard();
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tableNumber, userId]);

  useEffect(() => {
    const channel = supabase
      .channel('customer-realtime-master')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        supabase.from('menu_items').select('*, categories(*)').eq('is_available', true).order('sort_order').then(({ data }) => setMenu((data || []) as MenuItem[]));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        supabase.from('categories').select('*').eq('is_active', true).order('sort_order').then(({ data }) => setCategories((data || []) as Category[]));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => {
        supabase.from('app_settings').select('value').eq('key', 'store').maybeSingle().then(({ data }) => {
          if (data?.value) setSettings({ ...DEFAULT_SETTINGS, ...(data.value as StoreSettings) });
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!order?.id) return;
    const channel = supabase
      .channel(`customer-order-${order.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, (payload) => {
        const nextOrder = payload.new as Order;
        setOrder(nextOrder);
        if (notificationEnabled && nextOrder.status !== order.status) notifyOrderStatus(nextOrder.status);
        loadHistory();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${order.id}` }, () => {
        supabase.from('order_items').select('*').eq('order_id', order.id).then(({ data }) => setOrderItems((data || []) as OrderItem[]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, notificationEnabled]);

  useEffect(() => () => stopScanner(), []);

  async function applySession(session: any) {
    setHasSession(Boolean(session));
    setUserId(session?.user.id || null);
    setCustomerEmail(session?.user.email || null);

    if (!session?.user.id) return;

    const { data } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle();
    const nextName = profileDisplayName((data as { full_name?: string } | null)?.full_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0]);
    setCustomerName(nextName);
    window.localStorage.setItem('warunk-customer-name', nextName);
    await loadHistory();
  }

  async function loadHistory() {
    const { data: auth } = await supabase.auth.getSession();
    const ids = readHistoryIds();

    if (auth.session?.user.id) {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('customer_id', auth.session.user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      setHistoryOrders((data || []) as OrderWithItems[]);
      return;
    }

    if (!ids.length) {
      setHistoryOrders([]);
      return;
    }
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .in('id', ids)
      .order('created_at', { ascending: false });
    setHistoryOrders((data || []) as OrderWithItems[]);
  }

  async function loadLeaderboard() {
    try {
      const { data } = await (supabase as any).rpc('customer_leaderboard', { limit_count: 10 });
      if (Array.isArray(data)) setLeaderboard(data as LeaderboardItem[]);
    } catch {
      setLeaderboard([]);
    }
  }

  async function saveName(value: string) {
    const nextName = value || 'USER';
    setCustomerName(nextName);
    window.localStorage.setItem('warunk-customer-name', nextName);
    const { data: auth } = await supabase.auth.getSession();
    if (auth.session?.user.id) {
      await (supabase as any).rpc('update_my_customer_profile', { new_full_name: nextName });
    }
  }

  async function logoutCustomer() {
    await supabase.auth.signOut();
    setHasSession(false);
    setUserId(null);
    setCustomerEmail(null);
    await loadHistory();
  }

  async function toggleNotification(nextValue: boolean) {
    if (nextValue) {
      if (!('Notification' in window)) {
        setMessage('Browser ini belum mendukung notifikasi. Kamu tetap bisa melihat status pesanan di halaman scan.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage('Izin notifikasi belum aktif. Aktifkan dari pengaturan browser kalau ingin menerima update pesanan.');
        return;
      }
    }
    window.localStorage.setItem('warunk-notification-enabled', String(nextValue));
    setNotificationEnabled(nextValue);
    setMessage(nextValue ? 'Notifikasi pesanan aktif.' : 'Notifikasi pesanan dimatikan.');
  }

  function notifyOrderStatus(status: string) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification('Update pesanan Pratapa Mart', {
      body: orderStatusLabel(status),
      icon: '/logo.svg',
      badge: '/logo.svg'
    });
  }

  function addToCart(menuItem: MenuItem) {
    setMessage('');
    if (!table) {
      setActiveTab('scan');
      setMessage('Scan QR meja dulu supaya pesanan masuk ke meja yang benar.');
      return;
    }
    setCart((current) => {
      const found = current.find((item) => item.menu_item.id === menuItem.id);
      if (found) return current.map((item) => item.menu_item.id === menuItem.id ? { ...item, qty: item.qty + 1 } : item);
      return [...current, { menu_item: menuItem, qty: 1 }];
    });
    setMessage(`${menuItem.name} masuk keranjang.`);
  }

  function changeQty(menuItemId: string, delta: number) {
    setCart((current) => current
      .map((item) => item.menu_item.id === menuItemId ? { ...item, qty: item.qty + delta } : item)
      .filter((item) => item.qty > 0));
  }

  async function checkout() {
    if (!table) {
      setActiveTab('scan');
      setMessage('Scan QR meja dulu sebelum checkout.');
      return;
    }
    if (cart.length === 0) return;
    setSubmitting(true);
    setMessage('');
    const code = paymentCode();
    const { data: auth } = await supabase.auth.getSession();
    const { data: created, error: orderError } = await supabase
      .from('orders')
      .insert({
        table_id: table.id,
        table_number: table.table_number,
        customer_id: auth.session?.user.id || null,
        status: 'waiting_payment',
        payment_status: 'unpaid',
        payment_method: 'cashier_counter',
        payment_code: code,
        subtotal,
        service_amount: serviceAmount,
        tax_amount: taxAmount,
        total_amount: total,
        customer_note: note || null
      })
      .select('*')
      .single();

    if (orderError || !created) {
      setMessage(orderError?.message || 'Gagal membuat pesanan. Coba lagi sebentar.');
      setSubmitting(false);
      return;
    }

    const rows = cart.map((item) => ({
      order_id: created.id,
      menu_item_id: item.menu_item.id,
      item_name_snapshot: item.menu_item.name,
      qty: item.qty,
      unit_price: item.menu_item.price,
      note: item.note || null,
      subtotal: Number(item.menu_item.price) * item.qty
    }));
    const { data: insertedItems, error: itemError } = await supabase.from('order_items').insert(rows).select('*');
    await supabase.from('order_events').insert({
      order_id: created.id,
      event: 'order_created',
      description: `Pesanan meja ${table.table_number} dibuat dan menunggu pembayaran di kasir.`
    });

    if (itemError) {
      setMessage(itemError.message);
      setSubmitting(false);
      return;
    }

    setOrder(created as Order);
    setOrderItems((insertedItems || []) as OrderItem[]);
    saveHistoryId(created.id);
    window.localStorage.setItem(`warunk-active-order-${table.table_number}`, created.id);
    setCart([]);
    setNote('');
    setSubmitting(false);
    setActiveTab('scan');
    await loadHistory();
  }

  function clearActiveOrder() {
    if (table) window.localStorage.removeItem(`warunk-active-order-${table.table_number}`);
    setOrder(null);
    setOrderItems([]);
    setActiveTab('home');
  }

  async function startScanner() {
    setMessage('');
    if (!videoRef.current) return;

    stopScanner();
    setScannerOn(true);

    try {
      scannerRef.current = await startQrCamera(
        videoRef.current,
        (raw) => handleQrResult(raw),
        (errorMessage) => setMessage(errorMessage)
      );
    } catch {
      setScannerOn(false);
      setMessage('Kamera belum bisa dibuka. Pastikan izin kamera aktif, lalu buka lewat HTTPS atau localhost.');
    }
  }

  function handleQrResult(raw: string) {
    const found = parseQrValue(raw);
    stopScanner();
    if (found.slug || found.tableNumber) {
      const url = `/${found.slug ? `?slug=${encodeURIComponent(found.slug)}` : `?tableNumber=${encodeURIComponent(found.tableNumber)}`}${found.slug && found.tableNumber ? `&tableNumber=${encodeURIComponent(found.tableNumber)}` : ''}`;
      router.replace(url);
      return;
    }
    setMessage('QR meja belum cocok. Coba scan QR yang ada di meja kamu.');
  }

  async function handleQrImage(file?: File | null) {
    if (!file) return;
    try {
      const raw = await scanQrFromImage(file);
      if (!raw) throw new Error('QR kosong');
      handleQrResult(raw);
    } catch {
      setMessage('Foto QR belum terbaca. Pastikan gambar terang, tidak blur, dan QR terlihat penuh.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function stopScanner() {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setScannerOn(false);
  }

  if (loading) return <LoadingScreen label="Membuka warung digital..." />;

  const showHero = activeTab === 'home' || activeTab === 'menu';

  return (
    <main className="customer-page customer-page-v3">
      <div className="customer-shell">
        {showHero ? (
          <header className={`pratapa-hero hero-v3 ${activeTab === 'menu' ? 'pratapa-hero-compact' : ''}`}>
            <div className="hero-topline">
              <div>
                <div className="hero-mini">HI, {profileDisplayName(customerName).toUpperCase()}</div>
                <div className="hero-title">WELCOME TO,<br />{settings.name}</div>
              </div>
              <button type="button" className="settings-circle" aria-label="Buka settings" onClick={() => setActiveTab('settings')}>
                <i className="bi bi-gear" />
              </button>
              <div className="time-pill">{clock}</div>
            </div>
            {activeTab === 'home' && (
              <>
                <p className="hero-copy mb-2">{settings.tagline}</p>
                <p className="hero-copy hero-copy-strong mb-0">SCAN QR MEJA, PILIH JAJANAN,<br />BAYAR DI KASIR.</p>
              </>
            )}
            <div className="hero-table-strip">
              <span><i className="bi bi-qr-code-scan" /> Status meja</span>
              <strong>{table ? `Meja ${table.table_number}` : 'Belum scan'}</strong>
            </div>
          </header>
        ) : (
          <div className="customer-mini-top mini-top-v3">
            <div>
              <span>{settings.name}</span>
              <strong>{activeTab === 'scan' ? 'Scan & Bayar' : activeTab === 'history' ? 'Riwayat Belanja' : activeTab === 'settings' ? 'Settings' : 'Profile'}</strong>
            </div>
            <div className="mini-actions">
              {activeTab !== 'settings' && (
                <button type="button" className="mini-icon-btn" aria-label="Buka settings" onClick={() => setActiveTab('settings')}>
                  <i className="bi bi-gear" />
                </button>
              )}
              <button type="button" onClick={() => setActiveTab('scan')} className={table ? 'is-ready' : ''}>
                <i className="bi bi-qr-code-scan" /> {table ? `Meja ${table.table_number}` : 'Scan'}
              </button>
            </div>
          </div>
        )}

        {message && <div className="alert alert-info customer-alert rounded-4 py-2 small mb-3">{message}</div>}

        <section className={`customer-content ${!showHero ? 'customer-content-plain' : ''}`}>
          {activeTab === 'home' && (
            <HomeTab
              featured={featuredMenu}
              bestSeller={bestSellerMenu}
              addToCart={addToCart}
              onSeeMenu={() => setActiveTab('menu')}
              onScan={() => setActiveTab('scan')}
              table={table}
            />
          )}

          {activeTab === 'menu' && (
            <MenuTab
              categories={categories}
              filteredMenu={filteredMenu}
              activeCategory={activeCategory}
              setActiveCategory={setActiveCategory}
              addToCart={addToCart}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          )}

          {activeTab === 'scan' && (
            <ScanTab
              order={order ? { ...order, order_items: orderItems } : null}
              orderItems={orderItems}
              table={table}
              videoRef={videoRef}
              scannerOn={scannerOn}
              startScanner={startScanner}
              stopScanner={stopScanner}
              clearActiveOrder={clearActiveOrder}
              fileInputRef={fileInputRef}
              handleQrImage={handleQrImage}
              customerName={profileDisplayName(customerName)}
              customerEmail={customerEmail}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTab
              orders={filteredHistory}
              allOrders={historyOrders}
              hasSession={hasSession}
              historyDay={historyDay}
              setHistoryDay={setHistoryDay}
              historyMonth={historyMonth}
              setHistoryMonth={setHistoryMonth}
              historyYear={historyYear}
              setHistoryYear={setHistoryYear}
              historyYears={historyYears}
              customerName={profileDisplayName(customerName)}
              customerEmail={customerEmail}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileTab
              name={customerName}
              saveName={saveName}
              table={table}
              hasSession={hasSession}
              logoutCustomer={logoutCustomer}
              email={customerEmail}
              stats={stats}
              openSettings={() => setActiveTab('settings')}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              hasSession={hasSession}
              email={customerEmail}
              notificationEnabled={notificationEnabled}
              toggleNotification={toggleNotification}
              leaderboard={leaderboard}
              reloadLeaderboard={loadLeaderboard}
              stats={stats}
              customerName={profileDisplayName(customerName)}
            />
          )}
        </section>

        {cartCount > 0 && (
          <div className="cart-checkout-bar">
            <button type="button" className="cart-total" onClick={() => setActiveTab('menu')}>
              <span>TOTAL</span>
              <strong>{rupiah(total)}</strong>
            </button>
            <button disabled={submitting} onClick={checkout} className="cart-checkout-btn">
              {submitting ? 'MEMBUAT QR...' : `CHECKOUT (${cartCount})`}
            </button>
          </div>
        )}

        {cartCount > 0 && activeTab === 'menu' && (
          <div className="cart-mini-list">
            {cart.map((item) => (
              <div className="d-flex align-items-center justify-content-between gap-2 py-2" key={item.menu_item.id}>
                <span className="fw-semibold small">{item.menu_item.name}</span>
                <div className="btn-group btn-group-sm" role="group">
                  <button className="btn btn-outline-secondary" onClick={() => changeQty(item.menu_item.id, -1)}>-</button>
                  <button className="btn btn-light fw-bold" disabled>{item.qty}</button>
                  <button className="btn btn-outline-secondary" onClick={() => changeQty(item.menu_item.id, 1)}>+</button>
                </div>
              </div>
            ))}
            <textarea className="form-control form-control-sm rounded-3 mt-2" rows={2} placeholder="Catatan pesanan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>
    </main>
  );
}

function HomeTab({ featured, bestSeller, addToCart, onSeeMenu, onScan, table }: { featured: MenuItem[]; bestSeller: MenuItem[]; addToCart: (item: MenuItem) => void; onSeeMenu: () => void; onScan: () => void; table: TableRow | null }) {
  if (featured.length === 0 && bestSeller.length === 0) {
    return <EmptyState title="Menu belum tersedia" subtitle="Admin bisa menambahkan menu manual dari dashboard." />;
  }
  return (
    <div className="pb-5">
      <GuestOrderNote onScan={onScan} table={table} />
      <div className="section-heading">
        <h2>MENU TERATAS</h2>
        <button onClick={onSeeMenu}>LIHAT SEMUA</button>
      </div>
      <ProductRail items={featured} addToCart={addToCart} />
      <div className="section-heading mt-3">
        <h2>BEST SELLER</h2>
        <span />
      </div>
      <ProductRail items={bestSeller} addToCart={addToCart} />
    </div>
  );
}

function MenuTab({ categories, filteredMenu, activeCategory, setActiveCategory, addToCart, searchQuery, setSearchQuery }: { categories: Category[]; filteredMenu: MenuItem[]; activeCategory: string; setActiveCategory: (id: string) => void; addToCart: (item: MenuItem) => void; searchQuery: string; setSearchQuery: (value: string) => void }) {
  return (
    <div className="pb-5">
      <div className="menu-search-box mb-3">
        <i className="bi bi-search" />
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari es teh, mie goreng, snack..." />
      </div>
      <div className="category-scroller mb-3">
        <button className={activeCategory === 'all' ? 'active' : ''} onClick={() => setActiveCategory('all')}>SEMUA</button>
        {categories.map((category) => (
          <button key={category.id} className={activeCategory === category.id ? 'active' : ''} onClick={() => setActiveCategory(category.id)}>{category.name}</button>
        ))}
      </div>
      {filteredMenu.length === 0 ? <EmptyState title="Menu belum tersedia" subtitle="Menu akan tampil realtime setelah admin menambahkan data." /> : (
        <div className="menu-grid">
          {filteredMenu.map((item) => <ProductCard key={item.id} item={item} addToCart={addToCart} />)}
        </div>
      )}
    </div>
  );
}

function GuestOrderNote({ onScan, table }: { onScan: () => void; table: TableRow | null }) {
  return (
    <div className="guest-order-note mb-3 note-v3">
      <div className="guest-note-icon"><i className="bi bi-shop" /></div>
      <div className="flex-grow-1">
        <strong>Langsung jajan di warung</strong>
        <p className="mb-0">Scan QR meja, pilih menu favorit, lalu bayar di kasir. Login hanya untuk menyimpan history saat ganti HP.</p>
      </div>
      <button onClick={onScan} className="btn btn-sm btn-light rounded-pill fw-bold">{table ? `Meja ${table.table_number}` : 'Scan'}</button>
    </div>
  );
}

function ProductRail({ items, addToCart }: { items: MenuItem[]; addToCart: (item: MenuItem) => void }) {
  return (
    <div className="product-rail">
      {items.map((item) => <ProductCard key={item.id} item={item} addToCart={addToCart} />)}
    </div>
  );
}

function ProductCard({ item, addToCart }: { item: MenuItem; addToCart: (item: MenuItem) => void }) {
  return (
    <article className="pratapa-product-card product-card-v3">
      <div className="product-image-wrap">
        {item.image_url ? <img src={item.image_url} alt={item.name} /> : <i className="bi bi-cup-straw" />}
      </div>
      <div className="product-name">{item.name}</div>
      <div className="product-price">{rupiah(item.price)}</div>
      <button onClick={() => addToCart(item)}>Add</button>
    </article>
  );
}

function ScanTab({ order, orderItems, table, videoRef, scannerOn, startScanner, stopScanner, clearActiveOrder, fileInputRef, handleQrImage, customerName, customerEmail }: {
  order: OrderWithItems | null;
  orderItems: OrderItem[];
  table: TableRow | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scannerOn: boolean;
  startScanner: () => void;
  stopScanner: () => void;
  clearActiveOrder: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleQrImage: (file?: File | null) => void;
  customerName: string;
  customerEmail: string | null;
}) {
  if (order) {
    const qrValue = `${appUrl()}/kasir?code=${encodeURIComponent(order.payment_code)}`;
    return (
      <div className="payment-screen pb-5">
        <div className="payment-card text-center payment-card-v3">
          <button className="btn btn-sm btn-light rounded-circle payment-close" onClick={clearActiveOrder}>×</button>
          <span className={`badge rounded-pill ${orderStatusBadge(order.status)} mb-2`}>{orderStatusLabel(order.status)}</span>
          <h2 className="fw-bold mb-1">QR Pembayaran Kasir</h2>
          <p className="text-muted small mb-3">Tunjukkan QR ini ke kasir setelah kamu bayar. Kasir akan scan untuk verifikasi pesanan.</p>
          <QRCanvas value={qrValue} title="PRATAPA MART" subtitle="QR PEMBAYARAN KASIR" />
          <div className="fw-bold fs-5 mt-2">{order.payment_code}</div>
          <div className="text-muted small">Meja {order.table_number}</div>
        </div>
        <div className="soft-card p-3 mt-3 invoice-summary-card">
          <StatusTimeline status={order.status} />
          <div className="mt-3">
            {orderItems.map((item) => (
              <div className="history-row" key={item.id}>
                <span>{item.item_name_snapshot}</span>
                <small>x{item.qty}</small>
                <strong>{rupiah(item.subtotal)}</strong>
              </div>
            ))}
          </div>
          <div className="d-flex justify-content-between align-items-center border-top pt-3 mt-2">
            <span className="fw-bold">TOTAL</span>
            <strong className="fs-5 text-warunk">{rupiah(order.total_amount)}</strong>
          </div>
          <button type="button" className="btn btn-pratapa w-100 rounded-pill mt-3" onClick={() => downloadInvoice(order, customerName, customerEmail)}>
            <i className="bi bi-download me-2" />Download Invoice
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="scan-home scan-home-v3 text-center pb-5">
      <div className="scan-copy-card mb-3">
        <span>Scan meja</span>
        <strong>{table ? `Meja aktif ${table.table_number}` : 'Arahkan kamera ke QR meja kamu'}</strong>
        <p>QR meja dipakai supaya pesanan masuk ke nomor meja yang benar.</p>
      </div>
      <div className="scan-camera-box">
        <video ref={videoRef} className="w-100 h-100 object-fit-cover" autoPlay playsInline muted />
        {!scannerOn && <div className="scan-placeholder"><i className="bi bi-qr-code-scan" /><span>SCAN QR MEJA</span></div>}
        {scannerOn && <div className="scan-frame position-absolute top-50 start-50 translate-middle" />}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="d-none" onChange={(event) => handleQrImage(event.target.files?.[0])} />
      <div className="d-flex gap-2 mt-3 scan-actions-v3">
        <button onClick={startScanner} className="btn btn-pratapa flex-fill rounded-pill"><i className="bi bi-camera-video me-1" />Mulai Scan</button>
        <button onClick={() => fileInputRef.current?.click()} className="btn btn-light rounded-pill"><i className="bi bi-image me-1" />Foto QR</button>
        <button onClick={stopScanner} className="btn btn-outline-dark rounded-pill">Stop</button>
      </div>
      <div className="powered-text mt-4">Powered by FizzxDevv | Kograph</div>
    </div>
  );
}

function HistoryTab({ orders, allOrders, hasSession, historyDay, setHistoryDay, historyMonth, setHistoryMonth, historyYear, setHistoryYear, historyYears, customerName, customerEmail }: {
  orders: OrderWithItems[];
  allOrders: OrderWithItems[];
  hasSession: boolean;
  historyDay: string;
  setHistoryDay: (value: string) => void;
  historyMonth: string;
  setHistoryMonth: (value: string) => void;
  historyYear: string;
  setHistoryYear: (value: string) => void;
  historyYears: string[];
  customerName: string;
  customerEmail: string | null;
}) {
  return (
    <div className="history-screen history-screen-v3 pb-5">
      <div className="history-header-v3 mb-3">
        <div>
          <span>PRATAPA MART</span>
          <h2>History Belanja</h2>
          <p>Pilih tanggal untuk cek invoice jajan kamu.</p>
        </div>
        <div className="history-count-pill">{allOrders.length} order</div>
      </div>

      <div className="history-filter-card mb-3">
        <label>
          <span>Tanggal</span>
          <select value={historyDay} onChange={(e) => setHistoryDay(e.target.value)}>
            <option value="">Semua</option>
            {Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, '0')).map((day) => <option key={day} value={day}>{day}</option>)}
          </select>
        </label>
        <label>
          <span>Bulan</span>
          <select value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}>
            <option value="">Semua</option>
            {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => <option key={month} value={month}>{month}</option>)}
          </select>
        </label>
        <label>
          <span>Tahun</span>
          <select value={historyYear} onChange={(e) => setHistoryYear(e.target.value)}>
            <option value="">Semua</option>
            {historyYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>

      {!hasSession && (
        <div className="history-login-note mb-3">
          <i className="bi bi-info-circle-fill me-2" />
          Kamu bisa order tanpa login. Untuk history permanen saat ganti HP, <Link href="/login" className="fw-black text-decoration-none">masuk atau daftar akun</Link> dulu.
        </div>
      )}

      {orders.length === 0 ? <EmptyState title="Belum ada history" subtitle="Riwayat muncul setelah kamu checkout pesanan." /> : (
        <div className="vstack gap-3">
          {orders.map((order) => (
            <div className="history-card history-card-v3" key={order.id}>
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                <div>
                  <div className="history-date">{compactDate(order.created_at)}</div>
                  <strong>Meja {order.table_number}</strong>
                </div>
                <span className={`badge rounded-pill ${orderStatusBadge(order.status)}`}>{orderStatusLabel(order.status)}</span>
              </div>
              {(order.order_items || []).map((item) => (
                <div className="history-row" key={item.id}>
                  <span>{item.item_name_snapshot}</span>
                  <small>x{item.qty}</small>
                  <strong>{rupiah(item.subtotal)}</strong>
                </div>
              ))}
              <div className="d-flex justify-content-between border-top pt-2 mt-2"><span>Total</span><strong>{rupiah(order.total_amount)}</strong></div>
              <button type="button" className="btn btn-sm btn-outline-primary rounded-pill w-100 mt-3" onClick={() => downloadInvoice(order, customerName, customerEmail)}>
                <i className="bi bi-receipt me-1" /> Download Invoice
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileTab({ name, saveName, table, hasSession, logoutCustomer, email, stats, openSettings }: { name: string; saveName: (value: string) => void; table: TableRow | null; hasSession: boolean; logoutCustomer: () => void; email: string | null; stats: CustomerStats; openSettings: () => void }) {
  const displayName = profileDisplayName(name);
  return (
    <div className="profile-screen profile-screen-v3 pb-5">
      <div className="profile-hero-card text-center">
        <button className="profile-settings-float" type="button" aria-label="Buka settings" onClick={openSettings}><i className="bi bi-gear" /></button>
        <div className="profile-blob mx-auto">
          <i className="bi bi-person" />
        </div>
        <input value={displayName} onChange={(e) => saveName(e.target.value)} className="profile-name-input" aria-label="Nama customer" />
        <div className="profile-level">Lv {String(stats.level).padStart(3, '0')} · {stats.label}</div>
        <div className="level-progress mt-3">
          <span style={{ width: `${stats.progress}%` }} />
        </div>
        <div className="small text-white-50 mt-2">Belanja lagi sampai {rupiah(stats.nextTarget)} untuk naik level.</div>
      </div>

      <div className="profile-status-grid mt-3">
        <div className="profile-status-card">
          <span>Status meja</span>
          <strong>{table ? `Meja ${table.table_number}` : 'Belum scan'}</strong>
        </div>
        <div className="profile-status-card">
          <span>Transaksi</span>
          <strong>{stats.paidOrders}x beli</strong>
        </div>
        <div className="profile-status-card wide">
          <span>Email akun</span>
          <strong>{hasSession ? maskEmail(email) : 'Belum login'}</strong>
        </div>
      </div>

      <div className="profile-note mt-3"><i className="bi bi-shield-check me-1" />History dan level dihitung dari pesanan yang sudah dibayar. Login supaya progress level tidak hilang saat ganti perangkat.</div>
      <div className="d-flex justify-content-center flex-wrap gap-2 mt-4">
        {hasSession ? (
          <button onClick={logoutCustomer} className="btn btn-sm btn-light rounded-pill px-3">Logout Akun</button>
        ) : (
          <Link href="/login" className="btn btn-sm btn-light rounded-pill px-3">Masuk / Daftar</Link>
        )}
        <button onClick={openSettings} className="btn btn-sm btn-outline-light rounded-pill px-3"><i className="bi bi-gear me-1" />Settings</button>
      </div>
    </div>
  );
}

function SettingsTab({ hasSession, email, notificationEnabled, toggleNotification, leaderboard, reloadLeaderboard, stats, customerName }: {
  hasSession: boolean;
  email: string | null;
  notificationEnabled: boolean;
  toggleNotification: (nextValue: boolean) => void;
  leaderboard: LeaderboardItem[];
  reloadLeaderboard: () => void;
  stats: CustomerStats;
  customerName: string;
}) {
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [localMessage, setLocalMessage] = useState('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  async function changePassword() {
    setLocalMessage('');
    if (!hasSession) {
      setLocalMessage('Login dulu sebelum mengganti password.');
      return;
    }
    if (password.length < 8) {
      setLocalMessage('Password minimal 8 karakter.');
      return;
    }
    setSubmittingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmittingPassword(false);
    if (error) setLocalMessage(error.message);
    else {
      setPassword('');
      setLocalMessage('Password berhasil diperbarui.');
    }
  }

  async function requestEmailChange() {
    setLocalMessage('');
    if (!hasSession) {
      setLocalMessage('Login dulu sebelum meminta pergantian email.');
      return;
    }
    if (!newEmail.includes('@')) {
      setLocalMessage('Masukkan email baru yang valid.');
      return;
    }
    const { error } = await (supabase as any).rpc('request_my_email_change', { requested_email: newEmail });
    if (error) setLocalMessage('Request email tersimpan lokal, tapi database perlu update schema terbaru agar owner bisa approve.');
    else {
      setNewEmail('');
      setLocalMessage('Request pergantian email dikirim. Email baru aktif setelah owner approve.');
    }
  }

  return (
    <div className="settings-screen settings-screen-v3 pb-5">
      <div className="settings-hero-card">
        <span>Pengaturan akun</span>
        <h2>{customerName}</h2>
        <p>Atur notifikasi, keamanan akun, dan hidden gem warung.</p>
      </div>

      {localMessage && <div className="alert alert-info rounded-4 py-2 small">{localMessage}</div>}

      <div className="settings-card">
        <div className="settings-card-title"><i className="bi bi-bell" /> Notifikasi Pesanan</div>
        <div className="settings-row">
          <div>
            <strong>Alert realtime</strong>
            <p>Aktifkan untuk mendapat popup saat status pesanan berubah.</p>
          </div>
          <div className="form-check form-switch m-0">
            <input className="form-check-input" type="checkbox" checked={notificationEnabled} onChange={(event) => toggleNotification(event.target.checked)} aria-label="Toggle notifikasi" />
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title"><i className="bi bi-shield-lock" /> Keamanan Akun</div>
        <div className="settings-field">
          <label>Email</label>
          <input value={hasSession ? (email || '') : 'Belum login'} disabled />
          <small>Email tidak bisa diedit langsung. Pergantian email harus di-approve owner.</small>
        </div>
        <div className="settings-field">
          <label>Request email baru</label>
          <div className="input-group">
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="emailbaru@example.com" disabled={!hasSession} />
            <button className="btn btn-outline-primary" type="button" disabled={!hasSession} onClick={requestEmailChange}>Kirim</button>
          </div>
        </div>
        <div className="settings-field">
          <label>Password baru</label>
          <div className="input-group">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 8 karakter" disabled={!hasSession} />
            <button className="btn btn-pratapa" type="button" disabled={!hasSession || submittingPassword} onClick={changePassword}>{submittingPassword ? '...' : 'Update'}</button>
          </div>
        </div>
        {!hasSession && <Link href="/login" className="btn btn-light rounded-pill w-100 mt-2">Masuk / Daftar Akun</Link>}
      </div>

      <div className="settings-card">
        <div className="settings-card-title"><i className="bi bi-stars" /> Hidden Gem</div>
        <button type="button" className="hidden-gem-button" onClick={() => { setShowLeaderboard((value) => !value); reloadLeaderboard(); }}>
          <span>Leaderboard Jagoan Jajan</span>
          <i className={`bi ${showLeaderboard ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
        </button>
        {showLeaderboard && (
          <div className="leaderboard-list mt-3">
            <div className="leaderboard-self">
              <span>Level kamu</span>
              <strong>Lv {String(stats.level).padStart(3, '0')} · {rupiah(stats.lifetimeSpend)}</strong>
            </div>
            {leaderboard.length === 0 ? <p className="text-muted small mb-0">Leaderboard akan tampil setelah database menjalankan schema terbaru dan ada transaksi paid.</p> : leaderboard.map((item, index) => (
              <div className="leaderboard-item" key={`${item.masked_email}-${index}`}>
                <div className="leader-rank">#{index + 1}</div>
                <div className="flex-grow-1">
                  <strong>{item.username || 'Customer'}</strong>
                  <span>{item.masked_email || 'email disensor'}</span>
                </div>
                <em>Lv {item.level || 1}</em>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-card security-note-card">
        <div className="settings-card-title"><i className="bi bi-patch-check" /> Proteksi Akun</div>
        <ul>
          <li>Password bisa diganti hanya saat kamu login.</li>
          <li>Email lama tetap terkunci sampai owner approve request email baru.</li>
          <li>Leaderboard menyensor email agar data pribadi tetap aman.</li>
          <li>History permanen tersimpan di akun, bukan hanya local device.</li>
        </ul>
      </div>
    </div>
  );
}

function downloadInvoice(order: OrderWithItems, customerName: string, customerEmail: string | null) {
  const blob = new Blob([invoiceHtml(order, customerName, customerEmail)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `invoice-pratapa-${order.payment_code}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function BottomNav({ activeTab, setActiveTab }: { activeTab: BottomTab; setActiveTab: (tab: BottomTab) => void }) {
  return (
    <nav className="bottom-mobile-nav bottom-nav-v3">
      <button className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}><i className="bi bi-house" /><span>HOME</span></button>
      <button className={activeTab === 'menu' ? 'active' : ''} onClick={() => setActiveTab('menu')}><i className="bi bi-list-ul" /><span>MENU</span></button>
      <button className={`scan-nav ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => setActiveTab('scan')}><i className="bi bi-qr-code-scan" /></button>
      <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}><i className="bi bi-receipt" /><span>HISTORY</span></button>
      <button className={activeTab === 'profile' || activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('profile')}><i className="bi bi-person" /><span>PROFILE</span></button>
    </nav>
  );
}
