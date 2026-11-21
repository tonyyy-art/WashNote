# WashNote Backend

Dokumentasi backend aplikasi **WashNote / GALIROSO WASH** yang dibangun
menggunakan Laravel 13, PHP, MySQL, dan Laravel Sanctum. Backend
menyediakan REST API untuk autentikasi pengguna, pengelolaan data
master, transaksi pesanan, kendaraan dan layanan, pembayaran,
pengeluaran, jam operasional, laporan, serta audit perubahan.

# Developer
- Rhiwugha Dwi. S 
- Nawa Istiqomah 
- Ahmad Fathoni 
- Ratu Carmenita Faizal 
- Naufal Zarkasya Arkaan 

> **Catatan:** Dokumentasi endpoint ini disusun berdasarkan tahapan
> implementasi proyek. Cocokkan kembali dengan `routes/api.php` dan
> hasil `php artisan route:list` pada kode sumber Anda, karena nama
> route atau parameter dapat berbeda jika ada perubahan implementasi.

## 1. Teknologi

-   **Backend framework:** Laravel 13
-   **Bahasa:** PHP
-   **Database:** MySQL
-   **Autentikasi API:** Laravel Sanctum (Bearer Token)
-   **Format pertukaran data:** JSON
-   **Zona waktu aplikasi:** Asia/Jakarta

## 2. Tujuan Sistem

Backend WashNote digunakan oleh dua jenis pengguna:

-   **Owner:** mengelola akun kasir, data master, jam operasional,
    pengeluaran, laporan, dan riwayat perubahan.
-   **Kasir:** mengelola pesanan, kendaraan dalam pesanan, status proses
    kendaraan, dan pembayaran.

Pendaftaran mandiri tidak disediakan. Akun kasir dibuat oleh Owner.

## 3. Persiapan dan Instalasi

### Persyaratan

Pastikan perangkat sudah memiliki:

-   PHP yang kompatibel dengan Laravel 13
-   Composer
-   MySQL
-   Ekstensi PHP yang dibutuhkan Laravel
-   Web server lokal seperti Laragon (opsional)

### Langkah instalasi

1.  Clone atau salin folder proyek ke komputer.
2.  Buka terminal pada folder backend.
3.  Pasang dependensi:

``` bash
composer install
```

4.  Buat file konfigurasi lingkungan:

``` bash
cp .env.example .env
```

Pada Windows, file `.env.example` juga dapat disalin secara manual
menjadi `.env`.

5.  Buat application key:

``` bash
php artisan key:generate
```

6.  Buat database MySQL, misalnya `washnote_db`, lalu sesuaikan
    konfigurasi `.env`:

``` env
APP_NAME=WashNote
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://127.0.0.1:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=washnote_db
DB_USERNAME=root
DB_PASSWORD=
```

Sesuaikan username dan password dengan konfigurasi MySQL lokal Anda.

7.  Jalankan migrasi:

``` bash
php artisan migrate
```

8.  Jika seeder Owner sudah tersedia, jalankan:

``` bash
php artisan db:seed
```

9.  Bersihkan cache konfigurasi jika diperlukan:

``` bash
php artisan config:clear
```

10. Jalankan server:

``` bash
php artisan serve
```

Secara default, server tersedia di `http://127.0.0.1:8000`.

## 4. Struktur Fitur Backend

Secara umum, backend terdiri dari bagian berikut:

  -----------------------------------------------------------------------
  Bagian                              Fungsi
  ----------------------------------- -----------------------------------
  Authentication                      Login, logout, dan informasi akun
                                      aktif

  Role Middleware                     Membatasi akses berdasarkan peran
                                      Owner atau Kasir

  Data Master                         Mengelola kategori kendaraan,
                                      layanan, dan harga layanan

  Pesanan                             Membuat, melihat, mengubah, dan
                                      membatalkan pesanan

  Kendaraan Pesanan                   Menyimpan kendaraan dan status
                                      proses setiap kendaraan

  Detail Layanan                      Menyimpan layanan dan snapshot
                                      harga pada saat transaksi

  Pembayaran                          Mencatat metode, nominal, status,
                                      dan waktu pembayaran

  Pengeluaran                         Mengelola catatan pengeluaran usaha

  Jam Operasional                     Menyimpan jadwal buka dan tutup

  Laporan                             Menghitung pemasukan, pengeluaran,
                                      jumlah kendaraan, dan laba bersih

  Audit                               Menyimpan riwayat perubahan data
                                      penting

  Pengguna                            Mengelola akun kasir oleh Owner
  -----------------------------------------------------------------------

## 5. Konfigurasi Request API

### Base URL

Untuk pengujian melalui perangkat/komputer yang menjalankan server:

``` text
http://127.0.0.1:8000/api
```

Jika aplikasi React Native dijalankan pada emulator atau perangkat
fisik, `127.0.0.1` mengarah ke perangkat itu sendiri. Gunakan alamat IP
komputer yang menjalankan Laravel dan pastikan kedua perangkat berada
pada jaringan yang dapat saling terhubung.

### Header umum

Request yang mengirim atau menerima JSON menggunakan:

``` http
Accept: application/json
Content-Type: application/json
```

Endpoint yang membutuhkan autentikasi juga harus menyertakan:

``` http
Authorization: Bearer TOKEN_ANDA
```

