# WARUNK ONLINE

Web app warung digital realtime memakai **Next.js App Router**, **Bootstrap 5**, dan **Supabase**.

## Fitur utama

- Customer masuk langsung ke **home** di `/` tanpa landing page.
- Tampilan customer dibuat mengikuti mockup mobile PRATAPA MART: home, menu, scan, history, profile/settings, bottom navigation, dan checkout bar. Header besar hanya tampil di halaman yang cocok, bukan di semua tab.
- Customer scan QR meja lalu masuk ke `/?slug=...&tableNumber=...`.
- Customer bisa order tanpa login, pilih menu, tambah ke keranjang, checkout, lalu mendapat QR pembayaran.
- Payment hanya **bayar di kasir**. Customer menunjukkan QR pembayaran ke kasir.
- Kasir scan QR memakai kamera laptop/HP, upload/foto QR, atau input kode manual untuk mengubah `payment_status` menjadi `paid` dan `status` menjadi `paid` secara realtime.
- Customer melihat status order realtime: menunggu bayar, paid, preparing, ready, completed. History anonymous tersimpan di perangkat; jika customer login Supabase, order menyimpan `customer_id` supaya history bisa tersinkron.
- Dashboard POS role-based dengan table order, diagram omzet/status, antrean meja, dan tampilan responsive HP/PC:
  - **Owner:** full access, laporan, user & role, menu, QR meja, order, kasir.
  - **Admin:** generate QR meja, kelola menu manual, order, kasir.
  - **Kasir:** scan payment dan update status order.
- Realtime via Supabase Realtime untuk order, item, menu, kategori, dan meja.
- Tidak ada data demo. Kategori, menu, dan meja dibuat manual dari dashboard.

## Struktur halaman

- `/` home customer langsung.
- `/?slug=<qr_slug>&tableNumber=<nomor>` URL QR meja customer.
- `/order?slug=<qr_slug>&tableNumber=<nomor>` tetap disediakan sebagai kompatibilitas dan menampilkan UI customer yang sama.
- `/login` satu halaman masuk/daftar untuk customer dan staff. Routing akses dilakukan otomatis sesuai akun.
- `/dashboard` POS dashboard realtime dengan table dan diagram.
- `/dashboard/orders` order table realtime dengan panel detail POS dan update status.
- `/dashboard/menu` CRUD menu manual.
- `/dashboard/tables` generate/print QR meja.
- `/dashboard/users` owner mengatur role.
- `/dashboard/reports` laporan owner.
- `/kasir` scan QR payment dengan preview kamera besar, fallback foto/upload QR, dan input manual.

## Cara menjalankan lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

Isi `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Buka `http://localhost:3000`.

## Setup Supabase

1. Buat project Supabase baru.
2. Buka **SQL Editor**.
3. Jalankan semua isi file `supabase/schema.sql`.
4. Buka **Authentication > Users**, buat user untuk owner/admin/kasir. User baru default menjadi `customer`, jadi staff wajib diubah role-nya.
5. Buka tabel `profiles`, ubah role user staff:
   - `owner`
   - `admin`
   - `kasir`
   - `customer` untuk akun customer/history
6. Login sebagai owner/admin, tambahkan kategori, menu, dan QR meja manual dari dashboard.
7. Pastikan Realtime aktif untuk tabel yang dipakai. SQL sudah mencoba menambahkan tabel ke publication `supabase_realtime`.

## Alur pembayaran kasir

1. Customer scan QR meja dan pilih menu tanpa login.
2. Customer checkout dari home/menu customer.
3. Sistem membuat `orders` dengan:
   - `status = waiting_payment`
   - `payment_status = unpaid`
   - `payment_method = cashier_counter`
4. Customer menunjukkan QR pembayaran.
5. Kasir membuka `/kasir`, scan QR dengan kamera, upload/foto QR, atau input kode manual.
6. Kasir klik **Konfirmasi Bayar di Kasir**.
7. Sistem update order menjadi:
   - `status = paid`
   - `payment_status = paid`
   - `paid_at = now()`
   - `cashier_id = profile.id`
8. Halaman customer update otomatis realtime.

## File UI utama

- `components/CustomerApp.tsx` untuk home/menu/scan/history/profile customer.
- `app/globals.css` untuk style mockup mobile, bottom nav, card menu, loading screen, dan POS dashboard biru responsive.
- `components/LoadingScreen.tsx` untuk loading screen.
- `components/DashboardShell.tsx` untuk dashboard owner/admin/kasir.
- `components/QRCanvas.tsx` untuk QR meja dan QR payment.
- `components/StatusTimeline.tsx` untuk status realtime.

## Catatan produksi

- Jangan upload `node_modules` ke hosting.
- Deploy ke Vercel, isi environment variable yang sama.
- Untuk scanner kamera, gunakan HTTPS atau localhost karena browser membutuhkan secure context. Scanner memakai library `qr-scanner`, tidak mirror, prioritas kamera belakang, punya animasi scan, fallback foto/upload QR, dan input manual.
- Policy RLS di file SQL dibuat praktis untuk MVP. Untuk produksi besar, sebaiknya public read order dibatasi dengan token/order lookup endpoint agar data transaksi lebih privat.

## PWA, install app, dan notifikasi

Update ini sudah menambahkan:

- `public/manifest.webmanifest` untuk mode install/PWA.
- `public/sw.js` untuk service worker, cache ringan, notification click, dan handler push/message.
- `public/push-notification.js` untuk popup izin notifikasi, local realtime notification, sound, dan helper Push API.
- `public/sound.mp3` sebagai suara notifikasi realtime.
- Popup UI install/notifikasi yang muncul otomatis di aplikasi.

Catatan platform:

- Android/Chrome/Edge bisa memunculkan tombol **Install App** otomatis saat browser mengirim event `beforeinstallprompt`.
- iPhone/iPad tidak selalu menyediakan popup install otomatis dari browser. UI aplikasi akan menampilkan langkah **Share > Add to Home Screen**. Setelah dibuka dari Home Screen, user bisa mengizinkan notifikasi.
- Realtime alert di dalam aplikasi langsung aktif saat Supabase Realtime menerima order/status baru. Push notification jarak jauh saat browser tertutup penuh membutuhkan server push/VAPID. Helper `subscribeToPush(vapidPublicKey)` sudah tersedia di `public/push-notification.js` untuk disambungkan ke Supabase Edge Function/backend push.

## Update UX terbaru

- Halaman QR pembayaran customer sekarang memakai teks **QR pembayaran untuk kasir**, bukan scan meja.
- Header besar hanya muncul di Home supaya Menu/Scan/History/Profile lebih rapi.
- Copywriting customer dibuat lebih natural untuk warung.
- Warna biru dibuat lebih minimalis dan clean.
- Kasir tetap bisa scan tanpa alat scanner: kamera laptop/HP, foto/upload QR, atau input kode manual.
- Admin/owner/kasir mendapat alert realtime + suara saat order baru masuk.
