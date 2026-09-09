// News By Listening v1.5.0 - repeat playback engine
// Loaded before playlist/shuffle UI so it can intercept playback when repeat mode is active.
(function(){
  const QUEUE_LIMIT=50;
  const MODES=new Set(['off','list-once','list-infinity','track-once','track-infinity']);

  function normalizeMode(mode){return MODES.has(mode)?mode:'off';}
  function randomInt(max){
    if(max<=1)return 0;
    try{const b=new Uint32Array(1);crypto.getRandomValues(b);return b[0]%max;}catch{return Math.floor(Math.random()*max);}
  }
  function shuffledCopy(videos){
    const arr=[...(videos||[])];
    for(let i=arr.length-1;i>0;i--){const j=randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}
    return arr;
  }
  function queueById(id){return (state.customPlaylists||[]).find(x=>x.id===id);}
  function currentQueue(){return queueById(view.queueId);}
  function selectedTrack(queue){
    if(!queue)return null;
    return (queue.videos||[]).find(v=>v.videoId===queue.repeatVideoId)||null;
  }
  function cycle(queue,shuffle){
    const base=[...(queue?.videos||[])];
    return shuffle?shuffledCopy(base):base;
  }
  function buildSequence(queue,shuffle=false){
    if(!queue)return [];
    queue.repeatMode=normalizeMode(queue.repeatMode);
    const mode=queue.repeatMode;
    const base=queue.videos||[];
    if(!base.length)return [];

    if(mode==='track-once'||mode==='track-infinity'){
      const track=selectedTrack(queue);
      if(!track)return [];
      if(mode==='track-once')return [track,track];
      return Array.from({length:QUEUE_LIMIT},()=>track);
    }

    if(mode==='list-once'){
      const first=cycle(queue,shuffle);
      const second=cycle(queue,shuffle);
      return [...first,...second].slice(0,QUEUE_LIMIT);
    }

    if(mode==='list-infinity'){
      const out=[];
      while(out.length<QUEUE_LIMIT){
        const pass=cycle(queue,shuffle);
        if(!pass.length)break;
        out.push(...pass);
      }
      return out.slice(0,QUEUE_LIMIT);
    }

    return cycle(queue,shuffle).slice(0,QUEUE_LIMIT);
  }
  function queueUrl(sequence){
    const ids=(sequence||[]).map(x=>x.videoId).filter(Boolean).slice(0,QUEUE_LIMIT);
    return ids.length?`https://www.youtube.com/watch_videos?video_ids=${ids.map(encodeURIComponent).join(',')}`:'';
  }
  function modeLabel(queue){
    const mode=normalizeMode(queue?.repeatMode);
    if(mode==='list-once')return 'Toàn bộ ×1';
    if(mode==='list-infinity')return 'Toàn bộ ∞';
    if(mode==='track-once')return '1 bài ×1';
    if(mode==='track-infinity')return '1 bài ∞';
    return 'Tắt';
  }
  function play(queue,{shuffle=false}={}){
    if(!queue)return;
    const mode=normalizeMode(queue.repeatMode);
    if((mode==='track-once'||mode==='track-infinity')&&!selectedTrack(queue)){
      toast('Hãy chọn một bài trong danh sách để lặp');
      return;
    }
    const sequence=buildSequence(queue,shuffle);
    if(!sequence.length)return toast('Danh sách chưa có video');
    const url=queueUrl(sequence);
    if(!url)return toast('Không tạo được hàng đợi');
    const first=sequence[0];
    if(first&&typeof recordHistory==='function'){
      recordHistory({videoId:first.videoId,title:first.title,channelTitle:first.channelTitle,thumbnail:first.thumbnail},{title:queue.name},url);
    }
    const suffix=mode==='off'?'':` · Lặp ${modeLabel(queue)}`;
    toast(`${shuffle?'Đã trộn':'Đã tạo'} ${sequence.length} mục${suffix}`);
    openExternal(url);
  }

  window.NBL_REPEAT_ENGINE={QUEUE_LIMIT,normalizeMode,queueById,currentQueue,selectedTrack,buildSequence,modeLabel,play};

  // Register early. Only intercept normal/shuffle play when a repeat mode is active.
  document.addEventListener('click',e=>{
    const engine=window.NBL_REPEAT_ENGINE;
    let q=null,shuffle=false,matched=false;

    const detailPlay=e.target.closest('[data-q-action="play-all"]');
    if(detailPlay){q=engine.currentQueue();matched=true;}

    const cardPlay=e.target.closest('[data-q-play]');
    if(cardPlay){q=engine.queueById(cardPlay.dataset.qPlay);matched=true;}

    const shuffleCurrent=e.target.closest('[data-nbl-shuffle-current]');
    if(shuffleCurrent){q=engine.currentQueue();shuffle=true;matched=true;}

    const shuffleCard=e.target.closest('[data-nbl-shuffle-card]');
    if(shuffleCard){q=engine.queueById(shuffleCard.dataset.nblShuffleCard);shuffle=true;matched=true;}

    if(!matched||!q||engine.normalizeMode(q.repeatMode)==='off')return;
    e.preventDefault();e.stopImmediatePropagation();
    engine.play(q,{shuffle});
  },true);
})();
