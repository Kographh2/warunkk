# QR Scanner Build Fix

Error Vercel:

```txt
Cannot find module 'qr-scanner' or its corresponding type declarations.
```

Penyebab: kode scanner meng-import `qr-scanner`, tetapi dependency belum ada di `package.json`/`package-lock.json` yang dipakai Vercel.

Fix di versi ini:

- Menambahkan `qr-scanner@1.4.2` ke `dependencies`.
- Menambahkan `package-lock.json` agar Vercel install dependency yang sama.
- Mengubah `vercel.json` menjadi `npm ci` supaya lockfile dipakai.
- Menambahkan helper `lib/camera.ts` agar scanner kamera/foto QR aman secara TypeScript.
- Build sudah dites dengan `npm run build`.

Langkah deploy:

1. Push seluruh file ke GitHub, termasuk `package-lock.json`.
2. Jangan upload `node_modules` dan `.next`.
3. Di Vercel pilih `Redeploy` lalu centang `Clear Build Cache`.
4. Environment wajib ada:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

