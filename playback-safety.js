// News By Listening v1.6.1 - playback safety + duplicate-news filtering
(function(){
  const FETCH_LIMIT=50;
  const KEEP_LIMIT=30;

  function stripDiacritics(s){
    try{return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
    catch{return String(s||'');}
  }

  function normalizedTitle(title){
    return stripDiacritics(title)
      .toLowerCase()
      .replace(/https?:\/\/\S+/g,' ')
      .replace(/#[^\s#]+/g,' ')
      .replace(/\b\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\b/g,' ')
      .replace(/\b\d{1,2}:\d{2}\b/g,' ')
      .replace(/[^a-z0-9\s]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function titleTokens(title){
    return normalizedTitle(title).split(' ').filter(x=>x.length>1);
  }

  function sameDayish(a,b){
    const ta=Date.parse(a?.publishedAt||'')||0;
    const tb=Date.parse(b?.publishedAt||'')||0;
    if(!ta||!tb)return true;
    return Math.abs(ta-tb)<=36*60*60*1000;
  }

  function similarTopic(a,b){
    const na=normalizedTitle(a?.title), nb=normalizedTitle(b?.title);
    if(!na||!nb)return false;
    if(na===nb)return true;
    if(!sameDayish(a,b))return false;

    const aa=titleTokens(a.title), bb=titleTokens(b.title);
    if(aa.length<5||bb.length<5)return false;
    const setB=new Set(bb);
    let common=0;
    for(const t of new Set(aa))if(setB.has(t))common++;
    const overlap=common/Math.min(new Set(aa).size,setB.size);

    // Headlines that start with the same news formula and are mostly the same words
    // are treated as one topic. Example: a channel publishing several near-identical
    // weather/news cuts in the same day.
    const prefixLen=Math.min(6,aa.length,bb.length);
    let prefixSame=0;
    for(let i=0;i<prefixLen;i++){if(aa[i]===bb[i])prefixSame++;else break;}
    const strongPrefix=prefixLen>=5&&prefixSame>=5;
    return overlap>=0.84 || (strongPrefix&&overlap>=0.68);
  }

  function semanticDedupeEnabled(item){
    const cat=state.categories?.find(c=>c.id===item.categoryId);
    const label=stripDiacritics(cat?.name||'').toLowerCase();
    return /tin tuc|news|thoi tiet|du bao/.test(label);
  }

  function mapUploadItem(x,item){
    const videoId=x.contentDetails?.videoId||x.snippet?.resourceId?.videoId;
    return {
      videoId,
      title:x.snippet?.title||'',
      channelTitle:x.snippet?.videoOwnerChannelTitle||item.title,
      thumbnail:x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url||ytThumb(videoId),
      publishedAt:x.contentDetails?.videoPublishedAt||x.snippet?.publishedAt,
      position:x.snippet?.position
    };
  }

  function dedupeChannelVideos(videos,item){
    const out=[];
    const ids=new Set();
    const titles=new Set();
    const semantic=semanticDedupeEnabled(item);

    for(const v of videos||[]){
      if(!v?.videoId||ids.has(v.videoId))continue;
      const nt=normalizedTitle(v.title);
      if(nt&&titles.has(nt))continue;
      if(semantic&&out.some(prev=>similarTopic(prev,v)))continue;
      ids.add(v.videoId);
      if(nt)titles.add(nt);
      out.push(v);
      if(out.length>=KEEP_LIMIT)break;
    }
    return out;
  }

  // Replace the original 30-item loader with a 50-item source window, then keep
  // at most 30 unique/relevant items. This also feeds the silent 2-hour scanner.
  loadChannelVideos=async function(item){
    if(!item.uploadsPlaylistId)await resolveItem(item);
    const p=await yt('playlistItems',{
      part:'snippet,contentDetails',
      playlistId:item.uploadsPlaylistId,
      maxResults:FETCH_LIMIT
    });
    const raw=(p.items||[]).map(x=>mapUploadItem(x,item)).filter(x=>x.videoId);
    const filtered=dedupeChannelVideos(raw,item);
    item.videos=filtered;
    item.lastFetchedAt=new Date().toISOString();
    item.filteredDuplicateCount=Math.max(0,raw.length-filtered.length);
    save();
    return item.videos;
  };

  // IMPORTANT: do not send a stale playlist index. Upload-playlist positions shift
  // whenever a channel publishes a new video. The videoId + list pair is enough for
  // YouTube to locate the correct item and continue from there.
  watchUrl=function(item,video,index){
    const v=encodeURIComponent(video.videoId);
    if(item.kind==='playlist'&&item.playlistId){
      return `https://www.youtube.com/watch?v=${v}&list=${encodeURIComponent(item.playlistId)}&autoplay=1`;
    }
    if(item.kind==='channel'&&item.uploadsPlaylistId){
      return `https://www.youtube.com/watch?v=${v}&list=${encodeURIComponent(item.uploadsPlaylistId)}&autoplay=1`;
    }
    return `https://www.youtube.com/watch?v=${v}&autoplay=1`;
  };

  // Remove exact duplicate entries that may already be stored from an older build.
  for(const item of state.items||[]){
    if(item.kind!=='channel'||!Array.isArray(item.videos))continue;
    const before=item.videos.length;
    item.videos=dedupeChannelVideos(item.videos,item).slice(0,KEEP_LIMIT);
    if(before!==item.videos.length)item.filteredDuplicateCount=(item.filteredDuplicateCount||0)+(before-item.videos.length);
  }
  save();

  // Final version label after all older UI wrappers have rendered.
  if(typeof render==='function'){
    const baseRender=render;
    render=function(...args){
      const out=baseRender(...args);
      if(view.tab==='settings'){
        document.querySelectorAll('.subtle').forEach(el=>{
          if(/^Phiên bản\s+/i.test(el.textContent||''))el.textContent='Phiên bản 1.6.1 · chống trùng tin + ổn định playback';
        });
      }
      return out;
    };
  }

  window.NBL_PLAYBACK_SAFETY={normalizedTitle,similarTopic,dedupeChannelVideos};
  render();
})();
