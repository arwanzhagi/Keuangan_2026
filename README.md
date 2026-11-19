# Keuangan Arwan Resita

Dashboard keuangan React/Vite. Data transaksi, tabungan, dan hutang/piutang disimpan di Supabase dan disinkronkan realtime. Akun Arwan dan Resita dibuat pada website dan disimpan lokal di browser, bukan pada tabel database.

## Jalankan di Bolt

1. Jalankan semua file di `supabase/migrations/` berurutan menggunakan Supabase CLI atau SQL Editor. Migration terakhir menambahkan kolom kategori tabungan/konteks hutang, RPC impor, dan realtime.
2. Salin `.env.example` sebagai template environment. Masukkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` ke **Environment Variables** Bolt, lalu rebuild/redeploy.
3. Pada kunjungan pertama website, buat password untuk Arwan (Super Admin) dan Resita (User biasa). Akun awal dibuat langsung pada browser tersebut; password hanya disimpan sebagai hash.
4. Gunakan browser dan alamat website yang sama untuk memakai akun yang sudah dibuat. Browser atau perangkat lain memiliki penyimpanan akun lokal yang berbeda.

Jika masih melihat layar lama yang hanya meminta password, atau pesan `Failed to fetch`, website yang dibuka belum memakai source terbaru atau konfigurasi Bolt belum diisi. Di source terbaru akan tampil pengaturan awal akun dan pesan konfigurasi Supabase bila URL/key belum tersedia.

## Batas keamanan akun lokal

Akun lokal hanya mengatur tampilan website: user biasa tidak melihat tombol hapus. Karena tidak menggunakan Supabase Auth/server, role tersebut **tidak dapat mengunci akses langsung ke database**. Database memakai Supabase anon key pada browser. Jangan gunakan mode ini untuk data sensitif di website publik; penguncian yang sungguh-sungguh memerlukan autentikasi server-side.

## Tabel dan data

- `transactions`: pemasukan dan pengeluaran.
- `savings`: tabungan beserta kategori.
- `debts`: hutang/piutang beserta konteks.

Tambah/hapus lewat bagian Hutang & Piutang hanya mengubah tabel `debts`, tidak membuat perubahan pada `transactions`. CSV bisa diimpor dari website sebagai Super Admin. Impor CSV mengganti kategori data yang dipilih; `finance.csv` mengganti semua kategori.

Folder `local-data/` sengaja tidak disertakan di Git untuk menjaga privasi. Data transaksi CSV yang belum ada sudah ditambahkan ke tabel Supabase; transaksi lama yang tidak terdapat di CSV dipertahankan. Lima baris tabungan juga sudah ada. Setelah migration dijalankan, impor `savings.csv` untuk menyelaraskan kategorinya. File `debts.csv` saat ini hanya berisi header.

Jangan pernah memasukkan Supabase `service_role` key ke frontend/Bolt.

## Jalankan lokal

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```
