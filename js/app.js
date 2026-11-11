/* RT-KU · app.js — Tahap 1: login, sesi, dashboard, data rumah & anggota, akun, ganti sandi */

const PERAN = {
  administrator: 'Administrator', ketua_rt: 'Ketua RT', sekretaris: 'Sekretaris',
  bendahara_umum: 'Bendahara Kas Umum', bendahara_pembangunan: 'Bendahara Kas Pembangunan',
  bendahara_jimpitan: 'Bendahara Kas Jimpitan', bendahara_sosial: 'Bendahara Kas Sosial', warga: 'Warga'
};
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tglIndo = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const stat = (label, nilai, ket) => `<div class="kartu stat"><span class="muted">${label}</span><strong>${esc(nilai)}</strong><small class="muted">${ket}</small></div>`;
let AKUN = null;
let RUMAH_AKTIF = null;

// ============================================
// KOMUNIKASI BACKEND
// ============================================

function ambilToken() { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ''; }
function simpanToken(t, ingat) { hapusToken(); (ingat ? localStorage : sessionStorage).setItem(TOKEN_KEY, t); }
function hapusToken() { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); kosongkanCache(); PREFETCH_OK = false; }

let SIBUK = 0;
function sibuk(d) {
  SIBUK = Math.max(0, SIBUK + d);
  const bar = document.getElementById('bar');
  if (bar) bar.hidden = SIBUK === 0;
}

async function api(aksi, data = {}) {
  sibuk(1);
  try {
    const r = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: aksi, data, token: ambilToken() })
    });
    return await r.json();
  } catch (e) {
    return { success: false, message: 'Tidak dapat terhubung ke server. Periksa koneksi internet.' };
  } finally {
    sibuk(-1);
  }
}

// Data hasil baca disimpan agar pindah halaman terasa instan:
//  - umur < 20 dtk : dipakai langsung
//  - umur < 10 mnt : ditampilkan langsung, lalu disegarkan di belakang layar (tampilan diperbarui bila datanya berubah)
// Setiap aksi tulis mengosongkan seluruh simpanan. Klik menu yang sedang aktif = muat ulang data.
const BACA = new Set(['dashboard', 'daftarRumah', 'daftarAnggota', 'daftarAkun', 'daftarPengurus', 'daftarLog',
  'ringkasanKasUmum', 'daftarTagihan', 'daftarPembayaran', 'ringkasanKas', 'daftarSerahTerima', 'daftarPenyaluran',
  'daftarSurat', 'daftarPengumuman', 'daftarAgenda', 'daftarGaleri', 'daftarNotulen', 'daftarPengaduan',
  'ambilJadwalPengingat', 'riwayatPengingat', 'ringkasanKeuangan']);
const CACHE = new Map();
const SEGAR_MS = 20000;
const BASI_MS = 600000;
let EPOCH = 0;          // naik setiap simpanan dikosongkan: hasil yang datang terlambat dibuang
let NAV_ID = 0;
let DAFTAR_BASI = [];
let FORM_KOTOR = false; // pengguna sedang mengisi sesuatu: jangan timpa tampilan
let PREFETCH_OK = false;

function kosongkanCache() { CACHE.clear(); EPOCH++; }

// Sesi kedaluwarsa otomatis kembali ke login
async function panggil(aksi, data = {}) {
  const baca = BACA.has(aksi);
  const kunci = aksi + '|' + JSON.stringify(data);
  if (baca) {
    const c = CACHE.get(kunci);
    if (c) {
      const umur = Date.now() - c.t;
      if (umur < SEGAR_MS) return c.r;
      if (umur < BASI_MS) { DAFTAR_BASI.push({ aksi, data, kunci }); return c.r; }
    }
  } else {
    kosongkanCache();
  }
  const nav = NAV_ID, epoch = EPOCH;
  const r = await api(aksi, data);
  if (!baca) kosongkanCache();
  if (baca && r.success && epoch === EPOCH) CACHE.set(kunci, { t: Date.now(), r, json: JSON.stringify(r) });
  if (!r.success && r.sesi) {
    hapusToken(); AKUN = null;
    toast(r.message, false);
    go('login');
  } else if (baca && nav !== NAV_ID) {
    return { success: false, batal: true }; // pengguna sudah pindah halaman: jangan timpa tampilan
  } else if (!r.success) {
    toast(r.message, false);
  }
  return r;
}