Token diperoleh dari endpoint login. Jangan menyimpan token secara
hard-coded atau membagikannya kepada orang lain.

### Format respons

Respons berhasil umumnya berbentuk JSON. Contoh ilustrasi:

``` json
{
  "message": "Data berhasil diproses",
  "data": {}
}
```

Bentuk respons aktual mengikuti implementasi masing-masing controller.

## 6. Dokumentasi Endpoint API

Semua path di bawah menggunakan prefix `/api`.

### A. Autentikasi

  -----------------------------------------------------------------------
  Method            Endpoint          Akses             Fungsi
  ----------------- ----------------- ----------------- -----------------
  POST              `/login`          Publik            Memeriksa
                                                        username dan
                                                        password, lalu
                                                        menghasilkan
                                                        token Sanctum
                                                        jika akun aktif
                                                        dan kredensial
                                                        benar.

  POST              `/logout`         Login             Menghapus token
                                                        yang sedang
                                                        digunakan
                                                        sehingga token
                                                        tersebut tidak
                                                        dapat digunakan
                                                        lagi.

  GET               `/profile`        Login             Mengambil
                                                        informasi
                                                        pengguna yang
                                                        sedang login.
  -----------------------------------------------------------------------

**Contoh login:**

``` http
POST /api/login
```

``` json
{
  "username": "owner",
  "password": "password-anda"
}
```

Simpan token dari respons login secara aman pada aplikasi mobile. Login
dibatasi dengan rate limiter untuk mengurangi percobaan berulang.

### B. Pemeriksaan akses / endpoint uji

  ---------------------------------------------------------------------------
  Method            Endpoint              Akses             Fungsi
  ----------------- --------------------- ----------------- -----------------
  GET               `/operasional/test`   Owner dan Kasir   Endpoint uji
                                                            untuk memastikan
                                                            autentikasi dan
                                                            middleware peran
                                                            operasional
                                                            berjalan.

  GET               `/owner/test`         Owner             Endpoint uji
                                                            untuk memastikan
                                                            pembatasan akses
                                                            khusus Owner
                                                            berjalan.
  ---------------------------------------------------------------------------

Endpoint ini merupakan endpoint pengujian dan bukan fitur utama
aplikasi. Endpoint dapat dihapus atau dinonaktifkan setelah pengujian
selesai.

### C. Data master

#### Kategori kendaraan

  ----------------------------------------------------------------------------------
  Method            Endpoint                     Akses             Fungsi
  ----------------- ---------------------------- ----------------- -----------------
  GET               `/kategori-kendaraan`        Owner             Mengambil daftar
                                                                   kategori
                                                                   kendaraan.

  POST              `/kategori-kendaraan`        Owner             Menambahkan
                                                                   kategori
                                                                   kendaraan.

  GET               `/kategori-kendaraan/{id}`   Owner             Mengambil detail
                                                                   kategori
                                                                   kendaraan.

  PUT/PATCH         `/kategori-kendaraan/{id}`   Owner             Memperbarui
                                                                   kategori
                                                                   kendaraan.

  DELETE            `/kategori-kendaraan/{id}`   Owner             Menonaktifkan
                                                                   kategori
                                                                   kendaraan
                                                                   (soft-disable),
                                                                   bukan menghapus
                                                                   permanen.
  ----------------------------------------------------------------------------------

#### Layanan

  -----------------------------------------------------------------------
  Method            Endpoint          Akses             Fungsi
  ----------------- ----------------- ----------------- -----------------
  GET               `/layanan`        Owner             Mengambil daftar
                                                        layanan.

  POST              `/layanan`        Owner             Menambahkan
                                                        layanan.

  GET               `/layanan/{id}`   Owner             Mengambil detail
                                                        layanan.

  PUT/PATCH         `/layanan/{id}`   Owner             Memperbarui nama,
                                                        deskripsi, atau
                                                        status layanan.

  DELETE            `/layanan/{id}`   Owner             Menonaktifkan
                                                        layanan, bukan
                                                        menghapus
                                                        permanen.
  -----------------------------------------------------------------------

#### Harga layanan

  -----------------------------------------------------------------------------
  Method            Endpoint                Akses             Fungsi
  ----------------- ----------------------- ----------------- -----------------
  GET               `/harga-layanan`        Owner             Mengambil daftar
                                                              harga layanan
                                                              berdasarkan
                                                              layanan dan
                                                              kategori
                                                              kendaraan.

  POST              `/harga-layanan`        Owner             Menambahkan harga
                                                              dasar beserta
                                                              batas bawah dan
                                                              batas atas.

  GET               `/harga-layanan/{id}`   Owner             Mengambil detail
                                                              harga layanan.

  PUT/PATCH         `/harga-layanan/{id}`   Owner             Memperbarui harga
                                                              dan batas
                                                              penyesuaiannya.

  DELETE            `/harga-layanan/{id}`   Owner             Menonaktifkan
                                                              data harga.
  -----------------------------------------------------------------------------

