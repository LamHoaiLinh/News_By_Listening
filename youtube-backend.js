// News By Listening - YouTube Data API via Supabase backend (v1.2.0)
// API key is stored only on the backend; browsers never receive it.

const NBL_YOUTUBE_ENDPOINT = 'https://qjpcxhackvoewcxlatis.supabase.co/functions/v1/nbl-youtube';
let nblYoutubeBackendStatus = null;
let nblYoutubeStatusBusy = false;

async function nblYoutubeRequest(body) {
  const response = await fetch(NBL_YOUTUBE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NBL_SYNC_ANON_KEY}`,
      'apikey': NBL_SYNC_ANON_KEY
    },
    body: JSON.stringify(body)
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || 'Backend YouTube không phản hồi');
  return data;
}

// app.js uses apiKey() only to decide whether to show the old warning.
// Return a sentinel value because the real key is now server-side.
apiKey = function () { return 'BACKEND_MANAGED'; };

// Replace direct Google API calls with the protected Supabase Edge Function.
yt = async function (path, params) {
  return await nblYoutubeRequest({ action: 'api', path, params });
};

// Never include a YouTube API key in sync payloads anymore.
syncPayload = function () {
  return {
    v: 2,
    categories: state.categories,
    items: state.items.map(({ videos, lastFetchedAt, ...x }) => x),
    prefs: state.prefs
  };
};

async function nblCheckYoutubeBackendStatus(force = false) {
  if (nblYoutubeStatusBusy) return;
  if (nblYoutubeBackendStatus !== null && !force) return;
  nblYoutubeStatusBusy = true;
  try {
    const data = await nblYoutubeRequest({ action: 'status' });
    nblYoutubeBackendStatus = !!data.configured;
  } catch {
    nblYoutubeBackendStatus = false;
  } finally {
    nblYoutubeStatusBusy = false;
    if (view.tab === 'settings') render();
  }
}

renderSettings = function () {
  const statusText = nblYoutubeBackendStatus === null
    ? 'Đang kiểm tra...'
    : nblYoutubeBackendStatus
      ? 'Đã cấu hình · sẵn sàng'
      : 'Chưa có API key trên server';
  const statusClass = nblYoutubeBackendStatus ? 'green' : '';
  if (nblYoutubeBackendStatus === null && !nblYoutubeStatusBusy) setTimeout(() => nblCheckYoutubeBackendStatus(), 0);
  return shell(`<div class="section-title"><div><h2>Cài đặt</h2><div class="subtle">Các thiết lập lưu riêng trên thiết bị này</div></div></div>
    <div class="card form">
      <div class="field">
        <label>YouTube Data API</label>
        <div><span class="badge ${statusClass}">${esc(statusText)}</span></div>
        <small class="subtle">API key được giữ ở backend Supabase. PC và iPhone không cần nhập hoặc đồng bộ key.</small>
      </div>
      <button class="ghost" data-action="check-youtube-backend">Kiểm tra lại backend</button>
      <div class="hr"></div>
      <div class="field"><label>Tốc độ nghe ưa thích</label><div class="speedrow">${SPEEDS.map(x=>`<button class="chip ${state.prefs.speed===x?'active':''}" data-speed="${x}">${x}x</button>`).join('')}</div></div>
      <label><input id="remember-speed" type="checkbox" ${state.prefs.rememberSpeed?'checked':''}> Ghi nhớ tốc độ gần nhất đã chọn</label>
      <div class="notice">Tốc độ được News By Listening ghi nhớ để nhắc đúng thói quen. Video thực sự phát trong Brave/YouTube nên PWA không thể ép trình phát bên ngoài đổi tốc độ hoặc tự EQ/boost âm thanh.</div>
      <label><input id="open-brave" type="checkbox" ${state.prefs.openInBrave?'checked':''}> Trên iPhone, ưu tiên mở link bằng Brave</label>
      <div class="hr"></div>
      <div class="subtle">Phiên bản 1.2.0 · YouTube API qua backend</div>
    </div>`);
};

// Replace the sync screen so there is no longer an API-key checkbox.
renderSync = function () {
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
    <div class="section-title"><div><h2>Đồng bộ PC ↔ iPhone</h2><div class="subtle">Mã 6 ký tự · YouTube API key không cần đồng bộ</div></div>${status}</div>
    <div class="card form">
      <h3 style="margin-top:0">1. Trên PC</h3>
      <div class="notice">Phân loại, kênh, playlist và cài đặt được gửi qua mã 6 ký tự. YouTube API key nằm ở server nên không đi theo dữ liệu đồng bộ.</div>
      <button class="primary" data-action="create-sync6" ${sync6Ui.busy ? 'disabled' : ''}>${sync6Ui.busy ? 'Đang tạo...' : 'Tạo mã đồng bộ 6 ký tự'}</button>
      ${codeCard}
      <div class="hr"></div>
      <h3>2. Trên iPhone</h3>
      <div class="field"><label>Nhập mã 6 ký tự</label><input id="sync6-input" class="input" inputmode="text" maxlength="6" autocomplete="one-time-code" placeholder="ABC234" style="text-transform:uppercase;font-size:28px;font-weight:800;letter-spacing:7px;text-align:center"></div>
      <button class="primary" data-action="fetch-sync6" ${sync6Ui.busy ? 'disabled' : ''}>Nhận dữ liệu từ PC</button>
      <div class="notice" style="margin-top:14px">Khi nhận dữ liệu, danh sách phân loại/kênh trên thiết bị này sẽ được thay bằng cấu hình từ PC. Lịch sử đã nghe 3 ngày trên iPhone vẫn được giữ.</div>
      ${sync6Ui.message ? `<div class="notice ${sync6Ui.message.includes('lỗi') || sync6Ui.message.includes('Không') ? 'warn' : ''}" style="margin-top:12px">${esc(sync6Ui.message)}</div>` : ''}
    </div>`);
};

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action="check-youtube-backend"]');
  if (!btn) return;
  e.preventDefault();
  nblYoutubeBackendStatus = null;
  nblCheckYoutubeBackendStatus(true);
});

// Clean up any old locally stored API key. It is no longer used.
try { localStorage.removeItem(API_KEY_KEY); } catch {}
