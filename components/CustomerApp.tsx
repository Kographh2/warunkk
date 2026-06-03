'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { QRCanvas } from '@/components/QRCanvas';
import { StatusTimeline } from '@/components/StatusTimeline';
import { appUrl, compactDate, orderStatusBadge, orderStatusLabel, paymentCode, rupiah } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { CartItem, Category, MenuItem, Order, OrderItem, StoreSettings, TableRow } from '@/lib/types';

type BottomTab = 'home' | 'menu' | 'scan' | 'history' | 'profile';
type OrderWithItems = Order & { order_items?: OrderItem[] };

const DEFAULT_SETTINGS: StoreSettings = {
  name: 'PRATAPA MART',
  tagline: 'Kamu mau jajanan yang cepet dan ga ribet? Pesen disini aja!!',
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
  const next = [id, ...existing.filter((item) => item !== id)].slice(0, 30);
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

export function CustomerApp() {
  const params = useSearchParams();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const qrScannerRef = useRef<any>(null);

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
  const [clock, setClock] = useState('00.00 AM');
  const [scannerOn, setScannerOn] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
    supabase.auth.getSession().then(async ({ data }) => {
      setHasSession(Boolean(data.session));
      if (data.session?.user?.id) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', data.session.user.id).maybeSingle();
        if (profile?.full_name) setCustomerName(profile.full_name);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setHasSession(Boolean(session));
      if (session?.user?.id) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle();
        if (profile?.full_name) setCustomerName(profile.full_name);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

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
        if (error || !data) setMessage('QR meja tidak valid atau meja belum aktif. Minta QR baru ke kasir/admin.');
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
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tableNumber]);

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
        setOrder(payload.new as Order);
        loadHistory();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${order.id}` }, () => {
        supabase.from('order_items').select('*').eq('order_id', order.id).then(({ data }) => setOrderItems((data || []) as OrderItem[]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  useEffect(() => {
    if (activeTab === 'scan' && !order && !scannerOn) {
      startScanner();
    }
    if (activeTab !== 'scan') stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, order?.id]);

  useEffect(() => () => stopScanner(), []);

  async function loadHistory() {
    const { data: auth } = await supabase.auth.getSession();
    const ids = readHistoryIds();

    if (auth.session?.user.id) {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('customer_id', auth.session.user.id)
        .order('created_at', { ascending: false })
        .limit(60);
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

  function saveName(value: string) {
    setCustomerName(value);
    window.localStorage.setItem('warunk-customer-name', value || 'USER');
  }

  async function logoutCustomer() {
    await supabase.auth.signOut();
    setHasSession(false);
    await loadHistory();
  }

  function addToCart(menuItem: MenuItem) {
    setMessage('');
    if (!table) {
      setActiveTab('scan');
      setMessage('Scan QR meja dulu supaya pesanan terkirim ke meja yang benar.');
      return;
    }
    setCart((current) => {
      const found = current.find((item) => item.menu_item.id === menuItem.id);
      if (found) return current.map((item) => item.menu_item.id === menuItem.id ? { ...item, qty: item.qty + 1 } : item);
      return [...current, { menu_item: menuItem, qty: 1 }];
    });
    setMessage(`${menuItem.name} ditambahkan ke keranjang.`);
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
      setMessage(orderError?.message || 'Gagal membuat pesanan.');
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

  async function handleQrRaw(raw: string) {
    const found = parseQrValue(raw);
    if (found.slug || found.tableNumber) {
      stopScanner();
      const url = `/${found.slug ? `?slug=${encodeURIComponent(found.slug)}` : `?tableNumber=${encodeURIComponent(found.tableNumber)}`}${found.slug && found.tableNumber ? `&tableNumber=${encodeURIComponent(found.tableNumber)}` : ''}`;
      router.replace(url);
      return;
    }
    setMessage('QR belum sesuai. Pastikan yang discan adalah QR meja dari warung.');
  }

  async function startScanner() {
    setMessage('');
    if (scannerOn || order) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Kamera tidak bisa dibuka di browser ini. Coba buka dari HTTPS/localhost atau pakai tombol Ambil Foto QR.');
      return;
    }
    if (!videoRef.current) return;
    try {
      const QrScanner = (await import('qr-scanner')).default;
      stopScanner();
      const scanner = new QrScanner(
        videoRef.current,
        (result: any) => {
          const raw = typeof result === 'string' ? result : result?.data;
          if (raw) handleQrRaw(raw);
        },
        {
          preferredCamera: 'environment',
          returnDetailedScanResult: true,
          maxScansPerSecond: 8,
          highlightScanRegion: true,
          highlightCodeOutline: true
        }
      );
      qrScannerRef.current = scanner;
      await scanner.start();
      setScannerOn(true);
    } catch (error: any) {
      stopScanner();
      const text = String(error?.message || error || '');
      if (text.toLowerCase().includes('permission')) setMessage('Izin kamera belum diberikan. Tekan Allow/Izinkan di popup browser.');
      else setMessage('Kamera belum bisa dibuka. Pastikan halaman memakai HTTPS/localhost atau gunakan Ambil Foto QR.');
    }
  }

  async function scanImageFile(file?: File | null) {
    if (!file) return;
    setMessage('Membaca QR dari foto...');
    try {
      const QrScanner = (await import('qr-scanner')).default;
      const raw = await QrScanner.scanImage(file);
      await handleQrRaw(typeof raw === 'string' ? raw : String((raw as any)?.data || raw));
    } catch {
      setMessage('QR belum terbaca dari foto. Coba foto lebih dekat dan pastikan QR tidak blur.');
    }
  }

  function stopScanner() {
    try { qrScannerRef.current?.stop(); qrScannerRef.current?.destroy(); } catch {}
    qrScannerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScannerOn(false);
  }

  if (loading) return <LoadingScreen label="Membuka home warung digital..." />;

  return (
    <main className="customer-page">
      <div className="customer-shell">
        {(activeTab === 'home' || activeTab === 'menu') && (
          <header className="pratapa-hero">
            <div className="d-flex align-items-start justify-content-between gap-3">
              <div>
                <div className="hero-mini mb-3">HI, {customerName || 'USER'}</div>
                <div className="hero-title">WELCOME TO,<br />{settings.name}</div>
              </div>
              <div className="time-pill">{clock}</div>
            </div>
            <p className="hero-copy mb-2">{settings.tagline}</p>
            <p className="hero-copy hero-copy-strong mb-0">Pilih jajanan favoritmu, bayar di kasir, lalu tinggal tunggu dipanggil.</p>
            <div className="table-chip table-chip-soft">
              {table ? <><i className="bi bi-check-circle-fill me-1" /> Meja {table.table_number}</> : <><i className="bi bi-qr-code-scan me-1" /> Scan QR meja dulu</>}
            </div>
          </header>
        )}

        {message && <div className="alert alert-info customer-alert rounded-4 py-2 small mb-3">{message}</div>}

        <section className="customer-content">
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
              order={order}
              orderItems={orderItems}
              table={table}
              videoRef={videoRef}
              scannerOn={scannerOn}
              startScanner={startScanner}
              stopScanner={stopScanner}
              scanImageFile={scanImageFile}
              clearActiveOrder={clearActiveOrder}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTab orders={historyOrders} hasSession={hasSession} />
          )}

          {activeTab === 'profile' && (
            <ProfileTab name={customerName} saveName={saveName} table={table} hasSession={hasSession} logoutCustomer={logoutCustomer} />
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
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari minuman, makanan, snack..." />
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
    <div className="guest-order-note mb-3">
      <div className="guest-note-icon"><i className="bi bi-lightning-charge-fill" /></div>
      <div className="flex-grow-1">
        <strong>Pesan langsung, tanpa ribet</strong>
        <p className="mb-0">Bisa pesan tanpa login. Login hanya diperlukan kalau kamu ingin riwayat jajan tersimpan permanen.</p>
      </div>
      <button onClick={onScan} className="btn btn-sm btn-light rounded-pill fw-bold">{table ? `Meja ${table.table_number}` : 'Scan QR'}</button>
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
    <article className="pratapa-product-card">
      <div className="product-image-wrap">
        {item.image_url ? <img src={item.image_url} alt={item.name} /> : <i className="bi bi-cup-straw" />}
      </div>
      <div className="product-name">{item.name}</div>
      <div className="product-price">{rupiah(item.price)}</div>
      <button onClick={() => addToCart(item)}>Add</button>
    </article>
  );
}

function ScanTab({ order, orderItems, table, videoRef, scannerOn, startScanner, stopScanner, scanImageFile, clearActiveOrder }: {
  order: Order | null;
  orderItems: OrderItem[];
  table: TableRow | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scannerOn: boolean;
  startScanner: () => void;
  stopScanner: () => void;
  scanImageFile: (file?: File | null) => void;
  clearActiveOrder: () => void;
}) {
  if (order) {
    const qrValue = `${appUrl()}/kasir?code=${encodeURIComponent(order.payment_code)}`;
    return (
      <div className="payment-screen pb-5">
        <div className="payment-card text-center">
          <button className="btn btn-sm btn-light rounded-circle payment-close" onClick={clearActiveOrder}>×</button>
          <span className={`badge rounded-pill ${orderStatusBadge(order.status)} mb-2`}>{orderStatusLabel(order.status)}</span>
          <h2 className="fw-bold mb-1">Tunjukkan QR ke Kasir</h2>
          <p className="text-muted small mb-3">Kasir scan QR ini setelah kamu bayar tunai/non-tunai di kasir.</p>
          <QRCanvas value={qrValue} title="" subtitle="QR PEMBAYARAN UNTUK KASIR" />
          <div className="fw-bold fs-5 mt-2">{order.payment_code}</div>
          <div className="text-muted small">Meja {order.table_number}</div>
        </div>
        <div className="soft-card p-3 mt-3">
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
        </div>
      </div>
    );
  }

  return (
    <div className="scan-home text-center pb-5">
      <div className="scan-camera-box">
        <video ref={videoRef} className="w-100 h-100 object-fit-cover" autoPlay playsInline muted />
        {!scannerOn && <div className="scan-placeholder"><i className="bi bi-qr-code-scan" /><span>Arahkan kamera ke QR meja</span></div>}
        {scannerOn && <div className="scan-frame position-absolute top-50 start-50 translate-middle"><span /></div>}
      </div>
      <div className="small text-muted mt-3">{table ? `Meja aktif: ${table.table_number}` : 'Belum ada meja aktif'}</div>
      <div className="d-flex gap-2 mt-3">
        <button onClick={startScanner} className="btn btn-pratapa flex-fill rounded-pill"><i className="bi bi-camera-video me-1" />Nyalakan Kamera</button>
        <label className="btn btn-outline-primary rounded-pill mb-0"><i className="bi bi-image me-1" />Foto QR<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => scanImageFile(e.target.files?.[0])} /></label>
        <button onClick={stopScanner} className="btn btn-outline-dark rounded-pill">Stop</button>
      </div>
      <div className="powered-text mt-4">Powered By Fizzx</div>
    </div>
  );
}

function HistoryTab({ orders, hasSession }: { orders: OrderWithItems[]; hasSession: boolean }) {
  return (
    <div className="history-screen pb-5">
      <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h2 className="history-title">History Belanja</h2>
          <p className="history-subtitle">KAMU UDAH BELANJA APA AJA DISINI?</p>
        </div>
        <div className="date-badge">{new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date())}</div>
      </div>

      {!hasSession && (
        <div className="history-login-note mb-3">
          <i className="bi bi-info-circle-fill me-2" />
          Kamu tetap bisa order tanpa login. History sekarang tersimpan di perangkat ini; <Link href="/login?next=/" className="fw-black text-decoration-none">login customer</Link> supaya riwayat tersimpan lebih aman.
        </div>
      )}

      {orders.length === 0 ? <EmptyState title="Belum ada history" subtitle="Riwayat muncul setelah kamu checkout pesanan. Login dulu supaya history tidak hilang saat ganti perangkat." /> : (
        <div className="vstack gap-3">
          {orders.map((order) => (
            <div key={order.id}>
              <div className="history-date">{compactDate(order.created_at)}</div>
              <div className="history-card">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <strong>Meja {order.table_number}</strong>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileTab({ name, saveName, table, hasSession, logoutCustomer }: { name: string; saveName: (value: string) => void; table: TableRow | null; hasSession: boolean; logoutCustomer: () => void }) {
  return (
    <div className="profile-screen text-center pb-5">
      <div className="profile-blob mx-auto">
        <i className="bi bi-person" />
      </div>
      <input value={name} onChange={(e) => saveName(e.target.value)} className="profile-name-input" aria-label="Nama customer" />
      <div className="profile-level">Lv 001</div>
      <div className="soft-card p-3 mt-4 text-start">
        <div className="d-flex justify-content-between"><span className="text-muted">Status meja</span><strong>{table ? `Meja ${table.table_number}` : 'Belum scan'}</strong></div>
        <div className="d-flex justify-content-between mt-2"><span className="text-muted">Mode bayar</span><strong>Bayar di Kasir</strong></div>
        <div className="d-flex justify-content-between mt-2"><span className="text-muted">History</span><strong>{hasSession ? 'Tersinkron' : 'Perangkat ini'}</strong></div>
      </div>
      <div className="profile-note mt-3"><i className="bi bi-shield-check me-1" />Order tidak wajib login. Login customer diperlukan agar history tersimpan permanen.</div>
      <div className="d-flex justify-content-center flex-wrap gap-2 mt-4">
        {hasSession ? (
          <button onClick={logoutCustomer} className="btn btn-sm btn-light rounded-pill px-3">Logout Akun</button>
        ) : (
          <Link href="/login?next=/" className="btn btn-sm btn-light rounded-pill px-3">Login History</Link>
        )}
        <Link href="/login" className="btn btn-sm btn-outline-light rounded-pill px-3">Login Staff</Link>
      </div>
    </div>
  );
}

function BottomNav({ activeTab, setActiveTab }: { activeTab: BottomTab; setActiveTab: (tab: BottomTab) => void }) {
  return (
    <nav className="bottom-mobile-nav">
      <button className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}><i className="bi bi-house" /><span>HOME</span></button>
      <button className={activeTab === 'menu' ? 'active' : ''} onClick={() => setActiveTab('menu')}><i className="bi bi-list-ul" /><span>MENU</span></button>
      <button className={`scan-nav ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => setActiveTab('scan')}><i className="bi bi-qr-code-scan" /></button>
      <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}><i className="bi bi-receipt" /><span>HISTORY</span></button>
      <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}><i className="bi bi-person" /><span>PROFILE</span></button>
    </nav>
  );
}
