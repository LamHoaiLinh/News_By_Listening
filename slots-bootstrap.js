// News By Listening v1.4.0 - six independent user slots
// Loaded BEFORE app.js. It transparently maps app.js' legacy storage key to the active slot.
(function(){
  const BASE_STATE_KEY='nbl_state_v1';
  const ACTIVE_KEY='nbl_active_slot_v1';
  const META_KEY='nbl_slots_v1';
  const SLOT_COUNT=6;

  const rawGet=Storage.prototype.getItem;
  const rawSet=Storage.prototype.setItem;
  const rawRemove=Storage.prototype.removeItem;

  function normalizeSlot(v){
    const n=Number(v);
    return Number.isInteger(n)&&n>=1&&n<=SLOT_COUNT?n:1;
  }
  function activeSlot(){
    return normalizeSlot(rawGet.call(localStorage,ACTIVE_KEY)||1);
  }
  function physicalStateKey(slot=activeSlot()){
    slot=normalizeSlot(slot);
    return slot===1?BASE_STATE_KEY:`${BASE_STATE_KEY}_slot_${slot}`;
  }
  function defaultMeta(){
    return {version:1,slots:Array.from({length:SLOT_COUNT},(_,i)=>({id:i+1,name:`Người dùng ${i+1}`}))};
  }
  function getMeta(){
    try{
      const raw=rawGet.call(localStorage,META_KEY);
      const meta=raw?JSON.parse(raw):defaultMeta();
      if(!Array.isArray(meta.slots)) return defaultMeta();
      const fallback=defaultMeta();
      for(let i=0;i<SLOT_COUNT;i++){
        if(!meta.slots[i]) meta.slots[i]=fallback.slots[i];
        meta.slots[i].id=i+1;
        meta.slots[i].name=String(meta.slots[i].name||fallback.slots[i].name).slice(0,40);
      }
      meta.slots=meta.slots.slice(0,SLOT_COUNT);
      return meta;
    }catch{return defaultMeta();}
  }
  function setMeta(meta){
    rawSet.call(localStorage,META_KEY,JSON.stringify(meta));
  }
  function setActiveSlot(slot){
    rawSet.call(localStorage,ACTIVE_KEY,String(normalizeSlot(slot)));
  }

  // Initialize metadata and active slot without touching the user's existing nbl_state_v1 data.
  if(!rawGet.call(localStorage,META_KEY)) setMeta(defaultMeta());
  if(!rawGet.call(localStorage,ACTIVE_KEY)) setActiveSlot(1);

  Storage.prototype.getItem=function(key){
    if(this===localStorage&&key===BASE_STATE_KEY) return rawGet.call(this,physicalStateKey());
    return rawGet.call(this,key);
  };
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&key===BASE_STATE_KEY) return rawSet.call(this,physicalStateKey(),value);
    return rawSet.call(this,key,value);
  };
  Storage.prototype.removeItem=function(key){
    if(this===localStorage&&key===BASE_STATE_KEY) return rawRemove.call(this,physicalStateKey());
    return rawRemove.call(this,key);
  };

  window.NBL_SLOTS={
    count:SLOT_COUNT,
    active:activeSlot,
    setActive:setActiveSlot,
    physicalKey:physicalStateKey,
    getMeta,
    setMeta,
    rawGet:key=>rawGet.call(localStorage,key),
    rawSet:(key,value)=>rawSet.call(localStorage,key,value),
    rawRemove:key=>rawRemove.call(localStorage,key)
  };
})();
