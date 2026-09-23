// News By Listening v1.10.1 - silent scanner that augments, never replaces, Library UI
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

    await loadChannelVideos(item);
    const current=idsOf(item.videos);
    const currentSet=new Set(current);
    const fresh=hadBaseline?current.filter(id=>!previous.includes(id)):[];
    const pending=new Set((info.newIds||[]).filter(id=>currentSet.has(id)));
    fresh.forEach(id=>pending.add(id));

    if(view.itemId===item.id)pending.clear();

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

  function enhanceCategoryScanner(){
    if(view.tab!=='library'||!view.categoryId||view.itemId)return;
    const titleBlock=document.querySelector('#app .section-title > div');
    if(titleBlock&&!titleBlock.querySelector('.nbl-scan-status')){
      const status=document.createElement('div');
      status.className='nbl-scan-status';
      status.textContent=`${scannerStatusText()} · chỉ báo trong app, không push notification`;
      titleBlock.appendChild(status);
    }
    document.querySelectorAll('#app .entry-list .card.entry').forEach(row=>{
      const open=row.querySelector('[data-open-item]');
      const item=open?state.items.find(x=>x.id===open.dataset.openItem):null;
      if(!item||item.kind!=='channel')return;
      const n=pendingCount(item);
      row.querySelector('.nbl-new-video-badge')?.remove();
      if(!n)return;
      const info=row.querySelector('img.thumb')?.nextElementSibling;
      const h3=info?.querySelector('h3');
      if(!info||!h3)return;
      const badge=document.createElement('div');
      badge.className='nbl-new-video-badge';
      badge.textContent=`${n} VIDEO MỚI`;
      info.insertBefore(badge,h3);
    });
  }

  // Do not replace renderCategory(). The base Library renderer owns ordering controls
  // and future Library features; the scanner only decorates the rendered DOM.
  if(typeof render==='function'){
    const baseRender=render;
    render=function(...args){
      const out=baseRender(...args);
      enhanceCategoryScanner();
      return out;
    };
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-open-item]');
    if(!btn)return;
    const item=state.items.find(x=>x.id===btn.dataset.openItem);
    markChannelSeen(item);
  },true);

  window.NBL_AUTO_SCANNER={scanNow:()=>scanAll({force:true}),scanIfDue:()=>scanAll({force:false}),pendingCount};

  setTimeout(()=>scanAll({force:false}),1800);
  setInterval(()=>scanAll({force:false}),CHECK_TICK_MS);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scanAll({force:false});});
  window.addEventListener('online',()=>scanAll({force:false}));

  ensureState();
  save();
  render();
})();