### D. Pesanan dan kendaraan

  ----------------------------------------------------------------------------------------
  Method            Endpoint                           Akses             Fungsi
  ----------------- ---------------------------------- ----------------- -----------------
  GET               `/pesanan`                         Owner dan Kasir   Mengambil daftar
                                                                         pesanan.

  POST              `/pesanan`                         Owner dan Kasir   Membuat pesanan
                                                                         beserta
                                                                         kendaraan, detail
                                                                         layanan, dan
                                                                         record pembayaran
                                                                         awal.

  GET               `/pesanan/{pesanan}`               Owner dan Kasir   Melihat detail
                                                                         pesanan,
                                                                         kendaraan,
                                                                         layanan, dan
                                                                         pembayaran.

  PUT               `/pesanan/{pesanan}`               Owner dan Kasir   Memperbarui
                                                                         bagian pesanan
                                                                         yang didukung
                                                                         controller saat
                                                                         ini; implementasi
                                                                         awal menyediakan
                                                                         perubahan status
                                                                         pesanan dan
                                                                         memerlukan
                                                                         alasan.

  POST              `/pesanan/{pesanan}/batal`         Owner dan Kasir   Membatalkan
                                                                         pesanan dengan
                                                                         alasan wajib.
                                                                         Pesanan tetap
                                                                         tersimpan dalam
                                                                         riwayat.

  PUT               `/kendaraan-pesanan/{id}/status`   Owner dan Kasir   Memperbarui
                                                                         status proses
                                                                         kendaraan,
                                                                         misalnya
                                                                         `menunggu`,
                                                                         `proses`, atau
                                                                         `selesai`.
  ----------------------------------------------------------------------------------------

**Header idempotensi saat membuat pesanan:**

``` http
Idempotency-Key: nilai-unik-per-permintaan
```

Header ini digunakan untuk membantu mencegah pesanan ganda ketika
aplikasi mengirim ulang request yang sama. Gunakan nilai unik untuk
setiap transaksi baru.

**Contoh bentuk data pembuatan pesanan (ilustrasi):**

``` json
{
  "kendaraan": [
    {
      "id_kategori_kendaraan": 1,
      "layanan": [
        {
          "id_harga": 1,
          "harga_akhir": 15000
        }
      ]
    }
  ]
}
```

Sesuaikan nama dan struktur field dengan validasi aktual di
`PesananController`.

### E. Pembayaran

  ----------------------------------------------------------------------------------
  Method            Endpoint                     Akses             Fungsi
  ----------------- ---------------------------- ----------------- -----------------
  GET               `/pesanan/{id}/pembayaran`   Owner dan Kasir   Melihat informasi
                                                                   pembayaran suatu
                                                                   pesanan.

  POST              `/pesanan/{id}/pembayaran`   Owner dan Kasir   Mencatat
                                                                   pembayaran
                                                                   pesanan, termasuk
                                                                   nominal, metode,
                                                                   status, dan waktu
                                                                   penerimaan.
  ----------------------------------------------------------------------------------

Metode pembayaran yang disediakan implementasi awal: `tunai`, `qris`,
atau `transfer`. Endpoint ini hanya mencatat pembayaran; bukan memproses
transaksi ke bank atau penyedia QRIS.

**Contoh request pembayaran:**

``` json
{
  "jumlah_dibayar": 30000,
  "metode_pembayaran": "tunai"
}
```

Pesanan yang dibatalkan atau sudah dibayar tidak dapat dibayar kembali
melalui alur ini.

### F. Riwayat perubahan (audit)

  -----------------------------------------------------------------------------
  Method            Endpoint               Akses             Fungsi
  ----------------- ---------------------- ----------------- ------------------
  GET               `/riwayat-perubahan`   Owner             Melihat daftar
                                                             riwayat perubahan,
                                                             termasuk pengguna
                                                             pelaku, entitas,
                                                             waktu, nilai
                                                             sebelum/sesudah,
                                                             dan alasan jika
                                                             tersedia.

  -----------------------------------------------------------------------------

Riwayat audit digunakan untuk membantu penelusuran perubahan data
penting. Jangan menyimpan password atau token autentikasi ke dalam
catatan audit.

### G. Pengeluaran dan kategori pengeluaran

#### Kategori pengeluaran

  ------------------------------------------------------------------------------------
  Method            Endpoint                       Akses             Fungsi
  ----------------- ------------------------------ ----------------- -----------------
  GET               `/kategori-pengeluaran`        Owner             Mengambil daftar
                                                                     kategori
                                                                     pengeluaran.

  POST              `/kategori-pengeluaran`        Owner             Menambahkan
                                                                     kategori
                                                                     pengeluaran.

  GET               `/kategori-pengeluaran/{id}`   Owner             Mengambil detail
                                                                     kategori
                                                                     pengeluaran.

  PUT/PATCH         `/kategori-pengeluaran/{id}`   Owner             Memperbarui
                                                                     kategori
                                                                     pengeluaran.

  DELETE            `/kategori-pengeluaran/{id}`   Owner             Menonaktifkan
                                                                     kategori
                                                                     pengeluaran.
  ------------------------------------------------------------------------------------

#### Pengeluaran

  ----------------------------------------------------------------------------------
  Method            Endpoint                    Akses             Fungsi
  ----------------- --------------------------- ----------------- ------------------
  GET               `/pengeluaran`              Owner             Mengambil daftar
                                                                  pengeluaran.

  POST              `/pengeluaran`              Owner             Mencatat
                                                                  pengeluaran baru.

  PUT/PATCH         `/pengeluaran/{id}`         Owner             Memperbarui
                                                                  catatan
                                                                  pengeluaran sesuai
                                                                  validasi
                                                                  controller.

  PATCH             `/pengeluaran/{id}/batal`   Owner             Membatalkan
                                                                  pengeluaran dengan
                                                                  alasan/perubahan
                                                                  yang dicatat
                                                                  sesuai
                                                                  implementasi.
  ----------------------------------------------------------------------------------

