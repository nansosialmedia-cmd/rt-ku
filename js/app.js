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
function hapusToken() { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); }

async function api(aksi, data = {}) {
  try {
    const r = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: aksi, data, token: ambilToken() })
    });
    return await r.json();
  } catch (e) {
    return { success: false, message: 'Tidak dapat terhubung ke server. Periksa koneksi internet.' };
  }
}

// Sesi kedaluwarsa otomatis kembali ke login
async function panggil(aksi, data = {}) {
  const r = await api(aksi, data);
  if (!r.success && r.sesi) {
    hapusToken(); AKUN = null;
    toast(r.message, false);
    go('login');
  } else if (!r.success) {
    toast(r.message, false);
  }
  return r;
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
  $('#bottom-nav').hidden = !on;
}

// Navigasi bawah HP: empat menu utama sesuai peran, plus tombol "Menu" untuk seluruh daftar
const LABEL_SINGKAT = { dashboard: 'Beranda', rumah: 'Data', kasUmum: 'Kas', kasJimpitan: 'Kas', kasPembangunan: 'Kas', kasSosial: 'Kas', surat: 'Surat', pengumuman: 'Info', pengaduan: 'Aduan', notulen: 'Notulen', agenda: 'Agenda' };
const PRIORITAS_BAWAH = ['dashboard', 'rumah', 'kasUmum', 'kasJimpitan', 'kasPembangunan', 'kasSosial', 'surat', 'pengumuman', 'pengaduan'];

function renderNavBawah(item, aktif) {
  const pilih = PRIORITAS_BAWAH
    .map(k => item.find(([kode]) => kode === k))
    .filter(Boolean)
    .filter((x, i, arr) => arr.findIndex(y => LABEL_SINGKAT[y[0]] === LABEL_SINGKAT[x[0]]) === i)
    .slice(0, 4);
  $('#bottom-nav').innerHTML = pilih.map(([k]) =>
    `<a href="#" data-go="${k}" class="${k === aktif ? 'aktif' : ''}">${LABEL_SINGKAT[k]}</a>`).join('')
    + '<button type="button" id="btn-menu-bawah">Menu</button>';
}

function renderMenu(aktif) {
  const item = [['dashboard', 'Dashboard'], ['rumah', AKUN.peran === 'warga' ? 'Data Keluarga Saya' : 'Data Rumah & Anggota']];
  if (AKUN.peran === 'administrator') {
    item.push(['akun', 'Akun & Hak Akses'], ['pengurus', 'Pengurus & Periode'], ['log', 'Log Aktivitas']);
  }
  ['umum', 'pembangunan', 'jimpitan', 'sosial'].forEach(k => {
    if (bolehBacaKas(k)) item.push([KAS_HALAMAN[k], NAMA_KAS_FE[k]]);
  });
  if (['warga', 'ketua_rt', 'sekretaris'].includes(AKUN.peran)) {
    item.push(['surat', AKUN.peran === 'warga' ? 'Pengajuan Surat' : AKUN.peran === 'ketua_rt' ? 'Review Surat' : 'Status Surat']);
  }
  item.push(['pengumuman', 'Pengumuman'], ['agenda', 'Agenda'], ['galeri', 'Galeri']);
  if (PENGURUS_FE.includes(AKUN.peran)) item.push(['notulen', 'Notulen']);
  if (['warga', 'sekretaris', 'ketua_rt'].includes(AKUN.peran)) {
    item.push(['pengaduan', AKUN.peran === 'warga' ? 'Pengaduan Saya' : 'Pengaduan Warga']);
  }
  if (FITUR.pengingatWA && ['bendahara_umum', 'ketua_rt', 'administrator'].includes(AKUN.peran)) {
    item.push(['pengingat', 'Pengingat WhatsApp']);
  }
  item.push(['sandi', 'Ganti Kata Sandi']);
  $('#menu').innerHTML = item.map(([k, l]) => `<a href="#" data-go="${k}" class="${k === aktif ? 'aktif' : ''}">${l}</a>`).join('');
  $('#nama-sidebar').textContent = AKUN.nama;
  $('#profil-top').textContent = `${AKUN.nama} · ${PERAN[AKUN.peran]}`;
  renderNavBawah(item, aktif);
}

// ============================================
// NAVIGASI
// ============================================

