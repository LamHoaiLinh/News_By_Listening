// News By Listening v1.4.0 - slot switcher UI
(function(){
  if(!window.NBL_SLOTS) return;

  function slotMeta(){ return NBL_SLOTS.getMeta(); }
  function activeSlot(){ return NBL_SLOTS.active(); }
  function activeName(){
    const meta=slotMeta();
    return meta.slots.find(x=>x.id===activeSlot())?.name||`Người dùng ${activeSlot()}`;
  }
  function summary(slot){
    try{
      const raw=NBL_SLOTS.rawGet(NBL_SLOTS.physicalKey(slot));
      if(!raw) return 'Chưa có dữ liệu';
      const s=JSON.parse(raw);
      const cats=Array.isArray(s.categories)?s.categories.length:0;
      const items=Array.isArray(s.items)?s.items.length:0;
      const queues=Array.isArray(s.customPlaylists)?s.customPlaylists.length:0;
      return `${cats} phân loại · ${items} mục · ${queues} DS phát`;
    }catch{return 'Có dữ liệu';}
  }

  function showSlots(){
    document.querySelector('.nbl-slot-modalback')?.remove();
    const meta=slotMeta(), current=activeSlot();
    const root=document.createElement('div');
    root.className='modalback nbl-slot-modalback';
    root.innerHTML=`<div class="modal nbl-slot-modal"><div class="section-title"><div><h2>6 người dùng</h2><div class="subtle">Mỗi slot có thư viện, DS phát, lịch sử và cài đặt riêng</div></div></div><div class="nbl-slot-list">${meta.slots.map(s=>`<div class="card nbl-slot-card ${s.id===current?'active':''}"><div><div class="category-index">SLOT ${s.id}${s.id===current?' · ĐANG DÙNG':''}</div><h3>${esc(s.name)}</h3><div class="subtle">${esc(summary(s.id))}</div></div><div class="row-actions"><button class="ghost" data-slot-rename="${s.id}">Đổi tên</button>${s.id===current?'<span class="badge green">Hiện tại</span>':`<button class="primary" data-slot-switch="${s.id}">Dùng slot này</button>`}</div></div>`).join('')}</div><div class="notice">Slot 1 giữ nguyên toàn bộ dữ liệu anh đã có trước khi nâng cấp. Khi chuyển slot, app sẽ tải lại để tách dữ liệu hoàn toàn.</div><div class="modal-actions"><button class="ghost" data-slot-close>Đóng</button></div></div>`;
    root.addEventListener('click',e=>{if(e.target===root||e.target.closest('[data-slot-close]'))root.remove();});
    document.body.appendChild(root);
  }

  function renameSlot(id){
    const meta=slotMeta();
    const slot=meta.slots.find(x=>x.id===id);
    if(!slot) return;
    const next=prompt(`Đổi tên Slot ${id}:`,slot.name);
    if(next===null) return;
    const name=next.trim().slice(0,40);
    if(!name) return toast('Tên slot không được để trống');
    slot.name=name;
    NBL_SLOTS.setMeta(meta);
    document.querySelector('.nbl-slot-modalback')?.remove();
    render();
    showSlots();
  }

  function switchSlot(id){
    if(id===activeSlot()) return;
    try{ save(); }catch{}
    NBL_SLOTS.setActive(id);
    location.reload();
  }

  // Wrap the final shell (after Vivaldi modules) so the slot selector appears on every screen.
  if(typeof shell==='function'){
    const baseShell=shell;
    shell=function(content){
      const html=baseShell(content);
      const button=`<button class="nbl-slot-chip" data-slot-open title="Đổi người dùng"><span class="nbl-slot-dot">${activeSlot()}</span><span class="nbl-slot-name">${esc(activeName())}</span><span class="nbl-slot-caret">⌄</span></button>`;
      return html.replace(/<span class="badge green">([\s\S]*?)<\/span><\/header>/,`<div class="nbl-header-actions">${button}<span class="badge green">$1</span></div></header>`);
    };
  }

  // Add slot identity to active-slot sync payload only.
  if(typeof syncPayload==='function'){
    const baseSyncPayload=syncPayload;
    syncPayload=function(...args){
      const data=baseSyncPayload(...args);
      data.slotName=activeName();
      data.slotNumber=activeSlot();
      return data;
    };
  }
  if(typeof applyImport==='function'){
    const baseApplyImport=applyImport;
    applyImport=function(data){
      baseApplyImport(data);
      if(data?.slotName){
        const meta=slotMeta();
        const slot=meta.slots.find(x=>x.id===activeSlot());
        if(slot){slot.name=String(data.slotName).slice(0,40);NBL_SLOTS.setMeta(meta);}
      }
      try{render();}catch{}
    };
  }

  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-slot-open]');
    if(open){e.preventDefault();e.stopImmediatePropagation();showSlots();return;}
    const rename=e.target.closest('[data-slot-rename]');
    if(rename){e.preventDefault();e.stopImmediatePropagation();renameSlot(Number(rename.dataset.slotRename));return;}
    const sw=e.target.closest('[data-slot-switch]');
    if(sw){e.preventDefault();e.stopImmediatePropagation();switchSlot(Number(sw.dataset.slotSwitch));return;}
  },true);

  // Refresh once so the slot button is visible immediately after upgrade.
  render();
})();
