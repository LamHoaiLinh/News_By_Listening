// News By Listening v1.3.0
// Vivaldi-first playback + custom listening playlists made from arbitrary YouTube video links.

(function(){
  const NBL_QUEUE_LIMIT = 50;

  // Migrate existing data in-place. Keep the old storage key so nothing already entered is lost.
  state.customPlaylists ||= [];
  state.prefs ||= {};
  state.prefs.browser = 'vivaldi';
  state.prefs.openInBrave = false;
  view.queueId ||= null;
  save();

  // Vivaldi is used through iOS' Default Browser mechanism. This is more reliable than
  // inventing an undocumented deep-link format that can damage YouTube query strings.
  openExternal = function(url){
    if(!url) return;
    const target = String(url);
    const a = document.createElement('a');
    a.href = target;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  nav = function(){
    const items = [
      ['library','Thư viện'],
      ['queues','DS phát'],
      ['history','Đã nghe'],
      ['sync','Đồng bộ'],
      ['settings','Cài đặt']
    ];
    return `<nav class="bottomnav">${items.map(([id,t])=>`<button class="navbtn ${view.tab===id?'active':''}" data-nav="${id}">${t}</button>`).join('')}</nav>`;
  };

  shell = function(content){
    return `<div class="shell"><header class="topbar"><div class="brand"><div class="logo">NBL</div><div><h1>News By Listening</h1><p>Chọn nhanh · Mở Vivaldi · Nghe liên tục</p></div></div><span class="badge green">${esc(state.prefs.speed)}x ưa thích</span></header>${content}</div>${nav()}`;
  };

  // Include custom playlists in 6-character sync.
  if(typeof syncPayload === 'function'){
    const baseSyncPayload = syncPayload;
    syncPayload = function(){
      const payload = baseSyncPayload();
      payload.v = 3;
      payload.customPlaylists = state.customPlaylists;
      payload.prefs = {...(payload.prefs||{}),browser:'vivaldi',openInBrave:false};
      return payload;
    };
  }
  if(typeof applyImport === 'function'){
    const baseApplyImport = applyImport;
    applyImport = function(data){
      baseApplyImport(data);
      if(Array.isArray(data?.customPlaylists)) state.customPlaylists = data.customPlaylists;
      state.prefs ||= {};
      state.prefs.browser = 'vivaldi';
      state.prefs.openInBrave = false;
      save();
    };
  }

  function extractVideoId(raw){
    try{
      let text = String(raw||'').trim();
      if(!text) return null;
      if(!/^https?:\/\//i.test(text)) text='https://'+text;
      const u=new URL(text);
      const host=u.hostname.replace(/^www\./,'');
      if(host==='youtu.be'){
        const id=u.pathname.split('/').filter(Boolean)[0];
        return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;
      }
      if(!['youtube.com','m.youtube.com','music.youtube.com'].includes(host)) return null;
      const v=u.searchParams.get('v');
      if(/^[A-Za-z0-9_-]{11}$/.test(v||'')) return v;
      const m=u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/);
      return m?m[1]:null;
    }catch{return null;}
  }

  function parseManyVideoIds(text){
    const parts=String(text||'').split(/[\s,]+/).map(x=>x.trim()).filter(Boolean);
    const ids=[];
    for(const part of parts){const id=extractVideoId(part);if(id&&!ids.includes(id))ids.push(id);}
    return ids;
  }

  function fmtDuration(iso){
    const m=String(iso||'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if(!m)return '';
    const h=Number(m[1]||0),min=Number(m[2]||0),s=Number(m[3]||0);
    return h?`${h}:${String(min).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${min}:${String(s).padStart(2,'0')}`;
  }

  async function fetchVideoMetadata(ids){
    const out=new Map();
    for(let i=0;i<ids.length;i+=50){
      const chunk=ids.slice(i,i+50);
      try{
        const data=await yt('videos',{part:'snippet,contentDetails',id:chunk.join(','),maxResults:chunk.length});
        for(const x of data.items||[]){
          out.set(x.id,{id:uid('qv'),videoId:x.id,title:x.snippet?.title||`YouTube ${x.id}`,channelTitle:x.snippet?.channelTitle||'',thumbnail:x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url||ytThumb(x.id),duration:x.contentDetails?.duration||'',addedAt:new Date().toISOString()});
        }
      }catch{}
    }
    return ids.map(id=>out.get(id)||({id:uid('qv'),videoId:id,title:`YouTube video ${id}`,channelTitle:'',thumbnail:ytThumb(id),duration:'',addedAt:new Date().toISOString()}));
  }

  function currentQueue(){return state.customPlaylists.find(x=>x.id===view.queueId);}

  function tempQueueUrl(videos,start=0){
    const ids=videos.slice(start,start+NBL_QUEUE_LIMIT).map(x=>x.videoId).filter(Boolean);
    return ids.length?`https://www.youtube.com/watch_videos?video_ids=${ids.map(encodeURIComponent).join(',')}`:'';
  }

  function playCustomQueue(queue,start=0){
    const url=tempQueueUrl(queue.videos||[],start);
    if(!url)return toast('Danh sách chưa có video');
    const first=queue.videos[start];
    if(first&&typeof recordHistory==='function') recordHistory({videoId:first.videoId,title:first.title,channelTitle:first.channelTitle,thumbnail:first.thumbnail},{title:queue.name},url);
    openExternal(url);
  }

  function modal(html){
    const root=document.createElement('div');
    root.className='modalback';
    root.innerHTML=`<div class="modal">${html}</div>`;
    root.addEventListener('click',e=>{if(e.target===root)root.remove();});
    document.body.appendChild(root);
    return root;
  }

  function showCreateQueue(){
    const root=modal(`<h2>Tạo danh sách phát</h2><div class="field"><label>Tên danh sách</label><input id="qp-name" class="input" placeholder="Ví dụ: Nghe khi đi làm"></div><div class="field"><label>Dán các link video YouTube (mỗi link một dòng)</label><textarea id="qp-links" class="input nbl-textarea" placeholder="https://youtube.com/watch?v=...\nhttps://youtu.be/...\n..."></textarea><small class="subtle">Có thể tạo danh sách trước rồi thêm video sau. Thứ tự dán chính là thứ tự phát.</small></div><div class="modal-actions"><button class="ghost" data-close>Hủy</button><button class="primary" data-save>Tạo danh sách</button></div>`);
    root.querySelector('[data-close]').onclick=()=>root.remove();
    root.querySelector('[data-save]').onclick=async function(){
      const name=root.querySelector('#qp-name').value.trim()||'Danh sách nghe';
      const ids=parseManyVideoIds(root.querySelector('#qp-links').value);
      this.disabled=true;this.textContent='Đang lấy thông tin...';
      const videos=ids.length?await fetchVideoMetadata(ids):[];
      const q={id:uid('queue'),name,videos,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      state.customPlaylists.push(q);save();view.queueId=q.id;root.remove();render();toast(`Đã tạo ${name}${videos.length?' · '+videos.length+' video':''}`);
    };
  }

  function showRenameQueue(q){
    const root=modal(`<h2>Đổi tên danh sách</h2><div class="field"><label>Tên</label><input id="qp-name" class="input" value="${esc(q.name)}"></div><div class="modal-actions"><button class="ghost" data-close>Hủy</button><button class="primary" data-save>Lưu</button></div>`);
    root.querySelector('[data-close]').onclick=()=>root.remove();
    root.querySelector('[data-save]').onclick=()=>{q.name=root.querySelector('#qp-name').value.trim()||q.name;q.updatedAt=new Date().toISOString();save();root.remove();render();};
  }

  function showAddVideos(q){
    const root=modal(`<h2>Thêm video vào ${esc(q.name)}</h2><div class="field"><label>Dán nhiều link YouTube</label><textarea id="qp-links" class="input nbl-textarea" placeholder="Mỗi link một dòng"></textarea><small class="subtle">Link trùng trong danh sách sẽ tự bỏ qua.</small></div><div class="modal-actions"><button class="ghost" data-close>Hủy</button><button class="primary" data-save>Thêm video</button></div>`);
    root.querySelector('[data-close]').onclick=()=>root.remove();
    root.querySelector('[data-save]').onclick=async function(){
      const ids=parseManyVideoIds(root.querySelector('#qp-links').value);
      if(!ids.length)return toast('Không tìm thấy link video YouTube hợp lệ');
      const existing=new Set((q.videos||[]).map(x=>x.videoId));
      const newIds=ids.filter(id=>!existing.has(id));
      if(!newIds.length)return toast('Các video này đã có trong danh sách');
      this.disabled=true;this.textContent='Đang lấy thông tin...';
      const videos=await fetchVideoMetadata(newIds);
      q.videos||=[];q.videos.push(...videos);q.updatedAt=new Date().toISOString();save();root.remove();render();toast(`Đã thêm ${videos.length} video`);
    };
  }

  function renderQueueList(){
    const qs=state.customPlaylists||[];
    return shell(`<div class="section-title"><div><h2>Danh sách phát</h2><div class="subtle">Tự gom nhiều link video từ các kênh khác nhau</div></div><button class="primary" data-q-action="create">+ Tạo danh sách</button></div><div class="notice">Khi bấm phát, News By Listening tạo một hàng đợi YouTube tạm thời theo đúng thứ tự anh sắp xếp rồi mở bằng Vivaldi. Mỗi lượt phát liên tục tối đa ${NBL_QUEUE_LIMIT} video; danh sách lưu trong app có thể dài hơn.</div><div class="grid nbl-queue-grid" style="margin-top:12px">${qs.map(q=>`<div class="card category-card"><div class="card-actions"><button class="iconbtn" data-q-rename="${q.id}">Sửa</button></div><div class="category-index">DANH SÁCH PHÁT</div><h3>${esc(q.name)}</h3><div class="count">${(q.videos||[]).length} video</div><div class="toolbar nbl-card-toolbar"><button class="ghost" data-q-open="${q.id}">Mở</button><button class="primary" data-q-play="${q.id}">▶ Phát</button></div></div>`).join('')}</div>${qs.length?'':'<div class="empty" style="margin-top:12px">Chưa có danh sách phát. Tạo một danh sách rồi dán các link video cần nghe.</div>'}`);
  }

  function renderQueueDetail(q){
    const vs=q.videos||[];
    return shell(`<button class="ghost back" data-q-action="back">← Danh sách phát</button><div class="section-title"><div><h2>${esc(q.name)}</h2><div class="subtle">${vs.length} video · kéo thả trên PC hoặc dùng ↑ ↓ để đổi thứ tự</div></div><button class="primary" data-q-action="add-videos">+ Dán video</button></div><div class="toolbar"><button class="primary" data-q-action="play-all">▶ Phát từ đầu</button><button class="ghost" data-q-action="rename">Đổi tên</button><button class="danger" data-q-action="delete-queue">Xóa danh sách</button></div>${vs.length>NBL_QUEUE_LIMIT?`<div class="notice warn">Danh sách có ${vs.length} video. Một lượt YouTube tạm thời phát tối đa ${NBL_QUEUE_LIMIT} video. Anh có thể bấm “Nghe từ đây” ở video #${NBL_QUEUE_LIMIT+1} để phát phần tiếp theo.</div>`:''}<div class="video-list nbl-queue-videos">${vs.map((v,i)=>`<div class="card video nbl-q-video" draggable="true" data-q-index="${i}"><img class="thumb" src="${esc(v.thumbnail||ytThumb(v.videoId))}" alt=""><div><div class="video-index">#${i+1}</div><h3>${esc(v.title)}</h3><div class="meta">${esc(v.channelTitle||'')}${v.duration?' · '+fmtDuration(v.duration):''}</div></div><div class="row-actions"><button class="iconbtn" data-q-move="up" data-index="${i}" ${i===0?'disabled':''}>↑</button><button class="iconbtn" data-q-move="down" data-index="${i}" ${i===vs.length-1?'disabled':''}>↓</button><button class="primary" data-q-play-index="${i}">▶ Nghe từ đây</button><button class="danger" data-q-remove="${i}">Xóa</button></div></div>`).join('')}</div>${vs.length?'':'<div class="empty">Dán các link video YouTube để bắt đầu.</div>'}`);
  }

  function renderQueues(){const q=currentQueue();return q?renderQueueDetail(q):renderQueueList();}

  renderSettings=function(){
    const statusText=typeof nblYoutubeBackendStatus==='undefined'||nblYoutubeBackendStatus===null?'Đang kiểm tra...':nblYoutubeBackendStatus?'Đã cấu hình · sẵn sàng':'Chưa sẵn sàng';
    const statusClass=typeof nblYoutubeBackendStatus!=='undefined'&&nblYoutubeBackendStatus?'green':'';
    if(typeof nblYoutubeBackendStatus!=='undefined'&&nblYoutubeBackendStatus===null&&!nblYoutubeStatusBusy)setTimeout(()=>nblCheckYoutubeBackendStatus(),0);
    return shell(`<div class="section-title"><div><h2>Cài đặt</h2><div class="subtle">Vivaldi là trình duyệt phát mặc định</div></div></div><div class="card form"><div class="field"><label>Trình duyệt phát</label><div><span class="badge green">Vivaldi</span></div><small class="subtle">News By Listening mở URL HTTPS ra trình duyệt mặc định của iPhone để tránh lỗi deep-link. Hãy đặt Vivaldi làm Default Browser.</small></div><div class="notice"><b>Cấu hình Vivaldi một lần:</b><br>1) iPhone Settings → Apps → Default Apps → Browser App → Vivaldi.<br>2) Vivaldi → Settings → General → Allow media playback in background = ON.<br>3) Vivaldi → Settings → Privacy and security → Don't open links in external apps = ON.<br>4) Ad and Tracker Blocker → Block Trackers and Ads.</div><button class="ghost" data-q-action="test-vivaldi">Mở thử YouTube bằng Vivaldi</button><div class="hr"></div><div class="field"><label>YouTube Data API</label><div><span class="badge ${statusClass}">${esc(statusText)}</span></div><small class="subtle">API key nằm ở backend Supabase; PC/iPhone không giữ key.</small></div><button class="ghost" data-action="check-youtube-backend">Kiểm tra lại backend</button><div class="hr"></div><div class="field"><label>Tốc độ nghe ưa thích</label><div class="speedrow">${SPEEDS.map(x=>`<button class="chip ${state.prefs.speed===x?'active':''}" data-speed="${x}">${x}x</button>`).join('')}</div></div><label><input id="remember-speed" type="checkbox" ${state.prefs.rememberSpeed?'checked':''}> Ghi nhớ tốc độ gần nhất đã chọn</label><div class="notice">Tốc độ được app ghi nhớ để nhắc đúng thói quen; video thực tế phát trong Vivaldi/YouTube nên app không ép được playback speed hoặc EQ của trình phát ngoài.</div><div class="hr"></div><div class="subtle">Phiên bản 1.3.0 · Vivaldi + Danh sách phát tùy chỉnh</div></div>`);
  };

  if(typeof render==='function'){
    const baseRender=render;
    render=function(){if(view.tab==='queues'){app.innerHTML=renderQueues();return;}return baseRender();};
  }

  document.addEventListener('click',function(e){
    const navBtn=e.target.closest('[data-nav="queues"]');
    if(navBtn){e.preventDefault();e.stopImmediatePropagation();view.tab='queues';view.categoryId=null;view.itemId=null;view.queueId=null;render();return;}

    // Handle buttons before generic open actions so nested clicks do not get swallowed.
    const renameCard=e.target.closest('[data-q-rename]');
    if(renameCard){e.preventDefault();e.stopImmediatePropagation();const q=state.customPlaylists.find(x=>x.id===renameCard.dataset.qRename);if(q)showRenameQueue(q);return;}
    const playCard=e.target.closest('[data-q-play]');
    if(playCard){e.preventDefault();e.stopImmediatePropagation();const q=state.customPlaylists.find(x=>x.id===playCard.dataset.qPlay);if(q)playCustomQueue(q,0);return;}
    const open=e.target.closest('[data-q-open]');
    if(open){e.preventDefault();e.stopImmediatePropagation();view.tab='queues';view.queueId=open.dataset.qOpen;render();return;}

    const action=e.target.closest('[data-q-action]')?.dataset.qAction;
    if(action){
      e.preventDefault();e.stopImmediatePropagation();const q=currentQueue();
      if(action==='create')return showCreateQueue();
      if(action==='back'){view.queueId=null;return render();}
      if(action==='add-videos'&&q)return showAddVideos(q);
      if(action==='play-all'&&q)return playCustomQueue(q,0);
      if(action==='rename'&&q)return showRenameQueue(q);
      if(action==='delete-queue'&&q){if(confirm(`Xóa danh sách “${q.name}”?`)){state.customPlaylists=state.customPlaylists.filter(x=>x.id!==q.id);save();view.queueId=null;render();}return;}
      if(action==='test-vivaldi')return openExternal('https://m.youtube.com/');
    }

    const playIndex=e.target.closest('[data-q-play-index]');
    if(playIndex){e.preventDefault();e.stopImmediatePropagation();const q=currentQueue();if(q)playCustomQueue(q,Number(playIndex.dataset.qPlayIndex));return;}
    const remove=e.target.closest('[data-q-remove]');
    if(remove){e.preventDefault();e.stopImmediatePropagation();const q=currentQueue(),i=Number(remove.dataset.qRemove);if(q&&q.videos?.[i]&&confirm(`Xóa “${q.videos[i].title}” khỏi danh sách?`)){q.videos.splice(i,1);q.updatedAt=new Date().toISOString();save();render();}return;}
    const move=e.target.closest('[data-q-move]');
    if(move){e.preventDefault();e.stopImmediatePropagation();const q=currentQueue(),i=Number(move.dataset.index),j=move.dataset.qMove==='up'?i-1:i+1;if(q&&j>=0&&j<q.videos.length){const [v]=q.videos.splice(i,1);q.videos.splice(j,0,v);q.updatedAt=new Date().toISOString();save();render();}return;}
  },true);

  let dragIndex=null;
  document.addEventListener('dragstart',e=>{const row=e.target.closest('[data-q-index]');if(row)dragIndex=Number(row.dataset.qIndex);});
  document.addEventListener('dragover',e=>{if(e.target.closest('[data-q-index]'))e.preventDefault();});
  document.addEventListener('drop',e=>{const row=e.target.closest('[data-q-index]');if(!row||dragIndex===null)return;e.preventDefault();const q=currentQueue(),target=Number(row.dataset.qIndex);if(q&&target!==dragIndex){const [v]=q.videos.splice(dragIndex,1);q.videos.splice(target,0,v);q.updatedAt=new Date().toISOString();save();render();}dragIndex=null;});

  if(typeof renderSync==='function'){
    const baseRenderSync=renderSync;
    renderSync=function(){return baseRenderSync().replace('Phân loại, kênh, playlist và cài đặt','Phân loại, kênh, playlist YouTube, danh sách phát tùy chỉnh và cài đặt');};
  }

  render();
})();