function sedangMengisi() {
  const el = document.activeElement;
  return FORM_KOTOR || !!(el && $('#view').contains(el) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
}

// Menyegarkan data yang tadi ditampilkan dari simpanan lama; menggambar ulang halaman hanya bila ada yang berubah.
async function segarkanBasi(nav, p, daftar) {
  const epoch = EPOCH;
  const unik = [...new Map(daftar.map(x => [x.kunci, x])).values()];
  const hasil = await Promise.all(unik.map(x => api(x.aksi, x.data)));
  if (epoch !== EPOCH) return;
  let berubah = false;
  hasil.forEach((r, i) => {
    if (!r.success) return;
    const json = JSON.stringify(r), lama = CACHE.get(unik[i].kunci);
    if (!lama || lama.json !== json) berubah = true;
    CACHE.set(unik[i].kunci, { t: Date.now(), r, json });
  });
  if (berubah && nav === NAV_ID && !sedangMengisi()) {
    try { await HALAMAN[p](); } catch (e) { console.error(e); }
  }
}

// Setelah halaman pertama tampil, data halaman-halaman lain diambil sekaligus dalam satu permintaan.
function daftarPrefetch() {
  const p = AKUN.peran, L = [];
  const t = (action, data = {}) => L.push({ action, data });
  t('daftarRumah');
  if (p === 'warga' && AKUN.rumah_id) t('daftarAnggota', { rumah_id: AKUN.rumah_id });
  if (p !== 'administrator') t('ringkasanKeuangan', { periode: periodeSekarang() });
  t('daftarPengumuman', { kelola: ['sekretaris', 'ketua_rt'].includes(p) });
  t('daftarAgenda'); t('daftarGaleri');
  ['umum', 'pembangunan', 'jimpitan', 'sosial'].forEach(k => {
    if (!bolehBacaKas(k)) return;
    if (k === 'umum') { t('ringkasanKasUmum'); t('daftarTagihan', { periode: periodeSekarang() }); t('daftarPembayaran'); }
    else {
      t('ringkasanKas', { kas: k }); t('daftarSerahTerima');
      if (k === 'sosial' && (p === 'bendahara_sosial' || p === 'ketua_rt')) t('daftarPenyaluran');
    }
  });
  if (['warga', 'ketua_rt', 'sekretaris'].includes(p)) { t('daftarSurat'); t('daftarPengaduan'); }
  if (PENGURUS_FE.includes(p)) t('daftarNotulen');
  if (p === 'administrator') { t('daftarAkun'); t('daftarPengurus'); t('daftarLog'); }
  return L;
}

async function prefetchSemua() {
  if (!AKUN) return;
  const L = daftarPrefetch().filter(x => {
    const c = CACHE.get(x.action + '|' + JSON.stringify(x.data));
    return !c || Date.now() - c.t > SEGAR_MS;
  });
  if (!L.length) return;
  const epoch = EPOCH, token = ambilToken();
  const r = await api('batch', { calls: L });
  if (!r.success || epoch !== EPOCH || token !== ambilToken()) return;
  r.hasil.forEach((h, i) => {
    if (h && h.success) CACHE.set(L[i].action + '|' + JSON.stringify(L[i].data), { t: Date.now(), r: h, json: JSON.stringify(h) });
  });
}

// ============================================
// UI DASAR
// ============================================

function toast(pesan, ok = true) {
  const t = $('#toast');
  t.textContent = pesan;
  t.className = `toast tampil ${ok ? 'ok' : 'err'}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

function shell(on) {
  $('#sidebar').hidden = !on;
  $('#topbar').hidden = !on;
  if (!on) tutupMenu();
}

// Menu samping di HP: dibuka lewat tombol burger, ditutup lewat latar gelap, tombol Esc, atau saat memilih menu
function toggleMenu() {
  const buka = $('#sidebar').classList.toggle('buka');
  const ov = $('#overlay'); if (ov) ov.hidden = !buka;
  document.body.classList.toggle('menu-buka', buka);
  $('#btn-menu').setAttribute('aria-expanded', String(buka));
}

function tutupMenu() {
  $('#sidebar').classList.remove('buka');
  const ov = $('#overlay'); if (ov) ov.hidden = true;
  document.body.classList.remove('menu-buka');
  const b = $('#btn-menu'); if (b) b.setAttribute('aria-expanded', 'false');
}

const IKON = {
  dashboard: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  rumah: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4.2 1.8 4.2 4.5"/>',
  inputAnggota: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M19 8v6M16 11h6"/>',
  kas: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  surat: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  pengaduan: '<path d="M4 5h16v11H9l-5 4z"/>',
  pengingat: '<path d="M6 16v-5a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/>',
  pengumuman: '<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M18 9c1.2.8 1.2 5.2 0 6"/>',
  agenda: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  galeri: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  notulen: '<path d="M6 3h11a2 2 0 012 2v16H8a2 2 0 01-2-2z"/><path d="M6 17h13M10 8h6"/>',
  akun: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  pengurus: '<circle cx="12" cy="8" r="4"/><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
  log: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sandi: '<rect x="5" y="11" width="14" height="9.5" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>'
};
const svgIkon = (k) => `<svg class="ikon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[k.startsWith('kas') ? 'kas' : k] || IKON.dashboard}</svg>`;
const inisial = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

// Daftar menu per peran: [kode halaman, nama, kelompok]
function daftarMenu() {
  const p = AKUN.peran;
  const m = [['dashboard', 'Beranda', 'Utama']];
  m.push(['rumah', p === 'warga' ? 'Data Keluarga Saya' : 'Data Rumah & Anggota', 'Data Warga']);
  if (['administrator', 'sekretaris'].includes(p)) m.push(['inputAnggota', 'Input Anggota Keluarga', 'Data Warga']);
  ['umum', 'pembangunan', 'jimpitan', 'sosial'].forEach(k => {
    if (bolehBacaKas(k)) m.push([KAS_HALAMAN[k], NAMA_KAS_FE[k], 'Keuangan']);
  });
  if (['warga', 'ketua_rt', 'sekretaris'].includes(p)) {
    m.push(['surat', p === 'warga' ? 'Pengajuan Surat' : p === 'ketua_rt' ? 'Review Surat' : 'Status Surat', 'Layanan']);
    m.push(['pengaduan', p === 'warga' ? 'Pengaduan Saya' : 'Pengaduan Warga', 'Layanan']);
  }
  if (FITUR.pengingatWA && ['bendahara_umum', 'ketua_rt', 'administrator'].includes(p)) m.push(['pengingat', 'Pengingat WhatsApp', 'Layanan']);
  m.push(['pengumuman', 'Pengumuman', 'Informasi'], ['agenda', 'Agenda', 'Informasi'], ['galeri', 'Galeri', 'Informasi']);
  if (PENGURUS_FE.includes(p)) m.push(['notulen', 'Notulen Rapat', 'Informasi']);
  if (p === 'administrator') m.push(['akun', 'Akun & Hak Akses', 'Administrasi'], ['pengurus', 'Pengurus & Periode', 'Administrasi'], ['log', 'Log Aktivitas', 'Administrasi']);
  m.push(['sandi', 'Ganti Kata Sandi', 'Akun']);
  return m;
}

function renderMenu(aktif) {
  const m = daftarMenu();
  let grup = '', html = '';
  m.forEach(([k, l, g]) => {
    if (g !== grup) { grup = g; html += `<div class="grup-menu">${g}</div>`; }
    html += `<a href="#" data-go="${k}" class="${k === aktif ? 'aktif' : ''}">${svgIkon(k)}<span>${l}</span></a>`;
  });
  $('#menu').innerHTML = html;
  const nama = AKUN.nama || '';
  $('#kartu-user').innerHTML = `<span class="avatar">${esc(inisial(nama))}</span><span class="user-teks"><strong>${esc(nama)}</strong><small>${esc(PERAN[AKUN.peran])}</small></span>`;
  $('#profil-top').innerHTML = `<span class="avatar kecil">${esc(inisial(nama))}</span><span class="profil-teks"><strong>${esc(nama)}</strong><small>${esc(PERAN[AKUN.peran])}</small></span>`;
  const cur = m.find(x => x[0] === aktif);
  $('#judul-halaman').textContent = cur ? cur[1] : 'RT-KU';
}

// ============================================
// NAVIGASI
// ============================================

const HALAMAN = {
  login: viewLogin, pemulihan: viewPemulihan, dashboard: viewDashboard, rumah: viewRumah,
  akun: viewAkun, pengurus: viewPengurus, log: viewLog, sandi: viewSandi, surat: viewSurat,
  pengumuman: viewPengumuman, agenda: viewAgenda, galeri: viewGaleri, notulen: viewNotulen, pengaduan: viewPengaduan,
  pengingat: viewPengingat, inputAnggota: () => viewInputAnggota(),
  kasUmum: () => viewKasUmum(), kasPembangunan: () => viewKas('pembangunan'),
  kasJimpitan: () => viewKas('jimpitan'), kasSosial: () => viewKas('sosial')
};
const PERAN_KAS_FE = { umum: 'bendahara_umum', pembangunan: 'bendahara_pembangunan', jimpitan: 'bendahara_jimpitan', sosial: 'bendahara_sosial' };
const NAMA_KAS_FE = { umum: 'Kas Umum', pembangunan: 'Kas Pembangunan', jimpitan: 'Kas Jimpitan', sosial: 'Kas Sosial' };
const KAS_HALAMAN = { umum: 'kasUmum', pembangunan: 'kasPembangunan', jimpitan: 'kasJimpitan', sosial: 'kasSosial' };
const KAS_DARI_HALAMAN = { kasUmum: 'umum', kasPembangunan: 'pembangunan', kasJimpitan: 'jimpitan', kasSosial: 'sosial' };

// Ketua RT membaca semua kas. Sekretaris membaca kecuali Kas Sosial (memuat data penerima bantuan).
function bolehBacaKas(kas) {
  const a = AKUN?.peran;
  if (a === PERAN_KAS_FE[kas] || a === 'ketua_rt') return true;
  return a === 'sekretaris' && kas !== 'sosial';
}
const HALAMAN_ADMIN = ['akun', 'pengurus', 'log'];

let HALAMAN_AKTIF = null;
const HALAMAN_FORM = ['login', 'pemulihan', 'sandi'];

async function go(p) {
  if (!AKUN && !['login', 'pemulihan', 'pengumuman', 'agenda', 'galeri'].includes(p)) p = 'login';
  if (p === 'notulen' && !PENGURUS_FE.includes(AKUN?.peran)) p = 'dashboard';
  if (p === 'pengingat' && (!FITUR.pengingatWA || !['bendahara_umum', 'ketua_rt', 'administrator'].includes(AKUN?.peran))) p = 'dashboard';
  if (p === 'pengaduan' && !['warga', 'sekretaris', 'ketua_rt'].includes(AKUN?.peran)) p = 'dashboard';
  if (p === 'inputAnggota' && !['administrator', 'sekretaris'].includes(AKUN?.peran)) p = 'dashboard';
  if (AKUN && AKUN.wajib_ganti_sandi && p !== 'sandi') p = 'sandi';
  if (HALAMAN_ADMIN.includes(p) && AKUN?.peran !== 'administrator') p = 'dashboard';
  if (KAS_DARI_HALAMAN[p] && !bolehBacaKas(KAS_DARI_HALAMAN[p])) p = 'dashboard';
  if (p === 'surat' && !['warga', 'ketua_rt', 'sekretaris'].includes(AKUN?.peran)) p = 'dashboard';

  if (p === HALAMAN_AKTIF && !HALAMAN_FORM.includes(p)) kosongkanCache(); // klik menu yang sama = muat ulang data
  HALAMAN_AKTIF = p;
  const nav = ++NAV_ID;
  DAFTAR_BASI = []; FORM_KOTOR = false;

  const konten = !!AKUN && !['login', 'pemulihan'].includes(p);
  shell(konten);
  document.body.classList.toggle('bg-login', ['login', 'pemulihan'].includes(p));
  if (konten) renderMenu(p);
  tutupMenu();
  const v = $('#view');
  if (!HALAMAN_FORM.includes(p)) v.innerHTML = '<div class="memuat"><span class="putar"></span> Memuat halaman…</div>';
  try { await HALAMAN[p](); }
  catch (e) { console.error(e); toast('Terjadi kesalahan pada tampilan.', false); }
  if (nav !== NAV_ID) return; // pengguna sudah pindah ke halaman lain
  if (v.querySelector(':scope > .memuat')) {
    v.innerHTML = `<div class="kartu"><p>Halaman gagal dimuat. Periksa koneksi internet lalu coba lagi.</p><button class="btn-utama" type="button" data-go="${p}">Coba lagi</button></div>`;
  }
  window.scrollTo(0, 0);
  if (DAFTAR_BASI.length) segarkanBasi(nav, p, DAFTAR_BASI.splice(0));
  if (p === 'dashboard' && AKUN && !PREFETCH_OK) { PREFETCH_OK = true; setTimeout(prefetchSemua, 300); }
}

// ============================================
// HALAMAN: LOGIN & PEMULIHAN
// ============================================

function viewLogin(mode = 'pengurus') {
  shell(false);
  $('#view').innerHTML = `
    <div class="kartu-login">
      <img src="assets/logo/Logo_RT02.png" alt="Logo RT02 RW29 Gading Elok 1" class="logo-login">
      <h1>Masuk ke RT-KU</h1>
      <p class="muted">Sistem Informasi & Administrasi Warga RT02/RW29</p>
      ${mode === 'pengurus' ? '<p class="muted kecil">Cukup masukkan username dan kata sandi. Anda otomatis masuk sesuai peran akun, sebagai warga maupun pengurus.</p>' : ''}
      <div class="tab-dua">
        <button type="button" data-tab="pengurus" class="${mode === 'pengurus' ? 'aktif' : ''}">Pengurus & Warga</button>
        <button type="button" data-tab="admin" class="${mode === 'admin' ? 'aktif' : ''}">Administrator</button>
      </div>
      <form id="form-login" data-mode="${mode}">
        <label>${mode === 'pengurus' ? 'Username atau nomor WhatsApp' : 'Username Administrator'}
          <input name="username" required autocomplete="username"></label>
        <label>Kata sandi
          <span class="input-sandi">
            <input name="sandi" type="password" required autocomplete="current-password">
            <button type="button" class="mata" data-mata aria-label="Tampilkan atau sembunyikan kata sandi">👁</button>
          </span></label>
        <label class="cek"><input type="checkbox" name="ingat" checked> Ingat perangkat ini</label>
        <p id="pesan-login" class="pesan err" hidden></p>
        <button class="btn-utama lebar" type="submit">Masuk</button>
      </form>
      <p class="tengah"><a href="#" data-go="pemulihan">Lupa kata sandi?</a></p>
      <p class="tengah muted"><a href="#" data-go="pengumuman">Pengumuman</a> · <a href="#" data-go="agenda">Agenda</a> · <a href="#" data-go="galeri">Galeri</a></p>
    </div>`;
}

async function kirimLogin(f) {
  const fd = new FormData(f);
  const mode = f.dataset.mode;
  const data = { username: fd.get('username'), sandi: fd.get('sandi') };
  const pesan = $('#pesan-login');
  const r = await api(mode === 'admin' ? 'loginAdmin' : 'login', data);
  if (!r.success) { pesan.textContent = r.message; pesan.hidden = false; return; }
  simpanToken(r.token, fd.get('ingat') === 'on');
  AKUN = { ...r.akun, wajib_ganti_sandi: r.wajibGantiSandi };
  go(AKUN.wajib_ganti_sandi ? 'sandi' : 'dashboard');
}

function viewPemulihan() {
  $('#view').innerHTML = `
    <div class="kartu-login">
      <img src="assets/logo/Logo_RT02.png" alt="Logo RT02 RW29" class="logo-login">
      <h1>Pemulihan Akun</h1>
      <p class="muted">Permintaan akan diverifikasi oleh Administrator. Tidak tersedia pemulihan lewat email atau SMS.</p>
      <form id="form-pemulihan">
        <label>Nama lengkap<input name="nama" required></label>
        <label>Blok dan nomor rumah<input name="rumah" required placeholder="contoh: K22 No. 05"></label>
        <label>Keterangan (opsional)<input name="keterangan" maxlength="300"></label>
        <button class="btn-utama lebar" type="submit">Kirim Permintaan</button>
      </form>
      <p class="tengah"><a href="#" data-go="login">Kembali ke login</a></p>
    </div>`;
}

async function kirimPemulihan(f) {
  const r = await api('pemulihan', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) go('login');
}

// ============================================
// HALAMAN: DASHBOARD
// ============================================

const PRIORITAS_TILE = ['surat', 'inputAnggota', 'rumah', 'kasUmum', 'pengumuman', 'pengaduan', 'agenda', 'kasJimpitan', 'kasPembangunan', 'kasSosial', 'galeri', 'notulen', 'akun', 'pengurus', 'log'];

function tileMenu() {
  const m = daftarMenu();
  const pilih = PRIORITAS_TILE.map(k => m.find(x => x[0] === k)).filter(Boolean).slice(0, 8);
  return `<div class="tile-grid">${pilih.map(([k, l]) => `<a href="#" class="tile" data-go="${k}">${svgIkon(k)}<span>${l}</span></a>`).join('')}</div>`;
}

// ---------- grafik (SVG, tanpa pustaka tambahan) ----------
function skalaAtas(n) {
  if (n <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(n))), f = n / p;
  return ([1, 1.5, 2, 3, 4, 5, 6, 8, 10].find(x => f <= x)) * p;
}
function singkat(n) {
  const a = Math.abs(n), t = n < 0 ? '−' : '';
  if (a >= 1e6) return t + (a / 1e6).toFixed(a % 1e6 ? 1 : 0).replace('.', ',') + ' jt';
  if (a >= 1e3) return t + Math.round(a / 1e3) + ' rb';
  return t + a;
}
const blnPendek = (ym) => BULAN_FE[Number(ym.slice(5)) - 1];

function grafikBatang(seri) {
  if (!seri.some(s => s.pemasukan || s.pengeluaran)) return '<p class="muted">Belum ada transaksi pada 6 bulan terakhir.</p>';
  const W = 340, H = 190, L = 44, R = 6, T = 10, B = 26;
  const maks = skalaAtas(Math.max(...seri.flatMap(s => [s.pemasukan, s.pengeluaran])));
  const lg = (W - L - R) / seri.length, lb = Math.min(14, lg * 0.32);
  const y = (v) => T + (H - T - B) * (1 - v / maks);
  let g = '';
  [0, 0.5, 1].forEach(f => {
    const v = maks * f, yy = y(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" class="sb">${singkat(v)}</text>`;
  });
  seri.forEach((s, i) => {
    const x0 = L + i * lg + lg / 2;
    const bar = (v, dx, kelas) => v > 0 ? `<rect x="${(x0 + dx).toFixed(1)}" y="${y(v).toFixed(1)}" width="${lb}" height="${Math.max(1, y(0) - y(v)).toFixed(1)}" rx="3" class="${kelas}"/>` : '';
    g += bar(s.pemasukan, -lb - 1, 'bar-masuk') + bar(s.pengeluaran, 1, 'bar-keluar');
    g += `<text x="${x0.toFixed(1)}" y="${H - 8}" text-anchor="middle" class="sb">${blnPendek(s.bulan)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="grafik" role="img" aria-label="Grafik batang pemasukan dan pengeluaran enam bulan terakhir">${g}</svg>
    <div class="legenda"><span><i class="kotak masuk"></i>Pemasukan</span><span><i class="kotak keluar"></i>Pengeluaran</span></div>`;
}

function grafikGaris(seri) {
  const W = 340, H = 190, L = 48, R = 14, T = 16, B = 26;
  const nilai = seri.map(s => s.saldoAkhir);
  const terkecil = Math.min(0, ...nilai);
  const lo = terkecil < 0 ? -skalaAtas(-terkecil) : 0;
  const hi = skalaAtas(Math.max(1, ...nilai));
  const x = (i) => L + (W - L - R) * (seri.length === 1 ? 0.5 : i / (seri.length - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let g = '';
  [lo, (lo + hi) / 2, hi].forEach(v => {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="sb">${singkat(Math.round(v))}</text>`;
  });
  g += `<polyline points="${seri.map((s, i) => `${x(i).toFixed(1)},${y(s.saldoAkhir).toFixed(1)}`).join(' ')}" class="garis"/>`;
  seri.forEach((s, i) => {
    g += `<circle cx="${x(i).toFixed(1)}" cy="${y(s.saldoAkhir).toFixed(1)}" r="3.6" class="titik"/><text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="sb">${blnPendek(s.bulan)}</text>`;
  });
  const akhir = seri[seri.length - 1];
  g += `<text x="${x(seri.length - 1).toFixed(1)}" y="${(y(akhir.saldoAkhir) - 9).toFixed(1)}" text-anchor="end" class="sb tebal">${singkat(akhir.saldoAkhir)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="grafik" role="img" aria-label="Grafik garis saldo akhir enam bulan terakhir">${g}</svg>`;
}

function bagianKeuangan(k) {
  if (!k || !k.success) return '';
  const t = k.total;
  const baris = k.kas.map(x => `<tr><td>${esc(x.nama)}</td><td class="angka">${rp(x.saldoAwal)}</td><td class="angka">${rp(x.pemasukan)}</td><td class="angka">${rp(x.pengeluaran)}</td><td class="angka"><b>${rp(x.saldoAkhir)}</b></td></tr>`).join('');
  return `
    <section class="kartu">
      <div class="baris-judul"><h2>Laporan Keuangan RT02</h2>
        <form id="form-periode-dash" class="inline"><input type="month" name="periode" value="${esc(k.periode)}" required><button class="btn-kecil" type="submit">Tampilkan</button></form>
      </div>
      <div class="grid-kartu grid-empat">
        ${stat('Saldo awal', rp(t.saldoAwal), 'Awal bulan')}
        ${stat('Total pemasukan', rp(t.pemasukan), 'Selama bulan ini')}
        ${stat('Total pengeluaran', rp(t.pengeluaran), 'Selama bulan ini')}
        ${stat('Saldo akhir', rp(t.saldoAkhir), 'Akhir bulan')}
      </div>
      <div class="grid-grafik">
        <div><h3>Pemasukan & pengeluaran (6 bulan)</h3>${grafikBatang(k.seri)}</div>
        <div><h3>Saldo akhir per bulan</h3>${grafikGaris(k.seri)}</div>
      </div>
      <h3>Rincian per kas</h3>
      <div class="tabel-wrap"><table>
        <thead><tr><th>Kas</th><th>Saldo awal</th><th>Pemasukan</th><th>Pengeluaran</th><th>Saldo akhir</th></tr></thead>
        <tbody>${baris}
          <tr class="baris-total"><td>Total</td><td class="angka">${rp(t.saldoAwal)}</td><td class="angka">${rp(t.pemasukan)}</td><td class="angka">${rp(t.pengeluaran)}</td><td class="angka">${rp(t.saldoAkhir)}</td></tr>
        </tbody>
      </table></div>
      <p class="muted kecil">Angka total tidak menghitung serah terima antar kas karena hanya perpindahan dana. Rincian transaksi hanya dapat dilihat pengurus.</p>
    </section>`;
}

async function viewDashboard(periode) {
  const adm = AKUN.peran === 'administrator';
  const [r, k] = await Promise.all([
    panggil('dashboard'),
    adm ? Promise.resolve(null) : panggil('ringkasanKeuangan', { periode: periode || periodeSekarang() })
  ]);
  if (!r.success) return;
  let kartu;
  if (r.warga) {
    const rm = r.warga.rumah;
    kartu = stat('Rumah Anda', rm ? `Blok ${rm.blok} No. ${rm.nomor}` : 'Belum terhubung', 'Rumah tangga')
          + stat('Anggota keluarga', r.warga.jumlahAnggota, 'Anggota aktif');
  } else {
    const s = r.ringkasan;
    kartu = stat('Jumlah rumah', s.jumlahRumah, 'Rumah terdaftar')
          + stat('Anggota keluarga', s.jumlahAnggota, 'Anggota aktif');
    if (s.akunAktif !== undefined) kartu += stat('Akun aktif', s.akunAktif, 'Pengguna aktif') + stat('Akun terkunci', s.akunTerkunci, 'Akibat login gagal');
  }
  $('#view').innerHTML = `
    <section class="hero-dash"><h1>Selamat datang, ${esc(AKUN.nama)}</h1><p class="hero-sub">RT02/RW29 Perumahan Gading Elok 1</p><span class="chip">${esc(PERAN[AKUN.peran])}</span></section>
    <h2 class="judul-bagian">Menu cepat</h2>${tileMenu()}
    <h2 class="judul-bagian">Ringkasan</h2>
    <div class="grid-kartu">${kartu}</div>
    ${bagianKeuangan(k)}`;
}

// ============================================
// HALAMAN: DATA RUMAH & ANGGOTA
// ============================================

async function viewRumah() {
  const r = await panggil('daftarRumah');
  if (!r.success) return;
  const baris = r.rumah.map(x => `
    <tr>
      <td class="mono">${esc(x.blok)}</td><td class="mono">${esc(x.nomor)}</td>
      <td>${esc(x.kepala_keluarga) || '<span class="muted">Belum diisi</span>'}</td>
      <td>${x.jumlahAnggota}</td>
      <td><button class="btn-kecil" type="button" data-anggota="${esc(x.id)}">Lihat anggota</button></td>
    </tr>`).join('');
  $('#view').innerHTML = `
    <h1>${AKUN.peran === 'warga' ? 'Data Keluarga Saya' : 'Data Rumah & Anggota'}</h1>
    <section class="kartu">${AKUN.peran === 'warga' ? '' : '<input id="cari-rumah" type="search" placeholder="Cari blok, nomor, atau nama kepala keluarga…" style="margin-bottom:12px">'}<div class="tabel-wrap"><table id="tabel-rumah">
      <thead><tr><th>Blok</th><th>No.</th><th>Kepala keluarga</th><th>Anggota</th><th></th></tr></thead>
      <tbody>${baris || '<tr><td colspan="5" class="muted">Belum ada data rumah.</td></tr>'}</tbody>
    </table></div></section>
    ${AKUN.peran === 'administrator' ? `
    <section class="kartu"><h2>Tambah rumah</h2>
      <form id="form-rumah" class="grid-form">
        <label>Blok<input name="blok" required placeholder="contoh: K25"></label>
        <label>Nomor rumah<input name="nomor" required inputmode="numeric" placeholder="contoh: 16"></label>
        <button class="btn-utama" type="submit">Simpan Rumah</button>
      </form>
    </section>` : ''}
    <section class="kartu" id="panel-anggota">${['administrator', 'sekretaris'].includes(AKUN.peran) ? '<p class="muted">Klik “Lihat anggota” pada sebuah rumah untuk melihat anggotanya, atau pakai menu <b>Input Anggota Keluarga</b> untuk menambah anggota.</p>' : ''}</section>`;
  if (AKUN.peran === 'warga' && r.rumah[0]) tampilAnggota(r.rumah[0].id);
}

async function tampilAnggota(rumahId) {
  const r = await panggil('daftarAnggota', { rumah_id: rumahId });
  if (!r.success) return;
  const isi = r.anggota.map(a => `
    <tr><td>${esc(a.nama)}</td><td>${tglIndo(a.tgl_lahir)}</td><td>${a.usia} th</td>
    <td>${esc(a.hubungan)}</td><td class="mono">${esc(a.wa)}</td></tr>`).join('')
    || '<tr><td colspan="5" class="muted">Belum ada anggota terdaftar.</td></tr>';
  const panel = $('#panel-anggota');
  panel.innerHTML = `<h2>Daftar anggota keluarga</h2><div class="tabel-wrap"><table>
    <thead><tr><th>Nama</th><th>Tgl lahir</th><th>Usia</th><th>Hubungan</th><th>WhatsApp</th></tr></thead>
    <tbody>${isi}</tbody></table></div>`;
  RUMAH_AKTIF = rumahId;
  if (['administrator', 'sekretaris'].includes(AKUN.peran)) {
    panel.insertAdjacentHTML('beforeend', `
      <form id="form-anggota" class="grid-form" style="margin-top:16px">
        <h2>Tambah anggota</h2>
        <label>Nama lengkap<input name="nama" required></label>
        <label>Hubungan keluarga<select name="hubungan" required>
          <option value="">Pilih</option><option>Kepala Keluarga</option><option>Istri</option>
          <option>Suami</option><option>Anak</option><option>Orang Tua</option><option>Anggota Lain</option>
        </select></label>
        <label>Tanggal lahir<input name="tgl_lahir" type="date" required></label>
        <label>No. WhatsApp (opsional)<input name="wa" inputmode="tel" placeholder="0812xxxxxxx"></label>
        <button class="btn-utama" type="submit">Simpan Anggota</button>
      </form>`);
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// HALAMAN: AKUN & HAK AKSES (ADMINISTRATOR)
// ============================================

async function viewAkun() {
  const [a, rm] = await Promise.all([panggil('daftarAkun'), panggil('daftarRumah')]);
  if (!a.success || !rm.success) return;
  const opsiPeran = Object.entries(PERAN).filter(([k]) => k !== 'administrator')
    .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const opsiRumah = rm.rumah.map(x => `<option value="${esc(x.id)}">Blok ${esc(x.blok)} No. ${esc(x.nomor)}</option>`).join('');
  const baris = a.akun.map(x => `
    <tr><td class="mono">${esc(x.username)}</td><td>${esc(x.nama)}</td><td>${PERAN[x.peran] || esc(x.peran)}</td>
    <td class="mono">${esc(x.nomor_wa)}</td>
    <td><span class="badge ${x.status === 'aktif' ? 'hijau' : 'merah'}">${esc(x.status)}</span></td>
    <td>${x.id === AKUN.id ? '<span class="muted">Akun Anda</span>' : `
      ${x.status === 'nonaktif'
        ? `<button class="btn-kecil" type="button" data-aksi="aktifkan" data-id="${esc(x.id)}" data-nama="${esc(x.nama)}">Aktifkan</button>`
        : `<button class="btn-kecil" type="button" data-aksi="nonaktifkan" data-id="${esc(x.id)}" data-nama="${esc(x.nama)}">Nonaktifkan</button>`}
      <button class="btn-kecil" type="button" data-aksi="reset" data-id="${esc(x.id)}" data-nama="${esc(x.nama)}">Reset sandi</button>`}
    </td></tr>`).join('');
  $('#view').innerHTML = `
    <h1>Akun & Hak Akses</h1>
    <section class="kartu"><h2>Daftar akun</h2><div class="tabel-wrap"><table>
      <thead><tr><th>Username</th><th>Nama</th><th>Peran</th><th>WhatsApp</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>${baris}</tbody></table></div><div id="panel-reset"></div></section>
    <section class="kartu"><h2>Tambah akun</h2>
      <form id="form-akun" class="grid-form">
        <label>Username<input name="username" required placeholder="contoh: budi.santoso"></label>
        <label>Nama lengkap<input name="nama" required></label>
        <label>Peran<select name="peran">${opsiPeran}</select></label>
        <label>Nomor WhatsApp<input name="nomor_wa" required placeholder="0812xxxxxxx"></label>
        <label>Rumah (wajib untuk warga)<select name="rumah_id"><option value="">— Tidak terkait rumah —</option>${opsiRumah}</select></label>
        <label>Kata sandi awal<input name="sandi" type="password" required autocomplete="new-password"></label>
        <p class="muted">Pengguna wajib mengganti kata sandi saat login pertama. Minimal 8 karakter, memuat huruf dan angka.</p>
        <button class="btn-utama" type="submit">Simpan Akun</button>
      </form>
    </section>`;
}

async function kirimRumah(f) {
  const r = await panggil('tambahRumah', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewRumah();
}

async function kirimAnggota(f) {
  const data = Object.fromEntries(new FormData(f));
  data.rumah_id = RUMAH_AKTIF;
  const r = await panggil('tambahAnggota', data);
  toast(r.message, r.success);
  if (r.success) { await viewRumah(); tampilAnggota(RUMAH_AKTIF); }
}

async function aksiAkun(aksi, id, nama) {
  if (aksi === 'reset') {
    $('#panel-reset').innerHTML = `
      <section class="kartu"><h2>Reset kata sandi: ${esc(nama)}</h2>
        <form id="form-reset" class="grid-form" data-id="${esc(id)}">
          <label>Kata sandi sementara<input name="sandi" type="password" required autocomplete="new-password"></label>
          <p class="muted">Pengguna wajib mengganti kata sandi saat login berikutnya. Semua sesi aktifnya diakhiri.</p>
          <button class="btn-utama" type="submit">Reset Kata Sandi</button>
        </form>
      </section>`;
    $('#panel-reset').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const r = await panggil('ubahStatusAkun', { akun_id: id, aksi });
  toast(r.message, r.success);
  if (r.success) viewAkun();
}

async function kirimReset(f) {
  const r = await panggil('ubahStatusAkun', { akun_id: f.dataset.id, aksi: 'reset', sandi: new FormData(f).get('sandi') });
  toast(r.message, r.success);
  if (r.success) viewAkun();
}

async function viewPengurus() {
  const [p, a] = await Promise.all([panggil('daftarPengurus'), panggil('daftarAkun')]);
  if (!p.success || !a.success) return;
  const calon = a.akun.filter(x => x.status === 'aktif' && x.peran !== 'warga' && x.peran !== 'administrator');
  const baris = p.pengurus.map(x => `
    <tr><td>${esc(x.nama)}</td><td class="mono">${esc(x.username)}</td><td>${PERAN[x.jabatan] || esc(x.jabatan)}</td>
    <td>${tglIndo(x.mulai)}</td><td>${x.aktif ? '<span class="badge hijau">Aktif</span>' : tglIndo(x.akhir)}</td></tr>`).join('');
  $('#view').innerHTML = `
    <h1>Pengurus & Periode</h1>
    <section class="kartu"><h2>Riwayat kepengurusan</h2><div class="tabel-wrap"><table>
      <thead><tr><th>Nama</th><th>Username</th><th>Jabatan</th><th>Mulai</th><th>Selesai</th></tr></thead>
      <tbody>${baris || '<tr><td colspan="5" class="muted">Belum ada pengurus ditetapkan.</td></tr>'}</tbody>
    </table></div></section>
    <section class="kartu"><h2>Tetapkan pengurus</h2>
      ${calon.length ? `
      <form id="form-pengurus" class="grid-form">
        <label>Akun pengurus<select name="akun_id" required>
          ${calon.map(x => `<option value="${esc(x.id)}">${esc(x.nama)} · ${PERAN[x.peran]}</option>`).join('')}
        </select></label>
        <label>Mulai menjabat<input name="mulai" type="date" required></label>
        <p class="muted">Pengurus lama pada jabatan yang sama otomatis berakhir dan tetap tersimpan di riwayat.</p>
        <button class="btn-utama" type="submit">Tetapkan Pengurus</button>
      </form>`
      : '<p class="muted">Belum ada akun pengurus aktif. Buat akun pengurus di menu Akun & Hak Akses.</p>'}
    </section>`;
}

async function kirimPengurus(f) {
  const r = await panggil('tetapkanPengurus', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewPengurus();
}

async function viewLog() {
  const r = await panggil('daftarLog');
  if (!r.success) return;
  const baris = r.log.map(x => `
    <tr><td class="mono">${esc(x.waktu)}</td><td class="mono">${esc(x.username) || '—'}</td>
    <td>${esc(x.aksi)}</td><td>${esc(x.modul)}</td><td>${esc(x.keterangan)}</td></tr>`).join('');
  $('#view').innerHTML = `
    <h1>Log Aktivitas</h1>
    <p class="muted">200 aktivitas terakhir, terbaru di atas.</p>
    <section class="kartu"><div class="tabel-wrap"><table>
      <thead><tr><th>Waktu (WIB)</th><th>Pengguna</th><th>Aksi</th><th>Modul</th><th>Keterangan</th></tr></thead>
      <tbody>${baris || '<tr><td colspan="5" class="muted">Belum ada aktivitas.</td></tr>'}</tbody>
    </table></div></section>`;
}

// ============================================
// HALAMAN: KAS UMUM
// ============================================

let PERIODE_KAS = null;
const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const badgeStatus = (s) => ({ lunas: 'hijau', terverifikasi: 'hijau', dikonfirmasi: 'hijau', sebagian: 'amber', menunggu: 'amber', belum: 'merah', ditolak: 'merah' }[s] || '');
const periodeSekarang = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

async function viewKasUmum(periode) {
  PERIODE_KAS = periode || periodeSekarang();
  const [ring, tag, byr, rm] = await Promise.all([
    panggil('ringkasanKasUmum'), panggil('daftarTagihan', { periode: PERIODE_KAS }),
    panggil('daftarPembayaran'), panggil('daftarRumah')
  ]);
  if (!ring.success || !tag.success || !byr.success || !rm.success) return;

  const s = ring.ringkasan;
  const tulis = AKUN.peran === 'bendahara_umum';
  const opsiRumah = rm.rumah.map(x => `<option value="${esc(x.id)}">Blok ${esc(x.blok)} No. ${esc(x.nomor)}</option>`).join('');
  const barisTagihan = tag.tagihan.map(x => `
    <tr><td class="mono">${esc(x.blok)}</td><td class="mono">${esc(x.nomor)}</td>
    <td class="angka">${rp(x.nominal)}</td><td class="angka">${rp(x.terbayar)}</td><td class="angka">${rp(x.sisa)}</td>
    <td><span class="badge ${badgeStatus(x.status)}">${esc(x.status)}</span></td></tr>`).join('');
  const barisBayar = byr.pembayaran.map(x => `
    <tr><td>${tglIndo(x.tanggal)}</td><td>${esc(x.rumah)}</td><td>${esc(x.metode)}</td>
    <td class="angka">${rp(x.nominal)}</td>
    <td><span class="badge ${badgeStatus(x.status)}">${esc(x.status)}</span></td>
    <td>${tulis && x.status === 'menunggu' ? `
      <button class="btn-kecil" type="button" data-verif="setujui" data-id="${esc(x.id)}">Setujui</button>
      <button class="btn-kecil" type="button" data-verif="tolak" data-id="${esc(x.id)}">Tolak</button>` : ''}</td></tr>`).join('');
  const barisTrx = ring.transaksi.map(x => `
    <tr><td>${tglIndo(x.tanggal)}</td><td>${esc(x.jenis)}</td><td>${esc(x.uraian)}</td>
    <td class="angka">${x.jenis === 'pemasukan' ? '+' : '−'} ${rp(x.nominal)}</td></tr>`).join('');

  $('#view').innerHTML = `
    <h1>Kas Umum</h1>
    <p class="muted">Saldo, tagihan IPL, pembayaran, dan transaksi kas RT02.</p>
    <div class="grid-kartu">
      ${stat('Saldo Kas Umum', rp(s.saldo), 'Seluruh transaksi terverifikasi')}
      ${stat('Pemasukan ' + s.periode, rp(s.pemasukanPeriode), 'Bulan berjalan')}
      ${stat('Pengeluaran ' + s.periode, rp(s.pengeluaranPeriode), 'Bulan berjalan')}
      ${stat('Menunggu verifikasi', s.menunggu + ' pembayaran', rp(s.totalMenunggu))}
    </div>

    <section class="kartu">
      <div class="baris-judul">
        <h2>Tagihan IPL periode ${esc(PERIODE_KAS)}</h2>
        <form id="form-periode" class="inline"><input type="month" name="periode" value="${esc(PERIODE_KAS)}" required><button class="btn-kecil" type="submit">Tampilkan</button></form>
      </div>
      ${tag.sudahTerbit ? '' : '<p class="pesan info">Tagihan periode ini belum diterbitkan.</p>'}
      <div class="tabel-wrap"><table>
        <thead><tr><th>Blok</th><th>No.</th><th>Tagihan</th><th>Terbayar</th><th>Sisa</th><th>Status</th></tr></thead>
        <tbody>${barisTagihan}</tbody>
      </table></div>
      ${tulis && !tag.sudahTerbit ? `
      <form id="form-terbit" class="inline" style="margin-top:12px">
        <input type="hidden" name="periode" value="${esc(PERIODE_KAS)}">
        <button class="btn-utama" type="submit">Terbitkan tagihan periode ini</button>
      </form>` : ''}
    </section>

    ${tulis ? `
    <section class="kartu"><h2>Catat pembayaran</h2>
      <form id="form-bayar" class="grid-form">
        <label>Rumah<select name="rumah_id" required>${opsiRumah}</select></label>
        <label>Tanggal bayar<input name="tanggal" type="date" required></label>
        <label>Metode<select name="metode"><option value="tunai">Tunai</option><option value="transfer">Transfer</option></select></label>
        <label>Nominal (Rp)<input name="nominal" type="number" min="1" step="1" required inputmode="numeric"></label>
        <label>Catatan (opsional)<input name="catatan" maxlength="200"></label>
        <p class="muted">Pembayaran tercatat sebagai menunggu verifikasi dan belum mengurangi tunggakan.</p>
        <button class="btn-utama" type="submit">Catat Pembayaran</button>
      </form>
    </section>` : ''}

    <section class="kartu"><h2>Riwayat pembayaran</h2>
      <div class="tabel-wrap"><table>
        <thead><tr><th>Tanggal</th><th>Rumah</th><th>Metode</th><th>Nominal</th><th>Status</th><th>${tulis ? 'Aksi' : ''}</th></tr></thead>
        <tbody>${barisBayar || '<tr><td colspan="6" class="muted">Belum ada pembayaran.</td></tr>'}</tbody>
      </table></div>
    </section>

    ${tulis ? `
    <section class="kartu"><h2>Transaksi lain</h2>
      <form id="form-transaksi" class="grid-form">
        <label>Jenis<select name="jenis"><option value="pemasukan">Pemasukan</option><option value="pengeluaran">Pengeluaran</option></select></label>
        <label>Tanggal<input name="tanggal" type="date" required></label>
        <label>Uraian<input name="uraian" required maxlength="200"></label>
        <label>Nominal (Rp)<input name="nominal" type="number" min="1" step="1" required inputmode="numeric"></label>
        <button class="btn-utama" type="submit">Simpan Transaksi</button>
      </form>
    </section>` : ''}

    ${tulis ? `
    <section class="kartu"><h2>Serah terima dana ke kas lain</h2>
      <form id="form-serah" class="grid-form">
        <label>Tujuan<select name="ke"><option value="pembangunan">Kas Pembangunan</option><option value="sosial">Kas Sosial</option></select></label>
        <label>Tanggal<input name="tanggal" type="date" required></label>
        <label>Nominal (Rp)<input name="nominal" type="number" min="1" step="1" required inputmode="numeric"></label>
        <p class="muted">Saldo Kas Umum baru berkurang setelah bendahara tujuan mengonfirmasi.</p>
        <button class="btn-utama" type="submit">Ajukan Serah Terima</button>
      </form>
    </section>` : ''}

    <section class="kartu"><h2>Laporan & cetak</h2>
      <form id="form-laporan" class="grid-form">
        <label>Jenis periode<select name="jenis">
          <option value="bulanan">Bulanan</option><option value="rentang">Rentang tanggal</option>
        </select></label>
        <label>Periode bulan<input type="month" name="periode" value="${esc(PERIODE_KAS)}"></label>
        <label>Dari tanggal<input type="date" name="dari"></label>
        <label>Sampai tanggal<input type="date" name="sampai"></label>
        <div class="inline" style="grid-column:1/-1">
          <button class="btn-utama" type="button" data-laporan="pdf">Unduh PDF</button>
          <button class="btn-kecil" type="button" data-laporan="xlsx">Unduh Excel</button>
        </div>
      </form>
    </section>

    <section class="kartu"><h2>Transaksi terakhir</h2>
      <div class="tabel-wrap"><table>
        <thead><tr><th>Tanggal</th><th>Jenis</th><th>Uraian</th><th>Nominal</th></tr></thead>
        <tbody>${barisTrx || '<tr><td colspan="4" class="muted">Belum ada transaksi.</td></tr>'}</tbody>
      </table></div>
    </section>`;
}

async function kirimTerbit(f) {
  const r = await panggil('terbitkanTagihan', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewKasUmum(PERIODE_KAS);
}

async function kirimBayar(f) {
  const r = await panggil('catatPembayaran', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewKasUmum(PERIODE_KAS);
}

async function kirimTransaksi(f) {
  const r = await panggil('catatTransaksi', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewKasUmum(PERIODE_KAS);
}

async function verifikasi(aksi, id) {
  const r = await panggil('verifikasiPembayaran', { id, aksi });
  toast(r.message, r.success);
  if (r.success) viewKasUmum(PERIODE_KAS);
}

async function unduhLaporan(format, kas = 'umum') {
  const fd = Object.fromEntries(new FormData($('#form-laporan')));
  const r = await panggil('laporanKasUmum', { ...fd, format, kas });
  if (!r.success) return;
  const bin = atob(r.berkas);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
  const a = document.createElement('a');
  a.href = url; a.download = r.nama;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Laporan siap diunduh.');
}

// ============================================
// HALAMAN: KAS JIMPITAN, PEMBANGUNAN, SOSIAL
// ============================================

const KATEGORI_FE = { kepala_keluarga: 'Kepala keluarga', anak: 'Anak', orang_tua: 'Orang tua', anggota_lain: 'Anggota lain' };

async function viewKas(kas) {
  const tulis = AKUN.peran === PERAN_KAS_FE[kas];
  const sosialBisaLihat = kas === 'sosial' && (tulis || AKUN.peran === 'ketua_rt');
  const [ring, srt, pen, rm] = await Promise.all([
    panggil('ringkasanKas', { kas }),
    panggil('daftarSerahTerima'),
    sosialBisaLihat ? panggil('daftarPenyaluran') : Promise.resolve({ success: true, penyaluran: [] }),
    tulis && kas === 'sosial' ? panggil('daftarRumah') : Promise.resolve({ success: true, rumah: [] })
  ]);
  if (!ring.success || !srt.success || !pen.success || !rm.success) return;

  const s = ring.ringkasan;
  const nama = NAMA_KAS_FE[kas];
  const serah = srt.serah.filter(x => x.ke === kas || x.dari === NAMA_KAS_FE.umum);
  const menungguMasuk = serah.filter(x => x.ke === kas && x.status === 'menunggu');
  const totalMenunggu = menungguMasuk.reduce((t, x) => t + x.nominal, 0);
  const adaSerah = kas === 'pembangunan' || kas === 'sosial';

  const barisSerah = serah.map(x => `
    <tr><td>${tglIndo(x.tanggal)}</td><td>${esc(x.dari)} → ${esc(NAMA_KAS_FE[x.ke])}</td>
    <td class="angka">${rp(x.nominal)}</td><td><span class="badge ${badgeStatus(x.status)}">${esc(x.status)}</span></td>
    <td>${tulis && x.ke === kas && x.status === 'menunggu'
      ? `<button class="btn-kecil" type="button" data-konfirmasi="${esc(x.id)}" data-kas="${kas}">Konfirmasi terima</button>` : ''}</td></tr>`).join('');

  const opsiRumah = rm.rumah.map(x => `<option value="${esc(x.id)}">Blok ${esc(x.blok)} No. ${esc(x.nomor)}</option>`).join('');
  const barisPenyaluran = pen.penyaluran.map(x => `
    <tr><td>${tglIndo(x.tanggal)}</td><td>${esc(x.nama)}</td><td>${esc(x.rumah)}</td>
    <td>${KATEGORI_FE[x.kategori] || esc(x.kategori)}</td><td>${esc(x.jenis)}</td><td class="angka">${rp(x.nominal)}</td></tr>`).join('');
  const barisTrx = ring.transaksi.map(x => `
    <tr><td>${tglIndo(x.tanggal)}</td><td>${esc(x.jenis)}</td><td>${esc(x.uraian)}</td>
    <td class="angka">${x.jenis === 'pemasukan' ? '+' : '−'} ${rp(x.nominal)}</td></tr>`).join('');

  $('#view').innerHTML = `
    <h1>${nama}</h1>
    <p class="muted">Saldo, transaksi, dan laporan ${nama}.</p>
    <div class="grid-kartu">
      ${stat('Saldo ' + nama, rp(s.saldo), 'Seluruh transaksi tercatat')}
      ${stat('Pemasukan ' + s.periode, rp(s.pemasukanPeriode), 'Bulan berjalan')}
      ${stat('Pengeluaran ' + s.periode, rp(s.pengeluaranPeriode), 'Bulan berjalan')}
      ${adaSerah ? stat('Dana menunggu penyerahan', rp(totalMenunggu), 'Belum dikonfirmasi') : ''}
    </div>

    ${adaSerah ? `
    <section class="kartu"><h2>Serah terima dana dari Kas Umum</h2>
      <div class="tabel-wrap"><table>
        <thead><tr><th>Tanggal</th><th>Dari → Ke</th><th>Nominal</th><th>Status</th><th>${tulis ? 'Aksi' : ''}</th></tr></thead>
        <tbody>${barisSerah || '<tr><td colspan="5" class="muted">Belum ada serah terima.</td></tr>'}</tbody>
      </table></div>
    </section>` : ''}

    ${tulis ? `
    <section class="kartu"><h2>Catat transaksi</h2>
      <form id="form-kas-transaksi" class="grid-form" data-kas="${kas}">
        ${kas === 'sosial' ? '<input type="hidden" name="jenis" value="pemasukan">'
          : `<label>Jenis<select name="jenis"><option value="pemasukan">Pemasukan</option><option value="pengeluaran">Pengeluaran</option></select></label>`}
        <label>Tanggal<input name="tanggal" type="date" required></label>
        <label>Uraian<input name="uraian" required maxlength="200"></label>
        <label>Nominal (Rp)<input name="nominal" type="number" min="1" step="1" required inputmode="numeric"></label>
        <p class="muted">${kas === 'sosial' ? 'Pengeluaran bantuan dicatat melalui penyaluran di bawah.' : 'Pengeluaran tidak boleh melebihi saldo tersedia.'}</p>
        <button class="btn-utama" type="submit">Simpan Transaksi</button>
      </form>
    </section>` : ''}

    ${kas === 'sosial' && (tulis || AKUN.peran === 'ketua_rt') ? `
    ${tulis ? `
    <section class="kartu"><h2>Catat penyaluran bantuan</h2>
      <form id="form-penyaluran" class="grid-form">
        <label>Nama penerima<input name="nama" required></label>
        <label>Rumah (opsional)<select name="rumah_id"><option value="">— Tidak terkait rumah —</option>${opsiRumah}</select></label>
        <label>Kategori<select name="kategori">
          <option value="kepala_keluarga">Kepala keluarga</option><option value="anak">Anak</option>
          <option value="orang_tua">Orang tua</option><option value="anggota_lain">Anggota lain</option></select></label>
        <label>Jenis bantuan<input name="jenis_bantuan" required placeholder="contoh: sembako"></label>
        <label>Tanggal<input name="tanggal" type="date" required></label>
        <label>Nominal (Rp)<input name="nominal" type="number" min="1" step="1" required inputmode="numeric"></label>
        <label>Keterangan<input name="keterangan" maxlength="200"></label>
        <button class="btn-utama" type="submit">Catat Penyaluran</button>
      </form>
    </section>` : ''}
    <section class="kartu"><h2>Riwayat penyaluran</h2>
      <div class="tabel-wrap"><table>
        <thead><tr><th>Tanggal</th><th>Penerima</th><th>Rumah</th><th>Kategori</th><th>Jenis</th><th>Nominal</th></tr></thead>
        <tbody>${barisPenyaluran || '<tr><td colspan="6" class="muted">Belum ada penyaluran.</td></tr>'}</tbody>
      </table></div>
    </section>` : ''}

    <section class="kartu"><h2>Laporan & cetak</h2>
      <form id="form-laporan" class="grid-form">
        <label>Jenis periode<select name="jenis">
          <option value="bulanan">Bulanan</option><option value="rentang">Rentang tanggal</option>
        </select></label>
        <label>Periode bulan<input type="month" name="periode" value="${periodeSekarang()}"></label>
        <label>Dari tanggal<input type="date" name="dari"></label>
        <label>Sampai tanggal<input type="date" name="sampai"></label>
        <div class="inline" style="grid-column:1/-1">
          <button class="btn-utama" type="button" data-laporan="pdf" data-kas="${kas}">Unduh PDF</button>
          <button class="btn-kecil" type="button" data-laporan="xlsx" data-kas="${kas}">Unduh Excel</button>
        </div>
      </form>
    </section>

    <section class="kartu"><h2>Transaksi terakhir</h2>
      <div class="tabel-wrap"><table>
        <thead><tr><th>Tanggal</th><th>Jenis</th><th>Uraian</th><th>Nominal</th></tr></thead>
        <tbody>${barisTrx || '<tr><td colspan="4" class="muted">Belum ada transaksi.</td></tr>'}</tbody>
      </table></div>
    </section>`;
}

async function kirimKasTransaksi(f) {
  const kas = f.dataset.kas;
  const r = await panggil('catatTransaksiKas', { ...Object.fromEntries(new FormData(f)), kas });
  toast(r.message, r.success);
  if (r.success) viewKas(kas);
}

async function kirimPenyaluran(f) {
  const r = await panggil('catatPenyaluranSosial', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewKas('sosial');
}

async function kirimSerah(f) {
  const r = await panggil('ajukanSerahTerima', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewKasUmum(PERIODE_KAS);
}

async function konfirmasiSerah(id, kas) {
  const r = await panggil('konfirmasiSerahTerima', { id });
  toast(r.message, r.success);
  if (r.success) viewKas(kas);
}

// ============================================
// HALAMAN: SURAT
// ============================================

const JENIS_FE = { domisili: 'Surat Keterangan Domisili', usaha: 'Surat Keterangan Usaha', pengantar: 'Surat Pengantar', lainnya: 'Surat Lainnya' };
const BADGE_SURAT = { diajukan: 'amber', diperbaiki: 'merah', disetujui: 'hijau', diterbitkan: 'hijau', ditolak: 'merah' };
let SURAT_CACHE = [];

function tombolSurat(x) {
  if (x.status === 'diterbitkan') return `<button class="btn-kecil" type="button" data-surat="unduh" data-id="${esc(x.id)}">Unduh PDF</button>`;
  if (AKUN.peran === 'warga') {
    return x.status === 'diperbaiki' ? `<button class="btn-kecil" type="button" data-surat="perbaiki" data-id="${esc(x.id)}">Perbaiki</button>` : '';
  }
  return ['diajukan', 'disetujui'].includes(x.status)
    ? `<button class="btn-kecil" type="button" data-surat="periksa" data-id="${esc(x.id)}">Periksa</button>` : '';
}

async function viewSurat() {
  const r = await panggil('daftarSurat');
  if (!r.success) return;
  SURAT_CACHE = r.surat;
  const peran = AKUN.peran;
  const judul = peran === 'warga' ? 'Pengajuan Surat' : peran === 'ketua_rt' ? 'Review Pengajuan Surat' : 'Status Pengajuan Surat';
  const kolom = [['Tanggal', true], ['Pemohon', peran !== 'warga'], ['Jenis', true], ['Keperluan', peran !== 'sekretaris'], ['Status', true], ['Aksi', peran !== 'sekretaris']]
    .filter(([, ada]) => ada).map(([k]) => `<th>${k}</th>`).join('');

  const baris = r.surat.map(x => `
    <tr><td>${tglIndo(x.tanggal)}</td>
    ${peran !== 'warga' ? `<td>${esc(x.pemohon)}<br><span class="muted">${esc(x.rumah)}</span></td>` : ''}
    <td>${JENIS_FE[x.jenis] || esc(x.jenis)}</td>
    ${peran !== 'sekretaris' ? `<td>${esc(x.keperluan)}</td>` : ''}
    <td><span class="badge ${BADGE_SURAT[x.status] || ''}">${esc(x.status)}</span>
      ${x.nomor ? `<br><span class="mono">${esc(x.nomor)}</span>` : ''}
      ${x.catatan ? `<br><span class="muted">${esc(x.catatan)}</span>` : ''}</td>
    ${peran !== 'sekretaris' ? `<td>${tombolSurat(x)}</td>` : ''}</tr>`).join('');

  $('#view').innerHTML = `
    <h1>${judul}</h1>
    ${peran === 'warga' ? `
    <section class="kartu"><h2>Ajukan surat baru</h2>
      <form id="form-ajukan" class="grid-form">
        <label>Jenis surat<select name="jenis">${Object.entries(JENIS_FE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>Keperluan<input name="keperluan" required maxlength="200" placeholder="contoh: pembuatan KTP"></label>
        <label>Keterangan tambahan (opsional)<input name="keterangan" maxlength="500"></label>
        <p class="muted">Pengajuan diperiksa Ketua RT. Surat dicetak dan ditandatangani manual setelah diterbitkan.</p>
        <button class="btn-utama" type="submit">Kirim Pengajuan</button>
      </form>
    </section>` : ''}
    <section class="kartu">
      <div class="tabel-wrap"><table>
        <thead><tr>${kolom}</tr></thead>
        <tbody>${baris || `<tr><td colspan="6" class="muted">Belum ada pengajuan surat.</td></tr>`}</tbody>
      </table></div>
    </section>
    <div id="panel-surat"></div>`;
}

async function aksiSurat(aksi, id) {
  if (aksi === 'unduh') return unduhSurat(id);
  if (aksi === 'terbitkan') {
    const r = await panggil('terbitkanSurat', { id });
    toast(r.message, r.success);
    if (r.success) viewSurat();
    return;
  }
  const x = SURAT_CACHE.find(s => s.id === id);
  if (!x) return;
  const panel = $('#panel-surat');
  if (aksi === 'perbaiki') {
    panel.innerHTML = `<section class="kartu"><h2>Perbaiki pengajuan</h2>
      <p class="pesan info">Catatan Ketua RT: ${esc(x.catatan)}</p>
      <form id="form-perbaiki" class="grid-form" data-id="${esc(id)}">
        <label>Keperluan<input name="keperluan" required maxlength="200" value="${esc(x.keperluan)}"></label>
        <label>Keterangan tambahan<input name="keterangan" maxlength="500" value="${esc(x.keterangan)}"></label>
        <button class="btn-utama" type="submit">Kirim Perbaikan</button>
      </form></section>`;
  } else if (aksi === 'periksa') {
    panel.innerHTML = `<section class="kartu"><h2>Periksa: ${esc(JENIS_FE[x.jenis])}</h2>
      <p><b>${esc(x.pemohon)}</b> · ${esc(x.rumah)}</p>
      <p>Keperluan: ${esc(x.keperluan)}</p>
      ${x.keterangan ? `<p>Keterangan: ${esc(x.keterangan)}</p>` : ''}
      ${x.status === 'disetujui'
        ? `<p class="pesan info">Sudah disetujui. Terbitkan untuk membuat PDF dengan nomor surat.</p>
           <button class="btn-utama" type="button" data-surat="terbitkan" data-id="${esc(id)}">Terbitkan PDF</button>`
        : `<form id="form-tinjau" class="grid-form" data-id="${esc(id)}">
             <label>Keputusan<select name="aksi">
               <option value="setujui">Setujui</option><option value="perbaiki">Minta perbaikan</option><option value="tolak">Tolak</option>
             </select></label>
             <label>Catatan (wajib untuk perbaikan atau penolakan)<input name="catatan" maxlength="300"></label>
             <button class="btn-utama" type="submit">Simpan Keputusan</button>
           </form>`}
    </section>`;
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function kirimAjukan(f) {
  const r = await panggil('ajukanSurat', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewSurat();
}

async function kirimPerbaiki(f) {
  const r = await panggil('perbaikiSurat', { ...Object.fromEntries(new FormData(f)), id: f.dataset.id });
  toast(r.message, r.success);
  if (r.success) viewSurat();
}

async function kirimTinjau(f) {
  const r = await panggil('tinjauSurat', { ...Object.fromEntries(new FormData(f)), id: f.dataset.id });
  toast(r.message, r.success);
  if (r.success) viewSurat();
}

async function unduhSurat(id) {
  const r = await panggil('unduhSurat', { id });
  if (r.success) unduhBase64(r.berkas, r.nama, r.mime);
}

function unduhBase64(b64, nama, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ============================================
// HALAMAN: KONTEN (PUBLIK & PENGURUS)
// ============================================

const PENGURUS_FE = ['ketua_rt', 'sekretaris', 'bendahara_umum', 'bendahara_pembangunan', 'bendahara_jimpitan', 'bendahara_sosial'];
const PUBLIK = ['pengumuman', 'agenda', 'galeri'];
const BULAN_FE = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
let PENGUMUMAN_CACHE = [], AGENDA_CACHE = [], PENGADUAN_CACHE = [];

const MAKS_UNGGAH = 2 * 1024 * 1024;
const publikNav = (aktif) => {
  if (AKUN) return '';
  const link = (k, l) => `<a href="#" data-go="${k}" class="${aktif === k ? 'aktif' : ''}">${l}</a>`;
  return `<nav class="nav-publik"><strong>RT-KU</strong>${link('pengumuman', 'Pengumuman')}${link('agenda', 'Agenda')}${link('galeri', 'Galeri')}
    <a href="#" data-go="login" class="btn-kecil">Masuk</a></nav>`;
};
const setField = (f, nama, nilai) => { const el = f.elements.namedItem(nama); if (el) el.value = nilai ?? ''; };
const bacaBase64 = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1]);
  fr.onerror = rej;
  fr.readAsDataURL(file);
});

// ---------- Pengumuman ----------

async function viewPengumuman() {
  const kelola = !!AKUN && ['sekretaris', 'ketua_rt'].includes(AKUN.peran);
  const r = await panggil('daftarPengumuman', { kelola });
  if (!r.success) return;
  PENGUMUMAN_CACHE = r.pengumuman;
  const kartu = r.pengumuman.filter(p => !kelola || p.status === 'terbit').map(p => `
    <section class="kartu">
      <div class="baris-judul">
        <span><span class="badge">${esc(p.kategori)}</span>
          ${p.visibilitas === 'warga' ? ' <span class="badge amber">Khusus warga</span>' : ''}</span>
        <span class="muted">${tglIndo(p.tanggal)}</span>
      </div>
      <h2>${esc(p.judul)}</h2>
      ${p.terkunci
        ? '<p class="pesan info">Pengumuman ini khusus warga RT02. Silakan masuk untuk membaca.</p>'
        : `<p style="white-space:pre-line">${esc(p.isi)}</p>`}
    </section>`).join('');

  const kelolaHtml = !kelola ? '' : `
    <section class="kartu"><h2 id="judul-form-peng">Buat pengumuman</h2>
      <form id="form-pengumuman" class="grid-form">
        <input type="hidden" name="id">
        <label>Judul<input name="judul" required maxlength="150"></label>
        <label>Kategori<input name="kategori" maxlength="40" placeholder="Umum, Kerja Bakti, Keuangan"></label>
        <label>Visibilitas<select name="visibilitas"><option value="publik">Publik</option><option value="warga">Khusus warga</option></select></label>
        <label>Status<select name="status"><option value="terbit">Terbit</option><option value="draf">Draf</option></select></label>
        <label>Tanggal<input name="tanggal" type="date" required></label>
        <label style="grid-column:1/-1">Isi<textarea name="isi" required maxlength="3000"></textarea></label>
        <button class="btn-utama" type="submit">Simpan Pengumuman</button>
        <button class="btn-kecil" type="button" data-reset-form="form-pengumuman">Kosongkan</button>
      </form>
    </section>
    <section class="kartu"><h2>Semua pengumuman</h2><div class="tabel-wrap"><table>
      <thead><tr><th>Tanggal</th><th>Judul</th><th>Visibilitas</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>${r.pengumuman.map(p => `<tr><td>${tglIndo(p.tanggal)}</td><td>${esc(p.judul)}</td>
        <td>${p.visibilitas === 'warga' ? 'Khusus warga' : 'Publik'}</td>
        <td><span class="badge ${p.status === 'terbit' ? 'hijau' : ''}">${esc(p.status)}</span></td>
        <td><button class="btn-kecil" type="button" data-edit-peng="${esc(p.id)}">Ubah</button></td></tr>`).join('')}</tbody>
    </table></div></section>`;

  $('#view').innerHTML = `${publikNav('pengumuman')}<h1>Pengumuman</h1>${kelolaHtml}
    ${kartu || '<p class="muted">Belum ada pengumuman.</p>'}`;
}

function isiFormPengumuman(id) {
  const p = PENGUMUMAN_CACHE.find(x => x.id === id);
  if (!p) return;
  const f = $('#form-pengumuman');
  ['id', 'judul', 'kategori', 'visibilitas', 'status', 'tanggal', 'isi'].forEach(k => setField(f, k, p[k]));
  $('#judul-form-peng').textContent = 'Ubah pengumuman';
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function kirimPengumuman(f) {
  const data = Object.fromEntries(new FormData(f));
  if (!data.id) delete data.id;
  const r = await panggil('simpanPengumuman', data);
  toast(r.message, r.success);
  if (r.success) viewPengumuman();
}

// ---------- Agenda ----------

async function viewAgenda() {
  const kelola = !!AKUN && ['sekretaris', 'ketua_rt'].includes(AKUN.peran);
  const r = await panggil('daftarAgenda');
  if (!r.success) return;
  AGENDA_CACHE = r.agenda;
  const daftar = r.agenda.map(a => {
    const [, m, d] = a.tanggal.split('-');
    return `<section class="kartu baris-agenda">
      <div class="tanggal-box"><strong>${Number(d)}</strong><span>${BULAN_FE[Number(m) - 1]}</span></div>
      <div>
        <h2>${esc(a.judul)}</h2>
        <p class="muted">${tglIndo(a.tanggal)}${a.waktu ? ' · ' + esc(a.waktu) : ''}${a.tempat ? ' · ' + esc(a.tempat) : ''}</p>
        ${a.deskripsi ? `<p style="white-space:pre-line">${esc(a.deskripsi)}</p>` : ''}
        ${kelola ? `<button class="btn-kecil" type="button" data-batal-agenda="${esc(a.id)}">Batalkan agenda</button>` : ''}
      </div></section>`;
  }).join('');

  const form = !kelola ? '' : `
    <section class="kartu"><h2>Tambah agenda</h2>
      <form id="form-agenda" class="grid-form">
        <input type="hidden" name="status" value="aktif">
        <label>Nama kegiatan<input name="judul" required maxlength="150"></label>
        <label>Tanggal<input name="tanggal" type="date" required></label>
        <label>Waktu (opsional)<input name="waktu" maxlength="40" placeholder="07:00 - 10:00 WIB"></label>
        <label>Tempat (opsional)<input name="tempat" maxlength="150"></label>
        <label style="grid-column:1/-1">Deskripsi<textarea name="deskripsi" maxlength="1000"></textarea></label>
        <button class="btn-utama" type="submit">Simpan Agenda</button>
      </form>
    </section>`;

  $('#view').innerHTML = `${publikNav('agenda')}<h1>Agenda Kegiatan</h1>${form}${daftar || '<p class="muted">Belum ada agenda.</p>'}`;
}

async function kirimAgenda(f) {
  const r = await panggil('simpanAgenda', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewAgenda();
}

async function batalkanAgenda(id) {
  const a = AGENDA_CACHE.find(x => x.id === id);
  if (!a) return;
  const r = await panggil('simpanAgenda', { ...a, status: 'batal' });
  toast(r.message, r.success);
  if (r.success) viewAgenda();
}

// ---------- Galeri ----------

async function viewGaleri() {
  const r = await panggil('daftarGaleri');
  if (!r.success) return;
  const kelola = AKUN?.peran === 'sekretaris';
  const foto = r.galeri.map(g => `
    <figure class="foto">
      <img src="${esc(g.url)}" alt="${esc(g.judul)}" loading="lazy">
      <figcaption><strong>${esc(g.judul)}</strong><br><span class="muted">${tglIndo(g.tanggal)}</span>
        ${g.keterangan ? `<br>${esc(g.keterangan)}` : ''}</figcaption>
    </figure>`).join('');

  $('#view').innerHTML = `${publikNav('galeri')}<h1>Galeri</h1>
    ${kelola ? `
    <section class="kartu"><h2>Unggah foto</h2>
      <form id="form-galeri" class="grid-form">
        <label>Judul<input name="judul" required maxlength="150"></label>
        <label>Tanggal<input name="tanggal" type="date" required></label>
        <label>Keterangan<input name="keterangan" maxlength="300"></label>
        <label>Foto (JPG atau PNG, maks 2 MB)<input name="berkas" type="file" accept="image/jpeg,image/png" required></label>
        <button class="btn-utama" type="submit">Unggah Foto</button>
      </form>
    </section>` : ''}
    <div class="grid-foto">${foto || '<p class="muted">Belum ada foto.</p>'}</div>`;
}

async function kirimGaleri(f) {
  const file = f.elements.namedItem('berkas').files[0];
  if (!file) return toast('Pilih foto terlebih dahulu.', false);
  if (file.size > MAKS_UNGGAH) return toast('Ukuran foto maksimal 2 MB.', false);
  const data = await bacaBase64(file);
  const fd = Object.fromEntries(new FormData(f));
  const r = await panggil('unggahGaleri', { judul: fd.judul, tanggal: fd.tanggal, keterangan: fd.keterangan, mime: file.type, data });
  toast(r.message, r.success);
  if (r.success) viewGaleri();
}

// ---------- Notulen (pengurus) ----------

async function viewNotulen() {
  const r = await panggil('daftarNotulen');
  if (!r.success) return;
  const sekretaris = AKUN.peran === 'sekretaris';
  const daftar = r.notulen.map(n => `
    <section class="kartu">
      <div class="baris-judul"><h2>${esc(n.judul)}</h2><span class="muted">${tglIndo(n.tanggal)}</span></div>
      ${n.peserta ? `<p><b>Peserta:</b> ${esc(n.peserta)}</p>` : ''}
      ${n.agenda ? `<p><b>Agenda:</b> ${esc(n.agenda)}</p>` : ''}
      <p style="white-space:pre-line">${esc(n.isi)}</p>
    </section>`).join('');
  $('#view').innerHTML = `<h1>Notulen Rapat</h1>
    ${sekretaris ? `
    <section class="kartu"><h2>Tambah notulen</h2>
      <form id="form-notulen" class="grid-form">
        <label>Tanggal rapat<input name="tanggal" type="date" required></label>
        <label>Judul rapat<input name="judul" required maxlength="150"></label>
        <label>Peserta<input name="peserta" maxlength="300"></label>
        <label>Agenda<input name="agenda" maxlength="300"></label>
        <label style="grid-column:1/-1">Isi notulen<textarea name="isi" required maxlength="5000"></textarea></label>
        <button class="btn-utama" type="submit">Simpan Notulen</button>
      </form>
    </section>` : ''}
    ${daftar || '<p class="muted">Belum ada notulen.</p>'}`;
}

async function kirimNotulen(f) {
  const r = await panggil('simpanNotulen', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewNotulen();
}

// ---------- Pengaduan ----------

const BADGE_ADU = { baru: 'amber', diproses: '', selesai: 'hijau' };

async function viewPengaduan() {
  const r = await panggil('daftarPengaduan');
  if (!r.success) return;
  PENGADUAN_CACHE = r.pengaduan;
  const warga = AKUN.peran === 'warga';
  const baris = r.pengaduan.map(p => `
    <tr><td>${tglIndo(p.tanggal)}</td>
      ${warga ? '' : `<td>${esc(p.pelapor)}<br><span class="muted">${esc(p.rumah)}</span></td>`}
      <td>${esc(p.kategori)}</td><td style="white-space:pre-line">${esc(p.isi)}</td>
      <td><span class="badge ${BADGE_ADU[p.status] || ''}">${esc(p.status)}</span>
        ${p.tanggapan ? `<br><span class="muted">${esc(p.tanggapan)}</span>` : ''}</td>
      <td>${p.ada_lampiran ? `<button class="btn-kecil" type="button" data-lampiran="${esc(p.id)}">Lampiran</button>` : ''}
        ${warga ? '' : ` <button class="btn-kecil" type="button" data-tanggapi="${esc(p.id)}">Tanggapi</button>`}</td></tr>`).join('');

  $('#view').innerHTML = `<h1>${warga ? 'Pengaduan Saya' : 'Pengaduan Warga'}</h1>
    ${warga ? `
    <section class="kartu"><h2>Kirim pengaduan</h2>
      <form id="form-pengaduan" class="grid-form">
        <label>Kategori<input name="kategori" required maxlength="60" placeholder="contoh: Fasilitas umum"></label>
        <label>Lampiran (opsional, JPG/PNG/PDF maks 2 MB)<input name="berkas" type="file" accept="image/jpeg,image/png,application/pdf"></label>
        <label style="grid-column:1/-1">Isi pengaduan<textarea name="isi" required maxlength="1000"></textarea></label>
        <button class="btn-utama" type="submit">Kirim Pengaduan</button>
      </form>
    </section>` : ''}
    <section class="kartu"><div class="tabel-wrap"><table>
      <thead><tr><th>Tanggal</th>${warga ? '' : '<th>Pelapor</th>'}<th>Kategori</th><th>Isi</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>${baris || '<tr><td colspan="6" class="muted">Belum ada pengaduan.</td></tr>'}</tbody>
    </table></div></section>
    <div id="panel-adu"></div>`;
}

async function kirimPengaduan(f) {
  const file = f.elements.namedItem('berkas').files[0];
  const fd = Object.fromEntries(new FormData(f));
  const data = { kategori: fd.kategori, isi: fd.isi };
  if (file) {
    if (file.size > MAKS_UNGGAH) return toast('Ukuran lampiran maksimal 2 MB.', false);
    data.mime = file.type;
    data.data = await bacaBase64(file);
  }
  const r = await panggil('ajukanPengaduan', data);
  toast(r.message, r.success);
  if (r.success) viewPengaduan();
}

function tanggapiPengaduanPanel(id) {
  const p = PENGADUAN_CACHE.find(x => x.id === id);
  if (!p) return;
  $('#panel-adu').innerHTML = `<section class="kartu"><h2>Tanggapi pengaduan</h2>
    <p><b>${esc(p.pelapor)}</b> · ${esc(p.rumah)}</p>
    <p style="white-space:pre-line">${esc(p.isi)}</p>
    <form id="form-tanggapi" class="grid-form" data-id="${esc(id)}">
      <label>Status<select name="status">
        <option value="baru" ${p.status === 'baru' ? 'selected' : ''}>Baru</option>
        <option value="diproses" ${p.status === 'diproses' ? 'selected' : ''}>Diproses</option>
        <option value="selesai" ${p.status === 'selesai' ? 'selected' : ''}>Selesai</option>
      </select></label>
      <label style="grid-column:1/-1">Tanggapan<textarea name="tanggapan" maxlength="1000">${esc(p.tanggapan)}</textarea></label>
      <button class="btn-utama" type="submit">Simpan Tanggapan</button>
    </form></section>`;
  $('#panel-adu').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function kirimTanggapi(f) {
  const r = await panggil('tanggapiPengaduan', { ...Object.fromEntries(new FormData(f)), id: f.dataset.id });
  toast(r.message, r.success);
  if (r.success) viewPengaduan();
}

async function unduhLampiranAdu(id) {
  const r = await panggil('unduhLampiran', { id });
  if (r.success) unduhBase64(r.berkas, r.nama, r.mime);
}

// ============================================
// HALAMAN: PENGINGAT WHATSAPP (FONNTE)
// ============================================

let PRA_PERIODE = null;

async function viewPengingat() {
  const peran = AKUN.peran;
  const admin = peran === 'administrator';
  const bendahara = peran === 'bendahara_umum';
  const ketua = peran === 'ketua_rt';

  const st = (admin || bendahara) ? await panggil('statusFonnte') : { success: true, terhubung: null, pesan: '' };
  if (!st.success) return;
  if (admin) {
    $('#view').innerHTML = `<h1>Integrasi WhatsApp (Fonnte)</h1>
      <section class="kartu"><h2>Status koneksi</h2>
        <p><span class="badge ${st.terhubung ? 'hijau' : 'merah'}">${st.terhubung ? 'Terhubung' : 'Terputus'}</span></p>
        <p class="muted">${esc(st.pesan)}</p>
        <p class="muted">Token Fonnte disimpan di Script Properties dengan nama FONNTE_TOKEN dan tidak ditampilkan di aplikasi.</p>
      </section>`;
    return;
  }

  const jd = await panggil('ambilJadwalPengingat');
  const rw = (bendahara || ketua) ? await panggil('riwayatPengingat') : { success: true, riwayat: [] };
  if (!jd.success || !rw.success) return;
  const j = jd.jadwal;

  $('#view').innerHTML = `
    <h1>Pengingat WhatsApp</h1>
    <p class="muted">Pengingat hanya dikirim kepada warga yang masih memiliki sisa tagihan.</p>

    ${bendahara ? `
    <section class="kartu"><h2>Status koneksi</h2>
      <p><span class="badge ${st.terhubung ? 'hijau' : 'merah'}">${st.terhubung ? 'Terhubung' : 'Terputus'}</span> <span class="muted">${esc(st.pesan)}</span></p>
    </section>` : ''}

    <section class="kartu"><h2>Pratinjau & kirim</h2>
      <div class="inline">
        <label style="margin:0">Periode<input type="month" id="pra-periode" value="${periodeSekarang()}"></label>
        <button class="btn-kecil" type="button" data-pratinjau>Lihat pratinjau</button>
      </div>
      <div id="hasil-pratinjau" style="margin-top:16px"></div>
    </section>

    ${bendahara ? `
    <section class="kartu"><h2>Jadwal pengingat</h2>
      <form id="form-jadwal" class="grid-form">
        <label class="cek" style="grid-column:1/-1"><input type="checkbox" name="aktif" ${j.aktif ? 'checked' : ''}> Pengingat otomatis aktif</label>
        <label>Tanggal (1–28)<input name="tanggal" type="number" min="1" max="28" value="${j.tanggal}" required></label>
        <label>Jam WIB (0–23)<input name="jam" type="number" min="0" max="23" value="${j.jam}" required></label>
        <label>Batas kirim per hari<input name="batas" type="number" min="1" max="200" value="${j.batas}" required></label>
        <label style="grid-column:1/-1">Format pesan<textarea name="template">${esc(jd.template)}</textarea></label>
        <p class="muted">Placeholder: {nama}, {jenis}, {periode}, {total}, {terbayar}, {sisa}. Wajib memuat {nama} dan {sisa}.</p>
        <button class="btn-utama" type="submit">Simpan Jadwal & Format</button>
      </form>
    </section>

    <section class="kartu"><h2>Uji kirim</h2>
      <form id="form-uji" class="grid-form">
        <label>Nomor WhatsApp tujuan<input name="nomor" required placeholder="0812xxxxxxx"></label>
        <label>Isi pesan uji<input name="pesan" required maxlength="500" value="Tes pengingat RT-KU."></label>
        <button class="btn-kecil" type="submit">Kirim Uji</button>
      </form>
    </section>` : ''}

    ${bendahara || ketua ? `
    <section class="kartu"><h2>Riwayat pengiriman</h2><div class="tabel-wrap"><table>
      <thead><tr><th>Waktu</th><th>Periode</th><th>Penerima</th><th>Nomor</th><th>Sisa</th><th>Status API</th><th>Keterangan</th></tr></thead>
      <tbody>${rw.riwayat.map(x => `<tr><td>${esc(x.waktu)}</td><td>${esc(x.periode)}</td><td>${esc(x.nama)}</td>
        <td class="mono">${esc(x.nomor)}</td><td class="angka">${rp(x.sisa)}</td>
        <td><span class="badge ${x.status === 'diterima API' ? 'hijau' : 'merah'}">${esc(x.status)}</span></td>
        <td class="muted">${esc(x.detail)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Belum ada pengiriman.</td></tr>'}</tbody>
    </table></div></section>` : ''}`;
}

async function lihatPratinjau() {
  PRA_PERIODE = $('#pra-periode').value;
  const r = await panggil('pratinjauPengingat', { periode: PRA_PERIODE });
  if (!r.success) return;
  const bendahara = AKUN.peran === 'bendahara_umum';
  $('#hasil-pratinjau').innerHTML = `
    <div class="grid-kartu">
      ${stat('Akan dikirim', r.jumlahSiap + ' warga', r.periode)}
      ${stat('Total sisa tagihan', rp(r.totalSisa), 'Seluruh penerima')}
      ${stat('Dilewati', r.dilewati.length + ' rumah', 'Lihat alasan di bawah')}
      ${stat('Sudah lunas', r.lunas + ' rumah', 'Tidak dikirim')}
    </div>
    ${r.contoh.length ? `<h2 style="margin-top:16px">Contoh pesan</h2>${r.contoh.map(c => `
      <p class="muted"><b>${esc(c.label)}</b></p>
      <pre class="pesan-contoh">${esc(c.pesan)}</pre>`).join('')}` : ''}
    ${r.dilewati.length ? `<h2 style="margin-top:16px">Dilewati</h2><ul>${r.dilewati.map(x => `<li>${esc(x.label)} · ${esc(x.alasan)}</li>`).join('')}</ul>` : ''}
    ${bendahara && r.jumlahSiap ? `
    <div class="kartu" style="margin-top:16px">
      <label class="cek"><input type="checkbox" id="cek-pratinjau"> Saya sudah memeriksa pratinjau dan siap mengirim</label>
      <div class="inline" style="margin-top:8px">
        <label style="margin:0">Batas hari ini<input type="number" id="pra-batas" min="1" max="200" value="${$('#form-jadwal')?.elements.namedItem('batas')?.value || 50}"></label>
        <button class="btn-utama" type="button" data-kirim-pengingat>Kirim pengingat</button>
      </div>
      <p class="muted">Pengiriman bertahap. Warga yang sudah pernah menerima untuk periode ini tidak akan dikirim ulang.</p>
    </div>` : ''}`;
}

async function kirimPengingatSekarang() {
  if (!$('#cek-pratinjau')?.checked) return toast('Centang konfirmasi pratinjau terlebih dahulu.', false);
  if (!window.confirm('Kirim pengingat sekarang kepada warga yang tercantum di pratinjau?')) return;
  const r = await panggil('kirimPengingat', { periode: PRA_PERIODE, konfirmasi: true, batas: $('#pra-batas').value });
  toast(r.message, r.success);
  if (r.success) viewPengingat();
}

async function kirimJadwal(f) {
  const fd = new FormData(f);
  const r = await panggil('simpanJadwalPengingat', {
    aktif: fd.get('aktif') === 'on', tanggal: fd.get('tanggal'), jam: fd.get('jam'),
    batas: fd.get('batas'), template: fd.get('template')
  });
  toast(r.message, r.success);
  if (r.success) viewPengingat();
}

async function kirimUji(f) {
  const r = await panggil('ujiKirimFonnte', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
}

// ============================================
// HALAMAN: INPUT ANGGOTA KELUARGA (ADMINISTRATOR & SEKRETARIS)
// ============================================

async function viewInputAnggota(rumahId = '') {
  const rm = await panggil('daftarRumah');
  if (!rm.success) return;
  const opsi = rm.rumah.map(x => `<option value="${esc(x.id)}" ${x.id === rumahId ? 'selected' : ''}>Blok ${esc(x.blok)} No. ${esc(x.nomor)}${x.kepala_keluarga ? ' · ' + esc(x.kepala_keluarga) : ''} (${x.jumlahAnggota} anggota)</option>`).join('');

  let bawah = '<p class="muted">Pilih rumah terlebih dahulu untuk melihat dan menambah anggotanya.</p>';
  if (rumahId) {
    const a = await panggil('daftarAnggota', { rumah_id: rumahId });
    if (!a.success) return;
    const baris = a.anggota.map(x => `<tr><td>${esc(x.nama)}</td><td>${tglIndo(x.tgl_lahir)}</td><td>${x.usia} th</td><td>${esc(x.hubungan)}</td><td class="mono">${esc(x.wa) || '—'}</td></tr>`).join('')
      || '<tr><td colspan="5" class="muted">Belum ada anggota terdaftar di rumah ini.</td></tr>';
    bawah = `
      <section class="kartu"><h2>Anggota saat ini</h2><div class="tabel-wrap"><table>
        <thead><tr><th>Nama</th><th>Tgl lahir</th><th>Usia</th><th>Hubungan</th><th>WhatsApp</th></tr></thead>
        <tbody>${baris}</tbody></table></div></section>
      <section class="kartu"><h2>2. Tambah anggota</h2>
        <form id="form-input-anggota" class="grid-form">
          <input type="hidden" name="rumah_id" value="${esc(rumahId)}">
          <label>Nama lengkap<input name="nama" required maxlength="100" autocomplete="off"></label>
          <label>Hubungan keluarga<select name="hubungan" required>
            <option value="">Pilih</option><option>Kepala Keluarga</option><option>Istri</option>
            <option>Suami</option><option>Anak</option><option>Orang Tua</option><option>Anggota Lain</option>
          </select></label>
          <label>Tanggal lahir<input name="tgl_lahir" type="date" required></label>
          <label>No. WhatsApp (opsional)<input name="wa" inputmode="tel" placeholder="0812xxxxxxx"></label>
          <p class="muted">Nomor WhatsApp akan dipakai untuk pengingat tagihan. Isi nomor kepala keluarga bila ada. Setiap rumah hanya boleh punya satu kepala keluarga.</p>
          <button class="btn-utama" type="submit">Simpan Anggota</button>
        </form></section>`;
  }
  $('#view').innerHTML = `<h1>Input Anggota Keluarga</h1>
    <section class="kartu"><h2>1. Pilih rumah</h2>
      <label>Rumah<select id="pilih-rumah-anggota"><option value="">— Pilih rumah —</option>${opsi}</select></label>
    </section>${bawah}`;
}

async function kirimInputAnggota(f) {
  const data = Object.fromEntries(new FormData(f));
  const r = await panggil('tambahAnggota', data);
  toast(r.message, r.success);
  if (r.success) viewInputAnggota(data.rumah_id);
}

async function kirimAkun(f) {
  const r = await panggil('buatAkun', Object.fromEntries(new FormData(f)));
  toast(r.message, r.success);
  if (r.success) viewAkun();
}

// ============================================
// HALAMAN: GANTI KATA SANDI
// ============================================

function viewSandi() {
  $('#view').innerHTML = `
    <h1>Ganti Kata Sandi</h1>
    ${AKUN.wajib_ganti_sandi ? '<p class="pesan info">Anda wajib mengganti kata sandi awal sebelum melanjutkan.</p>' : ''}
    <section class="kartu narrow"><form id="form-sandi" class="grid-form">
      <label>Kata sandi lama<input name="lama" type="password" required autocomplete="current-password"></label>
      <label>Kata sandi baru<input name="baru" type="password" required autocomplete="new-password"></label>
      <label>Ulangi kata sandi baru<input name="ulang" type="password" required autocomplete="new-password"></label>
      <p class="muted">Minimal 8 karakter, memuat huruf dan angka. Semua sesi lain akan diakhiri.</p>
      <button class="btn-utama" type="submit">Simpan Kata Sandi Baru</button>
    </form></section>`;
}

async function kirimSandi(f) {
  const r = await panggil('gantiSandi', Object.fromEntries(new FormData(f)));
  if (!r.success) return;
  toast(r.message);
  hapusToken(); AKUN = null;
  go('login');
}

// ============================================
// AKSI UMUM
// ============================================

async function keluar() {
  await api('logout');
  hapusToken(); AKUN = null;
  go('login');
}

// ============================================
// EVENT (delegasi)
// ============================================

document.addEventListener('click', (e) => {
  if ($('#sidebar').classList.contains('buka') && !e.target.closest('#sidebar') && !e.target.closest('#btn-menu')) {
    tutupMenu();
  }
  const el = e.target.closest('[data-go],[data-tab],[data-anggota],[data-aksi],[data-verif],[data-laporan],[data-konfirmasi],[data-surat],[data-edit-peng],[data-reset-form],[data-batal-agenda],[data-lampiran],[data-tanggapi],[data-pratinjau],[data-kirim-pengingat],[data-mata],#btn-keluar,#btn-menu,#btn-tutup-menu');
  if (!el) return;
  e.preventDefault();
  if (el.dataset.go) go(el.dataset.go);
  else if (el.dataset.tab) viewLogin(el.dataset.tab);
  else if (el.dataset.anggota) tampilAnggota(el.dataset.anggota);
  else if (el.hasAttribute('data-mata')) {
    const input = el.parentElement.querySelector('input');
    input.type = input.type === 'password' ? 'text' : 'password';
  }
  else if (el.dataset.aksi) aksiAkun(el.dataset.aksi, el.dataset.id, el.dataset.nama);
  else if (el.dataset.verif) verifikasi(el.dataset.verif, el.dataset.id);
  else if (el.dataset.laporan) unduhLaporan(el.dataset.laporan, el.dataset.kas || 'umum');
  else if (el.dataset.konfirmasi) konfirmasiSerah(el.dataset.konfirmasi, el.dataset.kas);
  else if (el.dataset.surat) aksiSurat(el.dataset.surat, el.dataset.id);
  else if (el.dataset.editPeng) isiFormPengumuman(el.dataset.editPeng);
  else if (el.dataset.resetForm) { const f = document.getElementById(el.dataset.resetForm); f.reset(); const t = $('#judul-form-peng'); if (t) t.textContent = 'Buat pengumuman'; }
  else if (el.dataset.batalAgenda) batalkanAgenda(el.dataset.batalAgenda);
  else if (el.dataset.lampiran) unduhLampiranAdu(el.dataset.lampiran);
  else if (el.dataset.tanggapi) tanggapiPengaduanPanel(el.dataset.tanggapi);
  else if (el.hasAttribute('data-pratinjau')) lihatPratinjau();
  else if (el.hasAttribute('data-kirim-pengingat')) kirimPengingatSekarang();
  else if (el.id === 'btn-keluar') keluar();
  else if (el.id === 'btn-menu') toggleMenu();
  else if (el.id === 'btn-tutup-menu') tutupMenu();
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const handler = {
    'form-login': kirimLogin, 'form-pemulihan': kirimPemulihan, 'form-akun': kirimAkun,
    'form-sandi': kirimSandi, 'form-rumah': kirimRumah, 'form-anggota': kirimAnggota,
    'form-reset': kirimReset, 'form-pengurus': kirimPengurus,
    'form-periode': (f) => viewKasUmum(new FormData(f).get('periode')),
    'form-terbit': kirimTerbit, 'form-bayar': kirimBayar, 'form-transaksi': kirimTransaksi,
    'form-kas-transaksi': kirimKasTransaksi, 'form-penyaluran': kirimPenyaluran, 'form-serah': kirimSerah,
    'form-ajukan': kirimAjukan, 'form-perbaiki': kirimPerbaiki, 'form-tinjau': kirimTinjau,
    'form-pengumuman': kirimPengumuman, 'form-agenda': kirimAgenda, 'form-galeri': kirimGaleri,
    'form-notulen': kirimNotulen, 'form-pengaduan': kirimPengaduan, 'form-tanggapi': kirimTanggapi,
    'form-jadwal': kirimJadwal, 'form-uji': kirimUji, 'form-input-anggota': kirimInputAnggota, 'form-periode-dash': (f) => viewDashboard(new FormData(f).get('periode'))
  }[f.id];
  if (!handler) return;
  const tombol = f.querySelector('[type=submit]');
  tombol.disabled = true;
  try { await handler(f); }
  finally { tombol.disabled = false; }
});

// ============================================
// START
// ============================================

async function init() {
  if (ambilToken()) {
    const r = await api('sesi');
    if (r.success) {
      AKUN = r.akun;
      return go(AKUN.wajib_ganti_sandi ? 'sandi' : 'dashboard');
    }
    hapusToken();
  }
  go('login');
}

// Label kolom untuk tampilan kartu di ponsel: diambil dari teks header tabel
function labelTabel() {
  document.querySelectorAll('#view table').forEach(t => {
    const heads = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
    if (!heads.length) return;
    t.querySelectorAll('tbody tr').forEach(tr => {
      if (tr.children.length === 1) return;
      [...tr.children].forEach((td, i) => { if (!td.dataset.label && heads[i] !== undefined) td.dataset.label = heads[i]; });
    });
  });
}
let _lbl = 0;
new MutationObserver(() => { cancelAnimationFrame(_lbl); _lbl = requestAnimationFrame(labelTabel); }).observe($('#view'), { childList: true, subtree: true });

document.addEventListener('input', (e) => {
  if (e.target.closest && e.target.closest('#view')) FORM_KOTOR = true;
  if (e.target.id !== 'cari-rumah') return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#tabel-rumah tbody tr').forEach(tr => { tr.hidden = !!q && !tr.textContent.toLowerCase().includes(q); });
});
document.addEventListener('change', (e) => { if (e.target.id === 'pilih-rumah-anggota') viewInputAnggota(e.target.value); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupMenu(); });

init();
