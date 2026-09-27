// News By Listening v1.12.1 - slot switcher + copy/paste merge
(function(){
  if(!window.NBL_SLOTS) return;

  const ORDER_KEY='nbl_slot_order_v1';
  const CLIPBOARD_KEY='nbl_slot_clipboard_v1';

  function slotMeta(){ return NBL_SLOTS.getMeta(); }
  function activeSlot(){ return NBL_SLOTS.active(); }
  function activeName(){
    const meta=slotMeta();
    return meta.slots.find(x=>x.id===activeSlot())?.name||`Người dùng ${activeSlot()}`;
  }
  function getOrder(){
    const valid=Array.from({length:NBL_SLOTS.count},(_,i)=>i+1);
    try{
      const parsed=JSON.parse(NBL_SLOTS.rawGet(ORDER_KEY)||'[]');
      const order=[];
      for(const x of Array.isArray(parsed)?parsed:[]){
        const id=Number(x);
        if(valid.includes(id)&&!order.includes(id)) order.push(id);
      }
      for(const id of valid) if(!order.includes(id)) order.push(id);
      return order;
    }catch{return valid;}
  }
  function setOrder(order){
    NBL_SLOTS.rawSet(ORDER_KEY,JSON.stringify(order));
  }
  function orderedSlots(meta){
    const byId=new Map(meta.slots.map(s=>[s.id,s]));
    return getOrder().map(id=>byId.get(id)).filter(Boolean);
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

  function clone(value){return JSON.parse(JSON.stringify(value));}
  function freshId(prefix='copy'){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}
  function norm(value){return String(value||'').trim().toLocaleLowerCase('vi-VN');}
  function readSlotState(slot){
    try{
      const raw=NBL_SLOTS.rawGet(NBL_SLOTS.physicalKey(slot));
      if(!raw)return {categories:[],items:[],history:[],prefs:{},customPlaylists:[]};
      const s=JSON.parse(raw);
      s.categories=Array.isArray(s.categories)?s.categories:[];
      s.items=Array.isArray(s.items)?s.items:[];
      s.history=Array.isArray(s.history)?s.history:[];
      s.prefs=s.prefs&&typeof s.prefs==='object'?s.prefs:{};
      s.customPlaylists=Array.isArray(s.customPlaylists)?s.customPlaylists:[];
      return s;
    }catch{return {categories:[],items:[],history:[],prefs:{},customPlaylists:[]};}
  }
  function writeSlotState(slot,data){NBL_SLOTS.rawSet(NBL_SLOTS.physicalKey(slot),JSON.stringify(data));}
  function readClipboard(){
    try{
      const x=JSON.parse(NBL_SLOTS.rawGet(CLIPBOARD_KEY)||'null');
      return x&&typeof x==='object'&&Array.isArray(x.categories)&&Array.isArray(x.items)?x:null;
    }catch{return null;}
  }
  function copySlotData(id){
    const source=readSlotState(id),meta=slotMeta(),slot=meta.slots.find(x=>x.id===id);
    const payload={
      version:1,sourceSlot:id,sourceName:slot?.name||`Người dùng ${id}`,copiedAt:new Date().toISOString(),
      categories:clone(source.categories||[]),
      items:clone(source.items||[]),
      customPlaylists:clone(source.customPlaylists||[])
    };
    NBL_SLOTS.rawSet(CLIPBOARD_KEY,JSON.stringify(payload));
    toast(`Đã copy danh sách của ${payload.sourceName}`);
    showSlots();
  }
  function mergeVideos(targetVideos,sourceVideos){
    const out=Array.isArray(targetVideos)?targetVideos:[];
    const seen=new Set(out.map(v=>String(v?.videoId||'')).filter(Boolean));
    let added=0;
    for(const src of sourceVideos||[]){
      const id=String(src?.videoId||'');
      if(!id||seen.has(id))continue;
      const v=clone(src);
      if(v.id)v.id=freshId('qv');
      out.push(v);seen.add(id);added++;
    }
    return {videos:out,added};
  }
  function pasteSlotData(id){
    const clip=readClipboard();if(!clip)return toast('Hãy Copy từ một người dùng trước');
    const meta=slotMeta(),targetMeta=meta.slots.find(x=>x.id===id);
    if(!confirm(`Dán thêm danh sách từ “${clip.sourceName}” vào “${targetMeta?.name||'Người dùng '+id}”?\n\nDữ liệu hiện có sẽ được giữ; mục trùng sẽ không tạo thêm.`))return;
    const target=readSlotState(id);
    const categoryMap=new Map();
    let addedCats=0,addedItems=0,addedQueues=0,addedVideos=0;

    for(const sc of clip.categories||[]){
      const same=(target.categories||[]).find(tc=>norm(tc.name)===norm(sc.name));
      if(same){categoryMap.set(String(sc.id),same.id);continue;}
      const nc={...clone(sc),id:freshId('cat')};
      target.categories.push(nc);categoryMap.set(String(sc.id),nc.id);addedCats++;
    }

    let fallbackCategoryId='';
    function targetCategoryFor(sourceCategoryId){
      const mapped=categoryMap.get(String(sourceCategoryId||''));
      if(mapped)return mapped;
      if(fallbackCategoryId)return fallbackCategoryId;
      let fallback=target.categories.find(x=>norm(x.name)==='đã sao chép');
      if(!fallback){fallback={id:freshId('cat'),name:'Đã sao chép'};target.categories.push(fallback);addedCats++;}
      fallbackCategoryId=fallback.id;return fallbackCategoryId;
    }

    for(const si of clip.items||[]){
      const catId=targetCategoryFor(si.categoryId);
      const duplicate=(target.items||[]).some(ti=>
        (si.url&&ti.url===si.url) ||
        (si.playlistId&&ti.playlistId===si.playlistId) ||
        (si.channelId&&ti.channelId===si.channelId)
      );
      if(duplicate)continue;
      const ni={...clone(si),id:freshId('item'),categoryId:catId};
      target.items.push(ni);addedItems++;
    }

    for(const sq of clip.customPlaylists||[]){
      const same=(target.customPlaylists||[]).find(tq=>norm(tq.name)===norm(sq.name));
      if(same){
        const merged=mergeVideos(same.videos||[],sq.videos||[]);
        same.videos=merged.videos;same.updatedAt=new Date().toISOString();addedVideos+=merged.added;
      }else{
        const nq={...clone(sq),id:freshId('queue'),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        const merged=mergeVideos([],sq.videos||[]);
        nq.videos=merged.videos;addedVideos+=merged.added;
        target.customPlaylists.push(nq);addedQueues++;
      }
    }

    writeSlotState(id,target);
    toast(`Đã dán thêm: +${addedCats} phân loại · +${addedItems} mục · +${addedQueues} DS phát · +${addedVideos} video`);
    if(id===activeSlot())setTimeout(()=>location.reload(),350);else showSlots();
  }

  function showSlots(){
    document.querySelector('.nbl-slot-modalback')?.remove();
    const meta=slotMeta(), current=activeSlot(), slots=orderedSlots(meta),clip=readClipboard();
    const root=document.createElement('div');
    root.className='modalback nbl-slot-modalback';
    const clipText=clip?` · Đã copy: <b>${esc(clip.sourceName)}</b> (dùng “Dán thêm” ở tài khoản đích)`:' · Chưa copy dữ liệu';
    root.innerHTML=`<div class="modal nbl-slot-modal"><div class="section-title"><div><h2>6 người dùng</h2><div class="subtle">Đổi tên, sắp thứ tự, Copy và Dán thêm · dữ liệu từng slot vẫn độc lập${clipText}</div></div></div><div class="nbl-slot-list">${slots.map((s,pos)=>`<div class="card nbl-slot-card ${s.id===current?'active':''}"><div class="nbl-slot-info"><div class="category-index">VỊ TRÍ ${pos+1} · SLOT ${s.id}${s.id===current?' · ĐANG DÙNG':''}</div><h3>${esc(s.name)}</h3><div class="subtle">${esc(summary(s.id))}</div></div><div class="row-actions nbl-slot-actions"><button class="ghost nbl-slot-small" title="Đưa lên" data-slot-move="up" data-slot-id="${s.id}" ${pos===0?'disabled':''}>↑</button><button class="ghost nbl-slot-small" title="Đưa xuống" data-slot-move="down" data-slot-id="${s.id}" ${pos===slots.length-1?'disabled':''}>↓</button><button class="ghost nbl-slot-small" title="Đổi tên" data-slot-rename="${s.id}">Tên</button><button class="ghost nbl-slot-small" title="Copy toàn bộ phân loại, mục và danh sách phát" data-slot-copy="${s.id}">Copy</button><button class="ghost nbl-slot-small" title="Dán thêm, không ghi đè dữ liệu hiện có" data-slot-paste="${s.id}" ${!clip||clip.sourceSlot===s.id?'disabled':''}>Dán thêm</button>${s.id===current?'<span class="badge green">Hiện tại</span>':`<button class="primary nbl-slot-small" data-slot-switch="${s.id}">Dùng</button>`}</div></div>`).join('')}</div><div class="notice"><b>Dán thêm</b> giữ nguyên dữ liệu tài khoản đích. Phân loại cùng tên sẽ gộp; mục/video trùng sẽ bỏ qua; danh sách phát cùng tên sẽ nối thêm video chưa có.</div><div class="modal-actions"><button class="ghost" data-slot-close>Đóng</button></div></div>`;
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

  function moveSlot(id,direction){
    const order=getOrder();
    const i=order.indexOf(id);
    if(i<0) return;
    const j=direction==='up'?i-1:i+1;
    if(j<0||j>=order.length) return;
    [order[i],order[j]]=[order[j],order[i]];
    setOrder(order);
    showSlots();
  }

  function switchSlot(id){
    if(id===activeSlot()) return;
    try{ save(); }catch{}
    NBL_SLOTS.setActive(id);
    location.reload();
  }

  // Wrap the final shell so the slot selector appears on every screen.
  if(typeof shell==='function'){
    const baseShell=shell;
    shell=function(content){
      const html=baseShell(content);
      const button=`<button class="nbl-slot-chip" data-slot-open title="Đổi người dùng"><span class="nbl-slot-dot">${activeSlot()}</span><span class="nbl-slot-name">${esc(activeName())}</span><span class="nbl-slot-caret">⌄</span></button>`;
      return html.replace(/<span class="badge green">([\s\S]*?)<\/span><\/header>/,`<div class="nbl-header-actions">${button}<span class="badge green">$1</span></div></header>`);
    };
  }

  // Active-slot sync also carries the preferred slot order.
  if(typeof syncPayload==='function'){
    const baseSyncPayload=syncPayload;
    syncPayload=function(...args){
      const data=baseSyncPayload(...args);
      data.slotName=activeName();
      data.slotNumber=activeSlot();
      data.slotOrder=getOrder();
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
      if(Array.isArray(data?.slotOrder)) setOrder(data.slotOrder);
      try{render();}catch{}
    };
  }

  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-slot-open]');
    if(open){e.preventDefault();e.stopImmediatePropagation();showSlots();return;}
    const mover=e.target.closest('[data-slot-move]');
    if(mover){e.preventDefault();e.stopImmediatePropagation();moveSlot(Number(mover.dataset.slotId),mover.dataset.slotMove);return;}
    const rename=e.target.closest('[data-slot-rename]');
    if(rename){e.preventDefault();e.stopImmediatePropagation();renameSlot(Number(rename.dataset.slotRename));return;}
    const copy=e.target.closest('[data-slot-copy]');
    if(copy){e.preventDefault();e.stopImmediatePropagation();copySlotData(Number(copy.dataset.slotCopy));return;}
    const paste=e.target.closest('[data-slot-paste]');
    if(paste){e.preventDefault();e.stopImmediatePropagation();pasteSlotData(Number(paste.dataset.slotPaste));return;}
    const sw=e.target.closest('[data-slot-switch]');
    if(sw){e.preventDefault();e.stopImmediatePropagation();switchSlot(Number(sw.dataset.slotSwitch));return;}
  },true);

  render();
})();
