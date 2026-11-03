// Loading progress never resets the deadline; failures offer an explicit retry.
export function createLoadGate({onChange,onRetry,setTimer=setTimeout,clearTimer=clearTimeout,timeoutMs=45000}){
 let status='loading',timer,dead=false,message='';
 const emit=()=>onChange({status,canRetry:status==='slow'||status==='failed',message});
 function arm(){clearTimer(timer);timer=setTimer(()=>{if(dead||status!=='loading')return;status='slow';message='工作台加载较慢。可以重试；未保存的输入请先保留。';emit();},timeoutMs);}
 emit();arm();
 return {
  progress(value){if(dead||status==='ready'||status==='failed')return;message=String(value).slice(0,180);emit();},
  fail(value){if(dead||status==='ready')return;status='failed';message=String(value||'工作台资源加载失败，请重试。').slice(0,180);clearTimer(timer);emit();},
  ready(){if(dead)return;status='ready';message='';clearTimer(timer);emit();},
  retry(){if(dead||!['slow','failed'].includes(status))return;status='loading';message='';emit();arm();onRetry();},
  destroy(){dead=true;clearTimer(timer);}
 };
}
