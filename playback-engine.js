// News By Listening v1.9.0 - unified playback engine + single Vivaldi player
(function(){
  'use strict';

  const QUEUE_LIMIT=50;
  const DIAGNOSTIC_LIMIT=20;
  const RELAY_URL='https://qjpcxhackvoewcxlatis.supabase.co/functions/v1/nbl-player-relay';
  const MODES=new Set(['off','list-once','list-infinity','track-once','track-infinity']);

  state.prefs ||= {};
  if(typeof state.prefs.singleVivaldiTab!=='boolean')state.prefs.singleVivaldiTab=true;
  if(typeof state.prefs.singleVivaldiPlayerInitialized!=='boolean')state.prefs.singleVivaldiPlayerInitialized=false;
  state.playbackDiagnostics=Array.isArray(state.playbackDiagnostics)?state.playbackDiagnostics.slice(0,DIAGNOSTIC_LIMIT):[];

  function randomToken(){
    try{
      const b=new Uint8Array(32);crypto.getRandomValues(b);
      let s='';for(const x of b)s+=String.fromCharCode(x);
      return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }catch{return `${uid('player')}_${uid('player')}`.replace(/[^A-Za-z0-9_-]/g,'');}
  }
  if(!/^[A-Za-z0-9_-]{40,160}$/.test(state.prefs.singleVivaldiPlayerToken||''))state.prefs.singleVivaldiPlayerToken=randomToken();
  save();

  function normalizeMode(mode){return MODES.has(mode)?mode:'off';}
  function queueById(id){return (state.customPlaylists||[]).find(x=>x.id===id)||null;}
  function currentQueue(){return queueById(view.queueId);}
  function selectedTrack(queue){return (queue?.videos||[]).find(v=>v.videoId===queue.repeatVideoId)||null;}
  function modeLabel(queue){
    const mode=normalizeMode(queue?.repeatMode);
    if(mode==='list-once')return 'Toàn bộ ×1';
    if(mode==='list-infinity')return 'Toàn bộ ∞';
    if(mode==='track-once')return '1 bài ×1';
    if(mode==='track-infinity')return '1 bài ∞';
    return 'Tắt';
  }

  function isIOSDevice(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  }
  function singleTabEnabled(){return isIOSDevice()&&state.prefs.singleVivaldiTab!==false;}
  function connectionSnapshot(){
    const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    return {online:navigator.onLine,effectiveType:c?.effectiveType||'',downlink:typeof c?.downlink==='number'?c.downlink:null,saveData:!!c?.saveData,visibility:document.visibilityState||'',platform:isIOSDevice()?'iOS':'Other'};
  }

  function diagnostics(){state.playbackDiagnostics=Array.isArray(state.playbackDiagnostics)?state.playbackDiagnostics:[];return state.playbackDiagnostics;}
  function createDiagnostic(data={}){
    const entry={id:uid('diag'),startedAt:new Date().toISOString(),action:data.action||'direct-url',sourceType:data.sourceType||'',sourceName:data.sourceName||'',startIndex:Number.isFinite(Number(data.startIndex))?Number(data.startIndex):0,shuffle:!!data.shuffle,repeatMode:normalizeMode(data.repeatMode),queueCount:Number(data.queueCount)||0,firstVideoId:data.firstVideoId||'',firstTitle:data.firstTitle||'',videoIds:Array.isArray(data.videoIds)?data.videoIds.slice(0,QUEUE_LIMIT):[],url:data.url||'',launchStatus:'created',deliveryMode:data.deliveryMode||'',connection:connectionSnapshot()};
    state.playbackDiagnostics=[entry,...diagnostics()].slice(0,DIAGNOSTIC_LIMIT);save();
    window.dispatchEvent(new CustomEvent('nbl:playback-diagnostic',{detail:{id:entry.id}}));return entry.id;
  }
  function updateDiagnostic(id,patch={}){if(!id)return;const entry=diagnostics().find(x=>x.id===id);if(!entry)return;Object.assign(entry,patch,{updatedAt:new Date().toISOString()});save();window.dispatchEvent(new CustomEvent('nbl:playback-diagnostic',{detail:{id}}));}
  function clearDiagnostics(){state.playbackDiagnostics=[];save();window.dispatchEvent(new CustomEvent('nbl:playback-diagnostic',{detail:{cleared:true}}));}

  function toVivaldiScheme(target){
    try{const u=new URL(String(target),location.href);if(u.protocol==='http:'||u.protocol==='https:')return 'vivaldi://'+u.href.replace(/^https?:\/\//i,'');}catch{}
    return 'vivaldi://'+String(target).replace(/^https?:\/\//i,'');
  }
  function playerPageUrl(){const u=new URL('./player.html',location.href);u.hash='t='+encodeURIComponent(state.prefs.singleVivaldiPlayerToken);return u.href;}

  async function relay(action,extra={}){
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),4500);
    try{
      const r=await fetch(RELAY_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:state.prefs.singleVivaldiPlayerToken,...extra}),cache:'no-store',signal:ctrl.signal});
      const data=await r.json().catch(()=>({}));if(!r.ok||!data.ok)throw new Error(data.error||`HTTP ${r.status}`);return data;
    }finally{clearTimeout(timer);}
  }

  function looksLikePlaybackUrl(target){
    try{const u=new URL(String(target),location.href);const host=u.hostname.replace(/^www\./,'');return ['youtube.com','m.youtube.com','music.youtube.com'].includes(host)&&(u.pathname==='/watch'||u.pathname==='/watch_videos');}catch{return false;}
  }
  function idsFromPlaybackUrl(target){
    try{
      const u=new URL(String(target),location.href);
      if(u.pathname==='/watch_videos')return (u.searchParams.get('video_ids')||'').split(',').filter(x=>/^[A-Za-z0-9_-]{11}$/.test(x)).slice(0,QUEUE_LIMIT);
      const v=u.searchParams.get('v');return /^[A-Za-z0-9_-]{11}$/.test(v||'')?[v]:[];
    }catch{return [];}
  }

  function launchIOS(scheme,diagnosticId,{requestStatus='vivaldi-requested',handoffStatus='handoff-detected',fallbackUrl=''}={}){
    let handedOff=false,timer=null;
    const cleanup=()=>{document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',markHandoff);window.removeEventListener('blur',markHandoff);if(timer){clearTimeout(timer);timer=null;}};
    const markHandoff=()=>{if(handedOff)return;handedOff=true;updateDiagnostic(diagnosticId,{launchStatus:handoffStatus,handedOffAt:new Date().toISOString(),visibilityAfterLaunch:document.visibilityState||''});cleanup();};
    const onVisibility=()=>{if(document.visibilityState==='hidden')markHandoff();};
    document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',markHandoff,{once:true});window.addEventListener('blur',markHandoff,{once:true});
    updateDiagnostic(diagnosticId,{launchStatus:requestStatus,requestedAt:new Date().toISOString()});
    window.location.href=scheme;
    timer=setTimeout(()=>{
      const fallback=!handedOff&&document.visibilityState==='visible';cleanup();if(!fallback||!fallbackUrl)return;
      const a=document.createElement('a');a.href=fallbackUrl;a.target='_blank';a.rel='noopener noreferrer';a.style.display='none';document.body.appendChild(a);a.click();a.remove();
      updateDiagnostic(diagnosticId,{launchStatus:'single-player-fallback-open',fallbackAt:new Date().toISOString()});
    },1800);
    return true;
  }

  function directOpenExternal(url,diagnosticId=null){
    if(!url)return false;const target=String(url);
    if(isIOSDevice())return launchIOS(toVivaldiScheme(target),diagnosticId,{requestStatus:'vivaldi-requested',handoffStatus:'handoff-detected',fallbackUrl:target});
    window.open(target,'_blank','noopener');updateDiagnostic(diagnosticId,{launchStatus:'new-tab-opened',openedAt:new Date().toISOString()});return true;
  }

  async function deliverSingleTab(sequence,meta,diagnosticId,fallbackUrl){
    const ids=(sequence||[]).map(x=>x?.videoId).filter(x=>/^[A-Za-z0-9_-]{11}$/.test(x)).slice(0,QUEUE_LIMIT);
    if(!ids.length)return directOpenExternal(fallbackUrl,diagnosticId);
    if(!singleTabEnabled())return directOpenExternal(fallbackUrl,diagnosticId);

    const command={id:uid('pcmd'),videoIds:ids,title:sequence?.[0]?.title||meta?.title||'',sourceName:meta?.sourceName||'',repeatMode:normalizeMode(meta?.repeatMode),shuffle:!!meta?.shuffle,createdAt:new Date().toISOString()};
    updateDiagnostic(diagnosticId,{deliveryMode:'single-vivaldi-player',playerCommandId:command.id});
    try{await relay('push',{command});}
    catch(e){updateDiagnostic(diagnosticId,{launchStatus:'single-player-relay-error',relayError:String(e?.message||e)});return directOpenExternal(fallbackUrl,diagnosticId);}

    state.prefs.singleVivaldiLastCommandId=command.id;
    const firstOpen=!state.prefs.singleVivaldiPlayerInitialized;
    if(firstOpen)state.prefs.singleVivaldiPlayerInitialized=true;
    save();

    if(firstOpen){
      return launchIOS(toVivaldiScheme(playerPageUrl()),diagnosticId,{requestStatus:'single-player-first-open',handoffStatus:'single-player-handoff-detected',fallbackUrl:playerPageUrl()});
    }
    return launchIOS('vivaldi://',diagnosticId,{requestStatus:'single-player-reuse-requested',handoffStatus:'single-player-reused',fallbackUrl:playerPageUrl()});
  }

  function openExternal(url,diagnosticId=null){
    if(!url)return false;const target=String(url);
    if(looksLikePlaybackUrl(target)&&singleTabEnabled()){
      const ids=idsFromPlaybackUrl(target);
      if(ids.length){
        let diagId=diagnosticId;
        if(!diagId)diagId=createDiagnostic({action:'direct-url',sourceType:'direct',sourceName:'Mở lại',queueCount:ids.length,firstVideoId:ids[0],videoIds:ids,url:target});
        const seq=ids.map(videoId=>({videoId,title:''}));
        return deliverSingleTab(seq,{sourceName:'Mở lại',repeatMode:'off',shuffle:false},diagId,target);
      }
    }
    let diagId=diagnosticId;if(!diagId&&looksLikePlaybackUrl(target))diagId=createDiagnostic({action:'direct-url',sourceType:'direct',url:target,queueCount:1});
    return directOpenExternal(target,diagId);
  }

  function buildWatchUrl(item,video){
    if(!video?.videoId)return item?.url||'';const v=encodeURIComponent(video.videoId);
    if(item?.kind==='playlist'&&item.playlistId)return `https://www.youtube.com/watch?v=${v}&list=${encodeURIComponent(item.playlistId)}&autoplay=1`;
    if(item?.kind==='channel'&&item.uploadsPlaylistId)return `https://www.youtube.com/watch?v=${v}&list=${encodeURIComponent(item.uploadsPlaylistId)}&autoplay=1`;
    return `https://www.youtube.com/watch?v=${v}&autoplay=1`;
  }
  function randomInt(max){if(max<=1)return 0;try{const b=new Uint32Array(1);crypto.getRandomValues(b);return b[0]%max;}catch{return Math.floor(Math.random()*max);}}
  function shuffledCopy(videos){const arr=[...(videos||[])];for(let i=arr.length-1;i>0;i--){const j=randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
  function cycle(videos,shuffle){return shuffle?shuffledCopy(videos):[...(videos||[])];}

  function buildSequence(queue,{start=0,shuffle=false,honorRepeat=true}={}){
    if(!queue)return [];const source=(queue.videos||[]).slice(Math.max(0,Number(start)||0));if(!source.length)return [];
    const mode=honorRepeat?normalizeMode(queue.repeatMode):'off';
    if(mode==='track-once'||mode==='track-infinity'){const track=selectedTrack(queue);if(!track)return [];return mode==='track-once'?[track,track]:Array.from({length:QUEUE_LIMIT},()=>track);}
    if(mode==='list-once')return [...cycle(source,shuffle),...cycle(source,shuffle)].slice(0,QUEUE_LIMIT);
    if(mode==='list-infinity'){const out=[];while(out.length<QUEUE_LIMIT){const pass=cycle(source,shuffle);if(!pass.length)break;out.push(...pass);}return out.slice(0,QUEUE_LIMIT);}
    return cycle(source,shuffle).slice(0,QUEUE_LIMIT);
  }
  function queueUrl(sequence){const ids=(sequence||[]).map(x=>x?.videoId).filter(Boolean).slice(0,QUEUE_LIMIT);return ids.length?`https://www.youtube.com/watch_videos?video_ids=${ids.map(encodeURIComponent).join(',')}`:'';}
  function recordQueueHistory(queue,sequence,url){const first=sequence?.[0];if(!first||typeof recordHistory!=='function')return;recordHistory({videoId:first.videoId,title:first.title,channelTitle:first.channelTitle,thumbnail:first.thumbnail},{title:queue?.name||'Danh sách phát'},url);}

  function playQueue(queue,{start=0,shuffle=false,honorRepeat=true,quiet=false}={}){
    if(!queue)return false;const mode=honorRepeat?normalizeMode(queue.repeatMode):'off';
    if((mode==='track-once'||mode==='track-infinity')&&!selectedTrack(queue)){toast('Hãy chọn một bài trong danh sách để lặp');return false;}
    const sequence=buildSequence(queue,{start,shuffle,honorRepeat});if(!sequence.length){toast('Danh sách chưa có video');return false;}
    const url=queueUrl(sequence);if(!url){toast('Không tạo được hàng đợi');return false;}recordQueueHistory(queue,sequence,url);
    const first=sequence[0];const diagnosticId=createDiagnostic({action:start>0?'queue-from-here':'queue-play',sourceType:'custom-playlist',sourceName:queue.name||'Danh sách phát',startIndex:Number(start)||0,shuffle,repeatMode:mode,queueCount:sequence.length,firstVideoId:first?.videoId||'',firstTitle:first?.title||'',videoIds:sequence.map(x=>x?.videoId).filter(Boolean),url});
    if(!quiet){const repeatSuffix=mode==='off'?'':` · Lặp ${modeLabel(queue)}`;const fromSuffix=start>0?` · từ #${Number(start)+1}`:'';toast(`${shuffle?'Đã trộn':'Đã tạo'} ${sequence.length} mục${fromSuffix}${repeatSuffix}`);}
    return deliverSingleTab(sequence,{sourceName:queue.name||'Danh sách phát',repeatMode:mode,shuffle},diagnosticId,url);
  }
  function playFromIndex(queue,index){return playQueue(queue,{start:Number(index)||0,shuffle:false,honorRepeat:false});}
  function playRandom(queue){return playQueue(queue,{start:0,shuffle:true,honorRepeat:true});}

  function playLibraryVideo(item,video,index){
    if(!item||!video)return false;
    const idx=Math.max(0,Number(index)||0);let sequence=(item.videos||[]).slice(idx,idx+QUEUE_LIMIT).filter(x=>x?.videoId);
    if(!sequence.length||sequence[0]?.videoId!==video.videoId)sequence=[video];
    const url=queueUrl(sequence)||buildWatchUrl(item,video,index);
    if(typeof recordHistory==='function')recordHistory(video,item,url);
    const diagnosticId=createDiagnostic({action:'library-video',sourceType:item.kind||'library',sourceName:item.title||video.channelTitle||'Thư viện',startIndex:idx,shuffle:false,repeatMode:'off',queueCount:sequence.length,firstVideoId:video.videoId||'',firstTitle:video.title||'',videoIds:sequence.map(x=>x.videoId).filter(Boolean),url});
    return deliverSingleTab(sequence,{sourceName:item.title||video.channelTitle||'Thư viện',repeatMode:'off',shuffle:false},diagnosticId,url);
  }

  function setSingleTabEnabled(value){state.prefs.singleVivaldiTab=!!value;save();return state.prefs.singleVivaldiTab;}
  async function resetSingleTabPlayer(){state.prefs.singleVivaldiPlayerInitialized=false;state.prefs.singleVivaldiLastCommandId='';save();try{await relay('reset');}catch{}return true;}
  function openSinglePlayer(){
    if(!isIOSDevice())return window.open(playerPageUrl(),'_blank','noopener');
    state.prefs.singleVivaldiPlayerInitialized=true;save();return launchIOS(toVivaldiScheme(playerPageUrl()),null,{fallbackUrl:playerPageUrl()});
  }

  function handleQueuePlaybackClick(e){
    const cardShuffle=e.target.closest('[data-nbl-shuffle-card]');if(cardShuffle){const q=queueById(cardShuffle.dataset.nblShuffleCard);if(!q)return;e.preventDefault();e.stopImmediatePropagation();playRandom(q);return;}
    const currentShuffle=e.target.closest('[data-nbl-shuffle-current]');if(currentShuffle){const q=currentQueue();if(!q)return;e.preventDefault();e.stopImmediatePropagation();playRandom(q);return;}
    const cardPlay=e.target.closest('[data-q-play]');if(cardPlay){const q=queueById(cardPlay.dataset.qPlay);if(!q)return;e.preventDefault();e.stopImmediatePropagation();playQueue(q);return;}
    const detailPlay=e.target.closest('[data-q-action="play-all"]');if(detailPlay){const q=currentQueue();if(!q)return;e.preventDefault();e.stopImmediatePropagation();playQueue(q);return;}
    const fromHere=e.target.closest('[data-q-play-index]');if(fromHere){const q=currentQueue();if(!q)return;e.preventDefault();e.stopImmediatePropagation();playFromIndex(q,Number(fromHere.dataset.qPlayIndex));return;}
    const test=e.target.closest('[data-q-action="test-vivaldi"]');if(test){e.preventDefault();e.stopImmediatePropagation();openSinglePlayer();}
  }

  const api={version:'1.9.0',QUEUE_LIMIT,DIAGNOSTIC_LIMIT,normalizeMode,queueById,currentQueue,selectedTrack,modeLabel,buildWatchUrl,buildSequence,queueUrl,openExternal,playQueue,playFromIndex,playRandom,playLibraryVideo,diagnostics,createDiagnostic,updateDiagnostic,clearDiagnostics,singleTabEnabled,setSingleTabEnabled,resetSingleTabPlayer,openSinglePlayer,playerPageUrl};
  window.NBL_PLAYBACK_ENGINE=api;window.NBL_REPEAT_ENGINE=api;openExternal=api.openExternal;watchUrl=api.buildWatchUrl;playVideo=api.playLibraryVideo;
  document.addEventListener('click',handleQueuePlaybackClick,true);
})();
