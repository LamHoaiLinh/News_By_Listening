// News By Listening v1.8.0 - playback diagnostics UI
(function(){
  'use strict';
  const E=window.NBL_PLAYBACK_ENGINE;
  if(!E)return;

  function safe(v){return typeof esc==='function'?esc(v==null?'':String(v)):String(v==null?'':v);}
  function timeText(v){
    try{return new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'medium'}).format(new Date(v));}
    catch{return String(v||'');}
  }
  function repeatText(mode){
    if(mode==='list-once')return 'Toàn bộ ×1';
    if(mode==='list-infinity')return 'Toàn bộ ∞';
    if(mode==='track-once')return '1 bài ×1';
    if(mode==='track-infinity')return '1 bài ∞';
    return 'Tắt';
  }
  function actionText(x){
    if(x.action==='library-video')return 'Thư viện';
    if(x.action==='queue-from-here')return 'Nghe từ đây';
    if(x.action==='direct-url')return 'Mở lại / URL trực tiếp';
    if(x.shuffle&&x.repeatMode!=='off')return 'Ngẫu nhiên + Lặp';
    if(x.shuffle)return 'Ngẫu nhiên';
    if(x.repeatMode!=='off')return 'Phát + Lặp';
    return 'Phát danh sách';
  }
  function statusText(status){
    if(status==='handoff-detected')return 'Đã bàn giao Vivaldi';
    if(status==='vivaldi-requested')return 'Đã gọi Vivaldi';
    if(status==='https-fallback')return 'Fallback HTTPS';
    if(status==='new-tab-opened')return 'Đã mở tab';
    return 'Đã tạo lệnh phát';
  }
  function statusClass(status){
    return status==='handoff-detected'||status==='new-tab-opened'?'green':'';
  }
  function connectionText(c){
    if(!c)return '';
    const parts=[c.online===false?'Offline':'Online'];
    if(c.effectiveType)parts.push(c.effectiveType);
    if(c.saveData)parts.push('Save Data');
    if(c.platform)parts.push(c.platform);
    return parts.join(' · ');
  }
  function renderEntry(x,i){
    const from=x.startIndex>0?` · bắt đầu #${x.startIndex+1}`:'';
    const mode=x.repeatMode&&x.repeatMode!=='off'?` · lặp ${repeatText(x.repeatMode)}`:'';
    const shuffle=x.shuffle?' · shuffle':'';
    const ids=(x.videoIds||[]).join(', ');
    return `<div class="card nbl-diag-card">
      <div class="nbl-diag-head"><div><div class="category-index">#${i+1} · ${safe(actionText(x))}</div><h3>${safe(x.sourceName||'Playback')}</h3><div class="subtle">${safe(timeText(x.startedAt))}${safe(from)}${safe(shuffle)}${safe(mode)}</div></div><span class="badge ${statusClass(x.launchStatus)}">${safe(statusText(x.launchStatus))}</span></div>
      <div class="nbl-diag-grid"><div><b>${Number(x.queueCount)||0}</b><span>mục trong queue</span></div><div><b>${safe(x.firstTitle||x.firstVideoId||'—')}</b><span>bài đầu</span></div><div><b>${safe(connectionText(x.connection)||'Không rõ')}</b><span>kết nối lúc bấm phát</span></div></div>
      <details class="nbl-diag-details"><summary>Chi tiết kỹ thuật</summary><div><b>Video ID đầu:</b> ${safe(x.firstVideoId||'—')}</div><div><b>Trạng thái:</b> ${safe(x.launchStatus||'created')}</div>${ids?`<div><b>Video IDs:</b> ${safe(ids)}</div>`:''}<div class="nbl-diag-url"><b>URL:</b> ${safe(x.url||'—')}</div></details>
    </div>`;
  }
  function renderPanel(){
    const logs=E.diagnostics();
    return `<section class="nbl-diag-section" data-nbl-diagnostics-panel><div class="section-title"><div><h2>Nhật ký Chẩn đoán Playback</h2><div class="subtle">Lưu tối đa ${E.DIAGNOSTIC_LIMIT} lần phát gần nhất trên slot hiện tại</div></div><div class="toolbar nbl-diag-actions"><button class="ghost" data-diag-copy ${logs.length?'':'disabled'}>Sao chép JSON</button><button class="danger" data-diag-clear ${logs.length?'':'disabled'}>Xóa nhật ký</button></div></div><div class="notice">Dùng phần này khi Vivaldi không mở, không tự phát tiếp hoặc dừng giữa chừng. Trạng thái “Đã bàn giao Vivaldi” chỉ xác nhận iOS đã chuyển app sang nền/trình duyệt khác; nó không chứng minh YouTube đã phát hết toàn bộ queue.</div><div class="nbl-diag-list">${logs.length?logs.map(renderEntry).join(''):'<div class="empty">Chưa có dữ liệu. Hãy phát một video hoặc danh sách để tạo bản ghi đầu tiên.</div>'}</div></section>`;
  }
  function ensurePanel(){
    if(view.tab!=='settings')return;
    const shell=document.querySelector('#app .shell');
    if(!shell)return;
    let panel=shell.querySelector('[data-nbl-diagnostics-panel]');
    const html=renderPanel();
    if(panel){panel.outerHTML=html;}
    else shell.insertAdjacentHTML('beforeend',html);
    document.querySelectorAll('#app .subtle').forEach(el=>{
      if(/^Phiên bản\s+/i.test(el.textContent||''))el.textContent='Phiên bản 1.8.0 · Playback Diagnostics';
    });
  }
  async function copyLogs(){
    const text=JSON.stringify(E.diagnostics(),null,2);
    try{await navigator.clipboard.writeText(text);toast('Đã sao chép nhật ký Playback');}
    catch{toast('Không thể sao chép tự động');}
  }

  document.addEventListener('click',e=>{
    const copy=e.target.closest('[data-diag-copy]');
    if(copy){e.preventDefault();copyLogs();return;}
    const clear=e.target.closest('[data-diag-clear]');
    if(clear){
      e.preventDefault();
      if(confirm('Xóa toàn bộ nhật ký Playback của slot hiện tại?')){
        E.clearDiagnostics();ensurePanel();toast('Đã xóa nhật ký Playback');
      }
    }
  });

  if(typeof render==='function'){
    const baseRender=render;
    render=function(...args){
      const out=baseRender(...args);
      if(view.tab==='settings')setTimeout(ensurePanel,0);
      return out;
    };
  }
  window.addEventListener('nbl:playback-diagnostic',()=>ensurePanel());
  window.NBL_PLAYBACK_DIAGNOSTICS_UI={render:renderPanel,refresh:ensurePanel};
  render();
})();
