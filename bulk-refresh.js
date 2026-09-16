// News By Listening v1.6.2 - refresh all YouTube sources and saved queue metadata
(function(){
  let busy=false;
  let done=0;
  let total=0;
  let label='';
  const errors=[];

  function progressText(){
    if(!busy)return '↻ Cập Nhật Link';
    return `↻ ${done}/${Math.max(total,1)}${label?` · ${label}`:''}`;
  }

  function updateButton(){
    const btn=document.querySelector('[data-action="bulk-refresh-links"]');
    if(!btn)return;
    btn.disabled=busy;
    btn.textContent=progressText();
    btn.title=busy?'Đang cập nhật toàn bộ nguồn YouTube và danh sách phát':'Cập nhật toàn bộ kênh, playlist và thông tin video trong DS phát';
  }

  function enhanceTopbar(){
    const topbar=document.querySelector('.topbar');
    if(!topbar||topbar.querySelector('[data-action="bulk-refresh-links"]'))return;

    const btn=document.createElement('button');
    btn.className='ghost';
    btn.dataset.action='bulk-refresh-links';
    btn.style.padding='8px 10px';
    btn.style.fontSize='12px';
    btn.style.whiteSpace='nowrap';
    btn.textContent=progressText();

    const badge=topbar.querySelector('.badge');
    if(badge){
      let actions=topbar.querySelector('.nbl-top-actions');
      if(!actions){
        actions=document.createElement('div');
        actions.className='nbl-top-actions';
        actions.style.display='flex';
        actions.style.alignItems='center';
        actions.style.justifyContent='flex-end';
        actions.style.gap='7px';
        actions.style.flexWrap='wrap';
        topbar.insertBefore(actions,badge);
        actions.appendChild(badge);
      }
      actions.insertBefore(btn,actions.firstChild);
    }else{
      topbar.appendChild(btn);
    }
    updateButton();
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

  function isoDurationText(iso){
    return String(iso||'');
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
      item.thumbnail=x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url||ytThumb(videoId);
      if(!item.title||/^Video YouTube$/i.test(item.title))item.title=x.snippet?.title||item.title;
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
            duration:isoDurationText(x.contentDetails?.duration||'')
          });
        }
      }catch(e){
        errors.push(`DS phát ${i+1}-${Math.min(i+50,ids.length)}: ${e?.message||e}`);
      }
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

    busy=true;
    done=0;
    errors.length=0;
    const items=[...(state.items||[])];
    const queueIds=uniqueQueueVideoIds();
    total=items.length+Math.ceil(queueIds.length/50);
    label='Bắt đầu';
    updateButton();

    let refreshedItems=0;
    let refreshedQueueVideos=0;
    try{
      for(let i=0;i<items.length;i++){
        const item=items[i];
        label=`${i+1}/${items.length} ${item.title||'Nguồn YouTube'}`;
        updateButton();
        try{
          await refreshLibraryItem(item);
          refreshedItems++;
        }catch(e){
          errors.push(`${item.title||item.url||'Nguồn YouTube'}: ${e?.message||e}`);
        }
        done++;
        updateButton();
      }

      if(queueIds.length)refreshedQueueVideos=await refreshQueueMetadata(queueIds);
      state.lastBulkRefreshAt=new Date().toISOString();
      save();
    }finally{
      busy=false;
      label='';
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

  if(typeof render==='function'){
    const baseRender=render;
    render=function(...args){
      const out=baseRender(...args);
      enhanceTopbar();
      if(view.tab==='settings'){
        document.querySelectorAll('.subtle').forEach(el=>{
          if(/^Phiên bản\s+/i.test(el.textContent||''))el.textContent='Phiên bản 1.6.2 · Cập Nhật Link toàn bộ';
        });
        if(!document.querySelector('.nbl-autoplay-limit-note')){
          const card=document.querySelector('.card.form');
          if(card){
            const note=document.createElement('div');
            note.className='notice warn nbl-autoplay-limit-note';
            note.innerHTML='<b>Lưu ý khi nghe lâu:</b> YouTube có thể tự dừng Autoplay sau một thời gian không tương tác. News By Listening chỉ tạo hàng đợi và bàn giao sang Vivaldi; iOS có thể treo hoặc đóng PWA ở nền mà không ảnh hưởng dữ liệu đã lưu.';
            card.appendChild(note);
          }
        }
      }
      updateButton();
      return out;
    };
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-action="bulk-refresh-links"]');
    if(!btn)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    refreshAllLinks();
  },true);

  window.NBL_BULK_REFRESH={run:refreshAllLinks,get busy(){return busy;}};
  render();
})();
