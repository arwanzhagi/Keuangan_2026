# Keuangan Arwan Resita

Dashboard keuangan berbasis React/Vite. Transaksi, tabungan, dan hutang/piutang disimpan otomatis di IndexedDB pada browser yang digunakan. Tidak ada server, database cloud, atau API untuk data keuangan.

## Data dan privasi

- Aplikasi langsung terbuka tanpa perlu memilih file.
- Data baru disimpan otomatis di penyimpanan lokal browser (IndexedDB).
- Aplikasi tidak memiliki login/autentikasi. Siapa pun yang memakai profil browser yang sama dapat membuka data lokal di perangkat tersebut.
- Impor CSV bersifat opsional. Impor `finance.csv` hasil ekspor aplikasi, atau pilih satu/lebih file bernama `transactions.csv`, `savings.csv`, dan `debts.csv`. Impor `finance.csv` mengganti seluruh data; impor CSV per kategori hanya mengganti kategori yang dipilih.
- Gunakan **Ekspor CSV** untuk mengunduh satu file `finance.csv` berisi transaksi, tabungan, dan hutang/piutang.
- File CSV tidak dikirim ke Cloudflare, GitHub, atau layanan database.
- `local-data/` berisi data awal lokal dan diabaikan Git. Jangan menghapus `.gitignore` atau mengunggah CSV ke GitHub.
- Penyimpanan browser terikat pada origin dan browser. Data di `localhost` tidak otomatis tersedia di domain Cloudflare; ekspor lalu impor CSV di situs yang sudah di-deploy untuk memindahkannya. Data juga tidak tersinkron antarperangkat/browser.

Skema CSV gabungan:

```text
finance.csv: record_type,id,amount,type,category,description,date,created_at,source_transaction_id,context
```

`record_type` berisi `transaction`, `saving`, atau `debt`. Jenis transaksi berisi `income` atau `expense`; jenis hutang/piutang berisi `payable` atau `receivable`. Kolom `context` hutang/piutang berisi `personal` atau `external` (kosong dianggap `personal`).

## Jalankan lokal di Windows

```powershell
Set-Location 'D:\Arwan\Daily\2026-11-18\project'
npm.cmd install
npm.cmd run dev
```

Buka URL yang ditampilkan Vite, biasanya `http://localhost:5173`. Aplikasi menyimpan data baru secara otomatis. Untuk memuat data CSV yang sudah ada, pilih **Impor CSV** dan pilih file yang diinginkan dari folder `local-data`.

Pemeriksaan proyek:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

## Deploy ke Cloudflare Pages dari GitHub

Ini adalah **Cloudflare Pages** (hosting web statis), bukan Cloudflare Tunnel. Push source code ke repository GitHub, lalu di Cloudflare pilih **Workers & Pages → Create application → Pages → Connect to Git** dan hubungkan repository tersebut.

Pengaturan build:

| Pengaturan | Nilai |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js | 22 (ditentukan oleh `.nvmrc`) |
| Environment variables | Tidak diperlukan |

Setelah deploy, buka situs melalui HTTPS dan pilih CSV dari perangkat yang sedang digunakan. Website Cloudflare hanya mengirimkan aset aplikasi; isi CSV tetap berada di perangkat pengguna. Jika perlu sinkronisasi antarperangkat, diperlukan layanan penyimpanan terpisah—aplikasi ini memang tidak mengaktifkannya.