> Fitur penghapusan permanen pengeluaran dengan alasan dan audit perlu
> dipastikan sudah diimplementasikan sebelum endpoint tersebut
> didokumentasikan sebagai tersedia.

### H. Jam operasional

  -------------------------------------------------------------------------------
  Method            Endpoint                  Akses             Fungsi
  ----------------- ------------------------- ----------------- -----------------
  GET               `/jam-operasional`        Owner dan Kasir   Melihat jadwal
                                                                operasional.

  POST              `/jam-operasional`        Owner             Menambahkan
                                                                jadwal
                                                                operasional.

  PUT/PATCH         `/jam-operasional/{id}`   Owner             Memperbarui
                                                                jadwal
                                                                buka/tutup.

  DELETE            `/jam-operasional/{id}`   Owner             Menghapus jadwal
                                                                operasional.
  -------------------------------------------------------------------------------

Ketika pesanan dibuat, backend memeriksa jadwal hari tersebut dan
menyimpan penanda `di_luar_jam_operasional` apabila pesanan berada di
luar jam buka.

### I. Laporan

  -------------------------------------------------------------------------
  Method            Endpoint            Akses             Fungsi
  ----------------- ------------------- ----------------- -----------------
  GET               `/laporan`          Owner             Mengambil
                                                          ringkasan laporan
                                                          untuk rentang
                                                          tanggal yang
                                                          diminta.

  GET               `/laporan/harian`   Owner             Mengambil
                                                          ringkasan laporan
                                                          per hari.
  -------------------------------------------------------------------------

Perhitungan laporan yang diterapkan:

-   **Pemasukan:** total pembayaran berstatus `sudah_dibayar` dalam
    periode, tidak termasuk pesanan yang dibatalkan.
-   **Jumlah kendaraan:** jumlah kendaraan pada pesanan yang tidak
    dibatalkan.
-   **Pengeluaran:** total pengeluaran berstatus aktif dalam periode.
-   **Laba bersih:** pemasukan dikurangi pengeluaran.

Parameter tanggal dan format respons harus diperiksa pada
`LaporanController` untuk memastikan nama parameter yang digunakan.

### J. Pengelolaan akun kasir

  ------------------------------------------------------------------------------------
  Method            Endpoint                       Akses             Fungsi
  ----------------- ------------------------------ ----------------- -----------------
  GET               `/kasir`                       Owner             Mengambil daftar
                                                                     akun kasir.

  POST              `/kasir`                       Owner             Membuat akun
                                                                     kasir baru.

  PUT               `/kasir/{id}`                  Owner             Memperbarui
                                                                     informasi akun
                                                                     kasir.

  PATCH             `/kasir/{id}/status`           Owner             Mengaktifkan atau
                                                                     menonaktifkan
                                                                     akun kasir.

  PUT               `/kasir/{id}/reset-password`   Owner             Mengatur ulang
                                                                     password akun
                                                                     kasir.
  ------------------------------------------------------------------------------------

Password harus memiliki minimal delapan karakter dan disimpan dalam
bentuk hash. Endpoint pengelolaan akun tidak boleh mengembalikan hash
password kepada client.

## 7. Status Data yang Digunakan

Nilai status berikut merupakan nilai yang digunakan pada implementasi
awal. Periksa validasi controller jika enum atau status telah diubah.

  -----------------------------------------------------------------------
  Data                    Status / nilai          Arti
  ----------------------- ----------------------- -----------------------
  Peran pengguna          `owner`, `kasir`        Hak akses pengguna

  Status pesanan          `berjalan`, `selesai`,  Status keseluruhan
                          `dibatalkan`            pesanan

  Status proses kendaraan `menunggu`, `proses`,   Progres pengerjaan
                          `selesai`               setiap kendaraan

  Status pembayaran       `belum_dibayar`,        Kondisi pembayaran
                          `sudah_dibayar`         

  Metode pembayaran       `tunai`, `qris`,        Metode yang dicatat
                          `transfer`              

  Status pengeluaran      `aktif`, `dibatalkan`   Kondisi catatan
                                                  pengeluaran
  -----------------------------------------------------------------------

Status pembayaran dan status pengerjaan kendaraan adalah dua hal
berbeda. Kendaraan dapat selesai dikerjakan sementara pembayaran masih
belum dibayar, sesuai alur operasional yang diterapkan.

# Contoh Output API WashNote

**Penting:** Semua JSON di dokumen ini adalah contoh ilustratif, bukan
hasil pemanggilan backend secara langsung. Sesuaikan nama field, pesan,
dan pembungkus `data` dengan response aktual dari controller. Base URL
contoh: `http://127.0.0.1:8000/api`.

Untuk endpoint terproteksi, gunakan header:

``` http
Accept: application/json
Authorization: Bearer TOKEN_ANDA
Content-Type: application/json
```

## 1. Autentikasi

### POST `/login`

Request:

``` json
{"username":"owner","password":"WashNote123!"}
```

Response `200`:

