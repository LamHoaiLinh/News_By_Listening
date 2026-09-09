// News By Listening v1.6.0 - silent new-video scanner for YouTube channels
(function(){
  const SCAN_INTERVAL_MS=2*60*60*1000;
  const CHECK_TICK_MS=5*60*1000;
  let busy=false;

  function ensureState(){
    state.autoScan ||= {lastRunAt:null,items:{}};
    state.autoScan.items ||= {};
    return state.autoScan;
  }
  function infoFor(id){
    const root=ensureState();
    root.items[id] ||= {knownIds:[],newIds:[],lastScanAt:null,lastOpenedAt:null};
    return root.items[id];
  }
  function idsOf(videos){return (videos||[]).map(v=>v?.videoId).filter(Boolean);}
  function pendingCount(item){return infoFor(item.id).newIds.length;}
  function isDue(){
    const last=Date.parse(ensureState().lastRunAt||'')||0;
    return !last || Date.now()-last>=SCAN_INTERVAL_MS;
  }
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

  async function scanChannel(item){
    const info=infoFor(item.id);
    const oldIds=idsOf(item.videos);
    const previous=info.knownIds.length?info.knownIds:oldIds;
    const hadBaseline=info.knownIds.length>0||oldIds.length>0;

    await loadChannelVideos(item); // replaces item.videos with exactly the latest 30
    const current=idsOf(item.videos);
    const currentSet=new Set(current);
    const fresh=hadBaseline?current.filter(id=>!previous.includes(id)):[];
    const pending=new Set((info.newIds||[]).filter(id=>currentSet.has(id)));
    fresh.forEach(id=>pending.add(id));

    // If the channel is currently open, consider the refreshed list seen immediately.
    if(view.itemId===item.id) pending.clear();

    info.knownIds=current.slice(0,30);
    info.newIds=current.filter(id=>pending.has(id)).slice(0,30);
    info.lastScanAt=new Date().toISOString();
  }

  async function scanAll({force=false}={}){
    if(busy||!navigator.onLine)return;
    if(!force&&!isDue())return;
    busy=true;
    const root=ensureState();
    try{
      const channels=state.items.filter(x=>x.kind==='channel');
      for(const item of channels){
        try{await scanChannel(item);}catch{}
        await sleep(120);
      }
      root.lastRunAt=new Date().toISOString();
      save();
      if(view.tab==='library'&&view.categoryId&&!view.itemId)render();
    }finally{busy=false;}
  }

  function markChannelSeen(item){
    if(!item||item.kind!=='channel')return;
    const info=infoFor(item.id);
    info.newIds=[];
    info.knownIds=idsOf(item.videos).slice(0,30);
    info.lastOpenedAt=new Date().toISOString();
    save();
  }

  function scannerStatusText(){
    const last=Date.parse(ensureState().lastRunAt||'')||0;
    if(!last)return 'Tự quét khoảng 2 giờ/lần · chưa quét lần đầu';
    const mins=Math.max(0,Math.floor((Date.now()-last)/60000));
    if(mins<1)return 'Tự quét khoảng 2 giờ/lần · vừa quét';
    if(mins<60)return `Tự quét khoảng 2 giờ/lần · quét ${mins} phút trước`;
    const h=Math.floor(mins/60);
    return `Tự quét khoảng 2 giờ/lần · quét ${h} giờ trước`;
  }

  // Replace category rendering only to add per-channel in-app new-video counters.
  renderCategory=function(){
    const c=state.categories.find(x=>x.id===view.categoryId);
    if(!c){view.categoryId=null;return renderLibrary();}
    const items=categoryItems(c.id);
    return shell(`<button class="ghost back" data-action="back-library">← Phân loại</button><div class="section-title"><div><h2>${esc(c.name)}</h2><div class="subtle">Cấp 2 · Kênh YouTube hoặc playlist</div><div class="nbl-scan-status">${esc(scannerStatusText())} · chỉ báo trong app, không push notification</div></div><button class="primary" data-action="add-item">+ Dán link</button></div><div class="entry-list">${items.map(item=>{const n=item.kind==='channel'?pendingCount(item):0;return `<div class="card entry"><img class="thumb" src="${esc(item.thumbnail||'./icon.svg')}" alt=""><div>${n?`<div class="nbl-new-video-badge">${n} VIDEO MỚI</div>`:''}<h3>${esc(item.title)}</h3><div class="meta">${item.kind==='channel'?'Kênh YouTube':item.kind==='playlist'?'Playlist':'Video'}${item.kind==='playlist'&&item.totalVideos!=null?' · '+item.totalVideos+' video':''}</div></div><div class="row-actions"><button class="ghost" data-open-item="${item.id}">Mở</button><button class="iconbtn" data-edit-item="${item.id}">Sửa</button></div></div>`}).join('')}</div>${items.length?'':'<div class="empty">Dán link kênh hoặc playlist YouTube để bắt đầu.</div>'}`);
  };

  // Clear the badge as soon as the user opens that channel.
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-open-item]');
    if(!btn)return;
    const item=state.items.find(x=>x.id===btn.dataset.openItem);
    markChannelSeen(item);
  },true);

  // Update version text without disturbing the existing settings renderer stack.
  if(typeof render==='function'){
    const baseRender=render;
    render=function(...args){
      const out=baseRender(...args);
      if(view.tab==='settings'){
        document.querySelectorAll('.subtle').forEach(el=>{
          if(/^Phiên bản\s+/i.test(el.textContent||''))el.textContent='Phiên bản 1.6.0 · Tự quét video mới 2 giờ/lần';
        });
      }
      return out;
    };
  }

  window.NBL_AUTO_SCANNER={scanNow:()=>scanAll({force:true}),scanIfDue:()=>scanAll({force:false}),pendingCount};

  // First catch-up scan after startup, then periodic checks while the app is alive.
  setTimeout(()=>scanAll({force:false}),1800);
  setInterval(()=>scanAll({force:false}),CHECK_TICK_MS);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scanAll({force:false});});
  window.addEventListener('online',()=>scanAll({force:false}));

  ensureState();
  save();
  render();
})();
