// News By Listening v1.4.1 - random playback for custom playlists
(function(){
  const QUEUE_LIMIT=50;

  function randomInt(max){
    if(max<=1) return 0;
    try{
      const buf=new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0]%max;
    }catch{return Math.floor(Math.random()*max);}
  }

  function shuffledCopy(videos){
    const arr=[...(videos||[])];
    for(let i=arr.length-1;i>0;i--){
      const j=randomInt(i+1);
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    return arr;
  }

  function queueUrl(videos){
    const ids=(videos||[]).slice(0,QUEUE_LIMIT).map(x=>x.videoId).filter(Boolean);
    return ids.length?`https://www.youtube.com/watch_videos?video_ids=${ids.map(encodeURIComponent).join(',')}`:'';
  }

  function playRandom(queue){
    if(!queue) return;
    const shuffled=shuffledCopy(queue.videos||[]);
    if(!shuffled.length) return toast('Danh sách chưa có video');
    const url=queueUrl(shuffled);
    if(!url) return toast('Không tạo được hàng đợi');
    const first=shuffled[0];
    if(first&&typeof recordHistory==='function'){
      recordHistory({videoId:first.videoId,title:first.title,channelTitle:first.channelTitle,thumbnail:first.thumbnail},{title:queue.name},url);
    }
    toast(`Đã trộn ngẫu nhiên ${Math.min(shuffled.length,QUEUE_LIMIT)} video`);
    openExternal(url);
  }

  function queueById(id){
    return (state.customPlaylists||[]).find(x=>x.id===id);
  }

  function enhanceQueueUI(){
    if(view.tab!=='queues') return;

    // Cards on the custom-playlist overview.
    document.querySelectorAll('[data-q-play]').forEach(playBtn=>{
      const id=playBtn.dataset.qPlay;
      const bar=playBtn.closest('.toolbar');
      if(!bar||bar.querySelector('[data-nbl-shuffle-card]')) return;
      const b=document.createElement('button');
      b.className='ghost nbl-shuffle-btn';
      b.dataset.nblShuffleCard=id;
      b.textContent='🔀 Ngẫu nhiên';
      b.title='Trộn lại thứ tự mỗi lần phát';
      bar.appendChild(b);
    });

    // Detail screen.
    const playAll=document.querySelector('[data-q-action="play-all"]');
    if(playAll&&!document.querySelector('[data-nbl-shuffle-current]')){
      const b=document.createElement('button');
      b.className='ghost nbl-shuffle-btn';
      b.dataset.nblShuffleCurrent='1';
      b.textContent='🔀 Phát ngẫu nhiên';
      b.title='Không làm thay đổi thứ tự video đã lưu';
      playAll.insertAdjacentElement('afterend',b);
    }

    const list=document.querySelector('.nbl-queue-videos');
    if(list&&!document.querySelector('.nbl-shuffle-note')){
      const note=document.createElement('div');
      note.className='notice nbl-shuffle-note';
      note.innerHTML='<b>Phát ngẫu nhiên:</b> mỗi lần bấm sẽ trộn một thứ tự mới; thứ tự video đã sắp trong danh sách không bị thay đổi.';
      list.insertAdjacentElement('beforebegin',note);
    }
  }

  if(typeof render==='function'){
    const baseRender=render;
    render=function(...args){
      const result=baseRender(...args);
      enhanceQueueUI();
      // Update the visible version label when Settings is open.
      if(view.tab==='settings'){
        document.querySelectorAll('.subtle').forEach(el=>{
          if(/^Phiên bản\s+/i.test(el.textContent||'')) el.textContent='Phiên bản 1.4.1 · 6 slot · Vivaldi · phát ngẫu nhiên';
        });
      }
      return result;
    };
  }

  document.addEventListener('click',e=>{
    const card=e.target.closest('[data-nbl-shuffle-card]');
    if(card){
      e.preventDefault();e.stopImmediatePropagation();
      return playRandom(queueById(card.dataset.nblShuffleCard));
    }
    const current=e.target.closest('[data-nbl-shuffle-current]');
    if(current){
      e.preventDefault();e.stopImmediatePropagation();
      return playRandom(queueById(view.queueId));
    }
  },true);

  render();
})();