``` json
{
  "message":"Login berhasil",
  "token":"1|contoh_token_sanctum",
  "user":{"id_pengguna":1,"nama_lengkap":"Pemilik WashNote","username":"owner","peran":"owner","status_aktif":true}
}
```

### POST `/logout`

Response `200`:

``` json
{"message":"Logout berhasil"}
```

### GET `/profile`

Response `200`:

``` json
{"id_pengguna":1,"nama_lengkap":"Pemilik WashNote","username":"owner","peran":"owner","status_aktif":true}
```

## 2. Endpoint uji role

### GET `/operasional/test`

Response contoh:

``` json
{"message":"Akses operasional berhasil","user":{"id_pengguna":2,"username":"kasir01","peran":"kasir"}}
```

### GET `/owner/test`

Response contoh:

``` json
{"message":"Akses owner berhasil"}
```

Jika token Kasir memanggil endpoint Owner, response `403` contoh:

``` json
{"message":"Anda tidak memiliki akses"}
```

## 3. Kategori kendaraan

### GET `/kategori-kendaraan`

``` json
{"data":[
  {"id_kategori_kendaraan":1,"jenis_kendaraan":"motor","nama_kategori":"Motor Kecil","status_aktif":true},
  {"id_kategori_kendaraan":2,"jenis_kendaraan":"mobil","nama_kategori":"Mobil Keluarga","status_aktif":true}
]}
```

### POST `/kategori-kendaraan`

Request:

``` json
{"jenis_kendaraan":"motor","nama_kategori":"Motor Besar","status_aktif":true}
```

Response:

``` json
{"message":"Kategori kendaraan berhasil ditambahkan","data":{"id_kategori_kendaraan":3,"jenis_kendaraan":"motor","nama_kategori":"Motor Besar","status_aktif":true}}
```

### GET `/kategori-kendaraan/{id}`

``` json
{"data":{"id_kategori_kendaraan":1,"jenis_kendaraan":"motor","nama_kategori":"Motor Kecil","status_aktif":true}}
```

### PUT/PATCH `/kategori-kendaraan/{id}`

Request:

``` json
{"jenis_kendaraan":"motor","nama_kategori":"Motor Matic","status_aktif":true}
```

Response:

``` json
{"message":"Kategori kendaraan berhasil diperbarui","data":{"id_kategori_kendaraan":1,"jenis_kendaraan":"motor","nama_kategori":"Motor Matic","status_aktif":true}}
```

### DELETE `/kategori-kendaraan/{id}`

``` json
{"message":"Kategori kendaraan berhasil dinonaktifkan"}
```

## 4. Layanan

### GET `/layanan`

``` json
{"data":[
  {"id_layanan":1,"nama_layanan":"Cuci Reguler","deskripsi":"Pencucian reguler","status_aktif":true},
  {"id_layanan":2,"nama_layanan":"Cuci Premium","deskripsi":"Pencucian premium","status_aktif":true}
]}
```

### POST `/layanan`

Request:

``` json
{"nama_layanan":"Cuci Premium","deskripsi":"Pencucian kendaraan dengan layanan tambahan","status_aktif":true}
```

Response:

``` json
{"message":"Layanan berhasil ditambahkan","data":{"id_layanan":2,"nama_layanan":"Cuci Premium","deskripsi":"Pencucian kendaraan dengan layanan tambahan","status_aktif":true}}
```

### GET `/layanan/{id}`

``` json
{"data":{"id_layanan":1,"nama_layanan":"Cuci Reguler","deskripsi":"Pencucian reguler","status_aktif":true}}
```

### PUT/PATCH `/layanan/{id}`

Request:

``` json
{"nama_layanan":"Cuci Reguler Plus","deskripsi":"Reguler dengan tambahan poles","status_aktif":true}
```

Response:

``` json
{"message":"Layanan berhasil diperbarui","data":{"id_layanan":1,"nama_layanan":"Cuci Reguler Plus","deskripsi":"Reguler dengan tambahan poles","status_aktif":true}}
```

### DELETE `/layanan/{id}`

``` json
{"message":"Layanan berhasil dinonaktifkan"}
```

## 5. Harga layanan

### GET `/harga-layanan`

``` json
{"data":[{"id_harga":1,"id_layanan":1,"id_kategori_kendaraan":1,"harga_dasar":"15000.00","batas_bawah":"12000.00","batas_atas":"20000.00","status_aktif":true}]}
```

### POST `/harga-layanan`

Request:

``` json
{"id_layanan":1,"id_kategori_kendaraan":1,"harga_dasar":15000,"batas_bawah":12000,"batas_atas":20000,"status_aktif":true}
```

Response:

``` json
{"message":"Harga layanan berhasil ditambahkan","data":{"id_harga":1,"id_layanan":1,"id_kategori_kendaraan":1,"harga_dasar":"15000.00","batas_bawah":"12000.00","batas_atas":"20000.00","status_aktif":true}}
```

### GET `/harga-layanan/{id}`

``` json
{"data":{"id_harga":1,"id_layanan":1,"id_kategori_kendaraan":1,"harga_dasar":"15000.00","batas_bawah":"12000.00","batas_atas":"20000.00","status_aktif":true}}
```

### PUT/PATCH `/harga-layanan/{id}`

Request:

``` json
{"harga_dasar":16000,"batas_bawah":13000,"batas_atas":21000,"status_aktif":true}
```

Response:

