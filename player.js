// News By Listening v1.9.0 - persistent Vivaldi player tab
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

  function updateInfo(command,ids){
    titleEl.textContent=command?.title||command?.sourceName||`YouTube ${ids[0]||''}`;
    metaEl.textContent=[command?.sourceName||'',command?.shuffle?'Ngẫu nhiên':'',command?.repeatMode&&command.repeatMode!=='off'?`Lặp: ${command.repeatMode}`:''].filter(Boolean).join(' · ')||'Queue nhận từ News By Listening';
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
    updateInfo(command,ids);

    if(!ytReady||!ytPlayer){
      pendingCommand=command;
      setStatus('Đã nhận queue · chờ YouTube…');
      return;
    }

    pendingCommand=null;
    try{
      if(ids.length===1)ytPlayer.loadVideoById(ids[0]);
      else ytPlayer.loadPlaylist(ids,0,0);
      setStatus('Đã nhận queue · đang phát','ok');
      resumeBtn.hidden=true;
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
          if(e.data===YT.PlayerState.PLAYING){resumeBtn.hidden=true;setStatus('Đang phát · 1 tab','ok');}
          if(e.data===YT.PlayerState.PAUSED||e.data===YT.PlayerState.CUED)showResumeIfNeeded();
        },
        onError(e){setStatus(`YouTube lỗi ${e.data}`,'bad');resumeBtn.hidden=false;}
      }
    });
  };

  resumeBtn.addEventListener('click',()=>{
    try{ytPlayer?.playVideo();resumeBtn.hidden=true;setStatus('Đang phát · 1 tab','ok');}catch{}
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){clearTimeout(pollTimer);poll();}
  });
  window.addEventListener('online',()=>{clearTimeout(pollTimer);poll();});

  if(!/^[A-Za-z0-9_-]{40,160}$/.test(token)){
    setStatus('Thiếu mã Player','bad');
    titleEl.textContent='Hãy mở Player từ News By Listening';
    metaEl.textContent='Không mở trực tiếp trang này từ bookmark.';
    return;
  }

  setStatus('Đang kết nối relay…');
  poll();
})();
