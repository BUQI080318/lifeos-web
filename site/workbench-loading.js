// A slow iframe remains visible as loading, with an explicit, non-destructive retry.
export function createLoadGate({onChange,onRetry,setTimer=setTimeout,clearTimer=clearTimeout,timeoutMs=45000}){
 let status='loading',timer,dead=false;
 const emit=()=>onChange({status,canRetry:status==='slow'});
 function arm(){clearTimer(timer);timer=setTimer(()=>{if(dead||status!=='loading')return;status='slow';emit();},timeoutMs);}
 emit();arm();
 return {ready(){if(dead)return;status='ready';clearTimer(timer);emit();},retry(){if(dead||status!=='slow')return;status='loading';emit();arm();onRetry();},destroy(){dead=true;clearTimer(timer);}};
}