``` json
{"message":"Harga layanan berhasil diperbarui","data":{"id_harga":1,"harga_dasar":"16000.00","batas_bawah":"13000.00","batas_atas":"21000.00","status_aktif":true}}
```

### DELETE `/harga-layanan/{id}`

``` json
{"message":"Harga layanan berhasil dinonaktifkan"}
```

## 6. Pesanan dan kendaraan

### GET `/pesanan`

``` json
{"data":[{"id_pesanan":10,"id_pengguna":2,"waktu_pesanan":"2026-11-21T09:00:00+07:00","status_pesanan":"berjalan","alasan_pembatalan":null,"di_luar_jam_operasional":false}]}
```

### POST `/pesanan`

Header idempotensi:

``` http
Idempotency-Key: order-20261121-001
```

Request ilustratif:

``` json
{"kendaraan":[{"id_kategori_kendaraan":1,"layanan":[{"id_harga":1,"harga_akhir":15000}]}]}
```

Response ilustratif:

``` json
{
  "message":"Pesanan berhasil dibuat",
  "data":{
    "id_pesanan":10,"id_pengguna":2,"waktu_pesanan":"2026-11-21T09:00:00+07:00",
    "status_pesanan":"berjalan","di_luar_jam_operasional":false,
    "kendaraan":[{
      "id_kendaraan_pesanan":20,"id_kategori_kendaraan":1,
      "nama_kategori_snapshot":"Motor Kecil","status_proses":"menunggu",
      "detail_layanan":[{"id_detail_layanan":30,"id_harga":1,"harga_dasar_snapshot":"15000.00","harga_akhir":"15000.00"}]
    }],
    "pembayaran":{"id_pembayaran":10,"jumlah_dibayar":null,"metode_pembayaran":null,"status_pembayaran":"belum_dibayar","waktu_penerimaan":null},
    "total":15000
  }
}
```

### GET `/pesanan/{pesanan}`

``` json
{"data":{"id_pesanan":10,"status_pesanan":"berjalan","kendaraan":[{"id_kendaraan_pesanan":20,"nama_kategori_snapshot":"Motor Kecil","status_proses":"menunggu","detail_layanan":[{"id_detail_layanan":30,"harga_dasar_snapshot":"15000.00","harga_akhir":"15000.00"}]}],"pembayaran":{"status_pembayaran":"belum_dibayar"}}}
```

### PUT `/pesanan/{pesanan}`

Request:

``` json
{"alasan":"Seluruh kendaraan telah selesai","status_pesanan":"selesai"}
```

Response:

``` json
{"message":"Pesanan berhasil diperbarui","data":{"id_pesanan":10,"status_pesanan":"selesai"}}
```

Implementasi awal endpoint ini hanya memperbarui field yang ditangani
oleh `PesananController`, bukan seluruh detail kendaraan/layanan.

### POST `/pesanan/{pesanan}/batal`

Request:

``` json
{"alasan_pembatalan":"Pelanggan membatalkan pesanan"}
```

Response:

``` json
{"message":"Pesanan berhasil dibatalkan","data":{"id_pesanan":10,"status_pesanan":"dibatalkan","alasan_pembatalan":"Pelanggan membatalkan pesanan"}}
```

### PUT `/kendaraan-pesanan/{id}/status`

Request:

``` json
{"status_proses":"proses"}
```

Response:

``` json
{"message":"Status kendaraan berhasil diperbarui","data":{"id_kendaraan_pesanan":20,"status_proses":"proses"}}
```

## 7. Pembayaran

### GET `/pesanan/{id}/pembayaran`

``` json
{"data":{"id_pembayaran":10,"id_pesanan":10,"jumlah_dibayar":null,"metode_pembayaran":null,"status_pembayaran":"belum_dibayar","waktu_penerimaan":null}}
```

### POST `/pesanan/{id}/pembayaran`

Request:

``` json
{"jumlah_dibayar":15000,"metode_pembayaran":"tunai"}
```

Response:

``` json
{"message":"Pembayaran berhasil dicatat","data":{"id_pembayaran":10,"id_pesanan":10,"jumlah_dibayar":"15000.00","metode_pembayaran":"tunai","status_pembayaran":"sudah_dibayar","waktu_penerimaan":"2026-11-21T09:30:00+07:00"}}
```

## 8. Riwayat perubahan

### GET `/riwayat-perubahan`

``` json
{
  "data":[{
    "id_riwayat":1,"id_pengguna":2,"entitas":"Pesanan","record_id":10,
    "waktu_perubahan":"2026-11-21T09:20:00+07:00",
    "nilai_sebelum":{"status_pesanan":"berjalan"},
    "nilai_sesudah":{"status_pesanan":"dibatalkan"},
    "alasan":"Pelanggan membatalkan pesanan"
  }],
  "current_page":1,"per_page":15,"total":1
}
```

## 9. Kategori pengeluaran

### GET `/kategori-pengeluaran`

``` json
{"data":[{"id_kategori_pengeluaran":1,"nama_kategori":"Bahan pembersih","status_aktif":true},{"id_kategori_pengeluaran":2,"nama_kategori":"Listrik dan air","status_aktif":true}]}
```

### POST `/kategori-pengeluaran`

Request:

``` json
{"nama_kategori":"Perawatan alat","status_aktif":true}
```

Response:

