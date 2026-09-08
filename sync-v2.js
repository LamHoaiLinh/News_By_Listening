// News By Listening - Sync code 6 ky tu (v1.1.0)
// Giu nguyen STORAGE_KEY cu nen du lieu hien tai tren PC khong bi mat khi cap nhat.

const NBL_SYNC_ENDPOINT = 'https://qjpcxhackvoewcxlatis.supabase.co/functions/v1/nbl-sync';
const NBL_SYNC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqcGN4aGFja3ZvZXdjeGxhdGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMzYxNDEsImV4cCI6MjEwMjYxMjE0MX0.7PLermMf8kDjVBrBQ5ydnxLsIdA1REF0ronjcu9DLQo';
let sync6Ui = { code: '', expiresAt: '', busy: false, message: '' };

function normalizeSync6(value) {
  return String(value || '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);
}

async function sync6Request(action, extra = {}) {
  const response = await fetch(NBL_SYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NBL_SYNC_ANON_KEY}`,
      'apikey': NBL_SYNC_ANON_KEY
    },
    body: JSON.stringify({ action, ...extra })
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || 'Không kết nối được máy chủ đồng bộ');
  return data;
}

function sync6ExpiryText(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch { return ''; }
}

function renderSync() {
  const code = sync6Ui.code;
  const status = sync6Ui.busy ? '<span class="loader"></span>' : '';
  const codeCard = code ? `
    <div class="card" style="margin-top:14px;text-align:center">
      <div class="subtle">MÃ ĐỒNG BỘ</div>
      <div style="font-size:42px;font-weight:800;letter-spacing:9px;margin:10px 0;color:#7fffd4">${esc(code)}</div>
      <div class="subtle">Hết hạn: ${esc(sync6ExpiryText(sync6Ui.expiresAt))} · dùng được trong 24 giờ</div>
      <div class="toolbar" style="justify-content:center;margin-top:14px">
        <button class="primary" data-action="copy-sync6-code">Sao chép mã</button>
        <button class="ghost" data-action="copy-sync6-link">Sao chép link ngắn</button>
      </div>
    </div>` : '';
  return shell(`
    <div class="section-title"><div><h2>Đồng bộ PC ↔ iPhone</h2><div class="subtle">Mã 6 ký tự · không còn link dài</div></div>${status}</div>
    <div class="card form">
      <h3 style="margin-top:0">1. Trên PC</h3>
      <div class="notice">Toàn bộ phân loại và kênh anh đã nhập hiện tại vẫn được giữ nguyên. Bấm nút dưới đây để tạo mã tạm thời.</div>
      <label class="field"><span><input type="checkbox" id="sync6-include-key"> Kèm YouTube API key</span><small class="subtle">Không bật nếu không cần. Mã chỉ tồn tại 24 giờ.</small></label>
      <button class="primary" data-action="create-sync6" ${sync6Ui.busy ? 'disabled' : ''}>${sync6Ui.busy ? 'Đang tạo...' : 'Tạo mã đồng bộ 6 ký tự'}</button>
      ${codeCard}
      <div class="hr"></div>
      <h3>2. Trên iPhone</h3>
      <div class="field"><label>Nhập mã 6 ký tự</label><input id="sync6-input" class="input" inputmode="text" maxlength="6" autocomplete="one-time-code" placeholder="ABC234" style="text-transform:uppercase;font-size:28px;font-weight:800;letter-spacing:7px;text-align:center"></div>
      <button class="primary" data-action="fetch-sync6" ${sync6Ui.busy ? 'disabled' : ''}>Nhận dữ liệu từ PC</button>
      <div class="notice" style="margin-top:14px">Khi nhận dữ liệu, danh sách phân loại/kênh trên thiết bị này sẽ được thay bằng cấu hình từ PC. Lịch sử đã nghe 3 ngày trên iPhone vẫn được giữ.</div>
      ${sync6Ui.message ? `<div class="notice ${sync6Ui.message.includes('lỗi') || sync6Ui.message.includes('Không') ? 'warn' : ''}" style="margin-top:12px">${esc(sync6Ui.message)}</div>` : ''}
    </div>
  `);
}

async function createSync6Code() {
  if (sync6Ui.busy) return;
  const includeKey = !!document.getElementById('sync6-include-key')?.checked;
  sync6Ui.busy = true; sync6Ui.message = ''; render();
  try {
    const payload = syncPayload(includeKey);
    const result = await sync6Request('create', { payload });
    sync6Ui.code = normalizeSync6(result.code);
    sync6Ui.expiresAt = result.expiresAt || '';
    sync6Ui.message = 'Đã tạo mã. Mở News By Listening trên iPhone và nhập 6 ký tự này.';
    toast('Đã tạo mã đồng bộ ' + sync6Ui.code);
  } catch (e) {
    sync6Ui.message = 'Không tạo được mã: ' + (e.message || 'lỗi không xác định');
    toast(e.message || 'Không tạo được mã');
  } finally { sync6Ui.busy = false; render(); }
}

async function fetchSync6Code(codeFromArg) {
  if (sync6Ui.busy) return;
  const input = document.getElementById('sync6-input');
  const code = normalizeSync6(codeFromArg || input?.value);
  if (code.length !== 6) return toast('Nhập đủ mã đồng bộ 6 ký tự');
  sync6Ui.busy = true; sync6Ui.message = ''; render();
  try {
    const result = await sync6Request('fetch', { code });
    if (!result.payload) throw new Error('Mã không có dữ liệu');
    applyImport(result.payload);
    sync6Ui.message = 'Đồng bộ thành công.';
    toast('Đã đồng bộ dữ liệu từ PC');
  } catch (e) {
    sync6Ui.message = 'Không đồng bộ được: ' + (e.message || 'lỗi không xác định');
    toast(e.message || 'Không đồng bộ được');
  } finally {
    sync6Ui.busy = false;
    if (view.tab !== 'sync') { view.tab = 'sync'; view.categoryId = null; view.itemId = null; }
    render();
  }
}

async function copyText6(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    window.prompt('Sao chép nội dung này:', text);
  }
}

document.addEventListener('input', e => {
  if (e.target?.id === 'sync6-input') e.target.value = normalizeSync6(e.target.value);
});

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'create-sync6') { e.preventDefault(); createSync6Code(); return; }
  if (action === 'fetch-sync6') { e.preventDefault(); fetchSync6Code(); return; }
  if (action === 'copy-sync6-code') { e.preventDefault(); copyText6(sync6Ui.code, 'Đã sao chép mã ' + sync6Ui.code); return; }
  if (action === 'copy-sync6-link') {
    e.preventDefault();
    const url = location.origin + location.pathname + '#sync6=' + sync6Ui.code;
    copyText6(url, 'Đã sao chép link đồng bộ ngắn');
  }
});

async function checkSync6Hash() {
  const match = location.hash.match(/^#sync6=([A-HJ-NP-Z2-9]{6})$/i);
  if (!match) return;
  const code = normalizeSync6(match[1]);
  view.tab = 'sync'; view.categoryId = null; view.itemId = null; render();
  const input = document.getElementById('sync6-input'); if (input) input.value = code;
  if (confirm(`Nhận cấu hình News By Listening bằng mã ${code}?`)) await fetchSync6Code(code);
}

if (typeof view !== 'undefined' && view.tab === 'sync') render();
setTimeout(checkSync6Hash, 120);
