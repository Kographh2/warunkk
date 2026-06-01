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
import { CartItem, Category, MenuItem, Order, OrderItem, Profile, StoreSettings, TableRow } from '@/lib/types';

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
  const scannerRef = useRef<any>(null);
  const scannerStartingRef = useRef(false);

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
  const [scannerError, setScannerError] = useState('');
  const [hasSession, setHasSession] = useState(false);
  const [customerProfile, setCustomerProfile] = useState<Profile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [realtimeAlert, setRealtimeAlert] = useState('');
  const alertTimerRef = useRef<number | null>(null);
  const lastOrderStatusRef = useRef<string>('');

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
    const tab = params.get('tab') as BottomTab | null;
    if (tab && ['home', 'menu', 'scan', 'history', 'profile'].includes(tab)) setActiveTab(tab);
  }, [params]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date()).replace(':', '.'));
    }, 1000);
    setClock(new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date()).replace(':', '.'));
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    lastOrderStatusRef.current = order?.status || '';
  }, [order?.status]);

  useEffect(() => {
    refreshCustomerIdentity();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      refreshCustomerIdentity(session?.user.id);
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const nextOrder = payload.new as Order;
        const previousStatus = lastOrderStatusRef.current;
        setOrder(nextOrder);
        if (previousStatus && previousStatus !== nextOrder.status) showOrderAlert(nextOrder);
        lastOrderStatusRef.current = nextOrder.status;
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
    if (activeTab === 'scan' && !order) {
      const timer = window.setTimeout(() => {
        startScanner();
      }, 350);
      return () => window.clearTimeout(timer);
    }
    if (activeTab !== 'scan') stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, order?.id]);

  useEffect(() => () => {
    stopScanner();
    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
  }, []);

  async function refreshCustomerIdentity(userId?: string) {
    const savedName = window.localStorage.getItem('warunk-customer-name');
    const { data } = userId ? { data: { session: { user: { id: userId, email: undefined } } } as any } : await supabase.auth.getSession();
    const authUserId = userId || data.session?.user.id;

    setHasSession(Boolean(authUserId));
    if (!authUserId) {
      setCustomerProfile(null);
      setCustomerName(savedName || 'USER');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUserId)
      .maybeSingle();

    const typedProfile = (profile || null) as Profile | null;
    setCustomerProfile(typedProfile);
    const profileName = typedProfile?.full_name?.trim();
    const nextName = profileName || savedName || 'USER';
    setCustomerName(nextName);
    window.localStorage.setItem('warunk-customer-name', nextName);
  }

  async function showOrderAlert(nextOrder: Order) {
    const label = orderStatusLabel(nextOrder.status);
    const text = `Status pesanan kamu: ${label}`;
    setRealtimeAlert(text);
    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    alertTimerRef.current = window.setTimeout(() => setRealtimeAlert(''), 5200);
    await (window as any).WarunkPush?.notify?.({
      title: 'Update pesanan warung',
      body: `Meja ${nextOrder.table_number} sekarang ${label}.`,
      tag: `warunk-order-${nextOrder.id}-${nextOrder.status}`,
      url: '/'
    });
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

  async function saveName(value: string) {
    const nextName = value || 'USER';
    setCustomerName(nextName);
    window.localStorage.setItem('warunk-customer-name', nextName);

    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id && nextName.trim().length >= 2) {
      await supabase.from('profiles').update({ full_name: nextName.trim() }).eq('id', data.session.user.id);
      setCustomerProfile((current) => current ? { ...current, full_name: nextName.trim() } : current);
    }
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

  function handleScannedTableQr(raw: string) {
    const found = parseQrValue(raw);
    stopScanner();
    if (found.slug || found.tableNumber) {
      const url = `/${found.slug ? `?slug=${encodeURIComponent(found.slug)}` : `?tableNumber=${encodeURIComponent(found.tableNumber)}`}${found.slug && found.tableNumber ? `&tableNumber=${encodeURIComponent(found.tableNumber)}` : ''}`;
      router.replace(url);
      return;
    }
    setMessage('QR tidak berisi nomor meja yang valid.');
  }

  async function startScanner() {
    if (scannerStartingRef.current || scannerOn || order) return;
    setMessage('');
    setScannerError('');

    if (!videoRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError('Kamera belum bisa dibuka di perangkat ini. Kamu tetap bisa scan QR meja dari aplikasi kamera HP untuk membuka link order.');
      return;
    }

    scannerStartingRef.current = true;
    try {
      const { default: QrScanner } = await import('qr-scanner');
      const hasCamera = await QrScanner.hasCamera();
      if (!hasCamera) {
        setScannerError('Kamera tidak ditemukan. Buka link QR meja dari kamera HP atau cek izin kamera perangkat.');
        return;
      }

      scannerRef.current?.destroy?.();
      const scanner = new QrScanner(
        videoRef.current,
        (result: any) => handleScannedTableQr(typeof result === 'string' ? result : result?.data || ''),
        {
          preferredCamera: 'environment',
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 12,
          returnDetailedScanResult: true
        }
      );
      scannerRef.current = scanner;
      await scanner.start();
      setScannerOn(true);
    } catch {
      setScannerError('Kamera belum bisa aktif. Izinkan akses kamera dan jalankan lewat HTTPS atau localhost.');
      setScannerOn(false);
    } finally {
      scannerStartingRef.current = false;
    }
  }

  async function scanQrImage(file?: File | null) {
    if (!file) return;
    setMessage('Membaca QR dari gambar...');
    setScannerError('');
    try {
      const { default: QrScanner } = await import('qr-scanner');
      const result: any = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      handleScannedTableQr(typeof result === 'string' ? result : result?.data || '');
    } catch {
      setScannerError('QR di gambar belum terbaca. Coba foto QR lebih terang dan tidak blur.');
      setMessage('');
    }
  }

  function stopScanner() {
    scannerRef.current?.stop?.();
    scannerRef.current?.destroy?.();
    scannerRef.current = null;
    setScannerOn(false);
  }

  if (loading) return <LoadingScreen label="Membuka home warung digital..." />;

  const showHero = activeTab === 'home';

  return (
    <main className="customer-page">
      <div className="customer-shell">
        {showHero && <header className="pratapa-hero">
          <div className="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div className="hero-mini mb-3">Halo, {customerName || 'USER'}</div>
              <div className="hero-title">Selamat datang di<br />{settings.name}</div>
            </div>
            <div className="time-pill">{clock}</div>
          </div>
          <p className="hero-copy mb-2">{settings.tagline}</p>
          <p className="hero-copy hero-copy-strong mb-0">Scan QR meja, pilih jajanan, bayar di kasir.</p>
          {table && <div className="table-chip"><i className="bi bi-check-circle-fill me-1" /> Meja {table.table_number}</div>}
        </header>}

        {message && <div className="alert alert-info customer-alert rounded-4 py-2 small mb-3">{message}</div>}
        {realtimeAlert && (
          <div className="customer-realtime-toast">
            <span><i className="bi bi-bell-fill" /></span>
            <div><strong>Realtime update</strong><small>{realtimeAlert}</small></div>
          </div>
        )}

        <section className={`customer-content ${showHero ? '' : 'customer-content-plain'}`}>
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
              scannerError={scannerError}
              startScanner={startScanner}
              stopScanner={stopScanner}
              scanQrImage={scanQrImage}
              clearActiveOrder={clearActiveOrder}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTab orders={historyOrders} hasSession={hasSession} />
          )}

          {activeTab === 'profile' && (
            <ProfileTab name={customerName} saveName={saveName} table={table} hasSession={hasSession} profile={customerProfile} logoutCustomer={logoutCustomer} />
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
      <PageTop icon="bi-journal-richtext" title="Menu Warung" subtitle="Pilih jajanan favoritmu, nanti bayar di kasir." />
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
        <strong>Pesan dari meja kamu</strong>
        <p className="mb-0">Scan QR meja, pilih menu yang kamu mau, lalu tunjukkan QR pembayaran ke kasir.</p>
      </div>
      <button onClick={onScan} className="btn btn-sm btn-light rounded-pill fw-bold">{table ? `Meja ${table.table_number}` : 'Scan Meja'}</button>
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

function ScanTab({ order, orderItems, table, videoRef, scannerOn, scannerError, startScanner, stopScanner, scanQrImage, clearActiveOrder }: {
  order: Order | null;
  orderItems: OrderItem[];
  table: TableRow | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scannerOn: boolean;
  scannerError: string;
  startScanner: () => void;
  stopScanner: () => void;
  scanQrImage: (file?: File | null) => void;
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
          <p className="text-muted small mb-3">Setelah bayar di kasir, tunjukkan QR ini supaya pesanan diverifikasi.</p>
          <QRCanvas value={qrValue} title="" subtitle="QR pembayaran untuk kasir" />
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
      <PageTop icon="bi-qr-code-scan" title="Scan Meja" subtitle="Arahkan kamera ke QR yang ada di meja warung." />
      <div className={`scan-status-pill ${table ? 'active' : ''}`}>
        <i className={`bi ${table ? 'bi-check-circle-fill' : 'bi-geo-alt'}`} />
        {table ? `Meja ${table.table_number} aktif` : 'Meja belum dipilih'}
      </div>
      <div className="scan-camera-box mt-3">
        <video ref={videoRef} className="scan-video-feed w-100 h-100 object-fit-cover" autoPlay playsInline muted />
        {!scannerOn && <div className="scan-placeholder"><i className="bi bi-qr-code-scan" /><span>Scan QR Meja</span><small>Kamera akan meminta izin otomatis. Pastikan QR masuk ke kotak scan.</small></div>}
        {scannerOn && <div className="scan-frame position-absolute top-50 start-50 translate-middle"><span className="scan-line" /></div>}
      </div>
      <div className="small text-muted mt-3">{scannerOn ? 'Arahkan kamera belakang ke QR meja' : 'Tekan nyalakan kamera bila popup izin belum muncul'}</div>
      {scannerError && <div className="alert alert-warning rounded-4 small mt-3 mb-0">{scannerError}</div>}
      <div className="scan-actions-grid mt-3">
        <button onClick={startScanner} className="btn btn-pratapa rounded-pill"><i className="bi bi-camera-video me-1" />{scannerOn ? 'Scanning...' : 'Nyalakan Kamera'}</button>
        <label className="btn btn-light rounded-pill fw-bold mb-0">
          <i className="bi bi-image me-1" />Foto QR
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => scanQrImage(e.target.files?.[0])} />
        </label>
        <button onClick={stopScanner} className="btn btn-outline-dark rounded-pill">Stop</button>
      </div>
      <div className="powered-text mt-4">Powered By Fizzx</div>
    </div>
  );
}

function HistoryTab({ orders, hasSession }: { orders: OrderWithItems[]; hasSession: boolean }) {
  return (
    <div className="history-screen pb-5">
      <PageTop icon="bi-receipt" title="History Belanja" subtitle="Cek lagi jajanan yang pernah kamu pesan di warung ini." action={<div className="date-badge">{new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date())}</div>} />

      {!hasSession && (
        <div className="history-login-note mb-3">
          <i className="bi bi-info-circle-fill me-2" />
          Kamu tetap bisa order tanpa login. History sekarang tersimpan di perangkat ini; <Link href="/login" className="fw-black text-decoration-none">login</Link> supaya riwayat tersimpan lebih aman.
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

function ProfileTab({ name, saveName, table, hasSession, profile, logoutCustomer }: { name: string; saveName: (value: string) => void; table: TableRow | null; hasSession: boolean; profile: Profile | null; logoutCustomer: () => void }) {
  const [draftName, setDraftName] = useState(name);
  const [compactMode, setCompactMode] = useState(false);
  const [notifOn, setNotifOn] = useState(true);

  useEffect(() => setDraftName(name), [name]);
  useEffect(() => {
    setCompactMode(window.localStorage.getItem('warunk-compact-mode') === '1');
    setNotifOn(window.localStorage.getItem('warunk-notif-on') !== '0');
  }, []);

  function toggleCompact() {
    const next = !compactMode;
    setCompactMode(next);
    window.localStorage.setItem('warunk-compact-mode', next ? '1' : '0');
  }

  async function toggleNotif() {
    const next = !notifOn;
    if (next) {
      const permission = await (window as any).WarunkPush?.requestPermission?.();
      if (permission && permission !== 'granted') return;
      await (window as any).WarunkPush?.notify?.({
        title: 'Notifikasi pesanan aktif',
        body: 'Update status pesanan akan muncul realtime.',
        tag: 'warunk-customer-notif',
        url: '/'
      });
    }
    setNotifOn(next);
    window.localStorage.setItem('warunk-notif-on', next ? '1' : '0');
  }

  return (
    <div className="profile-screen-v2 pb-5">
      <PageTop icon="bi-person" title="Profile" subtitle="Atur nama, akun, dan kenyamanan belanja kamu." />

      <div className="profile-hero-card text-center">
        <div className="profile-blob mx-auto"><i className="bi bi-person" /></div>
        <h2 className="mb-1">{name || 'USER'}</h2>
        <div className="profile-level mb-3">{hasSession ? 'Akun tersinkron' : 'Tamu warung'}</div>
        <div className="profile-status-grid">
          <div><span>Meja</span><strong>{table ? table.table_number : '-'}</strong></div>
          <div><span>Bayar</span><strong>Kasir</strong></div>
          <div><span>History</span><strong>{hasSession ? 'Aman' : 'Lokal'}</strong></div>
        </div>
      </div>

      <div className="settings-card mt-3">
        <h3>Pengaturan Akun</h3>
        <label className="setting-label">Nama tampilan</label>
        <div className="input-group input-group-lg profile-name-group">
          <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="form-control rounded-start-pill" placeholder="Nama kamu" />
          <button className="btn btn-pratapa rounded-end-pill" onClick={() => saveName(draftName)}>Simpan</button>
        </div>
        <div className="settings-list mt-3">
          <SettingsRow icon="bi-shield-check" title="Status akun" value={hasSession ? profile?.role === 'customer' ? 'Customer' : 'Staff' : 'Belum login'} />
          <SettingsRow icon="bi-receipt-cutoff" title="Riwayat belanja" value={hasSession ? 'Tersimpan di akun' : 'Tersimpan di HP ini'} />
          <SettingsToggle icon="bi-bell" title="Notifikasi pesanan" checked={notifOn} onChange={toggleNotif} />
          <SettingsToggle icon="bi-grid-3x3-gap" title="Tampilan ringkas" checked={compactMode} onChange={toggleCompact} />
        </div>
      </div>

      <div className="settings-card mt-3">
        <h3>Bantuan Warung</h3>
        <div className="settings-list">
          <SettingsRow icon="bi-qr-code-scan" title="Cara pesan" value="Scan QR meja" />
          <SettingsRow icon="bi-cash-coin" title="Pembayaran" value="Tunjukkan QR ke kasir" />
          <SettingsRow icon="bi-headset" title="Butuh bantuan" value="Panggil kasir" />
        </div>
      </div>

      <div className="profile-note mt-3"><i className="bi bi-shield-check me-1" />Kamu bisa pesan tanpa login. Login hanya untuk menyimpan history saat ganti perangkat.</div>
      <div className="d-grid gap-2 mt-3">
        {hasSession ? (
          <button onClick={logoutCustomer} className="btn btn-outline-danger rounded-pill px-3">Logout Akun</button>
        ) : (
          <Link href="/login" className="btn btn-pratapa rounded-pill px-3">Masuk / Daftar Akun</Link>
        )}
      </div>
    </div>
  );
}

function PageTop({ icon, title, subtitle, action }: { icon: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="page-top-card">
      <div className="page-top-icon"><i className={`bi ${icon}`} /></div>
      <div className="flex-grow-1">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function SettingsRow({ icon, title, value }: { icon: string; title: string; value: string }) {
  return (
    <div className="settings-row">
      <div className="settings-icon"><i className={`bi ${icon}`} /></div>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SettingsToggle({ icon, title, checked, onChange }: { icon: string; title: string; checked: boolean; onChange: () => void }) {
  return (
    <button type="button" className="settings-row settings-toggle" onClick={onChange}>
      <div className="settings-icon"><i className={`bi ${icon}`} /></div>
      <span>{title}</span>
      <strong className={checked ? 'toggle-on' : ''}>{checked ? 'Aktif' : 'Mati'}</strong>
    </button>
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
