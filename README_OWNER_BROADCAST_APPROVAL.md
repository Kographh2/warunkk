# Update Owner: Email Approval + Broadcast & Ads

## Fitur baru

1. Dashboard owner memiliki menu `Broadcast & Ads`.
2. Owner bisa upload gambar manual dari perangkat, bukan link gambar.
3. Konten broadcast/ads tersimpan di tabel `announcements` dan gambar masuk ke Supabase Storage bucket `broadcast-assets`.
4. Customer yang menyalakan notifikasi di Settings akan menerima realtime alert saat app/PWA sedang aktif.
5. Ads/broadcast juga tampil di Home customer.
6. Dashboard `User & Approval` memiliki section approve/reject request ganti email.
7. Approve email memakai API server `/api/owner/email-requests/approve` agar service role key tidak bocor ke browser.

## Environment tambahan

Tambahkan di Vercel Environment Variables:

```env
SUPABASE_SERVICE_ROLE_KEY=isi_service_role_key_supabase
```

Jangan pernah memakai service role key di client/browser.

## Supabase

Jalankan ulang file:

```txt
supabase/schema.sql
```

Schema terbaru menambahkan:

- `announcements`
- `push_subscriptions`
- Storage bucket `broadcast-assets`
- RLS policies untuk owner dan customer
- realtime publication untuk `announcements`, `push_subscriptions`, dan `email_change_requests`

## Catatan push notification

Realtime notification aktif saat web/PWA sedang terbuka atau berjalan. Untuk push yang tetap masuk saat app benar-benar tertutup penuh, perlu backend push dengan VAPID/web-push. Struktur `push_subscriptions`, `sw.js`, dan `push-notification.js` sudah disiapkan supaya bisa dilanjutkan ke true background push.
