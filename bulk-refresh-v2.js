// News By Listening v1.7.0 - global refresh action without DOM-structure assumptions
(function(){
  'use strict';

  let busy=false;
  let done=0;
  let total=0;
  let label='';
  const errors=[];

  function progressText(){
    if(!busy)return '↻ Cập Nhật Link';
    return `↻ ${done}/${Math.max(total,1)}${label?` · ${label}`:''}`;
  }

  if(typeof shell==='function'){
    const baseShell=shell;
    shell=function(content){
      const html=baseShell(content);
      const button=`<button class="ghost nbl-bulk-refresh-btn" data-action="bulk-refresh-links" ${busy?'disabled':''} style="padding:8px 10px;font-size:12px;white-space:nowrap">${esc(progressText())}</button>`;
      return html.replace('</header>',`${button}</header>`);
    };
  }

  function updateButton(){
    document.querySelectorAll('[data-action="bulk-refresh-links"]').forEach(btn=>{
      btn.disabled=busy;
      btn.textContent=progressText();
      btn.title=busy?'Đang cập nhật toàn bộ nguồn YouTube và DS phát':'Cập nhật toàn bộ kênh, playlist và metadata video trong DS phát';
    });
  }

  function uniqueQueueVideoIds(){
    const ids=[];
    const seen=new Set();
    for(const q of state.customPlaylists||[]){
      for(const v of q.videos||[]){
        const id=v?.videoId;
        if(id&&!seen.has(id)){seen.add(id);ids.push(id);}
      }
    }
    return ids;
  }

  async function refreshLibraryItem(item){
    if(item.kind==='channel'){
      await resolveItem(item);
      await loadChannelVideos(item);
      return;
    }
    if(item.kind==='playlist'){
      await resolveItem(item);
      await loadPlaylistVideos(item);
      return;
    }
    if(item.kind==='video'){
      const parsed=parseYouTubeUrl(item.url||'');
      const videoId=item.videoId||parsed.videoId;
      if(!videoId)throw new Error('Không xác định được videoId');
      const p=await yt('videos',{part:'snippet,contentDetails',id:videoId,maxResults:1});
      const x=p.items?.[0];
      if(!x)throw new Error('Video không còn công khai hoặc không tồn tại');
      item.videoId=videoId;
      item.title=x.snippet?.title||item.title;
      item.thumbnail=x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url||ytThumb(videoId);
      item.lastFetchedAt=new Date().toISOString();
    }
  }

  async function refreshQueueMetadata(ids){
    const meta=new Map();
    for(let i=0;i<ids.length;i+=50){
      const chunk=ids.slice(i,i+50);
      label=`DS phát ${Math.min(i+50,ids.length)}/${ids.length}`;
      updateButton();
      try{
        const data=await yt('videos',{part:'snippet,contentDetails',id:chunk.join(','),maxResults:chunk.length});
        for(const x of data.items||[]){
          meta.set(x.id,{
            title:x.snippet?.title||'',
            channelTitle:x.snippet?.channelTitle||'',
            thumbnail:x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url||ytThumb(x.id),
            duration:x.contentDetails?.duration||''
          });
        }
      }catch(e){errors.push(`DS phát ${i+1}-${Math.min(i+50,ids.length)}: ${e?.message||e}`);}
      done++;
      updateButton();
    }

    let updated=0;
    for(const q of state.customPlaylists||[]){
      for(const v of q.videos||[]){
        const m=meta.get(v.videoId);
        if(!m)continue;
        v.title=m.title||v.title;
        v.channelTitle=m.channelTitle||v.channelTitle;
        v.thumbnail=m.thumbnail||v.thumbnail;
        v.duration=m.duration||v.duration;
        updated++;
      }
      q.updatedAt=new Date().toISOString();
    }
    return updated;
  }

  async function refreshAllLinks(){
    if(busy)return;
    if(!navigator.onLine)return toast('Thiết bị đang offline');

    busy=true;done=0;errors.length=0;label='Bắt đầu';
    const items=[...(state.items||[])];
    const queueIds=uniqueQueueVideoIds();
    total=items.length+Math.ceil(queueIds.length/50);
    updateButton();

    let refreshedItems=0;
    let refreshedQueueVideos=0;
    try{
      for(let i=0;i<items.length;i++){
        const item=items[i];
        label=`${i+1}/${items.length} ${item.title||'Nguồn YouTube'}`;
        updateButton();
        try{await refreshLibraryItem(item);refreshedItems++;}
        catch(e){errors.push(`${item.title||item.url||'Nguồn YouTube'}: ${e?.message||e}`);}
        done++;
        updateButton();
      }
      if(queueIds.length)refreshedQueueVideos=await refreshQueueMetadata(queueIds);
      state.lastBulkRefreshAt=new Date().toISOString();
      save();
    }finally{
      busy=false;label='';
      window.NBL_BULK_REFRESH_LAST_ERRORS=[...errors];
      render();
      updateButton();
    }

    if(errors.length){
      toast(`Đã cập nhật ${refreshedItems} nguồn + ${refreshedQueueVideos} video · lỗi ${errors.length}`);
      console.warn('[NBL] Bulk refresh errors',errors);
    }else{
      toast(`Đã cập nhật ${refreshedItems} nguồn + ${refreshedQueueVideos} video trong DS phát`);
    }
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-action="bulk-refresh-links"]');
    if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();
    refreshAllLinks();
  },true);

  window.NBL_BULK_REFRESH={run:refreshAllLinks,get busy(){return busy;}};
  render();
})();
