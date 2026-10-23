// The old business stores retain their schema, but every key is scoped to its owner.
export function accountStorage(raw, owner, assertActive, prefix='lifeos-workbench-v1:') {
  if(!/^[0-9a-f-]{36}$/i.test(owner))throw Error('账户标识无效。');
  const allowed=new Set(['lifeos_v1','suda_baoyan_v2']);
  const full=key=>{assertActive();if(!allowed.has(key))throw Error('不允许访问其他存储。');return prefix+owner+':'+key;};
  return Object.freeze({
    getItem(key){return raw.getItem(full(key));},
    setItem(key,value){raw.setItem(full(key),String(value));},
    removeItem(key){raw.removeItem(full(key));}
  });
}