``` json
{"message":"Kategori pengeluaran berhasil ditambahkan","data":{"id_kategori_pengeluaran":3,"nama_kategori":"Perawatan alat","status_aktif":true}}
```

### GET `/kategori-pengeluaran/{id}`

``` json
{"data":{"id_kategori_pengeluaran":1,"nama_kategori":"Bahan pembersih","status_aktif":true}}
```

### PUT/PATCH `/kategori-pengeluaran/{id}`

Request:

``` json
{"nama_kategori":"Bahan kimia pembersih","status_aktif":true}
```

Response:

``` json
{"message":"Kategori pengeluaran berhasil diperbarui","data":{"id_kategori_pengeluaran":1,"nama_kategori":"Bahan kimia pembersih","status_aktif":true}}
```

### DELETE `/kategori-pengeluaran/{id}`

``` json
{"message":"Kategori pengeluaran berhasil dinonaktifkan"}
```

## 10. Pengeluaran

### GET `/pengeluaran`

``` json
{"data":[{"id_pengeluaran":1,"id_pengguna":1,"id_kategori_pengeluaran":1,"tanggal_pengeluaran":"2026-11-21","deskripsi":"Pembelian sabun kendaraan","nominal":"100000.00","status_pengeluaran":"aktif"}]}
```

### POST `/pengeluaran`

Request ilustratif:

``` json
{"id_kategori_pengeluaran":1,"tanggal_pengeluaran":"2026-11-21","deskripsi":"Pembelian sabun kendaraan","nominal":100000}
```

Response:

``` json
{"message":"Pengeluaran berhasil ditambahkan","data":{"id_pengeluaran":1,"id_pengguna":1,"id_kategori_pengeluaran":1,"tanggal_pengeluaran":"2026-11-21","deskripsi":"Pembelian sabun kendaraan","nominal":"100000.00","status_pengeluaran":"aktif"}}
```

### PUT/PATCH `/pengeluaran/{id}`

Request ilustratif:

``` json
{"id_kategori_pengeluaran":1,"tanggal_pengeluaran":"2026-11-21","deskripsi":"Pembelian sabun dan sampo","nominal":125000,"alasan":"Koreksi sesuai nota"}
```

Response:

``` json
{"message":"Pengeluaran berhasil diperbarui","data":{"id_pengeluaran":1,"deskripsi":"Pembelian sabun dan sampo","nominal":"125000.00","status_pengeluaran":"aktif"}}
```

### PATCH `/pengeluaran/{id}/batal`

Request ilustratif:

``` json
{"alasan":"Salah input"}
```

Response:

``` json
{"message":"Pengeluaran berhasil dibatalkan","data":{"id_pengeluaran":1,"status_pengeluaran":"dibatalkan"}}
```

## 11. Jam operasional

### GET `/jam-operasional`

``` json
{"data":[{"id_jam_operasional":1,"hari":"Senin","status_buka":true,"jam_buka":"08:00:00","jam_tutup":"20:00:00","id_pengguna":1},{"id_jam_operasional":2,"hari":"Minggu","status_buka":false,"jam_buka":null,"jam_tutup":null,"id_pengguna":1}]}
```

### POST `/jam-operasional`

Request:

``` json
{"hari":"Senin","status_buka":true,"jam_buka":"08:00","jam_tutup":"20:00"}
```

Response:

``` json
{"message":"Jam operasional berhasil ditambahkan","data":{"id_jam_operasional":1,"hari":"Senin","status_buka":true,"jam_buka":"08:00:00","jam_tutup":"20:00:00","id_pengguna":1}}
```

### PUT/PATCH `/jam-operasional/{id}`

Request:

``` json
{"hari":"Senin","status_buka":true,"jam_buka":"09:00","jam_tutup":"21:00"}
```

Response:

``` json
{"message":"Jam operasional berhasil diperbarui","data":{"id_jam_operasional":1,"hari":"Senin","status_buka":true,"jam_buka":"09:00:00","jam_tutup":"21:00:00"}}
```

### DELETE `/jam-operasional/{id}`

``` json
{"message":"Jam operasional berhasil dihapus"}
```

## 12. Laporan

### GET `/laporan`

Contoh query (nama parameter harus dicocokkan dengan controller):

``` http
GET /api/laporan?dari=2026-11-01&sampai=2026-11-21
```

Response:

``` json
{"pemasukan":2500000,"jumlah_kendaraan":85,"pengeluaran":750000,"laba_bersih":1750000}
```

### GET `/laporan/harian`

``` json
{"data":[{"tanggal":"2026-11-20","pemasukan":350000,"jumlah_kendaraan":12,"pengeluaran":50000,"laba_bersih":300000},{"tanggal":"2026-11-21","pemasukan":450000,"jumlah_kendaraan":15,"pengeluaran":75000,"laba_bersih":375000}]}
```

## 13. Pengelolaan akun kasir

### GET `/kasir`

``` json
{"data":[{"id_pengguna":2,"nama_lengkap":"Kasir Satu","username":"kasir01","peran":"kasir","status_aktif":true}]}
```

### POST `/kasir`

Request:

``` json
{"nama_lengkap":"Kasir Dua","username":"kasir02","password":"KasirAman123!"}
```

Response:

``` json
{"message":"Akun kasir berhasil dibuat","data":{"id_pengguna":3,"nama_lengkap":"Kasir Dua","username":"kasir02","peran":"kasir","status_aktif":true}}
```

