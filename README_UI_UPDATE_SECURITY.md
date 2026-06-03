# Update UI & Akun Customer

Update ini fokus ke UI customer mobile-first dan fitur akun customer:

- Header user diperbaiki agar tidak saling nabrak.
- Link "Login Staff" di area user dihapus.
- Username customer memakai profil akun jika sudah login.
- Profile dipisah dari Settings agar tidak berantakan.
- Settings berisi notifikasi manual, keamanan akun, request pergantian email, ganti password, dan hidden gem leaderboard.
- History memiliki filter tanggal/bulan/tahun.
- Setiap history/order bisa download invoice HTML yang bisa diprint atau Save as PDF.
- Invoice memakai brand PRATAPA MART dan footer: Pratapa By FizzxDevv 2026.
- Scanner memakai footer: Powered by FizzxDevv | Kograph.

## Supabase

Jalankan ulang `supabase/schema.sql` agar fungsi berikut tersedia:

- `update_my_customer_profile`
- `request_my_email_change`
- `customer_leaderboard`
- tabel `email_change_requests`

Jika schema belum dijalankan, UI tetap aman; hanya fitur request email/leaderboard yang akan tampil fallback.
