# WARUNK ONLINE

Web app warung digital berbasis Next.js, Bootstrap 5, dan Supabase.

## Jalankan lokal

```bash
npm ci --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

Isi `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=isi_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=isi_anon_key_supabase
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Jalankan `supabase/schema.sql` di Supabase SQL Editor.

## Deploy Vercel

Setting penting:

- Framework Preset: Next.js
- Build Command: `npm run vercel-build`
- Install Command: `npm ci --no-audit --no-fund --legacy-peer-deps`
- Output Directory: kosongkan
- Root Directory: folder yang berisi `package.json`

Detail lengkap ada di `README_DEPLOY_FIX.md`. Untuk cek type lokal jalankan `npm run check`.

## Role

- Owner: akses penuh, laporan, user, menu, order, meja.
- Admin: menu, order, meja, generate QR, user terbatas.
- Kasir: POS order, scan QR pembayaran, update status.
- Customer: order tanpa login, login opsional untuk sinkron history.