### PUT `/kasir/{id}`

Request:

``` json
{"nama_lengkap":"Kasir Dua Update","username":"kasir02"}
```

Response:

``` json
{"message":"Data kasir berhasil diperbarui","data":{"id_pengguna":3,"nama_lengkap":"Kasir Dua Update","username":"kasir02","peran":"kasir","status_aktif":true}}
```

### PATCH `/kasir/{id}/status`

Request:

``` json
{"status_aktif":false,"alasan":"Akun tidak lagi digunakan"}
```

Response:

``` json
{"message":"Status akun kasir berhasil diperbarui","data":{"id_pengguna":3,"status_aktif":false}}
```

### PUT `/kasir/{id}/reset-password`

Request:

``` json
{"password_baru":"PasswordBaru123!","password_baru_confirmation":"PasswordBaru123!"}
```

Response:

``` json
{"message":"Password kasir berhasil diatur ulang"}
```

## 14. Contoh response error

### 401 --- belum login / token tidak valid

``` json
{"message":"Unauthenticated."}
```

### 403 --- tidak memiliki hak akses

``` json
{"message":"Anda tidak memiliki akses"}
```

### 404 --- data tidak ditemukan

``` json
{"message":"Data tidak ditemukan"}
```

### 422 --- validasi gagal

``` json
{
  "message":"The username field is required.",
  "errors":{"username":["The username field is required."]}
}
```

### 429 --- terlalu banyak request

``` json
{"message":"Too Many Attempts."}
```

## 15. Cara memeriksa response sebenarnya

Jalankan:

``` bash
php artisan route:list --path=api
php artisan route:list --path=api -v
```

Kemudian jalankan server (`php artisan serve`), panggil endpoint melalui
Postman, dan cocokkan JSON aktual dengan contoh. Source code controller
adalah acuan utama. Contoh request untuk pesanan, pengeluaran, laporan,
dan beberapa pesan sukses di atas perlu disesuaikan dengan aturan
validasi dan return statement pada controller masing-masing.


## 8. Pengujian API

Pengujian dapat dilakukan menggunakan Postman, Insomnia, atau REST
Client.

Urutan pengujian yang disarankan:

1.  Login menggunakan akun Owner.
2.  Pastikan token dapat digunakan untuk endpoint yang dilindungi.
3.  Buat kategori kendaraan, layanan, harga layanan, dan jam
    operasional.
4.  Buat akun Kasir melalui endpoint Owner.
5.  Login menggunakan akun Kasir.
6.  Buat pesanan dengan header `Idempotency-Key`.
7.  Periksa detail pesanan dan data kendaraan/layanan.
8.  Ubah status proses kendaraan.
9.  Catat pembayaran pada pesanan yang belum dibayar.
10. Login kembali sebagai Owner, lalu catat pengeluaran.
11. Periksa laporan dan riwayat perubahan.
12. Uji pembatasan peran: endpoint Owner harus menolak token Kasir.

### Kode status HTTP umum

  HTTP   Makna
  ------ -----------------------------------------------
  200    Request berhasil
  201    Data berhasil dibuat
  400    Request tidak dapat diproses
  401    Belum login atau token tidak valid
  403    Tidak memiliki hak akses
  404    Data atau endpoint tidak ditemukan
  422    Validasi input gagal
  429    Terlalu banyak request dalam periode tertentu
  500    Terjadi kesalahan pada server

Untuk melihat daftar route aktual:

``` bash
php artisan route:list --path=api
```

Untuk melihat route beserta middleware:

``` bash
php artisan route:list --path=api -v
```

## 9. Keamanan dan Catatan Pengembangan

-   Selalu gunakan HTTPS saat backend di-deploy ke server publik.
-   Simpan token Sanctum secara aman di Keychain/Keystore pada aplikasi
    mobile.
-   Jangan menyimpan password dalam bentuk teks biasa.
-   Batasi endpoint berdasarkan middleware autentikasi dan role.
-   Validasi seluruh data di backend, meskipun aplikasi mobile juga
    melakukan validasi.
-   Jangan mengirim data rahasia ke log atau respons API.
-   Gunakan transaksi database untuk operasi yang mengubah beberapa
    tabel sekaligus.
-   Uji pengiriman ulang request dan kondisi request bersamaan,
    khususnya pada pesanan dan pembayaran.
-   Pastikan penonaktifan akun kasir juga mencabut token aktifnya.
-   Lakukan backup database secara berkala.
-   Dokumentasi ini tidak menyatakan bahwa ekspor laporan PDF/XLSX,
    penghapusan permanen pengeluaran, atau seluruh fitur lanjutan telah
    tersedia jika belum ada implementasi dan pengujian pada source code.

## 10. Pengembangan Berikutnya

Pengembangan yang dapat dilanjutkan:

1.  Melengkapi pengujian otomatis untuk autentikasi, role, pesanan,
    pembayaran, dan laporan.
2.  Menambahkan ekspor laporan ke PDF dan Excel.
3.  Menyelesaikan penghapusan permanen pengeluaran dengan audit.
4.  Menyempurnakan validasi edit pesanan dan detail layanan.
5.  Menambahkan dokumentasi OpenAPI/Swagger.
6.  Menghubungkan endpoint dengan aplikasi React Native.

**WashNote Backend** --- REST API untuk mendukung operasional usaha
