// News By Listening v1.12.0 - listen status + manual status cycle
(function(){
  'use strict';

  const BASE_KEY='nbl_listen_status_v1';
  const activeSlot=()=>window.NBL_SLOTS?.active?.()||1;
  const KEY=activeSlot()===1?BASE_KEY:`${BASE_KEY}_slot_${activeSlot()}`;
  const STATUSES=['none','listening','done'];
  const AUTO_LISTENING_AT_RATIO=0.05;
  const AUTO_DONE_AT_RATIO=0.95;
  const LABELS={none:'Chưa nghe',listening:'Đang nghe',done:'Đã xong'};

  function blank(){return {v:1,videos:{},items:{},queues:{}};}
  function normalizeStatus(value){return STATUSES.includes(value)?value:'none';}
  function normalizeRecord(value){
    if(!value||typeof value!=='object')return null;
    return {
      status:normalizeStatus(value.status),
      statusUpdatedAt:String(value.statusUpdatedAt||value.updatedAt||''),
      position:Number(value.position)||0,
      duration:Number(value.duration)||0,
      positionUpdatedAt:String(value.positionUpdatedAt||''),
      source:String(value.source||'')
    };
  }
  function load(){
    try{
      const parsed=JSON.parse(localStorage.getItem(KEY)||'null');
      const data=parsed&&typeof parsed==='object'?parsed:blank();
      data.videos=data.videos&&typeof data.videos==='object'?data.videos:{};
      data.items=data.items&&typeof data.items==='object'?data.items:{};
      data.queues=data.queues&&typeof data.queues==='object'?data.queues:{};
      data.v=1;
      return data;
    }catch{return blank();}
  }
  function save(data){
    try{
      localStorage.setItem(KEY,JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('nbl:listen-status-change'));
      return true;
    }catch{return false;}
  }
  function nextStatus(current){
    const i=STATUSES.indexOf(normalizeStatus(current));
    return STATUSES[(i+1)%STATUSES.length];
  }
  function nowIso(){return new Date().toISOString();}

  function videoRecord(videoId){
    if(!videoId)return null;
    return normalizeRecord(load().videos[String(videoId)])||{status:'none',statusUpdatedAt:'',position:0,duration:0,positionUpdatedAt:'',source:''};
  }
  function videoStatus(videoId){return videoRecord(videoId)?.status||'none';}
  function setVideoStatus(videoId,status,source='manual'){
    if(!videoId)return 'none';
    const data=load(),id=String(videoId),prev=normalizeRecord(data.videos[id])||{};
    data.videos[id]={
      ...prev,
      status:normalizeStatus(status),
      statusUpdatedAt:nowIso(),
      source
    };
    save(data);
    return data.videos[id].status;
  }
  function cycleVideoStatus(videoId){return setVideoStatus(videoId,nextStatus(videoStatus(videoId)),'manual');}

  function markPlayback(videoId,currentTime=0,duration=0,{ended=false}={}){
    if(!videoId)return 'none';
    const data=load(),id=String(videoId),prev=normalizeRecord(data.videos[id])||{};
    const position=Math.max(0,Number(currentTime)||0),total=Math.max(0,Number(duration)||0);
    const oldStatus=normalizeStatus(prev.status);
    const manual=String(prev.source||'')==='manual';
    const ratio=total>0?Math.max(0,Math.min(1,position/total)):0;
    let status=oldStatus;
    if(!manual){
      if(ended||ratio>=AUTO_DONE_AT_RATIO)status='done';
      else if(ratio>=AUTO_LISTENING_AT_RATIO)status='listening';
    }
    const changed=status!==oldStatus;
    data.videos[id]={
      ...prev,
      status,
      statusUpdatedAt:changed?nowIso():String(prev.statusUpdatedAt||''),
      position,
      duration:total||Number(prev.duration)||0,
      positionUpdatedAt:nowIso(),
      source:manual?'manual':(changed?'auto':String(prev.source||''))
    };
    save(data);
    return status;
  }

  function latestChildStatusAt(videos){
    const data=load();
    let latest=0;
    for(const v of videos||[]){
      const rec=normalizeRecord(data.videos[String(v?.videoId||'')]);
      const t=Date.parse(rec?.statusUpdatedAt||'');
      if(Number.isFinite(t)&&t>latest)latest=t;
    }
    return latest;
  }
  function derivedStatus(videos){
    const ids=(videos||[]).map(v=>String(v?.videoId||'')).filter(Boolean);
    if(!ids.length)return 'none';
    const statuses=ids.map(videoStatus);
    if(statuses.every(s=>s==='done'))return 'done';
    if(statuses.some(s=>s==='listening'||s==='done'))return 'listening';
    return 'none';
  }
  function groupStatus(kind,id,videos){
    const data=load(),bucket=kind==='queue'?data.queues:data.items;
    const manual=normalizeRecord(bucket[String(id||'')]);
    const childStatus=derivedStatus(videos);
    const childAt=latestChildStatusAt(videos);
    const manualAt=Date.parse(manual?.statusUpdatedAt||'');
    if(manual&&Number.isFinite(manualAt)&&manualAt>=childAt)return manual.status;
    return childStatus;
  }
  function setGroupStatus(kind,id,status){
    if(!id)return 'none';
    const data=load(),bucket=kind==='queue'?data.queues:data.items,key=String(id);
    bucket[key]={status:normalizeStatus(status),statusUpdatedAt:nowIso(),source:'manual'};
    save(data);
    return bucket[key].status;
  }
  function cycleGroupStatus(kind,id,videos){return setGroupStatus(kind,id,nextStatus(groupStatus(kind,id,videos)));}

  function exportData(){return load();}
  function importData(value){
    if(!value||typeof value!=='object')return false;
    const data=blank();
    for(const [id,rec] of Object.entries(value.videos||{})){const n=normalizeRecord(rec);if(n)data.videos[id]=n;}
    for(const [id,rec] of Object.entries(value.items||{})){const n=normalizeRecord(rec);if(n)data.items[id]=n;}
    for(const [id,rec] of Object.entries(value.queues||{})){const n=normalizeRecord(rec);if(n)data.queues[id]=n;}
    return save(data);
  }
  function label(status){return LABELS[normalizeStatus(status)];}
  function tagClass(status){return `nbl-listen-tag is-${normalizeStatus(status)}`;}
  function applyTag(button,status){
    if(!button)return;
    const s=normalizeStatus(status);
    const cls=tagClass(s);
    const text=s==='none'?`○ ${label(s)}`:`● ${label(s)}`;
    if(button.className!==cls)button.className=cls;
    button.dataset.nblListenCurrent=s;
    if(button.textContent!==text)button.textContent=text;
    button.title='Nhấp để đổi: Chưa nghe → Đang nghe → Đã xong → Chưa nghe';
  }
  function makeTag(attrs,status){
    const b=document.createElement('button');
    b.type='button';
    b.dataset.nblListenGenerated='1';
    Object.entries(attrs).forEach(([k,v])=>b.dataset[k]=String(v));
    applyTag(b,status);
    return b;
  }
  function itemById(id){
    try{return (typeof state!=='undefined'&&Array.isArray(state.items))?state.items.find(x=>String(x.id)===String(id)):null;}catch{return null;}
  }
  function queueById(id){
    try{return (typeof state!=='undefined'&&Array.isArray(state.customPlaylists))?state.customPlaylists.find(x=>String(x.id)===String(id)):null;}catch{return null;}
  }
  function currentQueue(){
    try{return queueById(typeof view!=='undefined'?view.queueId:null);}catch{return null;}
  }

  function enhanceLibraryCards(root){
    root.querySelectorAll?.('[data-open-item]').forEach(card=>{
      const id=card.dataset.openItem,item=itemById(id);if(!item)return;
      if(card.querySelector(`[data-nbl-status-item="${String(id)}"]`))return;
      const info=Array.from(card.children).find(el=>el.tagName==='DIV'&&!el.classList.contains('row-actions'));
      if(!info)return;
      info.appendChild(makeTag({nblStatusItem:id},groupStatus('item',id,item.videos||[])));
    });
  }
  function enhanceLibraryVideos(root){
    root.querySelectorAll?.('[data-play-video]').forEach(playBtn=>{
      const card=playBtn.closest('.card.video'),idx=Number(playBtn.dataset.playVideo);
      const item=(typeof view!=='undefined')?itemById(view.itemId):null;
      const video=item?.videos?.[idx];if(!card||!video?.videoId)return;
      if(card.querySelector(`[data-nbl-status-video="${String(video.videoId)}"]`))return;
      const info=card.querySelector('.video-index')?.parentElement;
      if(info)info.appendChild(makeTag({nblStatusVideo:video.videoId},videoStatus(video.videoId)));
    });
  }
  function enhanceQueueCards(root){
    root.querySelectorAll?.('[data-q-open]').forEach(card=>{
      const id=card.dataset.qOpen,q=queueById(id);if(!q)return;
      if(card.querySelector(`[data-nbl-status-queue="${String(id)}"]`))return;
      const count=card.querySelector('.count');
      const tag=makeTag({nblStatusQueue:id},groupStatus('queue',id,q.videos||[]));
      if(count)count.insertAdjacentElement('afterend',tag);else card.appendChild(tag);
    });
  }
  function enhanceQueueVideos(root){
    const q=currentQueue();if(!q)return;
    root.querySelectorAll?.('.nbl-q-video[data-q-index]').forEach(card=>{
      const idx=Number(card.dataset.qIndex),video=q.videos?.[idx];if(!video?.videoId)return;
      if(card.querySelector(`[data-nbl-status-video="${String(video.videoId)}"]`))return;
      const info=card.querySelector('.video-index')?.parentElement;
      if(info)info.appendChild(makeTag({nblStatusVideo:video.videoId},videoStatus(video.videoId)));
    });
  }
  function enhanceDetailHeaders(root){
    try{
      if(typeof view==='undefined')return;
      if(view.tab==='library'&&view.itemId){
        const item=itemById(view.itemId),h2=root.querySelector('.card h2');
        if(item&&h2&&!h2.parentElement.querySelector('[data-nbl-detail-item-status]')){
          const tag=makeTag({nblStatusItem:item.id,nblDetailItemStatus:'1'},groupStatus('item',item.id,item.videos||[]));
          h2.insertAdjacentElement('afterend',tag);
        }
      }
      if(view.tab==='queues'&&view.queueId){
        const q=queueById(view.queueId),title=root.querySelector('.section-title h2');
        if(q&&title&&!title.parentElement.querySelector('[data-nbl-detail-queue-status]')){
          const tag=makeTag({nblStatusQueue:q.id,nblDetailQueueStatus:'1'},groupStatus('queue',q.id,q.videos||[]));
          title.insertAdjacentElement('afterend',tag);
        }
      }
    }catch{}
  }
  function enhance(){
    const root=document.getElementById('app');if(!root)return;
    enhanceLibraryCards(root);enhanceLibraryVideos(root);enhanceQueueCards(root);enhanceQueueVideos(root);enhanceDetailHeaders(root);
    refreshTags();
  }
  function refreshTags(){
    document.querySelectorAll?.('[data-nbl-status-video]').forEach(b=>applyTag(b,videoStatus(b.dataset.nblStatusVideo)));
    document.querySelectorAll?.('[data-nbl-status-item]').forEach(b=>{
      const item=itemById(b.dataset.nblStatusItem);if(item)applyTag(b,groupStatus('item',item.id,item.videos||[]));
    });
    document.querySelectorAll?.('[data-nbl-status-queue]').forEach(b=>{
      const q=queueById(b.dataset.nblStatusQueue);if(q)applyTag(b,groupStatus('queue',q.id,q.videos||[]));
    });
  }

  window.NBL_LISTEN_STATUS={
    version:'1.12.1',KEY,AUTO_LISTENING_AT_RATIO,AUTO_DONE_AT_RATIO,
    videoRecord,videoStatus,setVideoStatus,cycleVideoStatus,markPlayback,
    derivedStatus,groupStatus,setGroupStatus,cycleGroupStatus,
    exportData,importData,enhance,refreshTags
  };

  if(typeof syncPayload==='function'){
    const baseSyncPayload=syncPayload;
    syncPayload=function(...args){
      const payload=baseSyncPayload(...args);
      payload.v=Math.max(Number(payload.v)||0,5);
      payload.listenStatus=exportData();
      return payload;
    };
  }
  if(typeof applyImport==='function'){
    const baseApplyImport=applyImport;
    applyImport=function(data){
      const result=baseApplyImport(data);
      if(data?.listenStatus)importData(data.listenStatus);
      setTimeout(enhance,0);
      return result;
    };
  }

  document.addEventListener('click',e=>{
    const videoBtn=e.target.closest?.('[data-nbl-status-video]');
    if(videoBtn){
      e.preventDefault();e.stopPropagation();
      const status=cycleVideoStatus(videoBtn.dataset.nblStatusVideo);
      refreshTags();
      if(typeof toast==='function')toast(`Trạng thái: ${label(status)}`);
      return;
    }
    const itemBtn=e.target.closest?.('[data-nbl-status-item]');
    if(itemBtn){
      e.preventDefault();e.stopPropagation();
      const item=itemById(itemBtn.dataset.nblStatusItem);if(!item)return;
      const status=cycleGroupStatus('item',item.id,item.videos||[]);
      refreshTags();
      if(typeof toast==='function')toast(`Trạng thái: ${label(status)}`);
      return;
    }
    const queueBtn=e.target.closest?.('[data-nbl-status-queue]');
    if(queueBtn){
      e.preventDefault();e.stopPropagation();
      const q=queueById(queueBtn.dataset.nblStatusQueue);if(!q)return;
      const status=cycleGroupStatus('queue',q.id,q.videos||[]);
      refreshTags();
      if(typeof toast==='function')toast(`Trạng thái: ${label(status)}`);
    }
  },true);

  window.addEventListener('storage',e=>{if(e.key===KEY)setTimeout(()=>{enhance();refreshTags();},0);});
  window.addEventListener('nbl:listen-status-change',()=>setTimeout(()=>{enhance();refreshTags();},0));

  if(document.getElementById('app')){
    let scheduled=false;
    const schedule=()=>{if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;enhance();},0);};
    new MutationObserver(schedule).observe(document.getElementById('app'),{childList:true,subtree:true});
    schedule();
  }
})();