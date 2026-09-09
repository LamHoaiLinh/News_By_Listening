// News By Listening v1.4.1 - slot switcher UI + custom slot ordering
(function(){
  if(!window.NBL_SLOTS) return;

  const ORDER_KEY='nbl_slot_order_v1';

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

  function showSlots(){
    document.querySelector('.nbl-slot-modalback')?.remove();
    const meta=slotMeta(), current=activeSlot(), slots=orderedSlots(meta);
    const root=document.createElement('div');
    root.className='modalback nbl-slot-modalback';
    root.innerHTML=`<div class="modal nbl-slot-modal"><div class="section-title"><div><h2>6 người dùng</h2><div class="subtle">Đổi tên và sắp thứ tự tùy ý · dữ liệu từng slot vẫn độc lập</div></div></div><div class="nbl-slot-list">${slots.map((s,pos)=>`<div class="card nbl-slot-card ${s.id===current?'active':''}"><div><div class="category-index">VỊ TRÍ ${pos+1} · SLOT ${s.id}${s.id===current?' · ĐANG DÙNG':''}</div><h3>${esc(s.name)}</h3><div class="subtle">${esc(summary(s.id))}</div></div><div class="row-actions"><button class="ghost" data-slot-move="up" data-slot-id="${s.id}" ${pos===0?'disabled':''}>↑ Lên</button><button class="ghost" data-slot-move="down" data-slot-id="${s.id}" ${pos===slots.length-1?'disabled':''}>↓ Xuống</button><button class="ghost" data-slot-rename="${s.id}">Đổi tên</button>${s.id===current?'<span class="badge green">Hiện tại</span>':`<button class="primary" data-slot-switch="${s.id}">Dùng slot này</button>`}</div></div>`).join('')}</div><div class="notice">Thứ tự hiển thị có thể đổi tự do nhưng ID slot vẫn cố định để dữ liệu không bị tráo. Slot 1 vẫn giữ nguyên dữ liệu cũ trước khi nâng cấp.</div><div class="modal-actions"><button class="ghost" data-slot-close>Đóng</button></div></div>`;
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
    const sw=e.target.closest('[data-slot-switch]');
    if(sw){e.preventDefault();e.stopImmediatePropagation();switchSlot(Number(sw.dataset.slotSwitch));return;}
  },true);

  render();
})();