const HALAMAN = {
  login: viewLogin, pemulihan: viewPemulihan, dashboard: viewDashboard, rumah: viewRumah,
  akun: viewAkun, pengurus: viewPengurus, log: viewLog, sandi: viewSandi, surat: viewSurat,
  pengumuman: viewPengumuman, agenda: viewAgenda, galeri: viewGaleri, notulen: viewNotulen, pengaduan: viewPengaduan,
  pengingat: viewPengingat,
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

async function go(p) {
  if (!AKUN && !['login', 'pemulihan', 'pengumuman', 'agenda', 'galeri'].includes(p)) p = 'login';
  if (p === 'notulen' && !PENGURUS_FE.includes(AKUN?.peran)) p = 'dashboard';
  if (p === 'pengingat' && (!FITUR.pengingatWA || !['bendahara_umum', 'ketua_rt', 'administrator'].includes(AKUN?.peran))) p = 'dashboard';
  if (p === 'pengaduan' && !['warga', 'sekretaris', 'ketua_rt'].includes(AKUN?.peran)) p = 'dashboard';
  if (AKUN && AKUN.wajib_ganti_sandi && p !== 'sandi') p = 'sandi';
  if (HALAMAN_ADMIN.includes(p) && AKUN?.peran !== 'administrator') p = 'dashboard';
  if (KAS_DARI_HALAMAN[p] && !bolehBacaKas(KAS_DARI_HALAMAN[p])) p = 'dashboard';
  if (p === 'surat' && !['warga', 'ketua_rt', 'sekretaris'].includes(AKUN?.peran)) p = 'dashboard';

  const konten = !!AKUN && !['login', 'pemulihan'].includes(p);
  shell(konten);
  if (konten) renderMenu(p);
  const v = $('#view');
  v.classList.add('muat');
  try { await HALAMAN[p](); }
  catch (e) { toast('Terjadi kesalahan pada tampilan.', false); }
  finally { v.classList.remove('muat'); }
  window.scrollTo(0, 0);
}

// ============================================
// HALAMAN: LOGIN & PEMULIHAN
// ============================================

function viewLogin(mode = 'pengurus') {
  shell(false);
  const opsi = Object.entries(PERAN).filter(([k]) => k !== 'administrator')
    .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#view').innerHTML = `
    <div class="kartu-login">
      <img src="assets/logo/Logo_RT02.png" alt="Logo RT02 RW29 Gading Elok 1" class="logo-login">
      <h1>Masuk ke RT-KU</h1>
      <p class="muted">Sistem Informasi & Administrasi Warga RT02/RW29</p>
      <div class="tab-dua">
        <button type="button" data-tab="pengurus" class="${mode === 'pengurus' ? 'aktif' : ''}">Pengurus & Warga</button>
        <button type="button" data-tab="admin" class="${mode === 'admin' ? 'aktif' : ''}">Administrator</button>
      </div>
      <form id="form-login" data-mode="${mode}">
        ${mode === 'pengurus' ? `<label>Pilih peran<select name="peran" required>${opsi}</select></label>` : ''}
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
  if (mode === 'pengurus') data.peran = fd.get('peran');
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

async function viewDashboard() {
  const r = await panggil('dashboard');
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
  $('#view').innerHTML = `<h1>Selamat datang, ${esc(AKUN.nama)}</h1>
    <p class="muted">${esc(PERAN[AKUN.peran])}</p>
    <div class="grid-kartu">${kartu}</div>`;
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
    <section class="kartu"><div class="tabel-wrap"><table>
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
    <section class="kartu" id="panel-anggota"></section>`;
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
  if (AKUN.peran === 'administrator') {
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
  const el = e.target.closest('[data-go],[data-tab],[data-anggota],[data-aksi],[data-verif],[data-laporan],[data-konfirmasi],[data-surat],[data-edit-peng],[data-reset-form],[data-batal-agenda],[data-lampiran],[data-tanggapi],[data-pratinjau],[data-kirim-pengingat],[data-mata],#btn-keluar,#btn-menu,#btn-menu-bawah');
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
  else if (el.id === 'btn-menu' || el.id === 'btn-menu-bawah') $('#sidebar').classList.toggle('buka');
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
    'form-jadwal': kirimJadwal, 'form-uji': kirimUji
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

init();
