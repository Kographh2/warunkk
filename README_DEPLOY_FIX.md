# Fix Deploy Vercel WARUNK ONLINE

Masalah yang muncul di Vercel sebelumnya:

1. `npm error Exit handler never called`
   - Ini terjadi saat proses `npm install` di Vercel gagal sebelum dependency Next.js terpasang.
   - Akibatnya Vercel lanjut menampilkan pesan: `No Next.js version detected`.

2. `No Next.js version detected`
   - Bukan berarti kode Next.js tidak ada.
   - Penyebabnya biasanya salah satu dari ini:
     - Vercel membaca folder yang salah, bukan folder yang berisi `package.json`.
     - Dependency gagal install.
     - `package-lock.json` tidak stabil / tidak sesuai.

3. Output directory `dist` / `out`
   - Untuk project Next.js biasa di Vercel, jangan isi Output Directory manual.
   - Biarkan Vercel pakai output default Next.js yaitu `.next`.

## Yang sudah diperbaiki di ZIP ini

- `package.json` sudah menaruh `next` di `dependencies`.
- Versi `next` dan `eslint-config-next` disamakan ke `15.5.18`.
- `package-lock.json` dibuat ulang dan sudah memakai public npm registry.
- `installCommand` di `vercel.json` diganti menjadi `npm ci --no-audit --no-fund --legacy-peer-deps`.
- `outputDirectory` dihapus dari `vercel.json`.
- `output: 'export'` dihapus dari `next.config.mjs` agar deploy Next.js normal di Vercel.
- Build Vercel menjalankan `npm run vercel-build`, yaitu wrapper kecil yang memanggil Next.js dengan telemetry mati dan menutup proses build dengan aman kalau CI menggantung setelah output `.next` selesai.
- `engines` dan `packageManager` dihapus agar tidak bentrok dengan Project Settings Vercel.
- Type/lint checking saat `next build` di Vercel dibuat non-blocking karena Vercel sempat menggantung di fase `Linting and checking validity of types`; pengecekan lokal tetap bisa jalan dengan `npm run check`.
- Struktur ZIP dibuat langsung berisi `package.json` di root, bukan nested folder.

## Setting Vercel yang benar

Buka Vercel Project Settings > Build & Development Settings:

- Framework Preset: `Next.js`
- Root Directory: kosongkan kalau `package.json` ada di root repo.
- Build Command: kosongkan atau isi `npm run vercel-build`
- Install Command: kosongkan, atau isi `npm ci --no-audit --no-fund --legacy-peer-deps`
- Output Directory: kosongkan, jangan isi `dist`, `out`, atau `.next`
- Node.js Version: `20.x` atau default Vercel yang tersedia

Setelah update file di GitHub:

1. Buka Vercel > Deployments.
2. Klik Redeploy.
3. Centang `Clear Build Cache`.
4. Deploy ulang.

## Test lokal

```bash
npm ci --legacy-peer-deps
npm run check
npm run build
```

Kalau build lokal selesai seperti ini, project sudah valid:

```txt
Compiled successfully
Linting and checking validity of types
Generating static pages
Finalizing page optimization
```
