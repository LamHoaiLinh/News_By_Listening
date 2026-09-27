// News By Listening v1.13.0 - persistent player + resume position
(function(){
  'use strict';

  const RELAY='https://qjpcxhackvoewcxlatis.supabase.co/functions/v1/nbl-player-relay';
  const params=new URLSearchParams(location.hash.replace(/^#/,''));
  const token=params.get('t')||'';
  const statusEl=document.getElementById('relay-status');
  const titleEl=document.getElementById('now-title');
  const metaEl=document.getElementById('now-meta');
  const countEl=document.getElementById('queue-count');
  const resumeBtn=document.getElementById('resume-btn');

  let ytPlayer=null;
  let ytReady=false;
  let pendingCommand=null;
  let lastCommandId='';
  let pollTimer=null;
  let busy=false;
  let desiredPlaybackRate=1;
  let rateRetryTimer=null;
  let listenTimer=null;
  let trackedVideoId='';

  function setStatus(text,kind=''){
    statusEl.textContent=text;
    statusEl.className='status'+(kind?' '+kind:'');
  }

  async function relay(action,extra={}){
    const ctrl=new AbortController();
    const timeout=setTimeout(()=>ctrl.abort(),5000);
    try{
      const r=await fetch(RELAY,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,token,...extra}),
        cache:'no-store',
        signal:ctrl.signal
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.ok)throw new Error(data.error||`HTTP ${r.status}`);
      return data;
    }finally{clearTimeout(timeout);}
  }

  async function ack(commandId){
    try{await relay('ack',{commandId});}
    catch(e){console.warn('[NBL Player] ACK failed',e);}
  }

  function validIds(command){
    return (command?.videoIds||[]).map(String).filter(x=>/^[A-Za-z0-9_-]{11}$/.test(x)).slice(0,50);
  }

  function normalizeRate(value){
    const rate=Number(value);
    if(!Number.isFinite(rate))return 1;
    return Math.max(0.25,Math.min(2,rate));
  }

  function nearestAvailableRate(requested){
    if(!ytPlayer||!ytReady)return requested;
    try{
      const rates=ytPlayer.getAvailablePlaybackRates?.()||[];
      if(!rates.length)return requested;
      if(rates.includes(requested))return requested;
      return rates.reduce((best,current)=>
        Math.abs(current-requested)<Math.abs(best-requested)?current:best
      ,rates[0]);
    }catch{return requested;}
  }

  function applyPlaybackRate({retry=true}={}){
    if(!ytPlayer||!ytReady)return false;
    clearTimeout(rateRetryTimer);
    const requested=normalizeRate(desiredPlaybackRate);
    const target=nearestAvailableRate(requested);
    try{
      ytPlayer.setPlaybackRate(target);
      if(retry){
        rateRetryTimer=setTimeout(()=>{
          try{
            const actual=Number(ytPlayer.getPlaybackRate?.()||1);
            if(Math.abs(actual-target)>0.001)ytPlayer.setPlaybackRate(target);
          }catch{}
        },700);
      }
      return true;
    }catch(e){
      console.warn('[NBL Player] setPlaybackRate failed',e);
      return false;
    }
  }

  function playbackStatusText(){
    let actual=desiredPlaybackRate;
    try{actual=Number(ytPlayer?.getPlaybackRate?.()||desiredPlaybackRate)||desiredPlaybackRate;}catch{}
    return `Đang phát · ${actual}x · 1 tab`;
  }

  function playbackSnapshot(){
    if(!ytPlayer||!ytReady)return {videoId:'',currentTime:0,duration:0};
    try{
      const data=ytPlayer.getVideoData?.()||{};
      let videoId=String(data.video_id||'');
      if(!videoId){
        const url=String(ytPlayer.getVideoUrl?.()||'');
        try{videoId=new URL(url).searchParams.get('v')||'';}catch{}
      }
      return {
        videoId:/^[A-Za-z0-9_-]{11}$/.test(videoId)?videoId:'',
        currentTime:Number(ytPlayer.getCurrentTime?.()||0)||0,
        duration:Number(ytPlayer.getDuration?.()||0)||0
      };
    }catch{return {videoId:'',currentTime:0,duration:0};}
  }

  function pushListenProgress({ended=false}={}){
    const tracker=window.NBL_LISTEN_STATUS;
    if(!tracker||!ytPlayer||!ytReady)return;
    const snap=playbackSnapshot();
    const videoId=ended?(trackedVideoId||snap.videoId):snap.videoId;
    if(!videoId)return;
    if(!ended)trackedVideoId=videoId;
    tracker.markPlayback(videoId,snap.currentTime,snap.duration,{ended});
  }

  function stopListenTracking({ended=false}={}){
    if(listenTimer){clearInterval(listenTimer);listenTimer=null;}
    pushListenProgress({ended});
    if(ended)trackedVideoId='';
  }

  function startListenTracking(){
    if(listenTimer)clearInterval(listenTimer);
    pushListenProgress();
    listenTimer=setInterval(()=>pushListenProgress(),5000);
  }

  function formatClock(seconds){
    const total=Math.max(0,Math.floor(Number(seconds)||0));
    const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
    return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;
  }

  function updateInfo(command,ids){
    titleEl.textContent=command?.title||command?.sourceName||`YouTube ${ids[0]||''}`;
    const startSeconds=Math.max(0,Number(command?.startSeconds)||0);
    const resumeText=startSeconds>0?`Tiếp tục từ ${formatClock(startSeconds)}`:'';
    metaEl.textContent=[command?.sourceName||'',resumeText,command?.shuffle?'Ngẫu nhiên':'',command?.repeatMode&&command.repeatMode!=='off'?`Lặp: ${command.repeatMode}`:'',`${normalizeRate(command?.playbackRate||1)}x`].filter(Boolean).join(' · ')||'Queue nhận từ News By Listening';
    countEl.textContent=String(ids.length);
  }

  function showResumeIfNeeded(){
    if(!ytPlayer||!ytReady)return;
    let state=-1;
    try{state=ytPlayer.getPlayerState();}catch{}
    resumeBtn.hidden=state===YT.PlayerState.PLAYING;
  }

  function applyCommand(command){
    if(!command?.id)return;
    const ids=validIds(command);
    if(!ids.length){setStatus('Queue không hợp lệ','bad');return;}
    lastCommandId=command.id;
    desiredPlaybackRate=normalizeRate(command.playbackRate||1);
    updateInfo(command,ids);

    if(!ytReady||!ytPlayer){
      pendingCommand=command;
      setStatus('Đã nhận queue · chờ YouTube…');
      return;
    }

    pendingCommand=null;
    stopListenTracking();
    const startSeconds=Math.max(0,Number(command.startSeconds)||0);
    try{
      if(ids.length===1)ytPlayer.loadVideoById(ids[0],startSeconds);
      else ytPlayer.loadPlaylist(ids,0,startSeconds);
      setStatus(`Đã nhận queue · mục tiêu ${desiredPlaybackRate}x`,'ok');
      resumeBtn.hidden=true;
      setTimeout(()=>applyPlaybackRate(),250);
      setTimeout(()=>applyPlaybackRate(),1200);
      setTimeout(showResumeIfNeeded,1800);
      ack(command.id);
    }catch(e){
      console.error('[NBL Player] apply command failed',e);
      setStatus('Không nạp được queue','bad');
      resumeBtn.hidden=false;
    }
  }

  async function poll(){
    if(busy||!token)return;
    busy=true;
    try{
      const data=await relay('poll');
      if(data.command?.id&&data.command.id!==lastCommandId){
        applyCommand(data.command);
      }else if(lastCommandId&&data.commandId===lastCommandId&&data.ackId!==lastCommandId&&ytReady){
        ack(lastCommandId);
      }else if(!data.command){
        setStatus('Sẵn sàng · chờ News Listening','ok');
      }
    }catch(e){
      console.warn('[NBL Player] poll failed',e);
      setStatus(navigator.onLine?'Mất kết nối relay':'Đang offline','bad');
    }finally{
      busy=false;
      schedulePoll();
    }
  }

  function schedulePoll(){
    clearTimeout(pollTimer);
    pollTimer=setTimeout(poll,document.visibilityState==='visible'?1100:3500);
  }

  window.onYouTubeIframeAPIReady=function(){
    ytPlayer=new YT.Player('yt-player',{
      width:'100%',height:'100%',
      playerVars:{autoplay:1,playsinline:1,controls:1,rel:0,fs:1},
      events:{
        onReady(){
          ytReady=true;
          setStatus('Player sẵn sàng','ok');
          if(pendingCommand)applyCommand(pendingCommand);
          else poll();
        },
        onStateChange(e){
          if(e.data===YT.PlayerState.PLAYING){
            applyPlaybackRate();
            startListenTracking();
            resumeBtn.hidden=true;
            setTimeout(()=>setStatus(playbackStatusText(),'ok'),120);
          }
          if(e.data===YT.PlayerState.PAUSED||e.data===YT.PlayerState.CUED){
            stopListenTracking();
            showResumeIfNeeded();
          }
          if(e.data===YT.PlayerState.ENDED){
            stopListenTracking({ended:true});
          }
        },
        onPlaybackRateChange(){
          if(ytReady)setStatus(playbackStatusText(),'ok');
        },
        onError(e){stopListenTracking();setStatus(`YouTube lỗi ${e.data}`,'bad');resumeBtn.hidden=false;}
      }
    });
  };

  resumeBtn.addEventListener('click',()=>{
    try{ytPlayer?.playVideo();applyPlaybackRate();resumeBtn.hidden=true;setStatus(playbackStatusText(),'ok');}catch{}
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){clearTimeout(pollTimer);poll();}
  });
  window.addEventListener('online',()=>{clearTimeout(pollTimer);poll();});
  window.addEventListener('pagehide',()=>stopListenTracking());

  if(!/^[A-Za-z0-9_-]{40,160}$/.test(token)){
    setStatus('Thiếu mã Player','bad');
    titleEl.textContent='Hãy mở Player từ News By Listening';
    metaEl.textContent='Không mở trực tiếp trang này từ bookmark.';
    return;
  }

  setStatus('Đang kết nối relay…');
  poll();
})();
