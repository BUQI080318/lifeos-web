/* Frameless 3-Level Semantic Zoom Timeline Workbench (Year·Month <-> Day <-> 4-Period Day). */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localDayStr=value=>{const d=value instanceof Date?value:new Date(value);if(!Number.isFinite(+d))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const dateInput=value=>{if(!value)return '';if(/^\d{4}-\d\d-\d\d$/.test(value))return value+'T23:59';const date=new Date(value);if(!Number.isFinite(+date))return '';const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;};
  const when=value=>{if(!value)return '未设置';if(/^\d{4}-\d\d-\d\d$/.test(value))return value;const date=new Date(value);return Number.isFinite(+date)?new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date):String(value);};
  const mins=n=>{const value=Math.max(0,Math.round(Number(n)||0));return value>=60?`${Math.floor(value/60)} 小时${value%60?` ${value%60} 分钟`:''}`:`${value} 分钟`;};
  const action=(text,name,id='',classes='')=>`<button type="button" class="rs-button ${classes}" data-rs-action="${esc(name)}"${id!==''?` data-rs-id="${esc(id)}"`:''}>${esc(text)}</button>`;
  const priority={high:'重要',medium:'一般',low:'较低'};
  const schedPriorityLabel={asap:'立即处理',high:'重要',medium:'一般',low:'较低',none:'不设优先级'};
  const fmtClock=min=>{const m=Math.max(0,Math.trunc(Number(min)||0));return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};
  const fmtClockDate=iso=>{const d=new Date(iso);return Number.isFinite(+d)?`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:'';};
  const WEEKDAYS=['周日','周一','周二','周三','周四','周五','周六'];
  const PERIODS=[
    {id:'morning',label:'上午',icon:'<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 14h14M6 14a4 4 0 0 1 8 0M10 4v2.5M4.5 7.5l1.8 1.5M15.5 7.5l-1.8 1.5"/></svg>'},
    {id:'noon',label:'中午',icon:'<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="10" r="3.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"/></svg>'},
    {id:'afternoon',label:'下午',icon:'<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 15h14M6.5 12a3.8 3.8 0 0 1 7 0M10 4v3M14.8 6.5l-1.8 1.6"/></svg>'},
    {id:'evening',label:'晚上',icon:'<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M14.8 12.2A5.8 5.8 0 0 1 7.8 5.2a5.8 5.8 0 1 0 7 7z"/></svg>'}
  ];
  const periodOfMinute=m=>(m<720?'morning':m<795?'noon':m<1080?'afternoon':'evening');
  const classClockLabel=c=>(c.hideClock?'':`${fmtClockDate(c.start)}–${fmtClockDate(c.end)}`);

  const STARTER_RESOURCES=[
    // 公开课与通识（大陆直连）
    {id:'starter-mooc',name:'国家高等教育智慧教育平台',category:'公开课与通识',mode:'link',url:'https://higher.smartedu.cn/',notes:'教育部高教公共课与各学科一流课程视频及讲义。'},
    {id:'starter-icourse',name:'中国大学 MOOC（慕课）',category:'公开课与通识',mode:'link',url:'https://www.icourse163.org/',notes:'全国高校理工、经管、人文社科配套章节练习与课件。'},
    {id:'starter-xuetang',name:'学堂在线',category:'公开课与通识',mode:'link',url:'https://www.xuetangx.com/',notes:'清华等高校发起的工学、理学与经管开放课程平台。'},
    {id:'starter-cnmooc',name:'好大学在线（CNMOOC）',category:'公开课与通识',mode:'link',url:'https://www.cnmooc.org/',notes:'上交大等高水平大学共享慕课与通识学分课程。'},
    {id:'starter-163open',name:'网易公开课',category:'公开课与通识',mode:'link',url:'https://open.163.com/',notes:'国内直连国内外名校公开课合集（含中文字幕）。'},

    // 开源教材与开发（国内社区与技术文档为主）
    {id:'starter-helloalgo',name:'Hello 算法（动画图解开源书）',category:'开源教材与开发',mode:'link',url:'https://www.hello-algo.com/',notes:'国内作者开源，一键动画图解数据结构与算法，中文社区口碑极佳。'},
    {id:'starter-oiwiki',name:'OI Wiki 算法百科',category:'开源教材与开发',mode:'link',url:'https://oi-wiki.org/',notes:'国内竞赛与计算机社区共创的免费开源算法知识库。'},
    {id:'starter-csdiy',name:'CS 自学指南（CSDIY）',category:'开源教材与开发',mode:'link',url:'https://csdiy.wiki/',notes:'北大信科学长维护的计算机核心课程自学书单与路线。'},
    {id:'starter-wangdoc',name:'网道（WangDoc 中文开源教程）',category:'开源教材与开发',mode:'link',url:'https://wangdoc.com/',notes:'阮一峰团队维护的纯正中文开源编程文档（JS / C / Bash 等）。'},
    {id:'starter-runoob',name:'菜鸟教程（语法速查小站）',category:'开源教材与开发',mode:'link',url:'https://www.runoob.com/',notes:'适合实验课与写代码时快速检索基础语法和命令。'},
    {id:'starter-jsinfo',name:'现代 JavaScript 教程（中文社区）',category:'开源教材与开发',mode:'link',url:'https://zh.javascript.info/',notes:'结构清晰的开源现代前端教程，国内直连流畅。'},
    {id:'starter-ctfwik',name:'CTF Wiki 信息安全社区手册',category:'开源教材与开发',mode:'link',url:'https://ctf-wiki.org/',notes:'国内安全研究与高校战队的开源网安知识百科。'},
    {id:'starter-luogu',name:'洛谷（Luogu 算法社区）',category:'开源教材与开发',mode:'link',url:'https://www.luogu.com.cn/',notes:'国内大学生与算法入门常用的刷题、测试与社区题解平台。'},
    {id:'starter-leetcode',name:'力扣中国（LeetCode CN）',category:'开源教材与开发',mode:'link',url:'https://leetcode.cn/',notes:'数据结构练习、面试高频题库与中文技术讨论区。'},
    {id:'starter-openstax',name:'OpenStax 开源大学教材',category:'开源教材与开发',mode:'link',url:'https://openstax.org/',notes:'同行评审跨学科开源电子教材库（含微积分与基础科学 PDF）。'},

    // 人文社科与学术文献（国内公益库与小众中文站）
    {id:'starter-ncpssd',name:'国家哲学社会科学文献中心',category:'人文社科与学术文献',mode:'link',url:'https://www.ncpssd.org/',notes:'国内公益社科全文库，文学、历史、法学、马列期刊免费下载。'},
    {id:'starter-baidu-scholar',name:'百度学术',category:'人文社科与学术文献',mode:'link',url:'https://xueshu.baidu.com/',notes:'聚合国内中文期刊与学位论文题录，写文献综述直连检索最快。'},
    {id:'starter-cnki',name:'中国知网（CNKI）',category:'人文社科与学术文献',mode:'link',url:'https://www.cnki.net/',notes:'国内期刊论文与硕博学位论文总库（搭配校园网体验更佳）。'},
    {id:'starter-nlc',name:'国家图书馆 · 中华古籍与数字资源',category:'人文社科与学术文献',mode:'link',url:'https://www.nlc.cn/',notes:'公益开放数字古籍、地方志与民国文献全文阅览。'},
    {id:'starter-gushiwen',name:'古诗文网',category:'人文社科与学术文献',mode:'link',url:'https://www.gushiwen.cn/',notes:'诗词典故、文言文逐句译注与文学写作查据社区小站。'},
    {id:'starter-souyun',name:'搜韵（中华诗词与格律社区）',category:'人文社科与学术文献',mode:'link',url:'https://sou-yun.cn/',notes:'中文学子喜爱的诗词检索、平水韵格律校验与古诗地图小站。'},
    {id:'starter-zdic',name:'汉典',category:'人文社科与学术文献',mode:'link',url:'https://www.zdic.net/',notes:'古今汉语字典、说文解字及文献出处考据常用。'},

    // 语言与考试（国内直连）
    {id:'starter-cet',name:'全国大学英语四、六级考试官网',category:'语言与考试',mode:'link',url:'https://cet.neea.edu.cn/',notes:'考试大纲、口试说明与官方报名日程直达。'},
    {id:'starter-youdao',name:'有道词典网页版',category:'语言与考试',mode:'link',url:'https://dict.youdao.com/',notes:'双语查词、柯林斯例句及学术论文表达检索。'}
  ];
  function safeWebUrl(u){try{const p=new URL(String(u||''));return p.protocol==='https:'||p.protocol==='http:'?p.href:'';}catch{return '';}}

  function urgencyMeta(deadlineVal){
    if(!deadlineVal)return {axis:'无固定期限',level:'none',note:'无硬性截止，超载时优先让路'};
    const ms=Date.parse(/^\d{4}-\d\d-\d\d$/.test(deadlineVal)?deadlineVal+'T23:59:59':deadlineVal);
    if(!Number.isFinite(ms))return {axis:'待确认期限',level:'none',note:'填写有效日期后自动计算紧迫度'};
    const days=Math.floor((ms-Date.now())/86400000);
    if(days<0)return {axis:'已逾期',level:'urgent',note:'已超过截止日'};
    if(days<=2)return {axis:`紧急（${days===0?'今天':'距截止 '+days+' 天'}）`,level:'urgent',note:'48 小时内临期'};
    return {axis:`常规期限（距截止 ${days} 天）`,level:'normal',note:'按重要程度推进'};
  }

  function contextCard(model,ui={}){
    if(model.mode==='demo')return '';
    const built=ui.contextPreview||{context:{tasks:[],events:[]},references:{}},excluded=new Set(ui.excludeIds||[]),tasks=built.context.tasks;
    return `<details class="rs-dock-consent"><summary>AI 摘要授权（默认关闭）</summary><div class="rs-dock-consent-body"><label class="rs-context-consent"><input type="checkbox" data-ai-consent ${model.aiContextConsent?'checked':''}>允许 AI 参考相关任务摘要</label><p class="rs-note">仅发送标题、课程、期限与进度，不含笔记或文件正文。</p>${model.aiContextConsent?`<div class="rs-context-list">${tasks.map(t=>`<label class="rs-context-item"><input type="checkbox" data-ai-include="${esc(built.references[t.ref]?.id||'')}" ${excluded.has(built.references[t.ref]?.id)?'':'checked'}><span>${esc(t.title)}${t.course?' · '+esc(t.course):''}</span></label>`).join('')||'<p class="rs-note">暂无未完成任务。</p>'}<label class="rs-context-item"><input type="checkbox" data-ai-history ${ui.includeHistory!==false?'checked':''}>附带近期进度变化</label></div>`:''}</div></details>`;
  }

  function buildDayContext(model,todayStr){
    const report=model.timelineReport||model.scheduleReport||{scheduled:[],dropped:[],remainder:[]};
    const dayWinMap=new Map((model.timelineDays||[]).map(d=>[d.day,d.windows||[]]));
    const taskMap=new Map((model.tasks||[]).map(t=>[t.id,t]));
    const taskFutureMap=new Map();
    for(const item of report.scheduled||[])taskFutureMap.set(item.task,item.blocks||[]);

    const semMon=model.semesterStart||mondayOf(todayStr);
    const imp=window.LifeOSScheduleImporter;
    const blockedByDay=new Map();
    (model.blockedSlots||[]).forEach((b,idx)=>{
      const dStr=localDayStr(b.start);
      if(!dStr)return;
      const ws=Number(b.weekStart),we=Number(b.weekEnd),wm=b.weekMode||'all';
      if(Number.isInteger(ws)||wm!=='all'){
        const wkNum=weekDiff(mondayOf(dStr),semMon)+1;
        if(wkNum>=1){
          if(Number.isInteger(ws)&&wkNum<ws)return;
          if(Number.isInteger(we)&&wkNum>we)return;
          if(wm==='odd'&&wkNum%2===0)return;
          if(wm==='even'&&wkNum%2===1)return;
        }
      }
      const sd=new Date(b.start),ed=new Date(b.end);
      const startMin=sd.getHours()*60+sd.getMinutes();
      const endMin=Math.max(startMin+15,ed.getHours()*60+ed.getMinutes());
      const secRng=(imp?.extractSectionRange?.(b))||(Number.isInteger(Number(b.sectionStart))?{s1:Number(b.sectionStart),s2:Number(b.sectionEnd||b.sectionStart)}:null);
      const period=(b.bellCalibrated&&!b.hideClock)
        ?periodOfMinute(startMin)
        :(secRng?(secRng.s1<=5?'morning':secRng.s1<=9?'afternoon':'evening'):(['morning','noon','afternoon','evening'].includes(b.period)?b.period:periodOfMinute(startMin)));
      const sortKey=secRng?(secRng.s1*100+secRng.s2):startMin;
      const list=blockedByDay.get(dStr)||[];
      list.push({index:idx,start:b.start,end:b.end,startMin,endMin,sortKey,period,hideClock:b.hideClock===true,source:b.source||'',title:b.title||'固定日程',location:b.location||''});
      blockedByDay.set(dStr,list);
    });
    return {report,dayWinMap,taskMap,taskFutureMap,blockedByDay,todayStr};
  }

  function computeDayData(dt,ctx,model){
    const dayStr=localDayStr(dt);
    const baseParts=ctx.todayStr.split('-').map(Number);
    const todayDt=new Date(baseParts[0],baseParts[1]-1,baseParts[2]);
    const offset=Math.round((new Date(dt.getFullYear(),dt.getMonth(),dt.getDate())-todayDt)/86400000);
    const dow=dt.getDay();
    const relLabel=offset===-2?'前天':offset===-1?'昨天':offset===0?'今天':offset===1?'明天':offset===2?'后天':WEEKDAYS[dow];
    const classes=(ctx.blockedByDay.get(dayStr)||[]).slice().sort((a,b)=>(a.sortKey??a.startMin)-(b.sortKey??b.startMin));
    const rawWindows=(ctx.dayWinMap.get(dayStr)||[]).map(w=>[w[0],w[1]]);
    const freeMinutes=rawWindows.reduce((s,w)=>s+w[1],0);

    let winIdx=0,winCursor=rawWindows[0]?.[0]??1140,winRem=rawWindows[0]?.[1]??0;
    const studyBlocks=[];
    for(const item of ctx.report.scheduled||[]){
      for(const b of item.blocks||[]){
        if(b.day!==dayStr)continue;
        let left=b.min,assignedStart=null;
        while(left>0&&winIdx<rawWindows.length){
          if(winRem<=0){winIdx++;if(winIdx<rawWindows.length){winCursor=rawWindows[winIdx][0];winRem=rawWindows[winIdx][1];}continue;}
          if(assignedStart===null)assignedStart=winCursor;
          const take=Math.min(left,winRem);
          winCursor+=take;winRem-=take;left-=take;
        }
        const period=assignedStart!==null?periodOfMinute(assignedStart):(offset===0?'evening':'morning');
        const taskObj=ctx.taskMap.get(item.task)||{id:item.task,title:item.name,progress:0};
        const otherDays=(ctx.taskFutureMap.get(item.task)||[]).filter(x=>x.day>dayStr);
        studyBlocks.push({taskId:item.task,task:taskObj,title:item.name,minutes:b.min,totalEffMin:item.effMin,startMin:assignedStart,period,nextContinuation:otherDays[0]||null});
      }
    }
    const completedOnDay=(model.tasks||[]).filter(t=>t.kind!=='habit'&&t.completed&&(t.completedDate===dayStr||(t.completedAt&&localDayStr(t.completedAt)===dayStr)));
    const dueTasks=(model.tasks||[]).filter(t=>t.kind!=='habit'&&!t.completed&&!t.archived&&((t.due&&t.due===dayStr)||(t.deadline&&localDayStr(t.deadline)===dayStr)));
    const plannedMinutes=studyBlocks.reduce((s,x)=>s+x.minutes,0);

    return {
      offset,dayStr,dow,relLabel,
      month:dt.getMonth()+1,dayNum:dt.getDate(),year:dt.getFullYear(),
      shortDate:`${dt.getMonth()+1}/${dt.getDate()}`,
      titleDate:`${dt.getMonth()+1} 月 ${dt.getDate()} 日${offset===0?' · 今天':offset===1?' · 明天':offset===-1?' · 昨天':''}`,
      weekday:WEEKDAYS[dow],
      isPast:offset<0,isToday:offset===0,
      classes,studyBlocks,completedOnDay,dueTasks,freeMinutes,plannedMinutes,rawWindows
    };
  }

  function buildDaysForMonth(ym,model,todayStr){
    const ctx=buildDayContext(model,todayStr);
    const [y,m]=ym.split('-').map(Number);
    const totalDays=new Date(y,m,0).getDate();
    const out=[];
    for(let i=-2;i<=totalDays+2;i++){
      out.push(computeDayData(new Date(y,m-1,i),ctx,model));
    }
    return {days:out,report:ctx.report};
  }

  function buildMonths(model,todayStr){
    const [ty,tm]=todayStr.split('-').map(Number);
    const ctx=buildDayContext(model,todayStr);
    const out=[];
    for(let offset=-2;offset<=9;offset++){
      const d=new Date(ty,tm-1+offset,1);
      const y=d.getFullYear(),m=d.getMonth()+1,ym=`${y}-${String(m).padStart(2,'0')}`;
      const classesCount=(model.blockedSlots||[]).filter(b=>localDayStr(b.start).startsWith(ym)).length;
      const dueTasks=(model.tasks||[]).filter(t=>t.kind!=='habit'&&!t.completed&&!t.archived&&((t.due||'').startsWith(ym)||(t.deadline&&localDayStr(t.deadline).startsWith(ym))));
      let plannedMinutes=0;const previewTitles=[];
      for(const item of ctx.report.scheduled||[]){
        for(const b of item.blocks||[]){
          if(b.day.startsWith(ym)){plannedMinutes+=b.min;if(!previewTitles.includes(item.name))previewTitles.push(item.name);}
        }
      }
      out.push({
        ym,year:y,month:m,label:`${m}月`,
        fullLabel:`${y} 年 ${m} 月`,
        isCurrent:offset===0,
        classesCount,dueTasks,plannedMinutes,
        previewItems:[...previewTitles.slice(0,3),...dueTasks.map(t=>t.title)].filter((v,i,a)=>a.indexOf(v)===i).slice(0,4)
      });
    }
    return out;
  }

  const TODAY_STATES=[
    {id:'light',label:'只保底',mins:90},
    {id:'normal',label:'正常节奏',mins:150},
    {id:'sprint',label:'状态好',mins:240}
  ];
  const EFFORT_FEELS=[
    {id:'30',label:'随手就能做'},
    {id:'60',label:'坐一会能完'},
    {id:'150',label:'大块 · 分几次'}
  ];
  const AMBIENT_IMAGES={
    morning:'/lifeos-web/assets/workbench/wb-ambient-morning.png',
    noon:'/lifeos-web/assets/workbench/wb-ambient-afternoon.png',
    afternoon:'/lifeos-web/assets/workbench/wb-ambient-afternoon.png',
    evening:'/lifeos-web/assets/workbench/wb-ambient-night.png',
    study:'/lifeos-web/assets/workbench/wb-study-backdrop.png',
    resources:'/lifeos-web/assets/workbench/wb-res-backdrop.png'
  };
  function currentPeriodByHour(dt=new Date()){
    const h=dt.getHours();
    if(h<12)return 'morning';
    if(h<14)return 'noon';
    if(h<18)return 'afternoon';
    return 'evening';
  }
  function stateSwitchHtml(activeState){
    return `<div class="rs-state-switch" role="group" aria-label="切换今日状态"><span>今日状态：</span>${TODAY_STATES.map(s=>action(s.label,'today-state',s.id,activeState===s.id?'rs-primary':'rs-quiet-button')).join('')}</div>`;
  }

  function dayMetaSummary(d){
    if(d.isPast)return `${d.weekday}${d.completedOnDay.length?' · 完成了 '+d.completedOnDay.length+' 件事':' · 轻松回看'}`;
    const parts=[d.weekday];
    if(d.classes.length)parts.push(`${d.classes.length} 节课程`);
    if(d.studyBlocks.length)parts.push(`安排 ${d.studyBlocks.length} 项推进`);
    else parts.push(d.classes.length?'其余时段自然留白':'这一天还是空的，随时拖拽或新建');
    if(d.dueTasks.length)parts.push(`${d.dueTasks.length} 项临近截止`);
    return parts.join(' · ');
  }

  function renderFourPeriodPreview(d,todayState='light',isBlankBoard=false,model=null,ui=null){
    const nowPer=d.isToday?currentPeriodByHour():'';
    const inlineTarget=ui?.inlineSlotKey||'';
    const protoList=model?extractCoursePrototypes(model):[];
    const findProtoId=c=>{
      const hit=protoList.find(p=>c.start===p.start||(c.title&&p.fullTitle===c.title&&c.day===p.day));
      if(hit)return {id:hit.id,colorIdx:hit.colorIdx};
      return {id:'',colorIdx:hashCourseColor(c.title||'')};
    };
    const emptyGuide=isBlankBoard?`<div class="rs-empty-guide" data-rs-glow><div><strong>时间线还是空的</strong><span>支持直连学校教务课表、导入 WakeUp / 日历文件，或拖入课表截图自动梳理。</span></div><div class="rs-actions">${action('一键导入课表 / 识图','open-import','','rs-primary')}${action('载入示范课表体验','demo-c2','','rs-quiet-button')}</div></div>`:'';
    return `<div class="rs-open-preview-grid">
      ${PERIODS.map(p=>{
        const classes=d.classes.filter(c=>c.period===p.id);
        const studies=d.studyBlocks.filter(s=>s.period===p.id);
        const done=d.isPast?d.completedOnDay.filter(t=>periodOfMinute(t.completedAt?new Date(t.completedAt).getHours()*60:1140)===p.id):[];
        const count=classes.length+studies.length+done.length;
        const slotKey=`${d.dayStr}|${p.id}`;
        const isNow=nowPer===p.id;
        return `<div class="rs-prev-col ${count?'has-items':''} ${isNow?'is-now-period':''}" data-rs-glow data-rs-drop-period="${esc(slotKey)}" data-rs-action="open-period-at" data-rs-id="${esc(d.dayStr)}">
          <div class="rs-prev-head">${p.icon}<span>${esc(p.label)}</span>${isNow?'<span class="rs-now-beam"><i></i>此刻</span>':''}${!d.isPast?`<button type="button" class="rs-inline-plus" data-rs-action="open-inline-slot" data-rs-id="${esc(slotKey)}" aria-label="在${esc(p.label)}添加安排" title="点击直接输入">+</button>`:''}</div>
          <div class="rs-prev-items">
            ${classes.map(c=>{const meta=findProtoId(c);return meta.id?`<button type="button" class="rs-prev-chip is-fixed is-c${meta.colorIdx}" data-rs-glow data-rs-action="edit-course-card" data-rs-id="${esc(meta.id)}"><strong>${esc(c.title)}</strong>${classClockLabel(c)?`<small>${esc(classClockLabel(c))}</small>`:''}</button>`:`<div class="rs-prev-chip is-fixed is-c${meta.colorIdx}" data-rs-glow><strong>${esc(c.title)}</strong>${classClockLabel(c)?`<small>${esc(classClockLabel(c))}</small>`:''}</div>`;}).join('')}
            ${studies.map(s=>`<div class="rs-prev-chip is-study" data-rs-glow><strong>${esc(s.title)}</strong><small>${s.nextContinuation?`先推这一步 · 余下顺延至 ${esc(s.nextContinuation.day.slice(5))}`:'轻松推进'}</small></div>`).join('')}
            ${done.map(t=>`<div class="rs-prev-chip is-done"><strong>${esc(t.title)}</strong><small>已完成</small></div>`).join('')}
            ${!count&&inlineTarget!==slotKey?`<span class="rs-prev-empty">${d.isPast?'—':'留白 · 可拖入任务或点 +'}</span>`:''}
          </div>
          ${inlineTarget===slotKey?`<form class="rs-inline-composer" data-rs-form="inline-slot"><input type="hidden" name="day" value="${esc(d.dayStr)}"><input type="hidden" name="period" value="${esc(p.id)}"><input name="title" required maxlength="120" placeholder="写一句安排，回车放入…" data-rs-inline-input><button type="submit">放进</button></form>`:''}
        </div>`;
      }).join('')}
    </div>
    ${emptyGuide}
    <div class="rs-tl-preview-foot">
      ${d.isToday?stateSwitchHtml(todayState):'<span></span>'}
      <div class="rs-actions">${action('展开全天竖向时间轴 ↓','set-zoom','period','rs-quiet-button')}</div>
    </div>`;
  }

  function renderStrategyBoard(model){
    const s=model.strategyDraft;
    if(!s||!Array.isArray(s.options)||!s.options.length)return '';
    return `<section class="rs-tier-board rs-scene-reveal" aria-label="LifeOS 节奏方案选择">
      <div class="rs-tier-header">
        <div>
          <p class="rs-kicker">LifeOS 顾问建议</p>
          <h2>选一种此刻最顺手的过法</h2>
        </div>
        ${action('暂不重排','strategy-cancel','','rs-quiet-button')}
      </div>
      ${s.diagnosis?`<p class="rs-mentor-note">${esc(s.diagnosis)}</p>`:''}
      <div class="rs-tier-grid">
        ${s.options.map((opt,oi)=>{
          const isRec=opt.recommended||(oi===0&&!s.options.some(x=>x.recommended));
          const ctaText='选择此方案';
          return `<article class="rs-tier-card ${isRec?'is-featured':''}">
            ${isRec?`<div class="rs-tier-ribbon">${esc(opt.badge||'更适合这周节奏')}</div>`:`<div class="rs-tier-eyebrow">${esc(opt.badge||`方案 ${oi+1}`)}</div>`}
            <div class="rs-tier-top">
              <h3>${esc(opt.title)}</h3>
              <div class="rs-tier-metric">
                <strong>${esc(opt.headlineValue||'按空档重排')}</strong>
                <span>${esc(opt.headlineSub||'自动避开满课与深夜')}</span>
              </div>
              <button type="button" class="rs-tier-cta ${isRec?'is-primary':''}" data-rs-action="apply-ai-strategy" data-rs-id="${esc(opt.id)}">${ctaText}</button>
            </div>
            <hr class="rs-tier-rule">
            ${opt.advice?`<p class="rs-tier-advice">${esc(opt.advice)}</p>`:''}
            ${opt.benefits?.length?`<ul class="rs-tier-features">${opt.benefits.map(line=>`<li><span class="rs-tier-check" aria-hidden="true">✓</span><span>${esc(line)}</span></li>`).join('')}</ul>`:''}
            ${opt.previewBlocks?.length?`<details class="rs-tier-more"><summary>查看具体排入的 ${opt.previewBlocks.length} 段时段明细</summary><div class="rs-tier-schedule-lines">${opt.previewBlocks.map(b=>`<div><span>${esc(b.dayLabel)} ${esc(b.clock)}</span><strong>${esc(b.title)}</strong></div>`).join('')}</div></details>`:''}
          </article>`;
        }).join('')}
      </div>
    </section>`;
  }

  function renderMonthPreview(m){
    const meta=[
      m.classesCount?`${m.classesCount} 节固定课程`:'',
      m.dueTasks.length?`${m.dueTasks.length} 项即将截止`:''
    ].filter(Boolean).join(' · ')||'本月暂未压着太多事，可以放心安排生活';
    return `<div class="rs-month-preview-line">
      <div>
        <p class="rs-note">${esc(meta)}</p>
        ${m.previewItems.length?`<div class="rs-month-chips">${m.previewItems.map(t=>`<span>${esc(t)}</span>`).join('')}</div>`:''}
      </div>
      ${action('进入本月具体日期 ↓','enter-month',m.ym,'rs-primary')}
    </div>`;
  }

  function renderPeriodBlock(period,dayData,model){
    const classes=dayData.classes.filter(c=>c.period===period.id);
    const studies=dayData.studyBlocks.filter(s=>s.period===period.id);
    const doneItems=dayData.isPast?dayData.completedOnDay.filter(t=>periodOfMinute(t.completedAt?new Date(t.completedAt).getHours()*60:1140)===period.id):[];

    return `<article class="rs-open-period-row">
      <div class="rs-open-period-label">
        <span class="rs-open-dot ${classes.length||studies.length?'is-lit':''}" aria-hidden="true"></span>
        <div class="rs-open-name">${period.icon}<strong>${esc(period.label)}</strong></div>
      </div>
      <div class="rs-open-period-body">
        ${classes.map(c=>`<div class="rs-flow-item is-fixed">
          <div class="rs-flow-main">
            <span class="rs-block-badge is-fixed">课程 / 固定</span>
            <strong>${esc(c.title)}</strong>
            ${classClockLabel(c)?`<small>${esc(classClockLabel(c))}</small>`:''}
            ${c.location&&!String(c.title||'').includes(c.location)?`<small>${esc(c.location)}</small>`:''}
          </div>
          <button type="button" class="rs-button rs-quiet-button rs-block-del" data-rs-action="remove-blocked-slot" data-rs-id="${c.index}">移除</button>
        </div>`).join('')}

        ${studies.map(s=>{
          const t=s.task,pct=Math.min(100,Math.max(0,Number(t.progress)||0));
          const resList=(t.resourceIds||[]).map(rid=>{const item=(model.resources||[]).find(r=>r.id===rid);return item?{id:rid,name:item.name||item.title}:null;}).filter(Boolean);
          return `<div class="rs-flow-item is-study">
            <div class="rs-block-top">
              <div>
                <span class="rs-block-badge is-study">${s.nextContinuation?'今天先做这一步':'轻松推进'}</span>
                <strong>${esc(s.title)}</strong>
                ${t.course?`<span class="rs-block-course">${esc(t.course)}</span>`:''}
              </div>
              <div class="rs-block-actions">
                ${action('开始专注','start-task',s.taskId,'rs-primary')}
                ${action('完成 ✓','toggle-task',s.taskId,'rs-quiet-button')}
                ${action('编辑','edit-task',s.taskId,'rs-quiet-button')}
              </div>
            </div>
            <div class="rs-block-sub">
              <span>${t.deadline||t.due?'截止 '+esc(when(t.deadline||t.due)):'不急，慢慢来'}</span>
              <span>进度 ${pct}%</span>
              ${s.nextContinuation?`<button type="button" class="rs-link-btn" data-rs-action="select-day" data-rs-id="${esc(s.nextContinuation.day)}">余下部分已顺延至 ${esc(s.nextContinuation.day.slice(5))} ↗</button>`:''}
            </div>
            ${resList.length?`<div class="rs-block-res">资料：${resList.map(r=>`<button type="button" class="rs-file-link" data-kh-action="preview" data-kh-id="${esc(r.id)}">${esc(r.name)}</button>`).join(' ')}</div>`:''}
            <div class="rs-progress"><span style="width:${pct}%"></span></div>
          </div>`;
        }).join('')}

        ${doneItems.map(t=>`<div class="rs-flow-item is-done">
          <div class="rs-flow-main"><span class="rs-block-badge is-done">已完成 ✓</span><strong>${esc(t.title)}</strong>${t.actualMinutes?`<small>用时 ${esc(t.actualMinutes)} 分钟</small>`:''}</div>
          ${action('取消完成','toggle-task',t.id,'rs-quiet-button')}
        </div>`).join('')}

        ${!classes.length&&!studies.length&&!doneItems.length?`<div class="rs-open-empty">
          <span>${dayData.isPast?'该时段无记录':'空闲时段'}</span>
          ${!dayData.isPast?`<div class="rs-actions"><button type="button" class="rs-inline-add" data-rs-action="new-task-at" data-rs-id="${esc(dayData.dayStr)}">+ 记任务</button><button type="button" class="rs-inline-add" data-rs-action="new-block-at" data-rs-id="${esc(dayData.dayStr+'|'+period.id)}">+ 记课程</button></div>`:''}
        </div>`:''}
      </div>
    </article>`;
  }

  function renderNotePreviewCard(preview){
    if(!preview)return '';
    const bCount=preview.blockedSlots?.length||0,tCount=preview.tasks?.length||0,aCount=preview.dayAdjustments?.length||0;
    return `<section class="rs-panel rs-import-preview" aria-label="识别结果预览">
      <div class="rs-panel-head">
        <div><p class="rs-kicker">本地快速识别 · 确认后放上时间线</p><h2>已识别 ${bCount} 节课程/日程 · ${tCount} 项任务 · ${aCount} 条时间调整</h2></div>
        <div class="rs-actions">${action('确认放上时间线','confirm-note-import','','rs-primary')}${action('取消','cancel-note-import','','rs-quiet-button')}</div>
      </div>
      <div class="rs-preview-groups">
        ${bCount?`<div class="rs-preview-list">${preview.blockedSlots.slice(0,8).map(b=>`<div class="rs-preview-row"><span class="rs-tag-fixed">课程/日程</span><strong>${esc(b.title)}</strong><small>${esc(b.day)} ${esc(({morning:'上午',noon:'中午',afternoon:'下午',evening:'晚上'})[b.period]||'')}${b.hideClock?'':` ${esc(fmtClockDate(b.start))}–${esc(fmtClockDate(b.end))}`}</small></div>`).join('')}${bCount>8?`<p class="rs-note">另有 ${bCount-8} 节后续课程同步准备好导入。</p>`:''}</div>`:''}
        ${tCount?`<div class="rs-preview-list">${preview.tasks.map(t=>`<div class="rs-preview-row"><span class="rs-tag-study">学习任务</span><strong>${esc(t.title)}</strong><small>${t.due?'截止 '+esc(t.due)+' · ':''}预计 ${esc(t.estimateMinutes)} 分钟</small></div>`).join('')}</div>`:''}
        ${aCount?`<div class="rs-preview-list">${preview.dayAdjustments.map(a=>`<div class="rs-preview-row"><span class="rs-tag-time">可用时间</span><strong>${esc(a.day)} 可用约 ${esc(a.totalMinutes)} 分钟</strong><small>${esc(a.note)}</small></div>`).join('')}</div>`:''}
      </div>
    </section>`;
  }

  function mondayOf(dayStr){
    const p=String(dayStr||'').split('-').map(Number);
    const dt=p.length===3?new Date(p[0],p[1]-1,p[2],12,0,0):new Date();
    const dow=dt.getDay()||7;
    dt.setDate(dt.getDate()-(dow-1));
    return localDayStr(dt);
  }
  function weekDiff(monA,monB){
    const a=new Date(monA+'T12:00:00').getTime(),b=new Date(monB+'T12:00:00').getTime();
    return Math.round((a-b)/(7*86400000));
  }
  function hashCourseColor(key){
    let h=0;const s=String(key||'');
    for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
    return h%8;
  }
  function extractCoursePrototypes(model){
    const imp=window.LifeOSScheduleImporter;
    const slots=Array.isArray(model?.blockedSlots)?model.blockedSlots:[];
    const map=new Map();
    slots.forEach((b,idx)=>{
      if(!b?.start||!b?.title)return;
      const dt=new Date(b.start);
      const wd=dt.getDay()||7;
      const s1=Number(b.sectionStart)||(imp?.extractSectionRange?.(b)?.s1)||Math.max(1,Math.min(12,Math.round((dt.getHours()*60+dt.getMinutes()-480)/55)+1));
      const s2=Number(b.sectionEnd)||(imp?.extractSectionRange?.(b)?.s2)||s1;
      const cKey=imp?.canonicalCourseKey?imp.canonicalCourseKey(b.title):String(b.title).toLowerCase();
      const k=`${wd}|${s1}|${s2}|${cKey}`;
      if(!map.has(k)){
        const cleanTitle=String(b.title||'').replace(/\s*·\s*第?\s*\d{1,2}(?:\s*[-~到至]\s*\d{1,2})?\s*节.*$/,'').replace(/\s*\([^)]*(?:幢|栋|楼|室|馆|机房)[^)]*\)$/,'').trim()||String(b.title);
        map.set(k,{
          id:k,matchKey:cKey,weekday:wd,sectionStart:s1,sectionEnd:Math.max(s1,s2),
          title:cleanTitle,fullTitle:b.title,location:b.location||'',teacher:b.teacher||'',
          weekStart:Number(b.weekStart)||1,weekEnd:Number(b.weekEnd)||18,
          weekMode:['all','odd','even'].includes(b.weekMode)?b.weekMode:'all',
          colorIdx:Number.isInteger(Number(b.colorIdx))?Number(b.colorIdx):hashCourseColor(cKey),
          day:b.day||localDayStr(dt),start:b.start,end:b.end,slotIndex:idx
        });
      }
    });
    return [...map.values()].sort((a,b)=>a.weekday-b.weekday||a.sectionStart-b.sectionStart);
  }
  function renderWeekGridStage(model,ui,todayStr){
    const imp=window.LifeOSScheduleImporter;
    const protos=extractCoursePrototypes(model);
    const baseMon=mondayOf(ui.selectedDay||todayStr);
    const curMon=mondayOf(todayStr);
    const semMon=model.semesterStart||curMon;
    const weekNum=weekDiff(baseMon,semMon)+1;
    const hasWeekendCourses=protos.some(p=>p.weekday>=6);
    const showWeekend=Boolean(ui.showWeekend||hasWeekendCourses);
    const dayCols=showWeekend?7:5;
    const maxSec=Math.max(12,...protos.map(p=>p.sectionEnd||1));
    const bellMap=new Map((model.bellSchedule||[]).map(b=>[Number(b.section),b]));
    const defaultStart=s=>(imp?.BELL_PRESETS?.suda_12?.entries?.find(e=>e.section===s))||null;
    const wkBadge=weekNum>=1?`第 ${weekNum} 周 · ${weekNum%2===1?'单周':'双周'}`:`第 ${weekNum} 周`;
    const colDates=[];
    for(let i=0;i<dayCols;i++){
      const p=baseMon.split('-').map(Number);
      const dt=new Date(p[0],p[1]-1,p[2]+i,12,0,0);
      const dStr=localDayStr(dt);
      colDates.push({dow:i+1,dayStr:dStr,label:`周${'一二三四五六日'[i]}`,short:`${dt.getMonth()+1}/${dt.getDate()}`,isToday:dStr===todayStr});
    }
    const occupied=new Set();
    const courseCards=[];
    for(const c of protos){
      if(c.weekday>dayCols)continue;
      const inRange=weekNum<1||(weekNum>=c.weekStart&&weekNum<=c.weekEnd&&(c.weekMode==='all'||(c.weekMode==='odd'&&weekNum%2===1)||(c.weekMode==='even'&&weekNum%2===0)));
      for(let r=c.sectionStart;r<=c.sectionEnd;r++)occupied.add(`${c.weekday}:${r}`);
      const wkMeta=`${c.weekStart}-${c.weekEnd}周${c.weekMode==='odd'?'·单':c.weekMode==='even'?'·双':''}`;
      courseCards.push(`<button type="button" class="rs-wk-course rs-wk-c${c.colorIdx%8} ${inRange?'':'is-off-week'}" style="grid-column:${c.weekday+1};grid-row:${c.sectionStart+1}/${c.sectionEnd+2}" data-rs-action="edit-course-card" data-rs-id="${esc(c.id)}">
        <div><strong>${esc(c.title)}</strong>${c.location?`<small>@${esc(c.location)}</small>`:''}</div>
        <em>${inRange?esc(wkMeta):'非本周'}</em>
      </button>`);
    }
    const blanks=[];
    for(let r=1;r<=maxSec;r++){
      for(let d=1;d<=dayCols;d++){
        if(occupied.has(`${d}:${r}`))continue;
        blanks.push(`<button type="button" class="rs-wk-slot-blank" style="grid-column:${d+1};grid-row:${r+1}" data-rs-action="new-course-at" data-rs-id="${d}|${r}" title="点击添加第${r}节课程或安排"></button>`);
      }
    }
    const axes=[];
    for(let r=1;r<=maxSec;r++){
      const b=bellMap.get(r)||defaultStart(r);
      axes.push(`<div class="rs-wk-axis" style="grid-column:1;grid-row:${r+1}"><strong>${r}</strong>${b?`<span>${esc(b.start)}</span><span>${esc(b.end)}</span>`:''}</div>`);
    }
    const headers=`<div class="rs-wk-head" style="grid-column:1;grid-row:1"><strong>节次</strong></div>`+colDates.map(cd=>`<div class="rs-wk-head ${cd.isToday?'is-today':''}" style="grid-column:${cd.dow+1};grid-row:1"><strong>${esc(cd.label)}</strong><span>${esc(cd.short)}</span></div>`).join('');
    const toolbar=`<div class="rs-wk-toolbar">
      <div class="rs-wk-weeknav">
        ${action('‹ 上周','step-week','-1','rs-quiet-button')}
        <span class="rs-wk-week-badge">${esc(wkBadge)}</span>
        ${action('下周 ›','step-week','1','rs-quiet-button')}
        ${weekNum!==1?action('设本周为第1周','set-this-week-1',baseMon,'rs-quiet-button'):''}
      </div>
      <div class="rs-actions">
        ${!hasWeekendCourses?action(showWeekend?'隐藏周末':'显示周末','toggle-wk-weekend','','rs-quiet-button'):''}
        ${action('作息时间'+(model.bellSchedule?.length?` (${model.bellSchedule.length}节)`:''),'open-bell-editor','','rs-quiet-button')}
        ${action('+ 加一节课','new-course-at','1|1','rs-quiet-button')}
      </div>
    </div>`;
    const grid=`<div class="rs-wk-board-wrap"><div class="rs-wk-grid" style="grid-template-columns:50px repeat(${dayCols},minmax(92px,1fr));grid-template-rows:42px repeat(${maxSec},minmax(44px,auto))">${headers}${axes.join('')}${blanks.join('')}${courseCards.join('')}</div></div>`;
    return {
      liveTitle:`第 ${weekNum} 周课表`,
      liveMeta:protos.length?`本周共 ${protos.filter(p=>p.weekday<=dayCols).length} 门课程 · 点击任意课程卡片即可修改或为其新建学习任务`:'还没有课程，点上方「导入课表」或点击空白格子即可快速添加',
      stageBody:toolbar+grid
    };
  }

  function courseForm(draft){
    if(!draft)return '';
    const isNew=Boolean(draft.isNew);
    const colors=[0,1,2,3,4,5,6,7];
    return `<div class="rs-modal-backdrop"><form class="rs-dialog" data-rs-form="course-card" role="dialog" aria-modal="true" aria-labelledby="rsCourseTitle">
      <div class="rs-panel-head"><div><p class="rs-kicker">WakeUp 式课程卡片</p><h2 id="rsCourseTitle">${isNew?'添加一门固定课程':'查看 / 微调课程'}</h2></div>${action('关闭','close-course','','rs-quiet-button')}</div>
      <input type="hidden" name="matchKey" value="${esc(draft.matchKey||'')}">
      <input type="hidden" name="matchDow" value="${esc(draft.matchDow||'')}">
      <input type="hidden" name="matchS1" value="${esc(draft.matchS1||'')}">
      <input type="hidden" name="matchS2" value="${esc(draft.matchS2||'')}">
      <div class="rs-grid">
        <label class="rs-full">课程名称 *<input name="title" required maxlength="80" value="${esc(draft.title||'')}" placeholder="例：马克思主义文论经典选读"></label>
        <label>星期几<select name="weekday">${['周一','周二','周三','周四','周五','周六','周日'].map((w,i)=>`<option value="${i+1}" ${Number(draft.weekday||1)===i+1?'selected':''}>${w}</option>`).join('')}</select></label>
        <label>开始节次<input name="sectionStart" type="number" min="1" max="16" value="${esc(draft.sectionStart||1)}"></label>
        <label>结束节次<input name="sectionEnd" type="number" min="1" max="16" value="${esc(draft.sectionEnd||2)}"></label>
        <label>上课教室<input name="location" maxlength="60" value="${esc(draft.location||'')}" placeholder="例：1002幢2205"></label>
        <label>授课老师<input name="teacher" maxlength="40" value="${esc(draft.teacher||'')}" placeholder="可选"></label>
        <label>周次范围（起）<input name="weekStart" type="number" min="1" max="25" value="${esc(draft.weekStart||1)}"></label>
        <label>周次范围（止）<input name="weekEnd" type="number" min="1" max="25" value="${esc(draft.weekEnd||18)}"></label>
        <label>单双周<select name="weekMode"><option value="all" ${draft.weekMode==='all'?'selected':''}>每周都有</option><option value="odd" ${draft.weekMode==='odd'?'selected':''}>仅单周</option><option value="even" ${draft.weekMode==='even'?'selected':''}>仅双周</option></select></label>
        <div class="rs-full"><span class="rs-note">卡片颜色</span><input type="hidden" name="colorIdx" value="${esc(draft.colorIdx??0)}"><div class="rs-wk-colors">${colors.map(ci=>`<button type="button" class="rs-wk-color-dot rs-wk-c${ci} ${Number(draft.colorIdx??0)===ci?'is-picked':''}" data-rs-action="pick-course-color" data-rs-id="${ci}" aria-label="配色 ${ci+1}"></button>`).join('')}</div></div>
      </div>
      <div class="rs-actions">
        <button type="submit" class="rs-button rs-primary">${isNew?'添加到周课表':'保存修改'}</button>
        ${!isNew&&draft.title?action('+ 为此课记作业/复习','new-task-for-course',draft.title,'rs-quiet-button'):''}
        ${!isNew?action('移除这门课','delete-course-card','','rs-quiet-button rs-danger'):''}
      </div>
    </form></div>`;
  }

  function bellForm(bellDraft){
    if(!bellDraft)return '';
    const rows=Array.isArray(bellDraft.entries)?bellDraft.entries:[];
    return `<div class="rs-modal-backdrop"><form class="rs-dialog" data-rs-form="bell-editor" role="dialog" aria-modal="true" aria-labelledby="rsBellTitle">
      <div class="rs-panel-head"><div><p class="rs-kicker">一键套用学校作息 · 无需找作息截图</p><h2 id="rsBellTitle">第 1–12 节上下课时间表</h2></div>${action('关闭','close-bell','','rs-quiet-button')}</div>
      <div class="rs-actions" style="margin-bottom:10px">
        ${action('套用标准高校 12 节（8:00 起）','apply-bell-preset','suda_12','rs-quiet-button')}
        ${action('套用早八半 12 节（8:30 起）','apply-bell-preset','morning_830','rs-quiet-button')}
      </div>
      <div class="rs-bell-edit-grid">
        ${rows.map((r,idx)=>`<div class="rs-bell-edit-row"><span>第${r.section}节</span><input type="text" name="s_${idx}" value="${esc(r.start)}" aria-label="第${r.section}节开始"><em>–</em><input type="text" name="e_${idx}" value="${esc(r.end)}" aria-label="第${r.section}节结束"></div>`).join('')}
      </div>
      <div class="rs-actions" style="margin-top:12px">
        <button type="submit" class="rs-button rs-primary">保存并校准全部课程</button>
      </div>
    </form></div>`;
  }

  function renderPlanPage(model,ui={}){
    const todayStr=model.today||localDayStr(new Date());
    const zoomLevel=['month','week','day','period'].includes(ui.zoomLevel)?ui.zoomLevel:'day';
    const selectedDay=ui.selectedDay||todayStr;
    const activeYm=ui.activeYm||selectedDay.slice(0,7)||todayStr.slice(0,7);

    const months=buildMonths(model,todayStr);
    const activeMonth=months.find(m=>m.ym===activeYm)||months.find(m=>m.isCurrent)||months[0];
    const {days,report}=buildDaysForMonth(activeMonth.ym,model,todayStr);
    const activeDay=days.find(d=>d.dayStr===selectedDay)||days.find(d=>d.isToday)||days.find(d=>d.dayStr.startsWith(activeMonth.ym))||days[0];

    const openTasks=(model.tasks||[]).filter(t=>t.kind!=='habit'&&!t.completed&&!t.archived);
    const allNormalTasks=(model.tasks||[]).filter(t=>t.kind!=='habit'&&!t.archived);
    const isBlankBoard=allNormalTasks.length===0&&!(model.blockedSlots||[]).length;
    const activeStudy=model.tasks.find(t=>t.id===model.study?.taskId&&!t.completed&&!t.archived);
    const droppedList=report.dropped||[];
    const undatedTasks=openTasks.filter(t=>!Number(t.estimateMinutes)||Number(t.estimateMinutes)<=0);
    const cal=model.calibration||{k:1,n:0,source:'default'};
    const sr=model.scheduleReport||report;

    // Build Frameless Stage by Zoom Level
    let stageBody='';
    let liveTitle='';
    let liveMeta='';

    if(zoomLevel==='month'){
      const activeMonthIdx=Math.max(0,months.indexOf(activeMonth));
      liveTitle=activeMonth.fullLabel;
      liveMeta=[activeMonth.classesCount?`${activeMonth.classesCount} 节课程`:'',activeMonth.dueTasks.length?`${activeMonth.dueTasks.length} 项即将截止`:''].filter(Boolean).join(' · ')||'本月步调宽松，放心安排生活';
      stageBody=`<div class="rs-tl-viewport is-month" data-tl-viewport="month" data-rs-ruler-track role="slider" tabindex="0" aria-label="横向滑动选择年月" aria-valuemin="0" aria-valuemax="${months.length-1}" aria-valuenow="${activeMonthIdx}">
          <div class="rs-tl-beam-sticky" aria-hidden="true"><span class="rs-tl-beam-base"></span><span class="rs-tl-beam-lit"></span></div>
          <div class="rs-tl-playhead" aria-hidden="true"><span class="rs-tl-playhead-badge" data-tl-playhead-badge>${esc(activeMonth.year+'·'+activeMonth.label)}</span><i></i><em class="rs-tl-playhead-ring"></em></div>
          <div class="rs-tl-strip">
            <div class="rs-tl-spine" aria-hidden="true"></div>
            ${months.map((m,idx)=>{
              const posCls=idx<activeMonthIdx?'is-past':idx===activeMonthIdx?'is-center is-active':'is-future';
              return `<button type="button" class="rs-tl-tick is-month ${posCls} ${m.isCurrent?'is-today':''}" data-idx="${idx}" data-rs-action="select-month" data-rs-id="${esc(m.ym)}">
                <span class="rs-tick-year">${m.month===1||m.ym===months[0].ym?esc(m.year):''}</span>
                <span class="rs-tick-bars">${m.dueTasks.length?'<i class="b-due"></i>':''}${m.plannedMinutes?'<i class="b-study"></i>':''}</span>
                <span class="rs-tick-stem"></span>
                <span class="rs-tick-dot"></span>
                <strong class="rs-tick-main">${esc(m.label)}</strong>
                <small class="rs-tick-sub">${m.dueTasks.length?m.dueTasks.length+'项截止':(m.classesCount?m.classesCount+'节课':'浏览')}</small>
              </button>`;
            }).join('')}
          </div>
        </div>
        <div class="rs-tl-live-preview is-frameless" data-tl-live-preview>${renderMonthPreview(activeMonth)}</div>`;
    }else if(zoomLevel==='week'){
      const wk=renderWeekGridStage(model,ui,todayStr);
      liveTitle=wk.liveTitle;
      liveMeta=wk.liveMeta;
      stageBody=wk.stageBody;
    }else if(zoomLevel==='day'){
      const activeDayIdx=Math.max(0,days.indexOf(activeDay));
      liveTitle=activeDay.titleDate;
      liveMeta=dayMetaSummary(activeDay);
      stageBody=`<div class="rs-tl-month-strip" aria-label="快捷切换月份">
          <button type="button" class="rs-month-pill" data-rs-action="set-zoom" data-rs-id="month">年 · 月 ▾</button>
          ${months.slice(1,7).map(m=>`<button type="button" class="rs-month-pill ${m.ym===activeMonth.ym?'is-active':''}" data-rs-action="jump-month" data-rs-id="${esc(m.ym)}">${esc(m.label)}</button>`).join('')}
        </div>
        <div class="rs-tl-viewport is-day" data-tl-viewport="day" data-rs-ruler-track role="slider" tabindex="0" aria-label="左右滑动时间线选择日期" aria-valuemin="0" aria-valuemax="${days.length-1}" aria-valuenow="${activeDayIdx}">
          <div class="rs-tl-beam-sticky" aria-hidden="true"><span class="rs-tl-beam-base"></span><span class="rs-tl-beam-lit"></span></div>
          <div class="rs-tl-playhead" aria-hidden="true"><span class="rs-tl-playhead-badge" data-tl-playhead-badge>${esc(activeDay.shortDate+(activeDay.isToday?' 今天':''))}</span><i></i><em class="rs-tl-playhead-ring"></em></div>
          <div class="rs-tl-strip">
            <div class="rs-tl-spine" aria-hidden="true"></div>
            ${days.map((d,idx)=>{
              const loadPx=Math.min(18,Math.max(d.plannedMinutes?5:0,Math.round(d.plannedMinutes/15)));
              const inMonth=d.dayStr.startsWith(activeMonth.ym);
              const posCls=idx<activeDayIdx?'is-past':idx===activeDayIdx?'is-center is-active':'is-future';
              return `<button type="button" class="rs-tl-tick is-day ${posCls} ${d.isToday?'is-today':''} ${inMonth?'':'is-ghost'}" data-idx="${idx}" data-rs-action="select-day" data-rs-id="${esc(d.dayStr)}" aria-current="${d.dayStr===activeDay.dayStr?'date':'false'}">
                <span class="rs-tick-bars">${d.dueTasks.length?'<i class="b-due"></i>':''}${d.classes.length?'<i class="b-class"></i>':''}${d.plannedMinutes?`<i class="b-study" style="height:${loadPx}px"></i>`:''}${d.isPast&&d.completedOnDay.length?'<i class="b-done"></i>':''}</span>
                <span class="rs-tick-stem"></span>
                <span class="rs-tick-dot"></span>
                <strong class="rs-tick-main">${d.dayNum===1?esc(d.month+'月'):esc(d.dayNum)}</strong>
                <small class="rs-tick-sub">${esc(d.relLabel)}</small>
              </button>`;
            }).join('')}
          </div>
        </div>
        <div class="rs-tl-live-preview is-frameless" data-tl-live-preview>${renderFourPeriodPreview(activeDay,ui.todayState,isBlankBoard,model,ui)}</div>`;
    }else{
      liveTitle=activeDay.titleDate;
      liveMeta=dayMetaSummary(activeDay);
      stageBody=`<div class="rs-period-nav-bar">
          <div class="rs-actions">
            ${action(activeMonth.fullLabel,'set-zoom','month','rs-quiet-button')}
            ${action('‹ '+activeDay.shortDate+' 时间轴','set-zoom','day','rs-quiet-button')}
          </div>
          <div class="rs-actions">
            ${action('‹ 前一天','step-day','-1','rs-quiet-button')}
            ${action('后一天 ›','step-day','1','rs-quiet-button')}
            ${activeDay.isToday?stateSwitchHtml(ui.todayState):''}
            ${action('+ 任务','new-task-at',activeDay.dayStr,'rs-quiet-button')}
            ${action('+ 课程','new-block-at',activeDay.dayStr+'|morning','rs-quiet-button')}
            ${model.canUndo?action('撤销','undo-plan','','rs-quiet-button'):''}
          </div>
        </div>
        <div class="rs-open-periods">
          <div class="rs-open-spine" aria-hidden="true"></div>
          ${PERIODS.map(p=>renderPeriodBlock(p,activeDay,model)).join('')}
        </div>`;
    }

    const zoomSwitchHtml=`<div class="rs-zoom-switch" role="group" aria-label="时间线层级缩放">
            <button type="button" data-rs-action="set-zoom" data-rs-id="month" aria-pressed="${zoomLevel==='month'}">年 · 月</button>
            <button type="button" data-rs-action="set-zoom" data-rs-id="week" aria-pressed="${zoomLevel==='week'}">周课表</button>
            <button type="button" data-rs-action="set-zoom" data-rs-id="day" aria-pressed="${zoomLevel==='day'}">日</button>
            <button type="button" data-rs-action="set-zoom" data-rs-id="period" aria-pressed="${zoomLevel==='period'}">当日</button>
          </div>`;

    const stage=`<section class="rs-tl-stage" data-zoom="${esc(zoomLevel)}" aria-label="主时间线">
      <div class="rs-tl-header">
        <div>
          ${zoomSwitchHtml}
          <h1 class="rs-tl-live-title" data-tl-live-title>${esc(liveTitle)}</h1>
          <p class="rs-tl-live-meta" data-tl-live-meta>${esc(liveMeta)}</p>
        </div>
        <div class="rs-actions">${model.canUndo?action('撤销重排','undo-plan','','rs-quiet-button'):''}${(selectedDay!==todayStr||zoomLevel!=='day')?action('回到今天','jump-today','','rs-quiet-button'):''}</div>
      </div>
      ${stageBody}
    </section>`;

    const resumeBar=activeStudy?`<div class="rs-resume-line"><span>正在专注：<strong>${esc(activeStudy.title)}</strong></span>${action('继续专注','start-task',activeStudy.id,'rs-primary')}</div>`:'';

    const overflowStrip=(droppedList.length||undatedTasks.length)?`<section class="rs-open-overflow">
      <p class="rs-kicker">暂放后面 · 没做完不催你</p>
      <div class="rs-overflow-list">
        ${droppedList.map(d=>`<div class="rs-overflow-row"><div><strong>${esc(d.name)}</strong><small>${esc(d.reason)}${d.nextSlot?' · 顺延空档：'+esc(d.nextSlot.day.slice(5)):''}</small></div>${action('调整','edit-task',d.task,'rs-quiet-button')}</div>`).join('')}
        ${undatedTasks.map(t=>`<div class="rs-overflow-row"><div><strong>${esc(t.title)}</strong><small>想什么时候做都行，交给 AI 一键拆进本周空档</small></div>${action('让 AI 安排','quick-chip',`帮我把「${t.title}」拆解并安排进本周时间线`,'rs-quiet-button')}</div>`).join('')}
      </div>
    </section>`:'';

    const quickPrompts=Array.isArray(ui.bubbles)&&ui.bubbles.length?ui.bubbles:[
      '今晚太累，只想早点睡',
      '周三下午全空，怎么利用最高效',
      '下周考高数，帮我拆四步',
      '周五交小论文，拆成大纲与初稿',
      '不熬夜，帮我重排这周计划',
      '这周事有点多，排个优先级'
    ];
    const driftSeeds=[
      {ox:4,oy:6,bx:5,by:6,rot:0.6,dur:5.8,del:-1.1},
      {ox:14,oy:-4,bx:-6,by:5,rot:-0.7,dur:6.6,del:-3.4},
      {ox:-6,oy:10,bx:4,by:-7,rot:0.5,dur:5.4,del:-2.2},
      {ox:10,oy:2,bx:-5,by:-6,rot:-0.6,dur:6.9,del:-4.1},
      {ox:2,oy:-5,bx:6,by:5,rot:0.7,dur:6.1,del:-0.8},
      {ox:16,oy:8,bx:-4,by:6,rot:-0.5,dur:5.6,del:-2.9}
    ];
    const quickChipsHtml=`<div class="rs-bubble-wrap">
      <div class="rs-bubble-bar">
        <span class="rs-bubble-hint">悬浮气泡 · 点一句直接交给 LifeOS 分析</span>
        <button type="button" class="rs-bubble-refresh" data-rs-action="shuffle-quick-chips" title="换一组">换一组 ↻</button>
      </div>
      <div class="rs-bubble-stage" role="group" aria-label="随机灵感气泡">
        ${quickPrompts.map((q,bi)=>{
          const d=driftSeeds[bi%driftSeeds.length];
          return `<button type="button" class="rs-prompt-bubble" style="--b-ox:${d.ox}px;--b-oy:${d.oy}px;--b-bx:${d.bx}px;--b-by:${d.by}px;--b-rot:${d.rot}deg;--b-dur:${d.dur}s;--b-delay:${d.del}s" data-rs-action="quick-chip" data-rs-id="${esc(q)}">${esc(q)}</button>`;
        }).join('')}
      </div>
    </div>`;
    const quickDock=window.LifeOSStudyUI.intake(model,{text:ui.text,busy:ui.busy,cooldownSeconds:ui.cooldownSeconds,cooldownCode:ui.cooldownCode})
      .replace('rs-panel rs-ai-intake','rs-quick-dock rs-ai-intake')
      .replace('AI 学习需求','随口说一说')
      .replace('用一句话，说出你想完成的事。','写下想法或今天的状态，其余交给我')
      .replace('先得到下一步，再按需要完善时间。','不用自己算几分钟或挑截止日。写下现状或目标，LifeOS 会结合你的真实课表整理出三种不同节奏供你挑选。')
      .replace('下周考现代汉语，还有五章没复习。','例：下周三考高数、周五交报告，另外今晚我想早点睡')
      .replace('rows="3"','rows="2"')
      .replace('帮我理清下一步','生成可选节奏')
      .replace('正在理解需求…','正在结合课表整理方案…')
      .replace('手动创建','手动微调单项')
      .replace('</textarea>','</textarea><div class="rs-ai-context">'+contextCard(model,ui)+'</div>')
      .replace('</form></section>',`</form>${quickChipsHtml}</section>`)
      .replace('<button type="button" class="rs-button rs-quiet-button" data-life-route="knowledge">从资料开始</button>',`${action('识别课表文本','parse-note','','rs-quiet-button')}<input type="file" accept=".ics,.csv,.tsv,text/calendar,text/csv" data-rs-ics-file hidden>`);

    const backlogDrawer=`<details class="rs-precision"><summary>全部任务清单与排程计算明细（共 ${allNormalTasks.length} 项）</summary><div class="rs-drawer-inner"><div class="rs-backlog-list">${allNormalTasks.length?allNormalTasks.map(t=>`<div class="rs-backlog-item ${t.completed?'is-complete':''}"><button type="button" class="rs-check" data-rs-action="toggle-task" data-rs-id="${esc(t.id)}" aria-pressed="${!!t.completed}">${t.completed?'✓':'○'}</button><div><strong>${esc(t.title)}</strong><small>${t.course?esc(t.course)+' · ':''}${t.deadline||t.due?'截止 '+esc(when(t.deadline||t.due)):'不限日期'}</small></div><div class="rs-actions">${action('编辑','edit-task',t.id,'rs-quiet-button')}${action('删除','delete-task',t.id,'rs-quiet-button rs-danger')}</div></div>`).join(''):'<p class="rs-empty">还没有任务，直接在上方输入框告诉 AI 你想安排什么即可。</p>'}</div><div class="rs-pro-summary"><p class="rs-note">容量核对：${esc(sr?.capacityNote||'尚未登记可用时段')} · 节奏基准 ${esc(Number(cal.effectiveK??cal.k??1).toFixed(2))}×</p></div></div></details>`;

    return `${resumeBar}${stage}${quickDock}${renderStrategyBoard(model)}${renderNotePreviewCard(ui.notePreview)}${window.LifeOSStudyUI.preview(model)}${overflowStrip}${backlogDrawer}`;
  }

  function schoolPortalBlock(model,schoolUi){
    const bound=model.schoolProfile;
    const ui=schoolUi||{query:'',busy:false,error:'',draft:null,searchOpen:false};
    const showSearch=!bound||ui.searchOpen||ui.draft;
    const draft=ui.draft;
    return `<section class="rs-school-card" aria-label="绑定我的学校官网与教务处">
      <div class="rs-school-head">
        <div>
          <p class="rs-kicker">校园官方入口 · AI 自动匹配</p>
          <h2>${bound?esc(bound.schoolName)+' · 校内学习入口':'搜索并绑定你的学校官网与教务处'}</h2>
          <p class="rs-note">${bound?(esc(bound.officialDomain?`主域名 ${bound.officialDomain} · `:'')+'点对应入口即可直达教务处查课表、看校历与作息安排。'):'输入任意高校名称，由 AI 自动梳理官网、教务处、信息门户、图书馆与校历入口，先核对试开再保存。'}</p>
        </div>
        <div class="rs-actions">
          ${bound?`${action('去教务处截完课表 → 一键导入','open-import','','rs-primary')}${action(ui.searchOpen?'收起换校':'更换学校','toggle-school-search','','rs-quiet-button')}${action('解绑学校','clear-school-profile','','rs-quiet-button rs-danger')}`:''}
        </div>
      </div>
      ${showSearch?`<form data-rs-form="school-search" class="rs-school-search-bar">
        <label class="rs-sr-only" for="rsSchoolSearch">搜索你的学校</label>
        <input id="rsSchoolSearch" type="search" name="schoolName" data-rs-school-query value="${esc(ui.query||'')}" placeholder="输入任意大学或学院名称，例如：清华大学、复旦大学、四川大学…" maxlength="80">
        <button type="submit" class="rs-button rs-primary" ${ui.busy?'disabled':''}>${ui.busy?'正在匹配学校官网…':'AI 自动匹配校园网站'}</button>
        ${bound&&ui.searchOpen?action('取消','toggle-school-search','','rs-quiet-button'):''}
      </form>`:''}
      ${ui.error?`<div class="rs-byok-head"><p class="rs-text-warn" role="alert">${esc(ui.error)}</p>${!window.LifeOSLocalAI?.hasKey?.()?action('去设置填自带 Key','toggle-tools','','rs-quiet-button'):''}</div>`:''}
      ${draft?`<div class="rs-school-draft">
        <div class="rs-school-head">
          <div>
            <strong>已为「${esc(draft.schoolName)}」整理以下候选官方入口（勾选保留、可修改网址或先试开核对）</strong>
            ${draft.note?`<p class="rs-note">${esc(draft.note)}</p>`:''}
          </div>
          ${draft.officialDomain?`<span class="rs-res-cat">${esc(draft.officialDomain)}</span>`:''}
        </div>
        <div class="rs-school-draft-list">
          ${(draft.portals||[]).map((p,idx)=>{
            const w=safeWebUrl(p.url);
            return `<div class="rs-school-draft-row">
              <input type="checkbox" data-rs-school-pick="${idx}" ${p.checked!==false?'checked':''} aria-label="勾选 ${esc(p.name)}">
              <input type="text" data-rs-school-name="${idx}" value="${esc(p.name)}" placeholder="入口名称" maxlength="80">
              <input type="url" data-rs-school-url="${idx}" value="${esc(p.url)}" placeholder="https://..." maxlength="500">
              ${w?`<a class="rs-button rs-quiet-button" href="${esc(w)}" target="_blank" rel="noopener noreferrer">试开 ↗</a>`:'<span class="rs-note">无效链接</span>'}
            </div>`;
          }).join('')}
        </div>
        <div class="rs-actions">
          ${action('保存为我的学校入口','confirm-school-portals','','rs-primary')}
          ${action('取消预览','cancel-school-draft','','rs-quiet-button')}
        </div>
      </div>`:''}
      ${bound&&!draft?`<div class="rs-school-grid">
        ${(bound.portals||[]).map(p=>{
          const w=safeWebUrl(p.url);
          return `<article class="rs-school-portal">
            <div class="rs-school-portal-top"><strong>${esc(p.name)}</strong><span class="rs-res-cat">${esc(p.category||'校内入口')}</span></div>
            ${p.notes?`<p>${esc(p.notes)}</p>`:''}
            <div class="rs-actions">
              ${w?`<a class="rs-button rs-primary" href="${esc(w)}" target="_blank" rel="noopener noreferrer">打开 ↗</a>`:''}
              ${action('关联待办','new-task-from-res',p.id,'rs-quiet-button')}
            </div>
          </article>`;
        }).join('')}
      </div>`:''}
    </section>`;
  }

  function hostLabel(rawUrl){
    try{return new URL(String(rawUrl||'')).hostname.replace(/^www\./,'');}catch{return '';}
  }

  function resourcesPage(model,query='',cat='all',schoolUi=null,resUi=null){
    const isDummyPlaceholder=r=>/aistudy666\.com/i.test(String(r?.url||''));
    const raw=(model.resources||[]).filter(r=>!r.aliasOf&&!isDummyPlaceholder(r));
    const custom=(Array.isArray(model.customLinks)?model.customLinks:[]).filter(l=>!isDummyPlaceholder(l)).map(l=>({...l,_custom:true}));
    const rawKeys=new Set([...raw,...custom].map(r=>String(r.url||r.id||r.name||'').trim().toLowerCase()).filter(Boolean));
    const starterExtras=STARTER_RESOURCES.filter(r=>!rawKeys.has(String(r.url||r.id||'').trim().toLowerCase())).map(r=>({...r,_starter:true}));
    const schoolPortals=(model.schoolProfile?.portals||[]).map((p,i)=>({
      id:p.id||('school-p-'+i),
      name:p.name||'校园入口',
      category:'我的学校与教务',
      notes:p.notes||`${model.schoolProfile?.schoolName||'我的高校'} · ${p.category||'校内入口'}`,
      url:p.url,
      _schoolPortal:true
    }));
    const items=[...schoolPortals,...custom,...raw,...starterExtras];
    const cats=['all','公开课与通识','开源教材与开发','人文社科与学术文献','语言与考试','我的学校与教务','个人与自定义'];
    const catTitles={'我的学校与教务':'我的学校与教务','公开课与通识':'国内高校公开课','开源教材与开发':'国内开源社区与编程教程','人文社科与学术文献':'国内社科文献、论文与古籍','语言与考试':'四六级与词典工具','个人与自定义':'我保存的网址与本地文件'};
    const ui=resUi||{tool:''};
    const q=String(query||'').trim().toLowerCase();
    const resolveCat=r=>r._schoolPortal?'我的学校与教务':(r._custom||!cats.includes(r.category)?'个人与自定义':r.category);
    const filtered=items.filter(r=>{
      const rCat=resolveCat(r);
      if(cat!=='all'&&rCat!==cat)return false;
      if(!q)return true;
      return [r.name,r.title,r.category,r.notes,r.url].some(v=>String(v||'').toLowerCase().includes(q));
    });

    // Group visible entries by category for Raycast-style bookmark index sections
    const groups=[];
    for(const c of cats.slice(1)){
      const list=filtered.filter(r=>resolveCat(r)===c);
      if(list.length)groups.push({id:c,title:catTitles[c]||c,list});
    }

    const renderIndexRow=r=>{
      const t=r.name||r.title||'学习资料',w=safeWebUrl(r.url),host=w?hostLabel(w):(r.extension||'本地文件');
      const desc=r.notes||'';
      return `<div class="rs-idx-row">
        ${w
          ?`<a class="rs-idx-main" href="${esc(w)}" target="_blank" rel="noopener noreferrer"><div class="rs-idx-title"><strong>${esc(t)}</strong>${host?`<span class="rs-idx-host">${esc(host)}</span>`:''}</div>${desc?`<p>${esc(desc)}</p>`:''}</a>`
          :`<button type="button" class="rs-idx-main is-btn" data-kh-action="preview" data-kh-id="${esc(r.id)}"><div class="rs-idx-title"><strong>${esc(t)}</strong><span class="rs-idx-host">${esc(host)}</span></div>${desc?`<p>${esc(desc)}</p>`:''}</button>`}
        <div class="rs-idx-ops">
          <button type="button" class="rs-idx-plan" data-rs-action="ai-plan-from-res" data-rs-id="${esc(r.id)}">纳入计划</button>
          ${r._custom?`<button type="button" class="rs-idx-del" data-rs-action="remove-custom-link" data-rs-id="${esc(r.id)}" aria-label="移除 ${esc(t)}">×</button>`:''}
        </div>
      </div>`;
    };

    return `<section class="rs-dir-shell rs-scene-reveal" aria-label="学习资料与参考入口">
      <div class="rs-mm-topbar">
        <div>
          <p class="rs-kicker">常用书签索引 · 国内直连开源库与校园入口</p>
          <h1>学习资料与参考入口</h1>
        </div>
        <div class="rs-actions">
          <button type="button" class="rs-button ${ui.tool==='school'?'rs-primary':'rs-quiet-button'}" data-rs-action="toggle-mm-tool" data-rs-id="school">${model.schoolProfile?esc(model.schoolProfile.schoolName):'绑定学校入口'}</button>
          <button type="button" class="rs-button ${ui.tool==='add'?'rs-primary':'rs-quiet-button'}" data-rs-action="toggle-mm-tool" data-rs-id="add">+ 收藏网址</button>
          ${model.mode!=='demo'?'<button type="button" class="rs-button rs-quiet-button" data-life-route="knowledge">本地文件 ↗</button>':''}
          ${action('← 返回计划','go-overview','','rs-quiet-button')}
        </div>
      </div>

      <div class="rs-mm-drawer" ${ui.tool==='school'?'':'hidden'}>${schoolPortalBlock(model,schoolUi)}</div>
      ${ui.tool==='add'?`<div class="rs-mm-drawer"><form data-rs-form="custom-link" class="rs-custom-link-form"><label>网站名称<input name="name" required maxlength="100" placeholder="如：课程讨论区 / 开源题库"></label><label>网址<input name="url" type="url" required maxlength="500" placeholder="https://..."></label><label>分类<input name="category" maxlength="32" value="自定义网站" placeholder="自定义网站"></label><label>备注（可选）<input name="notes" maxlength="240" placeholder="用途说明"></label><button type="submit" class="rs-button rs-primary">保存链接</button></form></div>`:''}

      <div class="rs-idx-tools">
        <label class="rs-idx-search-wrap"><span class="rs-sr-only">搜索资料</span><input class="rs-idx-search" type="search" data-rs-res-query value="${esc(query)}" placeholder="搜网站、域名或主题（如：Hello 算法、网道、古诗文、知网、MOOC）…"></label>
        <div class="rs-dir-cats" role="tablist" aria-label="按方向筛选">
          ${cats.map(c=>`<button type="button" class="rs-dir-pill ${cat===c?'is-active':''}" data-rs-action="filter-res" data-rs-id="${esc(c)}">${esc(c==='all'?'全部':(catTitles[c]||c))}</button>`).join('')}
        </div>
      </div>

      <div class="rs-idx-groups">
        ${groups.length?groups.map(g=>`<section class="rs-idx-group" aria-label="${esc(g.title)}">
          <div class="rs-idx-ghead"><h2>${esc(g.title)}</h2><span>${g.list.length}</span></div>
          <div class="rs-idx-list">${g.list.map(renderIndexRow).join('')}</div>
        </section>`).join(''):`<div class="rs-dir-empty"><p class="rs-note">当前筛选下还没有资料。</p>${action('查看全部','clear-res-filter','','rs-quiet-button')}</div>`}
      </div>
    </section>`;
  }

  function settingsPage(model,byokUi){
    const tasks=(model.tasks||[]).filter(t=>t.kind!=='habit'),completed=tasks.filter(t=>t.completed).length,m=model.metrics||{},cal=model.calibration||{k:1,n:0},p=model.preferences||{focusMinutes:60,dailyCapMinutes:0,allowLate:true};
    const bell=Array.isArray(model.bellSchedule)?model.bellSchedule:[],school=model.schoolProfile;
    const localAi=window.LifeOSLocalAI,hasByok=Boolean(localAi?.hasKey?.()),masked=hasByok?localAi.maskedKey():'',bUi=byokUi||{busy:false,msg:'',err:''};
    return `<div class="rs-heading"><div><p class="rs-kicker">独立设置页 · 仅显示偏好与本机备份</p><h1>设置与数据备份</h1><p>调整专注节奏、核对真实耗时系数、管理学校作息时间表、学校官网绑定与自带 API Key。</p></div><div class="rs-actions">${action('← 返回学习计划','go-overview','','rs-quiet-button')}${action('前往学习资料','go-resources','','rs-quiet-button')}</div></div>
      <section class="rs-panel rs-tools" aria-label="设置与备份"><div class="rs-settings-grid"><div class="rs-setting-card"><h3>本机学习数据备份</h3><p class="rs-note">导出或恢复标准 JSON 排程快照（含课程、任务、作息表、绑定学校与自定义链接，自动排除 API Key）。</p><div class="rs-actions">${action('导出 JSON','export-schedule','','rs-quiet-button')}${action('导入 JSON','import-schedule-trigger','','rs-quiet-button')}</div><input type="file" accept=".json,application/json" data-rs-import-file hidden></div><div class="rs-setting-card"><h3>完成回顾与节奏基准</h3><p class="rs-note">已完成 <strong>${completed}</strong> / ${tasks.length} 项 · 累计记录 ${mins(m.actualMinutes||0)} · 估时系数 ${Number(cal.effectiveK??cal.k??1).toFixed(2)}×</p><details class="rs-inline-details"><summary>补记一次真实耗时（${cal.n||0} 条）</summary><form data-rs-form="calibration" class="rs-mini-calib"><input name="taskId" type="hidden" value=""><label>任务名<input name="title" maxlength="240" required placeholder="例如：高数复习"></label><label>原估时（分）<input name="estimate" type="number" min="1" max="10080" required placeholder="60"></label><label>实际用（分）<input name="actual" type="number" min="1" max="10080" required placeholder="90"></label><button class="rs-button rs-primary" type="submit">保存</button></form></details></div><div class="rs-setting-card"><h3>专注偏好</h3><form data-rs-form="preferences" class="rs-mini-prefs"><label>单次专注（分）<input name="focusMinutes" type="number" min="15" max="180" value="${esc(p.focusMinutes||60)}"></label><label>每日上限（0不限）<input name="dailyCapMinutes" type="number" min="0" max="1440" value="${esc(p.dailyCapMinutes||0)}"></label><label class="rs-inline-check"><input type="checkbox" name="allowLate" ${p.allowLate!==false?'checked':''}> 允许排入晚间</label><button class="rs-button rs-quiet-button" type="submit">保存偏好</button></form></div><div class="rs-setting-card"><h3>学校作息时间表</h3><p class="rs-note">${bell.length?`已绑定 <strong>${bell.length}</strong> 个作息节次，新旧课程会自动同步真实上下课钟点。`:'尚未绑定学校作息表；可在周课表点「作息时间」一键套用高校预设。'}</p><div class="rs-actions">${action('设置作息时间','open-bell-editor','','rs-quiet-button')}${bell.length?action('清除作息表','clear-bell-schedule','','rs-quiet-button rs-danger'):''}</div></div><div class="rs-setting-card"><h3>我的学校与教务入口</h3><p class="rs-note">${school?`已绑定 <strong>${esc(school.schoolName)}</strong>（${school.portals?.length||0} 个入口）。`:'尚未绑定学校；前往「学习资料」即可按校名自动匹配教务处、图书馆与信息门户。'}</p><div class="rs-actions">${action(school?'更换或查看学校入口':'搜索并绑定学校','go-resources','','rs-quiet-button')}${school?action('解绑学校','clear-school-profile','','rs-quiet-button rs-danger'):''}</div></div><div class="rs-setting-card rs-byok-card"><div class="rs-byok-head"><h3>自带模型 API Key（本机直连）</h3><span class="rs-byok-pill ${hasByok?'is-on':''}">${hasByok?'已配置 · '+esc(masked):'未配置'}</span></div><p class="rs-note">密钥仅保存在当前设备的浏览器本机存储中，不会上传到第三方服务器，导出备份 JSON 时也会自动排除。配置后无需云端账号即可直接使用课表归纳、计划理解与学校官网自动匹配。</p><form data-rs-form="byok-key" class="rs-byok-form"><label>API Key（sk-...）<input type="password" name="apiKey" autocomplete="off" spellcheck="false" placeholder="${hasByok?'已在本机配置（填写新 Key 并保存可替换）':'输入你的 sk-... Key'}" maxlength="256"></label><div class="rs-actions"><button type="submit" class="rs-button rs-primary" ${bUi.busy?'disabled':''}>保存本机 Key</button>${action(bUi.busy?'正在测试…':'测试连通性','test-byok-key','','rs-quiet-button')}${hasByok?action('清除本机 Key','clear-byok-key','','rs-quiet-button rs-danger'):''}</div></form>${bUi.msg?`<p class="rs-byok-ok" role="status">${esc(bUi.msg)}</p>`:''}${bUi.err?`<p class="rs-text-warn" role="alert">${esc(bUi.err)}</p>`:''}</div></div></section>`;
  }

  function taskForm(task,model){
    const item=task||{},ai=!!item.aiDraftId,resources=(model.resources||[]).filter(r=>!r.aliasOf),selected=new Set(item.resourceIds||[]);
    const schedPrio=['asap','high','medium','low','none'].includes(item.schedulePriority)?item.schedulePriority:(item.commitment==='must'?'asap':(item.priority||'medium'));
    const mappedPrio=schedPrio==='asap'?'high':schedPrio==='none'?'low':schedPrio;
    const urg=urgencyMeta(item.deadline||item.due),estNum=Number(item.estimateMinutes)||60,splittable=item.splittable!==false&&item.splittable!=='false';
    const activeEffort=estNum<=40?'30':estNum<=90?'60':'150';
    return `<div class="rs-modal-backdrop"><section class="rs-dialog" role="dialog" aria-modal="true" aria-labelledby="rsTaskTitle"><div class="rs-panel-head"><div><p class="rs-kicker">${ai?'核实后放上时间线':'学习任务'}</p><h2 id="rsTaskTitle">${item.id?'调整这件事':'记一件事放上时间线'}</h2></div>${action('关闭','close-task','','rs-quiet-button')}</div><form data-rs-form="task"><input name="aiDraftId" type="hidden" value="${esc(item.aiDraftId||'')}"><input name="id" type="hidden" value="${esc(item.id||'')}"><label>想做什么<input name="title" required maxlength="240" value="${esc(item.title||'')}" placeholder="例如：复习现代汉语第一章"></label><div class="rs-effort-block"><span>大概什么体感份量？（不用精算分钟）</span><div class="rs-effort-pills" role="group" aria-label="选择体感份量">${EFFORT_FEELS.map(ef=>`<button type="button" class="rs-button ${activeEffort===ef.id?'rs-primary':'rs-quiet-button'}" data-rs-action="pick-effort" data-rs-id="${ef.id}">${esc(ef.label)}</button>`).join('')}</div></div><div class="rs-form-grid"><label>截止日期（可选）<input name="deadline" type="datetime-local" value="${esc(dateInput(item.deadline||item.due))}"></label><label>课程（可选）<input name="course" maxlength="120" value="${esc(item.course||'')}" placeholder="例如：现代汉语"></label></div><label>补充笔记<textarea name="notes" rows="2" maxlength="30000">${esc(item.notes||'')}</textarea></label><details class="rs-optional"><summary>可选：自定义参考时长与拆分设置</summary><div class="rs-form-grid"><label>参考耗时（分钟）<input name="estimateMinutes" type="number" min="1" max="600000" step="5" value="${esc(item.estimateMinutes||60)}"></label><label>当前进度（%）<input name="progress" type="number" min="0" max="100" step="1" value="${esc(item.progress||0)}"></label><div class="rs-2d-priority"><div class="rs-2d-axis"><span>紧迫度（按截止日期自动判断）</span><strong data-rs-urgency-badge class="rs-urgency-${urg.level}">${esc(urg.axis)}</strong></div><div class="rs-2d-select"><span>重要程度</span><div class="rs-prio-pills">${Object.entries(schedPriorityLabel).map(([val,lbl])=>`<button type="button" class="rs-button ${schedPrio===val?'rs-primary':'rs-quiet-button'}" data-rs-action="pick-sched-prio" data-rs-id="${val}">${lbl}</button>`).join('')}</div><input type="hidden" name="schedulePriority" value="${esc(schedPrio)}"><select name="priority" hidden>${Object.entries(priority).map(([v,l])=>`<option value="${v}" ${mappedPrio===v?'selected':''}>${l}</option>`).join('')}</select></div></div><label class="rs-inline-check"><input type="checkbox" name="splittable" value="true" ${splittable?'checked':''}> 允许拆分成多段塞入空闲时段</label><label>最小分块（分钟）<input name="minChunk" type="number" min="10" max="480" step="5" value="${esc(item.minChunk||25)}" ${splittable?'':'disabled'}></label><label>关联学习资料<select name="resourceIds" multiple size="2">${resources.map(r=>`<option value="${esc(r.id)}" ${selected.has(r.id)?'selected':''}>${esc(r.name||r.title)}</option>`).join('')}</select></label></div></details>${ai?'<label class="rs-inline-check"><input name="confirmed" type="checkbox" required> 我已核实以上内容</label>':''}<div class="rs-actions"><button class="rs-button rs-primary" type="submit">保存并放上时间线</button>${action('取消','close-task','','rs-quiet-button')}</div></form></section></div>`;
  }

  function importDialog(modalState,model,portalCaps){
    if(!modalState)return '';
    const a=modalState.analysis;
    const files=Array.isArray(modalState.files)?modalState.files:[];
    const periodLabelMap={morning:'上午',noon:'中午',afternoon:'下午',evening:'晚上'};
    const selectedSlots=(a?.blockedSlots||[]).filter(x=>x.checked!==false).length;
    const selectedTasks=(a?.tasks||[]).filter(x=>x.checked!==false).length;
    const selectedAdj=a?.dayAdjustments?.length||0;
    const bellList=Array.isArray(a?.bellSchedule)?a.bellSchedule:[];
    const bellCount=bellList.length;
    const imp=window.LifeOSScheduleImporter;
    let existingMatched=0;
    if(bellCount&&imp?.applyBellScheduleToSlots&&Array.isArray(model?.blockedSlots)){
      existingMatched=imp.applyBellScheduleToSlots(model.blockedSlots,bellList).calibratedCount;
    }
    const totalCount=selectedSlots+selectedTasks+selectedAdj+bellCount;
    const confirmLabel=(!selectedSlots&&!selectedTasks&&!selectedAdj&&bellCount)
      ?`应用作息表并自动校准（${bellCount} 个节次）`
      :bellCount
        ?`确认导入并查看周课表（${selectedSlots+selectedTasks+selectedAdj} 项 + ${bellCount} 节作息）`
        :`确认导入并查看周课表（${totalCount} 项）`;
    const protoCards=a?.blockedSlots?.length?extractCoursePrototypes({blockedSlots:a.blockedSlots.filter(x=>x.checked!==false)}):[];
    const advOpen=Boolean(modalState.errorMsg||(modalState.text&&!a&&!files.length));
    const schoolPortalUrl=modalState.portalUrl||model?.schoolProfile?.portals?.find(p=>/课表|选课|教务/.test(p.category||p.name))?.url||model?.schoolProfile?.portals?.[0]?.url||'http://xk.suda.edu.cn/';
    const portalOpened=modalState.portalStep==='opened'||modalState.portalStep==='browser-opened';
    const nativePortal=Boolean(portalCaps?.canSpawnVisibleWindow);
    return `<div class="rs-modal-backdrop"><section class="rs-dialog rs-import-dialog" role="dialog" aria-modal="true" aria-labelledby="rsImportTitle">
      <div class="rs-panel-head">
        <div><p class="rs-kicker">WakeUp 式极简导入 · 导入课表文件、截图或便签</p><h2 id="rsImportTitle">导入课表或安排</h2></div>
        ${action('关闭','close-import','','rs-quiet-button')}
      </div>
      <div class="rs-wk-entry-grid" data-rs-dropzone tabindex="0">
        <button type="button" class="rs-wk-entry-card ${modalState.portalGuide?'is-active':''}" data-rs-action="toggle-portal-guide">
          <span class="rs-wk-entry-icon">🏫</span>
          <strong>登录学校教务导入</strong>
          <small>弹出官方登录窗口，自己登录进个人课表后一键读取</small>
        </button>
        <button type="button" class="rs-wk-entry-card" data-rs-action="trigger-unified-file">
          <span class="rs-wk-entry-icon">📄</span>
          <strong>WakeUp / 日历文件</strong>
          <small>支持 .wakeup_schedule、.ics、.csv、教务网页直接导入</small>
        </button>
        <button type="button" class="rs-wk-entry-card" data-rs-action="trigger-unified-file">
          <span class="rs-wk-entry-icon">🖼️</span>
          <strong>课表截图识别</strong>
          <small>辅助兜底：选入高清晰度整表截图，自动识别整理</small>
        </button>
        <input type="file" multiple accept=".wakeup_schedule,.html,.htm,.mhtml,.mht,.xls,.ics,.csv,.tsv,.txt,image/png,image/jpeg,image/webp,image/*" data-rs-unified-file hidden>
      </div>
      ${modalState.portalGuide?`<div class="rs-wk-portal-panel">
        <div class="rs-panel-head">
          <strong>直连教务窗口导入（不存密码 · 无视验证码与内网）</strong>
          ${action('苏州大学教务','fill-portal-url','http://xk.suda.edu.cn/','rs-quiet-button')}
        </div>
        <label>教务系统登录网址
          <input type="url" data-rs-portal-url value="${esc(schoolPortalUrl)}" placeholder="https://或http:// 教务处登录地址">
        </label>
        <div class="rs-actions">
          <button type="button" class="rs-button ${portalOpened?'rs-quiet-button':'rs-primary'}" data-rs-action="portal-open" ${modalState.busy?'disabled':''}>${portalOpened?'重新打开教务窗口':'1. 打开学校教务窗口'}</button>
          ${nativePortal
            ?`<button type="button" class="rs-button ${portalOpened?'rs-primary':'rs-quiet-button'}" data-rs-action="portal-grab" ${modalState.busy?'disabled':''}>2. 我已打开课表，直接读取</button>`
            :`<button type="button" class="rs-button ${portalOpened?'rs-primary':'rs-quiet-button'}" data-rs-action="portal-clipboard" ${modalState.busy?'disabled':''}>2. 读取我刚复制的课表</button>`}
        </div>
        <p class="rs-note">${nativePortal
          ?(portalOpened?'已在独立窗口打开教务系统：请在该窗口登录并点进「首页」或「个人课表」，然后回来点上方「2. 我已打开课表，直接读取」。':'点击第 1 步会打开独立浏览窗口供你自行登录教务；看到课表后点第 2 步即可零误差读回全部课程。')
          :(portalOpened?'已在浏览器新窗口打开教务系统！请在弹出页登录后停在「首页」课表（或点进「个人课表」表格），按 Ctrl+A 全选 → Ctrl+C 复制，切回这里点「2. 读取我刚复制的课表」（或直接按 Ctrl+V）。':'点击第 1 步会在浏览器新窗口打开你的学校教务；登录后按 Ctrl+A 全选 → Ctrl+C 复制课表，回来按 Ctrl+V 或点第 2 步即可零误差导入。')}</p>
      </div>`:''}
      ${files.length?`<div class="rs-import-files">
        <div class="rs-import-files-head">
          <span>已选择（${files.length} 项）</span>
          ${action('清空','clear-import-files','','rs-quiet-button')}
        </div>
        <div class="rs-import-file-list">
          ${files.map(f=>`<div class="rs-import-file-chip ${f.status==='error'?'is-error':f.clarityWarning?'is-warn':''}">
            ${f.previewUrl?`<img class="rs-import-file-thumb" src="${esc(f.previewUrl)}" alt="${esc(f.name)}">`:`<span class="rs-import-file-badge">${esc(String(f.kind||'FILE').toUpperCase())}</span>`}
            <div class="rs-import-file-meta"><strong>${esc(f.name)}</strong><small>${f.status==='pending'?'正在识别…':f.status==='error'?esc(f.error||'读取失败'):f.icsData?`${f.icsData.blockedSlots.length} 节日历课程`:f.portalData?`${f.portalData.portalClasses?.length||f.portalData.blockedSlots?.length||0} 门精准课程`:f.clarityWarning?esc(f.clarityWarning):'已识别完成'}</small></div>
            <button type="button" class="rs-import-file-remove" data-rs-action="remove-import-file" data-rs-id="${esc(f.id)}" aria-label="移除 ${esc(f.name)}">×</button>
          </div>`).join('')}
        </div>
      </div>`:''}
      ${files.some(f=>f.clarityWarning)?`<div class="rs-clarity-alert" role="status"><strong>清晰度提醒：</strong>${esc(files.find(f=>f.clarityWarning).clarityWarning)}</div>`:''}
      ${(modalState.busy||modalState.errorMsg)?`<div class="rs-import-bar" style="margin-top:8px"><div class="rs-import-status" role="status">${modalState.busy?`<span class="rs-working-dot"></span><span>${esc(modalState.stepText||'正在整理…')}</span>`:`<span class="rs-text-warn">${esc(modalState.errorMsg)}</span>`}</div></div>`:''}
      <details class="rs-wk-advanced" ${advOpen?'open':''}>
        <summary>文字粘贴 / 原文微调（识别偏差或想直接贴便签时展开）</summary>
        <div class="rs-import-input-area">
          <textarea rows="3" data-rs-import-text placeholder="直接在这里粘贴课表文字、待办清单（或在教务网页 Ctrl+A 复制后回这里按 Ctrl+V）…">${esc(modalState.text||'')}</textarea>
          <div class="rs-import-bar">
            <div class="rs-actions">
              ${action('填入示例内容','fill-modal-sample','','rs-quiet-button')}
            </div>
            <button type="button" class="rs-button rs-primary" data-rs-action="analyze-import-text" ${modalState.busy?'disabled':''}>${modalState.busy?'正在归纳…':'识别并生成预览'}</button>
          </div>
        </div>
      </details>
      ${a?`<div class="rs-import-result">
        <div class="rs-import-summary-card">
          <div class="rs-import-badge-row">
            <span class="rs-mode-badge ${a.mode==='deepseek'?'is-ai':''}">${a.mode==='portal'?'教务直连 / WakeUp 无损':a.mode==='deepseek'?'AI 自动归纳':'规则整理'}</span>
            <strong>${esc(a.summary)}</strong>
          </div>
          ${a.insights?.length?`<ul class="rs-import-insights">${a.insights.map(line=>`<li>${esc(line)}</li>`).join('')}</ul>`:''}
        </div>
        ${bellCount?`<div class="rs-bell-card">
          <div class="rs-bell-head">
            <strong>学校作息时间表 · 共 ${bellCount} 节</strong>
            <span>${existingMatched?`同步校准已有 ${existingMatched} 节课程`:'已按准确上下课钟点校准'}</span>
          </div>
          <div class="rs-bell-chips">${bellList.map(b=>`<span class="rs-bell-chip">第${b.section}节 ${esc(b.start)}–${esc(b.end)}</span>`).join('')}</div>
        </div>`:(a.blockedSlots?.length&&!model.bellSchedule?.length?`<div class="rs-bell-card"><div class="rs-bell-head"><strong>快捷匹配学校作息（无需找作息截图）</strong><button type="button" class="rs-button rs-quiet-button" data-rs-action="apply-bell-preset-import" data-rs-id="suda_12">一键套用标准 12 节作息（8:00起）</button></div></div>`:'')}
        ${protoCards.length?`<div class="rs-import-group">
          <h4>将导入以下每周课程原型（共 ${protoCards.length} 门 · 展开为 ${selectedSlots} 节全学期日程）</h4>
          <div class="rs-wk-proto-grid">
            ${protoCards.map(p=>`<div class="rs-wk-proto-card"><strong>${esc(p.title)}</strong><small>周${'一二三四五六日'[p.weekday-1]} 第${p.sectionStart}${p.sectionEnd>p.sectionStart?'-'+p.sectionEnd:''}节${p.location?' · '+esc(p.location):''}</small></div>`).join('')}
          </div>
        </div>`:''}
        ${a.tasks?.length?`<div class="rs-import-group">
          <h4>待办任务（已选 ${selectedTasks}/${a.tasks.length}）</h4>
          <div class="rs-import-list">
            ${a.tasks.map((t,idx)=>`<label class="rs-import-row"><input type="checkbox" data-imp-task="${idx}" ${t.checked!==false?'checked':''}><span class="rs-tag-study">${esc(t.effortLabel||'坐一会能完')}</span><strong>${esc(t.title)}</strong><small>${t.due?'截止 '+esc(t.due):'柔性推进'}</small></label>`).join('')}
          </div>
        </div>`:''}
        <div class="rs-actions rs-import-confirm-bar">
          <button type="button" class="rs-button rs-primary" data-rs-action="confirm-unified-import" ${totalCount?'':'disabled'}>${esc(confirmLabel)}</button>
          ${(model.blockedSlots?.length&&a.blockedSlots?.length)?`<label class="rs-inline-check"><input type="checkbox" data-imp-replace ${modalState.replaceImported?'checked':''}> 覆盖原有导入课程</label>`:''}
          ${action('清空预览','clear-import-preview','','rs-quiet-button')}
        </div>
      </div>`:''}
    </section></div>`;
  }

  function blockForm(draft){
    const per=['morning','noon','afternoon','evening'].includes(draft.period)?draft.period:'morning';
    return `<div class="rs-modal-backdrop"><section class="rs-dialog" role="dialog" aria-modal="true" aria-labelledby="rsBlockTitle"><div class="rs-panel-head"><div><p class="rs-kicker">课程 / 固定日程</p><h2 id="rsBlockTitle">添加到时间线</h2></div>${action('关闭','close-block','','rs-quiet-button')}</div><form data-rs-form="blocked"><input type="hidden" name="day" value="${esc(draft.day||'')}"><label>日程或课程名称<input name="title" required maxlength="120" value="${esc(draft.title||'')}" placeholder="例如：高等数学课、专业实验、社团开会"></label><label>所属生活时段<select name="period">${PERIODS.map(p=>`<option value="${p.id}" ${per===p.id?'selected':''}>${p.label}</option>`).join('')}</select></label><details class="rs-optional"><summary>可选：精确起止时间（留空则不显示具体钟点）</summary><div class="rs-form-grid"><label>开始钟点<input name="startClock" type="time" value="${esc(draft.startClock||'')}"></label><label>结束钟点<input name="endClock" type="time" value="${esc(draft.endClock||'')}"></label></div></details><div class="rs-actions"><button class="rs-button rs-primary" type="submit">添加到时间线</button>${action('取消','close-block','','rs-quiet-button')}</div></form></section></div>`;
  }

  function mount(root,adapter){
    if(!root||!adapter||typeof adapter.getModel!=='function'||typeof adapter.dispatch!=='function')throw Error('学习工作台初始化失败');
    const initToday=adapter.getModel()?.today||localDayStr(new Date());
    let view='overview',zoomLevel='day',selectedDay=initToday,activeYm=initToday.slice(0,7),todayState='light';
    let taskEditor=adapter.getModel().uiDrafts?.task||null,blockEditor=null,courseEditor=null,bellModal=null,showWeekend=false,notePreview=null,importModal=null;
    let resQuery='',resCategory='all',demoScenario='c2',quickText=adapter.getModel().uiDrafts?.quick||'',notice='',error='',working=false,quickBusy=false,destroyed=false;
    let inlineSlotKey='',draggedTaskId='',resUi={focusId:'root',tool:''};
    const drawQuickBubbles=(n=6)=>window.LifeOSPromptBank?.draw?.(n)||[
      '今晚太累，只想早点睡',
      '周三下午全空，怎么利用最高效',
      '下周考高数，帮我拆四步',
      '周五交小论文，拆成大纲与初稿',
      '不熬夜，帮我重排这周计划',
      '这周事有点多，排个优先级'
    ];
    let quickBubbles=drawQuickBubbles(6);
    let focusTimer={totalSec:25*60,leftSec:25*60,running:false,interval:null};
    function fmtClockSec(sec){const s=Math.max(0,Math.floor(sec));const m=Math.floor(s/60),r=s%60;return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;}
    function stopFocusTimer(){if(focusTimer.interval!==null){clearInterval(focusTimer.interval);focusTimer.interval=null;}focusTimer.running=false;}
    function toggleFocusTimer(){
      if(focusTimer.running){stopFocusTimer();render();return;}
      focusTimer.running=true;
      focusTimer.interval=setInterval(()=>{
        if(destroyed){stopFocusTimer();return;}
        focusTimer.leftSec=Math.max(0,focusTimer.leftSec-1);
        const clk=root.querySelector?.('[data-rs-focus-clock]');
        if(clk)clk.textContent=fmtClockSec(focusTimer.leftSec);
        if(focusTimer.leftSec<=0){stopFocusTimer();notice='本轮专注倒计时结束，可以喝口水休息一下。';render();}
      },1000);
      render();
    }
    let savedView={};try{savedView=JSON.parse(window.LifeOSAccountStorage?.getItem('lifeos-workbench-view')||'{}');if(savedView?.version!==1)savedView={};}catch{}
    if(['overview','resources','settings','study'].includes(savedView.view))view=savedView.view;
    if(savedView.toolsOpen&&view==='overview')view='settings';
    if(view==='study'&&!adapter.getModel().tasks.some(t=>t.id===adapter.getModel().study?.taskId&&!t.archived&&t.kind!=='habit'))view='overview';
    let toolsOpen=view==='settings',schoolUi={query:'',busy:false,error:'',draft:null,searchOpen:false},byokUi={busy:false,msg:'',err:''},excludeIds=new Set(),includeHistory=true,pendingEdits=new Map(),requestGeneration=0,consentGeneration=0,consentPending=false;
    let portalCaps={checked:false,canSpawnVisibleWindow:false};
    async function refreshPortalCaps(){
      if(portalCaps.checked||typeof fetch!=='function')return portalCaps;
      try{
        const res=await fetch('/lifeos-web/api/portal-capabilities');
        const d=await res.json().catch(()=>({}));
        portalCaps={checked:true,canSpawnVisibleWindow:Boolean(res.ok&&d?.ok&&d.canSpawnVisibleWindow)};
        if(importModal&&!destroyed)render();
      }catch{
        portalCaps={checked:true,canSpawnVisibleWindow:false};
      }
      return portalCaps;
    }
    void refreshPortalCaps();
    let dragTrackActive=false,dragStartX=0,dragStartScroll=0,dragMoved=false,suppressScrollSync=false,lastFocalId='';

    function saveView(){toolsOpen=view==='settings';if(adapter.getModel().mode==='demo')return;try{window.LifeOSAccountStorage?.setItem('lifeos-workbench-view',JSON.stringify({version:1,view,toolsOpen}));}catch{}}
    function contextPreview(){return adapter.getModel().aiContextConsent&&window.LifeOSStudyContext?window.LifeOSStudyContext.build(adapter.getModel(),quickText):undefined;}
    function updateContextCard(){const node=root.querySelector('.rs-ai-context');if(node)node.innerHTML=contextCard(adapter.getModel(),{contextPreview:contextPreview(),excludeIds:[...excludeIds],includeHistory});}
    const intake=window.LifeOSRestartAssistant.createIntake({isActive:()=>!destroyed});
    function cancelIntake(){requestGeneration++;intake.cancel();quickBusy=false;}
    const cooldown=window.LifeOSStudyUI.createCooldown({now:()=>Date.now(),setTimer:setTimeout,clearTimer:clearTimeout,onChange:updateIntakeControls});
    function cooldownSeconds(){return adapter.getModel().mode==='demo'?0:cooldown.remaining();}
    function syncCooldown(){if(adapter.getModel().mode==='demo')return;const request=window.LifeOSAssistantRequest,seconds=Number(request?.cooldownRemaining?.());if(seconds>cooldown.remaining())cooldown.start({code:request?.cooldownCode?.()||cooldown.code||'RATE_LIMITED',retryAfter:seconds});}
    function updateIntakeControls(){if(destroyed)return;const seconds=cooldownSeconds(),button=root.querySelector('[data-ai-submit]'),status=root.querySelector('[data-ai-cooldown]');if(button){button.disabled=quickBusy||seconds>0;button.textContent=quickBusy?'正在结合课表整理方案…':seconds>0?`${seconds} 秒后可重试`:'生成可选节奏';}if(status){status.hidden=adapter.getModel().mode==='demo'||!cooldown.code;status.textContent=cooldown.code?window.LifeOSStudyUI.cooldownCopy(seconds,cooldown.code):'';}}
    let materialId=adapter.getModel().uiDrafts?.quickSource?.id||'',materialText=adapter.getModel().uiDrafts?.quickSource?.text||'',draftTimer,noteTimer,pendingNote=null,suggestionEdits={};
    const persist=(key,value)=>adapter.dispatch('save-ui-draft',{key,value});
    async function flush(){clearTimeout(draftTimer);clearTimeout(noteTimer);const drafts=adapter.getModel().uiDrafts||{};if(drafts.quick!==quickText)await persist('quick',quickText);const source=materialId&&materialText===quickText?{id:materialId,text:materialText}:null;if(JSON.stringify(drafts.quickSource||null)!==JSON.stringify(source))await persist('quickSource',source);for(const [key,entry]of [...pendingEdits]){if(adapter.getModel().intentDraft?.id!==entry.draftId){pendingEdits.delete(key);continue;}await adapter.dispatch('save-intent-edits',{index:entry.index,values:entry.values});if(pendingEdits.get(key)===entry)pendingEdits.delete(key);}if(pendingNote){const note=pendingNote;await adapter.dispatch('save-study-note',note);if(pendingNote===note)pendingNote=null;}}
    function flushOnHide(){void flush().catch(e=>{error=e.message;});}
    function beforeLeave(event){if(pendingNote){event.preventDefault();event.returnValue='';}}
    function captureSuggestion(form){const id=adapter.getModel().intentDraft?.id;if(id){const values=Object.fromEntries(new FormData(form)),index=Number(form.elements.index.value),key=id+':'+index;suggestionEdits[key]=values;const clean={};for(const field of ['title','course','deadline','estimateMinutes','priority','notes'])if(Object.hasOwn(values,field))clean[field]=values[field];pendingEdits.set(key,{draftId:id,index,values:clean});clearTimeout(draftTimer);draftTimer=setTimeout(()=>{void flush().catch(e=>{error=e.message;});},350);}}

    function centerViewportOnActive(behavior='auto'){
      const vp=root.querySelector?.('[data-tl-viewport]');
      if(!vp||!vp.clientWidth)return;
      const target=vp.querySelector?.('.rs-tl-tick.is-center');
      if(!target)return;
      const desired=Math.max(0,(target.offsetLeft||0)+(target.offsetWidth||0)/2-vp.clientWidth/2);
      suppressScrollSync=true;
      try{if(typeof vp.scrollTo==='function')vp.scrollTo({left:desired,behavior});else vp.scrollLeft=desired;}catch{vp.scrollLeft=desired;}
      lastFocalId=target.dataset?.rsId||'';
      setTimeout(()=>{suppressScrollSync=false;},behavior==='smooth'?280:60);
    }

    function applyLiveFocal(vp){
      if(!vp||!vp.clientWidth)return;
      const ticks=[...(vp.querySelectorAll?.('.rs-tl-tick')||[])];
      if(!ticks.length)return;
      const centerX=(vp.scrollLeft||0)+vp.clientWidth/2;
      let best=ticks[0],bestDist=Infinity;
      for(const t of ticks){
        const mid=(t.offsetLeft||0)+(t.offsetWidth||0)/2;
        const dist=Math.abs(mid-centerX);
        if(dist<bestDist){bestDist=dist;best=t;}
      }
      const id=best?.dataset?.rsId;
      const activeIdx=ticks.indexOf(best);
      for(let i=0;i<ticks.length;i++){
        const t=ticks[i];
        t.classList?.toggle('is-center',i===activeIdx);
        t.classList?.toggle('is-active',i===activeIdx);
        t.classList?.toggle('is-past',i<activeIdx);
        t.classList?.toggle('is-future',i>activeIdx);
      }
      if(!id||id===lastFocalId)return;
      lastFocalId=id;
      const model=adapter.getModel()||{};
      const todayStr=model.today||initToday;
      const titleEl=root.querySelector?.('[data-tl-live-title]');
      const metaEl=root.querySelector?.('[data-tl-live-meta]');
      const prevEl=root.querySelector?.('[data-tl-live-preview]');
      const badgeEl=root.querySelector?.('[data-tl-playhead-badge]');
      if(vp.dataset?.tlViewport==='month'){
        activeYm=id;
        const mObj=buildMonths(model,todayStr).find(m=>m.ym===id);
        if(mObj){
          if(badgeEl)badgeEl.textContent=mObj.year+'·'+mObj.label;
          if(titleEl)titleEl.textContent=mObj.fullLabel;
          if(metaEl)metaEl.textContent=[mObj.classesCount?`${mObj.classesCount} 节课程`:'',mObj.dueTasks.length?`${mObj.dueTasks.length} 项即将截止`:''].filter(Boolean).join(' · ')||'本月步调宽松，放心安排生活';
          if(prevEl)prevEl.innerHTML=renderMonthPreview(mObj);
        }
      }else if(vp.dataset?.tlViewport==='day'){
        selectedDay=id;
        activeYm=id.slice(0,7);
        const {days}=buildDaysForMonth(activeYm,model,todayStr);
        const dObj=days.find(d=>d.dayStr===id);
        if(dObj){
          if(badgeEl)badgeEl.textContent=dObj.shortDate+(dObj.isToday?' 今天':'');
          if(titleEl)titleEl.textContent=dObj.titleDate;
          if(metaEl)metaEl.textContent=dayMetaSummary(dObj);
          const isBlank=((model.tasks||[]).filter(t=>t.kind!=='habit'&&!t.archived).length===0)&&!(model.blockedSlots||[]).length;
          if(prevEl)prevEl.innerHTML=renderFourPeriodPreview(dObj,todayState,isBlank,model,{inlineSlotKey});
          for(const p of root.querySelectorAll?.('.rs-tl-month-strip .rs-month-pill[data-rs-id]')||[]){
            p.classList?.toggle('is-active',p.dataset.rsId===activeYm);
          }
        }
      }
    }

    function bindViewportScroll(){
      const vp=root.querySelector?.('[data-tl-viewport]');
      if(!vp||vp._boundScroll)return;
      vp._boundScroll=true;
      vp.addEventListener?.('scroll',()=>{if(!suppressScrollSync)applyLiveFocal(vp);},{passive:true});
    }

    function render(){
      syncCooldown();saveView();
      const model=adapter.getModel()||{};
      const isSettingsView=view==='settings';
      const isPlanView=view!=='resources'&&view!=='study'&&!isSettingsView;
      const ambientKey=view==='study'?'study':view==='resources'?'resources':currentPeriodByHour();
      const ambientSrc=AMBIENT_IMAGES[ambientKey]||AMBIENT_IMAGES.evening;
      const studySpotlightHtml=view==='study'
        ?`<section class="rs-study-spotlight rs-scene-reveal" aria-label="专注空间"><div class="rs-focus-timer-bar"><div><p class="rs-kicker">专注计时 · 其余课表已静默虚化</p><div class="rs-focus-clock" data-rs-focus-clock>${fmtClockSec(focusTimer.leftSec)}</div></div><div class="rs-actions"><button type="button" class="rs-button ${focusTimer.totalSec===1500?'rs-primary':'rs-quiet-button'}" data-rs-action="focus-timer-preset" data-rs-id="25">25 分钟</button><button type="button" class="rs-button ${focusTimer.totalSec===2700?'rs-primary':'rs-quiet-button'}" data-rs-action="focus-timer-preset" data-rs-id="45">45 分钟</button><button type="button" class="rs-button rs-primary" data-rs-action="focus-timer-toggle">${focusTimer.running?'暂停计时':'开始计时'}</button>${action('重置','focus-timer-reset','','rs-quiet-button')}</div></div>${window.LifeOSStudyUI.execution(model)}</section>`
        :'';
      const body=view==='resources'
        ?resourcesPage(model,resQuery,resCategory,schoolUi,resUi)
        :isSettingsView
          ?settingsPage(model,byokUi)
          :view==='study'
            ?studySpotlightHtml
            :renderPlanPage(model,{zoomLevel,selectedDay,activeYm,todayState,showWeekend,inlineSlotKey,text:quickText,bubbles:quickBubbles,busy:quickBusy,cooldownSeconds:cooldownSeconds(),cooldownCode:model.mode==='demo'?'':cooldown.code,contextPreview:contextPreview(),excludeIds:[...excludeIds],includeHistory,notePreview});

      const scrollPct=typeof window.scrollY==='number'?Math.max(0,Math.min(1,window.scrollY/420)):0;
      root.innerHTML=`<div class="rs-workspace" data-rs-view="${esc(view)}" style="--rs-scroll:${scrollPct.toFixed(3)}">
        <div class="rs-cinema-backdrop" aria-hidden="true"><div class="rs-cinema-vignette"></div></div>
        <div class="rs-top${typeof window.scrollY==='number'&&window.scrollY>16?' is-scrolled':''}">
          <nav class="rs-nav" aria-label="学习工作台导航">
            <button type="button" data-rs-action="view" data-rs-id="overview" aria-current="${isPlanView?'page':'false'}">学习计划</button>
            <button type="button" data-rs-action="view" data-rs-id="resources" aria-current="${view==='resources'?'page':'false'}">学习资料</button>
            <button type="button" data-rs-action="toggle-tools" aria-current="${isSettingsView?'page':'false'}" aria-expanded="${isSettingsView}">设置与备份</button>
          </nav>
          <div class="rs-top-actions">
            <span class="rs-note" data-life-save role="status"></span>
            ${action('导入课表 / 识图','open-import','','rs-primary')}
          </div>
        </div>
        ${error?`<div class="rs-error" role="alert">${esc(error)}</div>`:''}
        ${working?'<div class="rs-working" role="status">正在处理…</div>':''}
        ${notice?`<div class="rs-toast" role="status"><span>${esc(notice)}</span><button type="button" class="rs-toast-close" data-rs-action="dismiss-notice" aria-label="关闭提示">×</button></div>`:''}
        ${body}
        ${taskEditor!==null?taskForm(taskEditor,model):''}
        ${blockEditor!==null?blockForm(blockEditor):''}
        ${courseEditor!==null?courseForm(courseEditor):''}
        ${bellModal!==null?bellForm(bellModal):''}
        ${importModal!==null?importDialog(importModal,model,portalCaps):''}
      </div>`;
      const draftId=model.intentDraft?.id;
      for(const form of root.querySelectorAll?.('[data-rs-form=intent-accept]')||[]){
        const edits=suggestionEdits[draftId+':'+form.elements.index.value];
        if(edits)for(const [k,v]of Object.entries(edits)){const f=form.elements.namedItem(k);if(f&&k!=='index')f.value=v;}
      }
      window.LifeOS?.updateSave();
      bindViewportScroll();
      if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>centerViewportOnActive('auto'));
    }

    async function runSchoolSearch(rawName){
      const schoolName=String(rawName??schoolUi.query??'').trim().slice(0,80);
      if(schoolName.length<2){schoolUi.error='请输入至少 2 个字的高等院校全称或简称。';render();return;}
      schoolUi.query=schoolName;schoolUi.busy=true;schoolUi.error='';render();
      let found=null,lastErr='';
      if(window.LifeOSLocalAI?.hasKey?.()){
        try{found=await window.LifeOSLocalAI.lookupSchoolPortals({schoolName});}
        catch(e){lastErr=e?.message||'';}
      }
      try{
        if(!found&&typeof fetch==='function'){
          const res=await fetch('/lifeos-web/api/school-portals',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({schoolName}),
            signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(26000):undefined
          });
          const data=await res.json().catch(()=>({}));
          if(res.ok&&data?.ok&&data.data?.portals?.length)found=data.data;
          else if(!lastErr&&data?.error)lastErr=data.error;
        }
      }catch(e){if(!lastErr)lastErr=e?.message||'';}
      if(!found&&window.LifeOSAssistantRequest){
        try{
          const remote=await window.LifeOSAssistantRequest('school_portals',{schoolName});
          if(remote?.portals?.length)found=remote;
        }catch(e){if(!lastErr)lastErr=e?.message||'';}
      }
      schoolUi.busy=false;
      if(!found){
        schoolUi.error=lastErr||'学校官网 AI 自动匹配暂未连接（离线或未配置密钥），你可以先点击下方「+ 添加常用学习网站或课程平台链接」手动保存学校教务处地址。';
        render();
        return;
      }
      schoolUi.draft={
        schoolName:found.schoolName||schoolName,
        officialDomain:found.officialDomain||'',
        note:found.note||'',
        portals:(found.portals||[]).map((p,i)=>({id:'school-p-'+i,...p,checked:true}))
      };
      render();
    }

    async function send(name,payload){if(working)return;working=true;error='';try{return await adapter.dispatch(name,payload);}catch(e){error=e?.message||'操作没有完成，请重试。';}finally{working=false;render();}}

    async function prepareImageDataUrl(file){
      const rawUrl=await new Promise((resolve,reject)=>{
        if(typeof FileReader==='undefined'){reject(Error('当前环境不支持读取图片'));return;}
        const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(Error('读取图片失败'));r.readAsDataURL(file);
      });
      if(typeof Image==='undefined'||typeof document==='undefined')return {dataUrl:rawUrl,width:0,height:0,clarityWarning:''};
      return new Promise(resolve=>{
        const img=new Image();
        img.onload=()=>{
          const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
          if(!w||!h){resolve({dataUrl:rawUrl,width:0,height:0,clarityWarning:''});return;}
          let clarityWarning='';
          if(w<720||h<380){
            clarityWarning=`图片分辨率偏低（${w}×${h}），本地识别小字极易出错；建议改传高清原图或放大网页后重截。`;
          }else if(h<820&&w/h>2.1){
            clarityWarning=`横屏宽表格偏扁（${w}×${h}），行内小字可能过细；建议浏览器放大至 150% 以上截图或优先导入 .ics/.csv。`;
          }else if((Number(file?.size)||0)>0&&file.size<35000&&w*h>250000){
            clarityWarning='检测到图片经过高比例压缩，若个别字词认错可在下方文本框顺手微调或重传原图。';
          }
          let scale=1;
          if(w>2400)scale=2400/w;
          if(scale===1&&rawUrl.length<1800000){resolve({dataUrl:rawUrl,width:w,height:h,clarityWarning});return;}
          const canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(w*scale));
          canvas.height=Math.max(1,Math.round(h*scale));
          const ctx=canvas.getContext?.('2d');
          if(!ctx){resolve({dataUrl:rawUrl,width:w,height:h,clarityWarning});return;}
          ctx.imageSmoothingEnabled=true;
          ctx.imageSmoothingQuality='high';
          ctx.fillStyle='#ffffff';
          ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve({dataUrl:canvas.toDataURL('image/png'),width:w,height:h,clarityWarning});
        };
        img.onerror=()=>resolve({dataUrl:rawUrl,width:0,height:0,clarityWarning:''});
        img.src=rawUrl;
      });
    }

    let impFileSeq=0;
    const emptyImportModal=(extra={})=>({busy:false,stepText:'',files:[],imageDataUrl:'',text:'',sourceKind:'note',analysis:null,replaceImported:true,portalGuide:false,portalStep:'idle',portalUrl:'',errorMsg:'',...extra});
    function syncModalFilesText(){
      if(!importModal)return;
      const files=importModal.files||[];
      const textReady=files.filter(f=>f.status==='ready'&&f.kind!=='ics'&&f.kind!=='html'&&String(f.text||'').trim());
      if(textReady.length===1){
        importModal.text=textReady[0].text;
      }else if(textReady.length>=2){
        importModal.text=textReady.map((f,i)=>`【文件 ${i+1}：${f.name}】\n${f.text}`).join('\n\n');
      }else if(!files.some(f=>f.status==='ready')){
        if(files.length===0&&!importModal.text)importModal.text='';
      }
      const imgs=files.filter(f=>f.previewUrl);
      importModal.imageDataUrl=(imgs.length===1&&files.length<=1)?imgs[0].previewUrl:'';
      if(files.length===1)importModal.sourceKind=files[0].kind||'note';
      else if(files.length>1)importModal.sourceKind='batch';
    }

    async function runUnifiedAnalyze(rawText,sourceKind='note'){
      const imp=window.LifeOSScheduleImporter;
      if(!imp)throw Error('解析模块尚未就绪。');
      const readyFiles=(importModal?.files||[]).filter(f=>f.status==='ready');
      const icsFiles=readyFiles.filter(f=>f.kind==='ics'&&f.icsData);
      const icsSlots=[];
      for(const f of icsFiles){
        for(const s of f.icsData.blockedSlots||[])icsSlots.push({...s,checked:true});
      }
      const curModel=adapter.getModel()||{};
      const existingBell=Array.isArray(curModel.bellSchedule)?curModel.bellSchedule:[];
      const todayStr=curModel.today||initToday;
      const baseDate=new Date(todayStr+'T12:00:00');
      const rawStr=String(rawText??importModal?.text??'');
      const trimmedStr=rawStr.trim();
      const htmlFiles=readyFiles.filter(f=>f.kind==='html'&&f.portalData);
      if(htmlFiles.length===1&&readyFiles.length===1&&htmlFiles[0].portalData){
        const pRes=htmlFiles[0].portalData;
        if(importModal){importModal.busy=false;importModal.stepText='';importModal.analysis=pRes;importModal.errorMsg='';render();}
        return pRes;
      }
      for(const hf of htmlFiles){
        for(const s of hf.portalData?.blockedSlots||[])icsSlots.push({...s,checked:true});
      }
      if((sourceKind==='html'||(/<table\b/i.test(trimmedStr)&&/<t[dh]\b/i.test(trimmedStr)))||/^\s*\{\s*"v"\s*:\s*1[\s\S]*"cells"\s*:\s*\[/.test(trimmedStr)){
        const directRes=imp.analyzeImportLocally(trimmedStr,{now:baseDate,days:126,sourceKind:sourceKind==='html'?'html':'note',bellSchedule:existingBell});
        if(importModal){importModal.busy=false;importModal.stepText='';importModal.analysis=directRes;importModal.errorMsg='';render();}
        return directRes;
      }
      const cleaned=(sourceKind==='image'&&!/^【已按课表二维表格/.test(trimmedStr))?imp.normalizeOCRText(rawStr):trimmedStr;
      if(!cleaned&&!icsSlots.length&&!htmlFiles.length)throw Error('没有识别到文字或日历内容，请添加课表文件、截图或手动补充文字再试。');

      if(importModal){importModal.text=cleaned;importModal.busy=true;importModal.errorMsg='';importModal.stepText=readyFiles.length>1?'2. 正在通过 LifeOS 交叉归纳多份文件…':'2. 正在通过 LifeOS 自动归纳分类…';render();}
      let result=null;
      const effectiveKind=readyFiles.length>1?'batch':sourceKind;
      if(!result&&cleaned&&sourceKind!=='ics'&&!/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(cleaned)){
        if(window.LifeOSLocalAI?.hasKey?.()){
          try{
            const byokRes=await window.LifeOSLocalAI.analyzeImport({text:cleaned,sourceKind:effectiveKind,today:todayStr});
            if(byokRes)result=imp.normalizeRemoteAnalysis(byokRes,{now:baseDate,days:126,bellSchedule:existingBell});
          }catch{}
        }
        try{
          if(!result&&typeof fetch==='function'){
            const res=await fetch('/lifeos-web/api/import-analyze',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({text:cleaned,sourceKind:effectiveKind,today:todayStr}),
              signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(26000):undefined
            });
            if(res.ok){
              const data=await res.json();
              if(data?.ok&&data.analysis)result=imp.normalizeRemoteAnalysis(data.analysis,{now:baseDate,days:126,bellSchedule:existingBell});
            }
          }
        }catch{}
        if(!result&&window.LifeOSAssistantRequest){
          try{
            const remote=await window.LifeOSAssistantRequest('analyze_import',{text:cleaned,sourceKind:effectiveKind,today:todayStr,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});
            if(remote)result=imp.normalizeRemoteAnalysis(remote,{now:baseDate,days:126,bellSchedule:existingBell});
          }catch{}
        }
      }
      if(!result&&cleaned){
        result=imp.analyzeImportLocally(cleaned,{now:baseDate,days:126,sourceKind:effectiveKind==='batch'?'note':sourceKind,bellSchedule:existingBell});
      }
      if(!result){
        result={mode:'rules',summary:'',insights:[],blockedSlots:[],tasks:[],dayAdjustments:[],bellSchedule:[]};
      }

      let mergedSlots=[];
      if(imp?.mergeBlockedSlots){
        mergedSlots=imp.mergeBlockedSlots(icsSlots,result.blockedSlots||[]).slots.map(s=>({...s,checked:s.checked!==false}));
      }else{
        mergedSlots=[...icsSlots];
        const slotSeen=new Set(icsSlots.map(s=>`${s.start}|${s.end}|${s.title||''}`));
        for(const b of result.blockedSlots||[]){
          const key=`${b.start}|${b.end}|${b.title||''}`;
          if(!slotSeen.has(key)){slotSeen.add(key);mergedSlots.push({...b,checked:b.checked!==false});}
        }
      }
      const rawTasks=(result.tasks||[]).map(t=>({...t,checked:t.checked!==false}));
      const uniqueTasks=imp?.dedupeTasksList?imp.dedupeTasksList([],rawTasks).tasks:rawTasks;
      const extractedBell=Array.isArray(result.bellSchedule)?result.bellSchedule:[];
      const effectiveBell=extractedBell.length?extractedBell:existingBell;
      let finalSlots=mergedSlots;
      let calibratedNow=0;
      if(effectiveBell.length&&imp.applyBellScheduleToSlots&&mergedSlots.length){
        const cal=imp.applyBellScheduleToSlots(mergedSlots,effectiveBell);
        finalSlots=cal.slots.map((s,i)=>({...s,checked:mergedSlots[i]?.checked!==false}));
        calibratedNow=cal.calibratedCount;
      }
      const nextInsights=[...(result.insights||[])];
      if(icsFiles.length)nextInsights.unshift(`已合并 ${icsFiles.length} 份 .ics 日历，共提取 ${icsSlots.length} 节带钟点日程`);
      if(calibratedNow&&!nextInsights.some(x=>x.includes('作息'))){
        nextInsights.unshift(`已用提取到的学校作息表自动校准 ${calibratedNow} 节课程上下课时间`);
      }
      const batchPrefix=readyFiles.length>1?`已联合分析 ${readyFiles.length} 份文件 · `:'';
      let summaryText=result.summary||'';
      if(icsFiles.length&&!cleaned){
        summaryText=`已从 ${icsFiles.length} 份 .ics 日历提取 ${icsSlots.length} 节课程`;
      }else if(batchPrefix&&summaryText&&!summaryText.startsWith('已联合分析')){
        summaryText=batchPrefix+summaryText;
      }else if(!summaryText){
        summaryText=`${batchPrefix}已归纳 ${finalSlots.length} 节课程与 ${uniqueTasks.length} 项待办`;
      }
      result={...result,summary:summaryText.slice(0,240),insights:nextInsights.filter(Boolean).slice(0,4),blockedSlots:finalSlots,tasks:uniqueTasks,bellSchedule:extractedBell};

      if(importModal){
        importModal.busy=false;
        importModal.stepText='';
        importModal.analysis=result;
        importModal.errorMsg='';
        render();
      }
      return result;
    }

    async function handleUnifiedFiles(fileList){
      const incoming=Array.from(fileList||[]).filter(Boolean);
      if(!incoming.length)return;
      if(!importModal)importModal=emptyImportModal();
      const imp=window.LifeOSScheduleImporter;
      const room=Math.max(0,8-(importModal.files?.length||0));
      if(room<=0){importModal.errorMsg='一次最多同时联合分析 8 个文件，请先移除部分后再添加。';render();return;}
      const existingSig=new Set((importModal.files||[]).map(x=>`${x.name}|${x.size}|${x.lastModified}`));
      const added=[];
      let dupSkipped=0;
      for(const f of incoming){
        if(added.length>=room)break;
        const sig=`${f.name||''}|${Number(f.size)||0}|${Number(f.lastModified)||0}`;
        if(existingSig.has(sig)){dupSkipped++;continue;}
        existingSig.add(sig);
        const isImg=/^image\//i.test(f.type)||/\.(png|jpe?g|webp|bmp)$/i.test(f.name||'');
        const isIcs=/\.ics$/i.test(f.name||'');
        const isWakeUp=/\.wakeup_schedule$/i.test(f.name||'');
        const isHtml=/\.(?:html?|mhtml?|xls)$/i.test(f.name||'')||/^text\/html|multipart\/related$/i.test(f.type||'');
        const isCsv=/\.(csv|tsv)$/i.test(f.name||'');
        const kind=isImg?'image':isWakeUp?'html':isIcs?'ics':isHtml?'html':isCsv?'csv':'note';
        const entry={id:'imp-f-'+(++impFileSeq),name:f.name||(isImg?'粘贴截图.png':'导入文件'),size:Number(f.size)||0,lastModified:Number(f.lastModified)||0,kind,status:'pending',text:'',previewUrl:'',icsData:null,portalData:null,error:'',_rawFile:f};
        importModal.files.push(entry);
        added.push(entry);
      }
      if(!added.length){
        importModal.errorMsg=dupSkipped?'所选文件已在待分析队列中，已自动跳过重复添加。':'未能加入队列。';
        render();return;
      }
      importModal.busy=true;importModal.errorMsg='';importModal.analysis=null;
      render();

      for(let i=0;i<added.length;i++){
        const entry=added[i];
        const f=entry._rawFile;
        delete entry._rawFile;
        if(importModal){importModal.stepText=`1. 正在识别与读取 (${i+1}/${added.length})：${entry.name}…`;render();}
        if(f.size>8*1024*1024){entry.status='error';entry.error='文件超过 8 MB';continue;}
        try{
          if(entry.kind==='image'){
            const prep=await prepareImageDataUrl(f);
            const dataUrl=typeof prep==='string'?prep:prep.dataUrl;
            entry.previewUrl=dataUrl;
            if(prep?.clarityWarning)entry.clarityWarning=prep.clarityWarning;
            if(typeof fetch!=='function')throw Error('当前环境不支持识图接口');
            const res=await fetch('/lifeos-web/api/ocr-image',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({dataUrl,mimeType:f.type||'image/png'}),
              signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(28000):undefined
            });
            const data=await res.json().catch(()=>({}));
            if(!res.ok||!data?.ok)throw Error(data?.error||'截图识别未完成');
            const rawOcr=String(data.text||'').trim();
            const recon=imp?.reconstructTimetableFromOCR
              ?imp.reconstructTimetableFromOCR({words:data.words,rows:data.rows,imgW:data.imgW,imgH:data.imgH,fallbackText:rawOcr})
              :{isGrid:false,text:imp?imp.normalizeOCRText(rawOcr):rawOcr};
            const norm=String(recon?.text||'').trim();
            if(!norm){entry.status='error';entry.error='未识别到清晰文字';}
            else{entry.status='ready';entry.text=norm;entry.isGrid=Boolean(recon?.isGrid);}
          }else{
            let rawText='';
            if(typeof f.arrayBuffer==='function'&&typeof TextDecoder!=='undefined'){
              const buf=await f.arrayBuffer();
              rawText=new TextDecoder('utf-8').decode(buf);
              const badCount=(rawText.match(/\uFFFD/g)||[]).length;
              if(badCount>=2){
                try{
                  const gbkText=new TextDecoder('gbk').decode(buf);
                  if((gbkText.match(/\uFFFD/g)||[]).length<badCount)rawText=gbkText;
                }catch{}
              }
            }else{
              rawText=await f.text();
            }
            if(entry.kind==='ics'||/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(rawText)){
              entry.kind='ics';
              if(!imp)throw Error('解析模块尚未就绪');
              entry.icsData=imp.parseICS(rawText,{now:new Date(),days:126});
              entry.status='ready';
            }else if(/\.wakeup_schedule$/i.test(f.name||'')||(/"courseName"\s*:/.test(rawText)&&/"startNode"\s*:/.test(rawText))){
              entry.kind='html';
              if(!imp)throw Error('解析模块尚未就绪');
              const curModel=adapter.getModel()||{};
              const baseDate=new Date((curModel.today||initToday)+'T12:00:00');
              const existingBell=Array.isArray(curModel.bellSchedule)?curModel.bellSchedule:[];
              entry.portalData=imp.parseWakeUpSchedule(rawText,{now:baseDate,days:126,bellSchedule:existingBell});
              entry.status='ready';
            }else if(entry.kind==='html'||(/<table\b/i.test(rawText)&&/<t[dh]\b/i.test(rawText))){
              entry.kind='html';
              if(!imp)throw Error('解析模块尚未就绪');
              const curModel=adapter.getModel()||{};
              const baseDate=new Date((curModel.today||initToday)+'T12:00:00');
              const existingBell=Array.isArray(curModel.bellSchedule)?curModel.bellSchedule:[];
              entry.portalData=imp.parseHtmlTimetable(rawText,{now:baseDate,days:126,bellSchedule:existingBell});
              entry.status='ready';
            }else{
              const trimmed=String(rawText||'').trim();
              if(!trimmed){entry.status='error';entry.error='文件内容为空';}
              else{entry.status='ready';entry.text=trimmed;}
            }
          }
        }catch(e){
          entry.status='error';
          entry.error=e?.message||'读取失败';
        }
        if(importModal)render();
      }

      if(!importModal)return;
      syncModalFilesText();
      const anyReady=importModal.files.some(x=>x.status==='ready')||Boolean(String(importModal.text||'').trim());
      if(!anyReady){
        importModal.busy=false;
        importModal.stepText='';
        importModal.errorMsg=importModal.files.find(x=>x.error)?.error||'未能从所选文件提取内容，请更换清晰图片或手动粘贴文本。';
        render();
        return;
      }
      try{
        await runUnifiedAnalyze(importModal.text,importModal.sourceKind||'note');
      }catch(e){
        if(importModal){importModal.busy=false;importModal.stepText='';importModal.errorMsg=e?.message||'联合归纳未完成';render();}
      }
    }

    function onPointerDown(event){
      const vp=event.target?.closest?.('[data-tl-viewport]');
      if(!vp||event.button>0)return;
      dragTrackActive=true;dragMoved=false;dragStartX=event.clientX;dragStartScroll=vp.scrollLeft||0;
    }
    function onPointerMove(event){
      const glowEl=event.target?.closest?.('[data-rs-glow]');
      if(glowEl&&typeof glowEl.getBoundingClientRect==='function'){
        const rc=glowEl.getBoundingClientRect();
        glowEl.style?.setProperty?.('--mx',`${Math.round(event.clientX-rc.left)}px`);
        glowEl.style?.setProperty?.('--my',`${Math.round(event.clientY-rc.top)}px`);
      }
      if(!dragTrackActive)return;
      const vp=root.querySelector?.('[data-tl-viewport]');
      if(!vp)return;
      const dx=event.clientX-dragStartX;
      if(Math.abs(dx)>6){dragMoved=true;vp.classList?.add('is-dragging');}
      if(dragMoved)vp.scrollLeft=dragStartScroll-dx;
    }
    function onPointerUp(){
      if(!dragTrackActive)return;
      dragTrackActive=false;
      const vp=root.querySelector?.('[data-tl-viewport]');
      if(vp)vp.classList?.remove('is-dragging');
      if(dragMoved){
        if(vp)applyLiveFocal(vp);
        centerViewportOnActive('smooth');
        setTimeout(()=>{dragMoved=false;},0);
      }
    }
    function onWheel(event){
      const vp=event.target?.closest?.('[data-tl-viewport]');
      if(!vp)return;
      if(Math.abs(event.deltaY)>Math.abs(event.deltaX)&&event.deltaY!==0){
        vp.scrollLeft+=event.deltaY;
        event.preventDefault();
      }
    }

    async function onClick(event){
      if(typeof Element!=='undefined'&&event.target instanceof Element&&event.target.closest('.rs-inline-composer'))return;
      if(event.target?.classList?.contains('rs-modal-backdrop')&&!quickBusy&&!importModal?.busy){cancelIntake();if(taskEditor?.aiDraftId)void adapter.dispatch('ai-cancel');taskEditor=null;blockEditor=null;courseEditor=null;bellModal=null;importModal=null;render();return;}
      const target=event.target.closest('[data-rs-action]');if(!target||!root.contains(target))return;
      const name=target.dataset.rsAction,id=target.dataset.rsId;
      if(['cancel-intake','new-task','quick-manual','demo-start','demo-end','demo-reset','intent-cancel','open-import'].includes(name))cancelIntake();
      try{await flush();}catch(e){error='尚未保存：'+e.message;render();return;}

      if(name==='open-inline-slot'){inlineSlotKey=(inlineSlotKey===id?'':id);render();root.querySelector?.('[data-rs-inline-input]')?.focus?.();return;}
      if(name==='toggle-mm-tool'){resUi={...resUi,tool:(resUi.tool===id?'':id)};render();return;}
      if(name==='shuffle-quick-chips'){quickBubbles=drawQuickBubbles(6);render();return;}
      if(name==='quick-chip'){
        quickText=String(id||'').trim();
        if(quickText)await runQuickFlow(quickText);
        return;
      }
      if(name==='ai-plan-from-res'){
        const model=adapter.getModel()||{};
        const allKnown=[...(model.resources||[]),...(model.customLinks||[]),...(model.schoolProfile?.portals||[]),...STARTER_RESOURCES];
        const found=allKnown.find(r=>r.id===id);
        const rName=found?(found.name||found.title||'这份资料'):'这份资料';
        view='overview';
        quickText=`我想学习《${rName}》，请结合我本周空档分析负荷并给出安排方案`;
        await runQuickFlow(quickText);
        return;
      }
      if(name==='apply-ai-strategy'){
        await send('apply-ai-strategy',{optionId:id});
        if(!error){
          quickText='';
          notice='已按所选方案重新排好时间线（顶部点「撤销重排」可随时撤回）。';
          render();
          root.querySelector?.('.rs-tl-stage')?.scrollIntoView?.({behavior:'smooth',block:'start'});
        }
        return;
      }
      if(name==='strategy-cancel'){await send('strategy-cancel');return;}
      if(name==='focus-timer-toggle'){toggleFocusTimer();return;}
      if(name==='focus-timer-reset'){stopFocusTimer();focusTimer.leftSec=focusTimer.totalSec;render();return;}
      if(name==='focus-timer-preset'){stopFocusTimer();const minsVal=Number(id)||25;focusTimer.totalSec=minsVal*60;focusTimer.leftSec=minsVal*60;render();return;}

      if(name==='open-import'){importModal=emptyImportModal({portalGuide:false});void refreshPortalCaps();render();return;}
      if(name==='toggle-portal-guide'){if(importModal){importModal.portalGuide=!importModal.portalGuide;importModal.errorMsg='';void refreshPortalCaps();render();}return;}
      if(name==='fill-portal-url'){if(importModal){importModal.portalUrl=id||'http://xk.suda.edu.cn/';render();}return;}
      if(name==='portal-open'){
        if(!importModal||importModal.busy)return;
        const urlInp=root.querySelector?.('[data-rs-portal-url]');
        let targetUrl=String(urlInp?.value||importModal.portalUrl||'http://xk.suda.edu.cn/').trim();
        if(!/^https?:\/\//i.test(targetUrl))targetUrl='http://'+targetUrl;
        importModal.portalUrl=targetUrl;
        if(!portalCaps.canSpawnVisibleWindow){
          let pop=null;
          try{pop=window.open(targetUrl,'_blank','width=1220,height=820');}catch{}
          if(!pop){
            importModal.errorMsg=`浏览器拦截了新窗口弹出，请允许弹窗后重试，或手动新开标签页访问 ${targetUrl} 后全选复制课表。`;
            render();
            return;
          }
          importModal.portalStep='browser-opened';
          importModal.errorMsg='';
          importModal.stepText='已在浏览器新窗口打开教务系统：登录后在课表页按 Ctrl+A 全选 → Ctrl+C 复制，再回来点「2. 读取我刚复制的课表」或 Ctrl+V。';
          render();
          return;
        }
        importModal.busy=true;importModal.errorMsg='';importModal.stepText='正在启动学校教务登录窗口…';render();
        try{
          const res=await fetch('/lifeos-web/api/portal-open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:targetUrl})});
          const data=await res.json().catch(()=>({}));
          if(!res.ok||!data?.ok)throw Error(data?.error||'打开教务窗口失败');
          if(data.sandboxDesktop){
            portalCaps={checked:true,canSpawnVisibleWindow:false};
            if(importModal){
              importModal.busy=false;importModal.portalStep='browser-opened';importModal.errorMsg='';
              importModal.stepText='请再次点击上方「打开教务窗口」（或手动新开标签页访问教务系统），复制课表后按 Ctrl+V 粘贴导入。';
              render();
            }
            return;
          }
          if(importModal){importModal.busy=false;importModal.portalStep='opened';importModal.stepText=data.message||'已弹出登录窗口，请登录并打开个人课表页。';render();}
        }catch(e){
          if(importModal){importModal.busy=false;importModal.stepText='';importModal.errorMsg=e?.message||'无法打开教务窗口';render();}
        }
        return;
      }
      if(name==='portal-clipboard'){
        if(!importModal||importModal.busy)return;
        importModal.busy=true;importModal.errorMsg='';importModal.stepText='正在读取剪贴板里的教务课表…';render();
        try{
          let htmlClip='',txtClip='';
          if(navigator.clipboard?.read){
            const items=await navigator.clipboard.read();
            for(const it of items){
              if(!htmlClip&&it.types.includes('text/html'))htmlClip=await (await it.getType('text/html')).text();
              if(!txtClip&&it.types.includes('text/plain'))txtClip=await (await it.getType('text/plain')).text();
            }
          }else if(navigator.clipboard?.readText){
            txtClip=await navigator.clipboard.readText();
          }else{
            throw Error('当前浏览器不支持按钮读取剪贴板，请直接按 Ctrl+V 粘贴。');
          }
          const applied=await applyClipboardTimetable({html:htmlClip,text:txtClip});
          if(!applied)throw Error('剪贴板里还没有课表内容：请切到教务课表页按 Ctrl+A 全选 → Ctrl+C 复制后重试。');
        }catch(e){
          if(importModal){
            importModal.busy=false;importModal.stepText='';
            importModal.errorMsg=e?.name==='NotAllowedError'
              ?'浏览器需要剪贴板权限，请直接在这个弹窗里按 Ctrl+V 粘贴（在教务页 Ctrl+A → Ctrl+C 后直接 Ctrl+V 即可）。'
              :(e?.message||'读取剪贴板失败，请直接按 Ctrl+V 粘贴。');
            render();
          }
        }
        return;
      }
      if(name==='portal-grab'){
        if(!importModal||importModal.busy)return;
        const imp=window.LifeOSScheduleImporter;
        importModal.busy=true;importModal.errorMsg='';importModal.stepText='正在直接读取教务网页课表…';render();
        try{
          const res=await fetch('/lifeos-web/api/portal-grab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
          const data=await res.json().catch(()=>({}));
          if(!res.ok||!data?.ok)throw Error(data?.error||'未读取到课表表格');
          const curModel=adapter.getModel()||{};
          const baseDate=new Date((curModel.today||initToday)+'T12:00:00');
          const existingBell=Array.isArray(curModel.bellSchedule)?curModel.bellSchedule:[];
          const parsedPortal=imp.parsePortalCells({v:1,host:data.host||'',cells:data.cells},{now:baseDate,days:126,bellSchedule:existingBell});
          const summaryLines=(parsedPortal.portalClasses||[]).map(c=>`每周${'日一二三四五六日'[c.weekday]||'一'} ${c.section}节 ${c.title}${c.location?' ('+c.location+')':''}`);
          if(importModal){
            importModal.busy=false;importModal.portalStep='idle';importModal.stepText='';
            importModal.sourceKind='portal';importModal.text=summaryLines.join('\n');
            importModal.analysis=parsedPortal;importModal.errorMsg='';
            render();
          }
        }catch(e){
          if(importModal){importModal.busy=false;importModal.stepText='';importModal.errorMsg=e?.message||'读取失败';render();}
        }
        return;
      }
      if(name==='apply-bell-preset-import'){
        const imp=window.LifeOSScheduleImporter;
        const preset=imp?.BELL_PRESETS?.[id||'suda_12']||imp?.BELL_PRESETS?.suda_12;
        if(preset&&importModal?.analysis){
          const curBell=preset.entries.map(x=>({...x}));
          const cal=imp.applyBellScheduleToSlots(importModal.analysis.blockedSlots||[],curBell);
          importModal.analysis={
            ...importModal.analysis,
            bellSchedule:curBell,
            blockedSlots:cal.slots.map((s,idx)=>({...s,checked:importModal.analysis.blockedSlots?.[idx]?.checked!==false}))
          };
          render();
        }
        return;
      }
      if(name==='close-import'){if(!importModal?.busy){if(importModal?.portalStep==='opened'&&typeof fetch==='function'){try{void fetch('/lifeos-web/api/portal-close',{method:'POST'});}catch{}}importModal=null;render();}return;}
      if(name==='trigger-unified-file'){root.querySelector('[data-rs-unified-file]')?.click();return;}
      if(name==='remove-import-file'){
        if(!importModal||importModal.busy)return;
        importModal.files=(importModal.files||[]).filter(f=>f.id!==id);
        importModal.analysis=null;importModal.errorMsg='';
        if(!importModal.files.length){importModal.imageDataUrl='';importModal.text='';importModal.sourceKind='note';}
        else syncModalFilesText();
        render();return;
      }
      if(name==='clear-import-files'){if(importModal&&!importModal.busy){importModal=emptyImportModal();render();}return;}
      if(name==='fill-modal-sample'){const imp=window.LifeOSScheduleImporter;if(imp&&importModal){importModal=emptyImportModal({sourceKind:'note',text:imp.SAMPLE_STICKY_NOTE});await runUnifiedAnalyze(importModal.text,'note');}return;}
      if(name==='analyze-import-text'){if(!importModal||importModal.busy)return;const inp=root.querySelector('[data-rs-import-text]'),txt=String(inp?.value??importModal.text??'').trim();importModal.text=txt;try{await runUnifiedAnalyze(txt,importModal.sourceKind||'note');}catch(e){importModal.busy=false;importModal.stepText='';importModal.errorMsg=e?.message||'分析未完成';render();}return;}
      if(name==='clear-import-preview'){if(importModal&&!importModal.busy){importModal.analysis=null;importModal.errorMsg='';render();}return;}
      if(name==='clear-bell-schedule'){await send('clear-bell-schedule');if(!error){notice='已清除学校作息时间表。';render();}return;}
      if(name==='confirm-unified-import'){
        const a=importModal?.analysis;if(!a)return;
        const pickedSlots=(a.blockedSlots||[]).filter(x=>x.checked!==false);
        const pickedTasks=(a.tasks||[]).filter(x=>x.checked!==false);
        const pickedAdj=a.dayAdjustments||[];
        const bellList=Array.isArray(a.bellSchedule)?a.bellSchedule:[];
        const replaceImported=Boolean(importModal.replaceImported);
        const prevSlotCount=(adapter.getModel()?.blockedSlots||[]).length;
        await send('import-timetable-note',{blockedSlots:pickedSlots,tasks:pickedTasks,dayAdjustments:pickedAdj,bellSchedule:bellList,replaceImported});
        if(!error){
          importModal=null;zoomLevel=pickedSlots.length?'week':'day';view='overview';
          const bellMsg=bellList.length?`；已保存 ${bellList.length} 节作息表${prevSlotCount||pickedSlots.length?' 并自动校准对应课程时间':''}`:'';
          notice=`已一键写入 ${pickedSlots.length} 节课程与 ${pickedTasks.length} 项任务${bellMsg}。`;
          render();
        }
        return;
      }

      if(name==='dismiss-notice'){notice='';render();return;}
      if(name==='toggle-tools'){view=view==='settings'?'overview':'settings';error='';render();return;}
      if(name==='toggle-school-search'){schoolUi.searchOpen=!schoolUi.searchOpen;schoolUi.error='';render();return;}
      if(name==='cancel-school-draft'){schoolUi.draft=null;schoolUi.error='';render();return;}
      if(name==='confirm-school-portals'){
        const d=schoolUi.draft;if(!d)return;
        const picked=(d.portals||[]).filter(p=>p.checked!==false);
        await send('save-school-profile',{schoolName:d.schoolName,officialDomain:d.officialDomain,note:d.note,portals:picked});
        if(!error){schoolUi.draft=null;schoolUi.searchOpen=false;view='resources';notice=`已保存「${d.schoolName}」共 ${picked.length} 项校内入口到学习资料。`;render();}
        return;
      }
      if(name==='clear-school-profile'){await send('clear-school-profile');if(!error){schoolUi.draft=null;schoolUi.searchOpen=true;notice='已解除学校入口绑定。';render();}return;}
      if(name==='remove-custom-link'){await send('remove-custom-link',{id});if(!error){notice='已移除自定义网站。';render();}return;}
      if(name==='test-byok-key'){
        const localAi=window.LifeOSLocalAI;
        if(!localAi){byokUi={busy:false,msg:'',err:'本机密钥模块尚未就绪。'};render();return;}
        const typed=String(root.querySelector?.('[data-rs-form=byok-key] [name=apiKey]')?.value||'').trim();
        byokUi={busy:true,msg:'',err:''};render();
        try{
          const res=await localAi.testConnection(typed||undefined);
          byokUi={busy:false,msg:`连通正常！当前模型：${res.model}`,err:''};
        }catch(e){
          byokUi={busy:false,msg:'',err:e?.message||'连通测试未通过'};
        }
        render();return;
      }
      if(name==='clear-byok-key'){
        window.LifeOSLocalAI?.clearKey?.();
        byokUi={...byokUi,busy:false,msg:'已从本机浏览器移除自带 API Key。',err:''};
        render();return;
      }
      if(name==='set-zoom'){zoomLevel=['month','week','day','period'].includes(id)?id:'day';view='overview';render();return;}
      if(name==='step-week'){const p=selectedDay.split('-').map(Number);const d=new Date(p[0],p[1]-1,p[2]+(Number(id)||1)*7);selectedDay=localDayStr(d);activeYm=selectedDay.slice(0,7);zoomLevel='week';render();return;}
      if(name==='set-this-week-1'){await send('set-semester-start',{semesterStart:id||mondayOf(selectedDay)});if(!error){notice='已将当前周设为本学期第 1 周，单双周将自动同步。';render();}return;}
      if(name==='toggle-wk-weekend'){showWeekend=!showWeekend;render();return;}
      if(name==='edit-course-card'){
        const proto=extractCoursePrototypes(adapter.getModel()||{}).find(p=>p.id===id);
        if(proto){courseEditor={...proto,matchDow:proto.weekday,matchS1:proto.sectionStart,matchS2:proto.sectionEnd};render();}
        return;
      }
      if(name==='new-course-at'){
        const [wd,sec]=String(id||'1|1').split('|').map(Number);
        const s1=Math.max(1,Math.min(16,sec||1));
        courseEditor={isNew:true,title:'',weekday:wd||1,sectionStart:s1,sectionEnd:Math.min(16,s1+1),location:'',teacher:'',weekStart:1,weekEnd:18,weekMode:'all',colorIdx:0};
        render();return;
      }
      if(name==='close-course'){courseEditor=null;render();return;}
      if(name==='pick-course-color'){if(courseEditor){const form=root.querySelector('[data-rs-form=course-card]');if(form){const fd=new FormData(form);courseEditor={...courseEditor,...Object.fromEntries(fd),colorIdx:Number(id)||0};}else{courseEditor.colorIdx=Number(id)||0;}render();}return;}
      if(name==='delete-course-card'){if(!courseEditor)return;await send('update-course-card',{remove:true,matchKey:courseEditor.matchKey,matchDow:courseEditor.matchDow,matchS1:courseEditor.matchS1,matchS2:courseEditor.matchS2,title:courseEditor.title});if(!error){courseEditor=null;notice='已从周课表移除该课程。';render();}return;}
      if(name==='new-task-for-course'){courseEditor=null;taskEditor={title:`复习 / 作业：${id}`,course:id,estimateMinutes:60,deadline:selectedDay?selectedDay+'T22:00':''};render();root.querySelector('[name=title]')?.focus();return;}
      if(name==='open-bell-editor'){
        const imp=window.LifeOSScheduleImporter;
        const curBell=Array.isArray(adapter.getModel()?.bellSchedule)&&adapter.getModel().bellSchedule.length
          ?adapter.getModel().bellSchedule
          :(imp?.BELL_PRESETS?.suda_12?.entries||[]);
        bellModal={entries:curBell.map(b=>({...b}))};
        render();return;
      }
      if(name==='close-bell'){bellModal=null;render();return;}
      if(name==='apply-bell-preset'){
        const imp=window.LifeOSScheduleImporter;
        const preset=imp?.BELL_PRESETS?.[id];
        if(preset){bellModal={entries:preset.entries.map(x=>({...x}))};render();}
        return;
      }
      if(name==='jump-today'){const t=adapter.getModel()?.today||initToday;selectedDay=t;activeYm=t.slice(0,7);zoomLevel='day';view='overview';render();return;}
      if(name==='jump-month'){activeYm=id||activeYm;selectedDay=activeYm+'-01';if(selectedDay.slice(0,7)===initToday.slice(0,7))selectedDay=initToday;zoomLevel='day';render();return;}
      if(name==='enter-month'){activeYm=id||activeYm;selectedDay=activeYm===initToday.slice(0,7)?initToday:activeYm+'-01';zoomLevel='day';render();return;}
      if(name==='select-month'){
        if(dragMoved){dragMoved=false;return;}
        if(id&&id===activeYm){selectedDay=id===initToday.slice(0,7)?initToday:id+'-01';zoomLevel='day';render();}
        else if(id){activeYm=id;render();}
        return;
      }
      if(name==='select-day'){
        if(dragMoved){dragMoved=false;return;}
        if(zoomLevel==='day'&&id&&id===selectedDay&&target.classList?.contains?.('rs-tl-tick')){zoomLevel='period';render();return;}
        if(id){selectedDay=id;activeYm=id.slice(0,7);}
        if(zoomLevel==='month')zoomLevel='day';
        view='overview';render();return;
      }
      if(name==='open-period-at'){if(id){selectedDay=id;activeYm=id.slice(0,7);}zoomLevel='period';view='overview';render();return;}
      if(name==='step-day'){
        const p=selectedDay.split('-').map(Number);const d=new Date(p[0],p[1]-1,p[2]+(Number(id)||1));
        selectedDay=localDayStr(d);activeYm=selectedDay.slice(0,7);render();return;
      }
      if(name==='view'){view=id||'overview';toolsOpen=false;error='';render();return;}
      if(name==='go-overview'||name==='go-repair'){view='overview';if(name==='go-repair'){const t=adapter.getModel()?.today||initToday;selectedDay=t;activeYm=t.slice(0,7);zoomLevel='period';}toolsOpen=false;error='';render();return;}
      if(name==='go-resources'){importModal=null;view='resources';toolsOpen=false;error='';render();return;}
      if(name==='cancel-intake'){intake.cancel();quickBusy=false;render();return;}

      if(name==='parse-note'){
        const inp=root.querySelector('#rsIntakeText'),txt=String(inp?.value??quickText??'').trim();
        if(!txt){error='请先输入或粘贴课表/便签内容。';render();inp?.focus();return;}
        quickText=txt;
        try{const imp=window.LifeOSScheduleImporter;if(!imp)throw Error('解析模块尚未就绪。');notePreview=imp.parseNoteOrTimetable(txt,{now:new Date()});error='';notice=notePreview.summary;render();}catch(e){error=e.message;render();}
        return;
      }
      if(name==='fill-sample-note'){
        const imp=window.LifeOSScheduleImporter;
        if(imp){quickText=imp.SAMPLE_STICKY_NOTE;notePreview=imp.parseNoteOrTimetable(quickText,{now:new Date()});error='';notice='已填入示例便签与课表。';render();}
        return;
      }
      if(name==='import-ics-trigger'){root.querySelector('[data-rs-ics-file]')?.click();return;}
      if(name==='cancel-note-import'){notePreview=null;render();return;}
      if(name==='confirm-note-import'){if(!notePreview)return;await send('import-timetable-note',{blockedSlots:notePreview.blockedSlots,tasks:notePreview.tasks,dayAdjustments:notePreview.dayAdjustments,bellSchedule:notePreview.bellSchedule||[]});if(!error){notice='已同步放上时间线（已自动合并重复项）。';notePreview=null;quickText='';render();}return;}

      if(name==='new-task'||name==='new-task-at'){const dStr=(name==='new-task-at'&&id)?id:selectedDay;taskEditor={deadline:dStr?dStr+'T22:00':'',estimateMinutes:60};render();root.querySelector('[name=title]')?.focus();return;}
      if(name==='new-block-at'){const [dStr,per]=(id||'').split('|');blockEditor={title:'',day:dStr||selectedDay,period:per||'morning'};render();root.querySelector('[data-rs-form=blocked] [name=title]')?.focus();return;}
      if(name==='close-block'){blockEditor=null;render();return;}
      if(name==='edit-task'){taskEditor=(adapter.getModel().tasks||[]).find(t=>t.id===id)||{};render();return;}
      if(name==='close-task'){if(taskEditor?.aiDraftId)await adapter.dispatch('ai-cancel');taskEditor=null;void persist('task',null);render();return;}

      if(name==='pick-effort'){const form=target.closest('form[data-rs-form=task]');if(form){const fd=new FormData(form);taskEditor={...Object.fromEntries(fd),resourceIds:fd.getAll('resourceIds'),splittable:fd.has('splittable'),estimateMinutes:Number(id)||60};delete taskEditor.aiDraftId;render();}return;}
      if(name==='pick-sched-prio'){const form=target.closest('form[data-rs-form=task]');if(form){const fd=new FormData(form),mapped=id==='asap'?'high':id==='none'?'low':id;taskEditor={...Object.fromEntries(fd),resourceIds:fd.getAll('resourceIds'),splittable:fd.has('splittable'),schedulePriority:id,priority:mapped};delete taskEditor.aiDraftId;render();}return;}
      if(name==='start-task'){await send(name,{id});if(!error){view='study';render();}return;}
      if(name==='pause-study'||name==='complete-study'){await send(name,{id});if(!error){view=name==='complete-study'?'study':'overview';notice=name==='complete-study'?'这项行动已完成！':'已保存专注位置。';render();}return;}
      if(name==='toggle-task'||name==='delete-task'){if(name==='delete-task'&&!confirm('确定删除这项任务吗？'))return;await send(name,{id});return;}
      if(name==='remove-blocked-slot'){await send(name,{index:Number(id)});if(!error)notice='已移除固定日程。';return;}
      if(name==='today-state'){
        const st=TODAY_STATES.find(x=>x.id===id)||TODAY_STATES[0];
        todayState=st.id;
        await send('set-today-minutes',{minutes:st.mins});
        if(!error){
          const t=adapter.getModel()?.today||initToday;selectedDay=t;activeYm=t.slice(0,7);
          notice=st.id==='light'?'已切到「只保底」：今天只留最紧要的一步，其余温柔顺延，安心忙生活。':st.id==='normal'?'已切到「正常节奏」：按轻松步调安排今天，不给自己硬塞。':'已切到「状态好」：顺手把后面几天靠前的任务多推一点。';
          render();
        }
        return;
      }
      if(name==='today-min'){const m=Number(id)||90;todayState=m<=100?'light':m<=180?'normal':'sprint';await send('set-today-minutes',{minutes:m});if(!error){const t=adapter.getModel()?.today||initToday;selectedDay=t;activeYm=t.slice(0,7);notice='已为你重新理顺今天的安排。';render();}return;}

      if(name==='demo-c2'||name==='demo-exam'||name==='demo-paper'){
        demoScenario=name==='demo-exam'?'exam':name==='demo-paper'?'paper':'c2';todayState='light';
        await send(name==='demo-c2'?'demo-c2':'demo-scenario',{scenario:demoScenario});
        if(!error){const t=adapter.getModel()?.today||initToday;selectedDay=t;activeYm=t.slice(0,7);notice='已载入场景，累了随时在上方切换今日状态。';render();}return;
      }
      if(name==='demo-start'||name==='demo-end'||name==='demo-reset'){demoScenario='c2';todayState='light';notePreview=null;materialId='';materialText='';intake.cancel();quickBusy=false;taskEditor=null;await send(name);if(!error){const t=adapter.getModel()?.today||initToday;selectedDay=t;activeYm=t.slice(0,7);zoomLevel='day';quickText=adapter.getModel().uiDrafts?.quick||'';view='overview';render();}return;}

      if(name==='filter-res'){resCategory=id||'all';render();return;}
      if(name==='clear-res-filter'){resQuery='';resCategory='all';render();return;}
      if(name==='new-task-from-res'){const model=adapter.getModel()||{};const allKnown=[...(model.resources||[]),...(model.customLinks||[]),...(model.schoolProfile?.portals||[]),...STARTER_RESOURCES];const found=allKnown.find(r=>r.id===id);const title=found?('学习：'+(found.name||found.title||'')):'';const isReal=(model.resources||[]).some(r=>r.id===id);const urlNote=found?.url?'参考链接：'+found.url:'';taskEditor={title,course:found?.course||'',resourceIds:isReal?[id]:[],notes:[found?.notes||'',urlNote].filter(Boolean).join('\n'),estimateMinutes:60,deadline:selectedDay?selectedDay+'T22:00':''};render();root.querySelector('[name=title]')?.focus();return;}

      if(name==='intent-dismiss'){const draft=adapter.getModel().intentDraft?.id,next={};for(const [k,v]of Object.entries(suggestionEdits)){const i=Number(k.split(':').at(-1));if(k.startsWith(draft+':')&&i!==Number(id))next[draft+':'+(i>Number(id)?i-1:i)]=v;}suggestionEdits=next;await send(name,{index:Number(id)});return;}
      if(name==='intent-cancel'||name==='undo-plan'){await send(name);return;}
      if(name==='intent-adjust-confirm'){await send(name);if(!error){notice='调整已应用到时间线。';render();}return;}

      if(name==='export-schedule'){try{if(typeof adapter.exportScheduleBundle!=='function')throw Error('当前环境暂不支持导出备份。');const bundle=adapter.exportScheduleBundle(),blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`LifeOS-排程快照-${bundle.today||'export'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);notice='排程 JSON 已导出。';render();}catch(e){error=e.message;render();}return;}
      if(name==='import-schedule-trigger'){root.querySelector('[data-rs-import-file]')?.click();return;}
      await send(name);
    }

    function buildStrategyCalendar(context,todayStr){
      const {days}=buildDaysForMonth(todayStr.slice(0,7),context,todayStr);
      const startIdx=Math.max(0,days.findIndex(d=>d.dayStr===todayStr));
      return days.slice(startIdx,startIdx+7).map(d=>({
        day:d.dayStr,
        weekday:d.weekday,
        freeMinutes:d.freeMinutes||0,
        classes:d.classes.map(c=>`${c.title}${classClockLabel(c)?' '+classClockLabel(c):''}`)
      }));
    }

    async function runQuickFlow(rawText){
      syncCooldown();if(quickBusy||cooldownSeconds()>0){updateIntakeControls();return;}
      if(consentPending){notice='摘要授权正在保存，请稍后再提交。';render();return;}
      const useUnderstandBridge=!window.LifeOSStudyPlanner?.strategizeLocal;
      if(useUnderstandBridge&&adapter.getModel().mode!=='demo'&&window.LifeOSAssistantRequest?.pending?.()){notice='上一条请求仍在处理中，暂不重复发送；可手动创建任务。';render();return;}
      quickText=String(rawText||'').trim();if(!quickText||quickText.length>2000)return;
      const mode=adapter.getModel().mode,generation=++requestGeneration;quickBusy=true;notice='';error='';render();let persisted=false;
      try{
        await flush();persisted=true;if(destroyed||generation!==requestGeneration||consentPending||adapter.getModel().mode!==mode)return;
        const context=adapter.getModel();
        if(useUnderstandBridge){
          const built=mode!=='demo'&&context.aiContextConsent&&window.LifeOSStudyContext?window.LifeOSStudyContext.build(context,quickText,{excludeIds:[...excludeIds]}):null;
          if(built&&!includeHistory)built.context.events=[];
          let request=mode==='demo'?undefined:window.LifeOSAssistantRequest;
          if(mode!=='demo'&&!request&&window.LifeOSLocalAI?.hasKey?.()){
            request=(act,inp)=>window.LifeOSLocalAI.understandPlan({text:inp.text,context:inp.context,today:context.today||initToday,timeZone:inp.timeZone,hasAvailableTime:inp.hasAvailableTime});
          }
          const result=await intake.run('understand',{text:quickText,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,hasAvailableTime:context.slots.some(s=>Date.parse(s.end)>Date.now()),...(built?{context:built.context}:{})},{request});
          if(!result||destroyed||generation!==requestGeneration||adapter.getModel().mode!==mode)return;
          await adapter.dispatch('intent-preview',{value:result.value,context:built?.context,references:built?.references});
          suggestionEdits={};
          const change=result.value.adjustment;
          if(result.value.intent==='adjust'&&((change.kind==='time'&&change.day!=='unspecified'&&(change.reductionMinutes||change.unavailable))||change.kind!=='time'))await adapter.dispatch('intent-adjust-preview');
          notice=result.notice;
          return;
        }

        const todayStr=context.today||initToday;
        const calendar=buildStrategyCalendar(context,todayStr);
        const openTasks=(context.tasks||[]).filter(t=>t.kind!=='habit'&&!t.completed&&!t.archived).map(t=>({
          id:t.id,title:t.title,course:t.course||'',deadline:t.due||(t.deadline?String(t.deadline).slice(0,10):''),
          estimateMinutes:t.estimateMinutes||null,progress:t.progress||0,priority:t.schedulePriority||t.priority||'medium'
        }));
        let aiValue=null,aiMode='rules',aiNotice='';
        if(mode!=='demo'){
          if(window.LifeOSLocalAI?.hasKey?.()){
            try{
              aiValue=await window.LifeOSLocalAI.strategizePlan({text:quickText,today:todayStr,calendar,openTasks,preferences:context.preferences});
              if(aiValue?.options?.length)aiMode='deepseek';
            }catch{}
          }
          if(!aiValue&&typeof window.LifeOSAssistantRequest==='function'){
            try{
              const remote=await window.LifeOSAssistantRequest('strategize',{
                text:quickText,
                today:todayStr,
                calendar:calendar.slice(0,14),
                openTasks:openTasks.slice(0,24),
                preferences:{
                  focusMinutes:context.preferences?.focusMinutes||30,
                  dailyCapMinutes:context.preferences?.dailyCapMinutes||180,
                  allowLate:context.preferences?.allowLate===true
                }
              });
              if(remote?.options?.length){aiValue=remote;aiMode='deepseek';}
            }catch(err){
              if(err?.code&&cooldown.start(err)){
                aiNotice=(err.message||'AI 额度暂限')+'，已先按本地规则排好 3 套备选方案。';
              }else if(err?.code){
                aiNotice=(err.message||'云端 AI 暂不可用')+'；已先为你按本地规则排好 3 套方案。';
              }
            }
          }
          if(!aiValue&&typeof fetch==='function'){
            try{
              const res=await fetch('/lifeos-web/api/strategize',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({text:quickText,today:todayStr,calendar,openTasks,preferences:context.preferences}),
                signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(14000):undefined
              });
              const d=await res.json().catch(()=>({}));
              if(res.ok&&d?.ok&&d.value?.options?.length){aiValue=d.value;aiMode='deepseek';}
            }catch{}
          }
        }
        if(destroyed||generation!==requestGeneration||adapter.getModel().mode!==mode)return;
        await adapter.dispatch('strategy-preview',{text:quickText,value:aiValue,mode:aiMode});
        notice=aiNotice||(aiMode==='deepseek'?'LifeOS 已结合你的课表分析出 3 套可选重排方案，挑一个即可生效。':(typeof window.LifeOSAssistantRequest==='function'||mode==='demo'?'LifeOS 已按你的课表空档生成 3 套可选方案，挑一个即可生效。':'当前已先按本地规则排好 3 套方案；登录账户后即可调用云端 AI 深度分析。'));
      }catch(e){
        if(!destroyed&&generation===requestGeneration){
          if(cooldown.start(e))error='';
          else error=persisted?(e.message||'AI 暂不可用。'):'尚未保存：'+e.message;
        }
      }finally{
        if(generation===requestGeneration){
          quickBusy=false;
          if(!destroyed){
            render();
            root.querySelector?.('.rs-tier-board')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
          }
        }
      }
    }

    async function onSubmit(event){
      const form=event.target.closest('form[data-rs-form]');if(!form||!root.contains(form))return;event.preventDefault();
      const data=new FormData(form),type=form.dataset.rsForm;
      if(type==='quick'){
        await runQuickFlow(data.get('text'));
        return;
      }
      try{await flush();}catch(e){error='尚未保存：'+e.message;render();return;}
      if(type==='intent-accept'){const result=await send('intent-accept',{...Object.fromEntries(data),index:Number(data.get('index')),start:event.submitter?.value==='true',resourceIds:materialId?[materialId]:[]});if(result?.acceptedTaskId&&!error){if(event.submitter?.value==='true')view='study';notice='已保存并加入时间线。';render();}return;}
      if(type==='intent-adjust'){const values=Object.fromEntries(data);if(data.has('reductionMinutes'))values.reductionMinutes=Number(data.get('reductionMinutes'));values.unavailable=data.has('unavailable');await send('intent-adjust-preview',values);return;}
      if(type==='preferences'){const payload=Object.fromEntries(data);for(const k of ['focusMinutes','dailyCapMinutes'])payload[k]=Number(payload[k]);payload.allowLate=data.has('allowLate');await send('save-preferences',payload);if(!error)notice='偏好已保存。';return;}
      if(type==='inline-slot'){
        const day=String(data.get('day')||selectedDay||initToday),per=String(data.get('period')||'morning'),title=String(data.get('title')||'').trim();
        if(!title)return;
        const nom={morning:['09:00','10:30'],noon:['12:30','13:30'],afternoon:['14:30','16:00'],evening:['19:00','20:30']}[per]||['09:00','10:30'];
        await send('add-blocked-slot',{title,start:`${day}T${nom[0]}`,end:`${day}T${nom[1]}`,period:per,hideClock:true,source:'manual'});
        if(!error){inlineSlotKey='';notice=`已将「${title}」放入该时段。`;render();}
        return;
      }
      if(type==='blocked'){
        const day=String(data.get('day')||selectedDay||initToday),per=String(data.get('period')||'morning'),sc=String(data.get('startClock')||'').trim(),ec=String(data.get('endClock')||'').trim();
        const nom={morning:['09:00','10:30'],noon:['12:30','13:30'],afternoon:['15:00','16:30'],evening:['19:30','21:00']}[per]||['09:00','10:30'];
        const hasClock=Boolean(sc&&ec);
        const startStr=`${day}T${hasClock?sc:nom[0]}`,endStr=`${day}T${hasClock?ec:nom[1]}`;
        await send('add-blocked-slot',{title:String(data.get('title')||''),start:startStr,end:endStr,period:per,hideClock:!hasClock,source:'manual'});
        if(!error){blockEditor=null;notice='已添加到当日时间线。';render();}
        return;
      }
      if(type==='school-search'){await runSchoolSearch(data.get('schoolName'));return;}
      if(type==='custom-link'){
        await send('add-custom-link',{name:data.get('name'),url:data.get('url'),category:data.get('category'),notes:data.get('notes')});
        if(!error){notice='已将学习网站添加到「学习资料」。';render();}
        return;
      }
      if(type==='byok-key'){
        const raw=String(data.get('apiKey')||'');
        try{
          const localAi=window.LifeOSLocalAI;
          if(!localAi)throw Error('本机密钥模块尚未就绪。');
          const masked=localAi.setKey(raw);
          byokUi={...byokUi,busy:false,msg:`已在本机安全保存：${masked}（导出备份不包含密钥）`,err:''};
        }catch(e){byokUi={...byokUi,busy:false,msg:'',err:e?.message||'保存失败'};}
        render();return;
      }
      if(type==='calibration'){await send('add-calibration-record',{title:String(data.get('title')||''),estimate:Number(data.get('estimate')),actual:Number(data.get('actual')),taskId:String(data.get('taskId')||'')});if(!error){notice='已记录真实耗时。';render();}return;}
      if(type==='course-card'){
        const payload=Object.fromEntries(data.entries());
        await send('update-course-card',{
          matchKey:payload.matchKey||'',matchDow:Number(payload.matchDow)||undefined,
          matchS1:Number(payload.matchS1)||undefined,matchS2:Number(payload.matchS2)||undefined,
          title:payload.title,weekday:Number(payload.weekday)||1,
          sectionStart:Number(payload.sectionStart)||1,sectionEnd:Number(payload.sectionEnd)||1,
          location:payload.location||'',teacher:payload.teacher||'',
          weekStart:Number(payload.weekStart)||1,weekEnd:Number(payload.weekEnd)||18,
          weekMode:payload.weekMode||'all',colorIdx:Number(payload.colorIdx)||0
        });
        if(!error){courseEditor=null;notice='周课表已更新。';render();}
        return;
      }
      if(type==='bell-editor'){
        const rows=(bellModal?.entries||[]).map((r,idx)=>{
          const st=String(data.get(`s_${idx}`)||r.start||'').trim();
          const en=String(data.get(`e_${idx}`)||r.end||'').trim();
          const h=Number(st.split(':')[0]);
          const period=h<12?'morning':(h<13?'noon':(h<18?'afternoon':'evening'));
          return {section:r.section,start:st,end:en,period};
        });
        await send('save-bell-schedule',{bellSchedule:rows});
        if(!error){bellModal=null;notice='作息时间已保存，所有对应课程上下课时间已同步校准。';render();}
        return;
      }
      if(type==='task'){
        const payload=Object.fromEntries(data.entries());payload.estimateMinutes=Number(payload.estimateMinutes);payload.progress=Number(payload.progress);payload.resourceIds=data.getAll('resourceIds');
        if(form.elements?.namedItem?.('splittable'))payload.splittable=data.has('splittable');if(data.get('minChunk'))payload.minChunk=Number(data.get('minChunk'));
        const aiId=taskEditor?.aiDraftId;taskEditor={...payload,aiDraftId:aiId};
        if(aiId){await send('ai-confirm',{...payload,id:aiId,confirmed:data.has('confirmed')});if(!error){taskEditor=null;view='overview';notice='任务已确认并放上时间线。';render();}}
        else{await send('save-task',payload);if(!error){taskEditor=null;void persist('task',null);view='overview';notice='任务已保存到时间线。';render();}}
        return;
      }
    }

    async function onChange(event){
      if(event.target.matches('[data-ai-consent]')){const enabled=event.target.checked,generation=++consentGeneration;cancelIntake();consentPending=true;try{await flush();if(destroyed||generation!==consentGeneration)return;await adapter.dispatch('set-ai-context-consent',{enabled});excludeIds.clear();error='';notice=enabled?'已允许参考任务摘要。':'已撤回摘要授权。';}catch(e){if(generation===consentGeneration)error=e.message;}finally{if(generation===consentGeneration){consentPending=false;if(!destroyed)render();}}return;}
      if(event.target.matches('[data-ai-include]')){cancelIntake();event.target.checked?excludeIds.delete(event.target.dataset.aiInclude):excludeIds.add(event.target.dataset.aiInclude);updateContextCard();updateIntakeControls();return;}
      if(event.target.matches('[data-ai-history]')){cancelIntake();includeHistory=event.target.checked;updateContextCard();updateIntakeControls();return;}
      if(event.target.matches?.('[data-rs-unified-file]')){const files=Array.from(event.target.files||[]);event.target.value='';if(files.length)await handleUnifiedFiles(files);return;}
      if(event.target.matches?.('[data-imp-slot]')){const i=Number(event.target.dataset.impSlot);if(importModal?.analysis?.blockedSlots?.[i]){importModal.analysis.blockedSlots[i].checked=event.target.checked;render();}return;}
      if(event.target.matches?.('[data-imp-task]')){const i=Number(event.target.dataset.impTask);if(importModal?.analysis?.tasks?.[i]){importModal.analysis.tasks[i].checked=event.target.checked;render();}return;}
      if(event.target.matches?.('[data-imp-replace]')){if(importModal){importModal.replaceImported=event.target.checked;}return;}
      if(event.target.matches?.('[data-rs-school-pick]')){const i=Number(event.target.dataset.rsSchoolPick);if(schoolUi.draft?.portals?.[i]){schoolUi.draft.portals[i].checked=event.target.checked;render();}return;}
      if(event.target.matches?.('[data-rs-school-url]')){const i=Number(event.target.dataset.rsSchoolUrl);if(schoolUi.draft?.portals?.[i]){schoolUi.draft.portals[i].url=event.target.value;render();}return;}
      if(event.target.matches?.('[data-rs-ics-file]')){const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>5*1024*1024)throw Error('.ics 文件不能超过 5 MB。');const imp=window.LifeOSScheduleImporter;if(!imp)throw Error('解析模块尚未就绪。');const text=await file.text();notePreview=/\.csv$/i.test(file.name||'')?imp.parseCSVTimetable(text,{now:new Date(),days:35}):imp.parseICS(text,{now:new Date(),days:35});error='';notice=notePreview.summary;render();}catch(e){error='课表导入失败：'+(e?.message||'文件无效');render();}return;}
      if(event.target.matches?.('[data-rs-import-file]')){const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>5*1024*1024)throw Error('文件不能超过 5 MB。');const parsed=JSON.parse(await file.text());await send('import-schedule-json',{data:parsed});if(!error){notice='已恢复排程快照。';render();}}catch(e){error='导入失败：'+(e?.message||'文件格式无效');render();}return;}
      const intentForm=event.target.closest?.('[data-rs-form=intent-accept]');if(intentForm)captureSuggestion(intentForm);
    }

    function onInput(event){
      if(event.target.matches?.('[data-rs-import-text]')){if(importModal)importModal.text=event.target.value;return;}
      if(event.target.matches?.('[data-rs-portal-url]')){if(importModal)importModal.portalUrl=event.target.value;return;}
      if(event.target.matches?.('[data-rs-school-query]')){schoolUi.query=event.target.value;return;}
      if(event.target.matches?.('[data-rs-school-name]')){const i=Number(event.target.dataset.rsSchoolName);if(schoolUi.draft?.portals?.[i])schoolUi.draft.portals[i].name=event.target.value;return;}
      if(event.target.matches?.('[data-rs-school-url]')){const i=Number(event.target.dataset.rsSchoolUrl);if(schoolUi.draft?.portals?.[i])schoolUi.draft.portals[i].url=event.target.value;return;}
      if(event.target.matches?.('[data-rs-res-query]')){resQuery=event.target.value;render();const inp=root.querySelector('[data-rs-res-query]');if(inp){inp.focus();const len=inp.value.length;inp.setSelectionRange?.(len,len);}return;}
      const intentForm=event.target.closest?.('[data-rs-form=intent-accept]');if(intentForm){captureSuggestion(intentForm);return;}
      if(event.target.id==='rsIntakeText'){quickText=event.target.value;updateContextCard();clearTimeout(draftTimer);draftTimer=setTimeout(()=>{void flush().catch(e=>{error=e.message;});},350);return;}
      if(event.target.matches?.('[data-study-note]')){pendingNote={id:event.target.dataset.studyNote,note:event.target.value};clearTimeout(noteTimer);noteTimer=setTimeout(async()=>{try{const note=pendingNote;if(!note)return;await adapter.dispatch('save-study-note',note);if(pendingNote===note)pendingNote=null;const status=root.querySelector('#studyNoteStatus');if(status)status.textContent='笔记已保存。';}catch(e){const status=root.querySelector('#studyNoteStatus');if(status)status.textContent='未保存：'+e.message;}},350);return;}
      const form=event.target.closest?.('[data-rs-form=task]');
      if(form){const fd=new FormData(form),value={...Object.fromEntries(fd),resourceIds:fd.getAll('resourceIds')};if(form.elements?.namedItem?.('splittable')){value.splittable=fd.has('splittable');const mcInput=form.elements.namedItem('minChunk');if(mcInput)mcInput.disabled=!value.splittable;}delete value.aiDraftId;taskEditor=value;void persist('task',value).catch(e=>{error=e.message;});}
    }

    function onKey(event){
      const vp=event.target?.closest?.('[data-tl-viewport]');
      if(vp&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){
        event.preventDefault();
        const ticks=[...(vp.querySelectorAll?.('.rs-tl-tick')||[])];
        const i=ticks.findIndex(t=>t.classList?.contains('is-center'));
        const next=ticks[Math.max(0,Math.min(ticks.length-1,(i<0?0:i)+(event.key==='ArrowRight'?1:-1)))];
        if(next){
          if(vp.dataset?.tlViewport==='month')activeYm=next.dataset.rsId;
          else{selectedDay=next.dataset.rsId;activeYm=selectedDay.slice(0,7);}
          render();
          root.querySelector('[data-tl-viewport]')?.focus?.();
        }
        return;
      }
      const dialog=root.querySelector('[role=dialog]');
      if(!dialog){if(event.key==='Escape'&&view==='settings'){view='overview';render();}return;}
      if(event.key==='Escape'){cancelIntake();if(taskEditor?.aiDraftId)void adapter.dispatch('ai-cancel');taskEditor=null;blockEditor=null;courseEditor=null;bellModal=null;if(!importModal?.busy)importModal=null;render();}
    }

    function onDragStart(event){
      const card=event.target?.closest?.('[data-rs-drag-task]');
      if(!card)return;
      draggedTaskId=card.dataset.rsDragTask||'';
      card.classList?.add('is-dragging');
      try{event.dataTransfer?.setData?.('text/plain',draggedTaskId);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';}catch{}
    }
    function onDragEnd(){
      draggedTaskId='';
      for(const el of root.querySelectorAll?.('.is-dragging,.is-drag-target')||[]){
        el.classList?.remove('is-dragging','is-drag-target');
      }
    }
    function onDragOver(event){
      const dz=event.target?.closest?.('[data-rs-dropzone]');
      if(dz){event.preventDefault();dz.classList?.add('is-over');return;}
      const col=event.target?.closest?.('[data-rs-drop-period]');
      if(col&&draggedTaskId){event.preventDefault();col.classList?.add('is-drag-target');}
    }
    function onDragLeave(event){
      const dz=event.target?.closest?.('[data-rs-dropzone]');
      if(dz)dz.classList?.remove('is-over');
      const col=event.target?.closest?.('[data-rs-drop-period]');
      if(col)col.classList?.remove('is-drag-target');
    }
    async function onDrop(event){
      const col=event.target?.closest?.('[data-rs-drop-period]');
      if(col){
        event.preventDefault();
        col.classList?.remove('is-drag-target');
        const tid=draggedTaskId||(event.dataTransfer?.getData?.('text/plain')||'');
        draggedTaskId='';
        const [day,per]=String(col.dataset.rsDropPeriod||'').split('|');
        const task=(adapter.getModel()?.tasks||[]).find(t=>t.id===tid);
        if(task&&day&&per){
          const nom={morning:['09:00','10:30'],noon:['12:30','13:30'],afternoon:['14:30','16:00'],evening:['19:00','20:30']}[per]||['09:00','10:30'];
          await send('add-blocked-slot',{title:task.title,start:`${day}T${nom[0]}`,end:`${day}T${nom[1]}`,period:per,hideClock:true,source:'pinned-task'});
          if(!error){const pLabel=({morning:'上午',noon:'中午',afternoon:'下午',evening:'晚上'})[per]||'';notice=`已将「${task.title}」放入 ${day.slice(5)} ${pLabel}。`;render();}
        }
        return;
      }
      const dz=event.target?.closest?.('[data-rs-dropzone]');
      if(!dz)return;
      event.preventDefault();
      dz.classList?.remove('is-over');
      const files=Array.from(event.dataTransfer?.files||[]);
      if(files.length)await handleUnifiedFiles(files);
    }
    async function applyClipboardTimetable({html='',text=''}={}){
      const imp=window.LifeOSScheduleImporter;
      if(!importModal||!imp)return false;
      const curModel=adapter.getModel()||{};
      const baseDate=new Date((curModel.today||initToday)+'T12:00:00');
      const existingBell=Array.isArray(curModel.bellSchedule)?curModel.bellSchedule:[];
      if(html&&/<table\b/i.test(html)&&/(?:星期|礼拜|周)[一二三四五六日天]/.test(html)&&imp.parseHtmlTimetable){
        try{
          const parsedHtml=imp.parseHtmlTimetable(html,{now:baseDate,days:126,bellSchedule:existingBell});
          const summaryLines=(parsedHtml.portalClasses||[]).map(c=>`每周${'日一二三四五六日'[c.weekday]||'一'} ${c.section}节 ${c.title}${c.location?' ('+c.location+')':''}`);
          importModal.busy=false;
          importModal.sourceKind='portal';
          importModal.text=summaryLines.join('\n')||importModal.text;
          importModal.analysis=parsedHtml;
          importModal.errorMsg='';
          importModal.stepText='已直接读取教务网页表格，零误差解析完成，请核对后点击一键写入！';
          render();
          return true;
        }catch{}
      }
      const txt=String(text||'').trim();
      if(txt&&/(?:星期|礼拜|周)[一二三四五六日天]/.test(txt)&&/\d{1,2}(?:\s*[-~到至]\s*\d{1,2})?\s*节/.test(txt)&&imp.analyzeImportLocally){
        try{
          const parsedTxt=imp.analyzeImportLocally(txt,{now:baseDate,days:126,sourceKind:'note',bellSchedule:existingBell});
          if(parsedTxt?.portalClasses?.length||parsedTxt?.blockedSlots?.length){
            const summaryLines=(parsedTxt.portalClasses||[]).map(c=>`每周${'日一二三四五六日'[c.weekday]||'一'} ${c.section}节 ${c.title}${c.location?' ('+c.location+')':''}`);
            importModal.busy=false;
            importModal.sourceKind=parsedTxt.portalClasses?.length?'portal':'note';
            importModal.text=summaryLines.join('\n')||txt;
            importModal.analysis=parsedTxt;
            importModal.errorMsg='';
            importModal.stepText='已直接识别粘贴的课表内容，请核对后点击一键写入！';
            render();
            return true;
          }
        }catch{}
      }
      return false;
    }
    async function onPaste(event){
      if(!importModal||importModal.busy)return;
      const htmlClip=String(event.clipboardData?.getData?.('text/html')||'');
      const txtClip=String(event.clipboardData?.getData?.('text/plain')||'');
      if(await applyClipboardTimetable({html:htmlClip,text:txtClip})){
        event.preventDefault();
        return;
      }
      const items=event.clipboardData?.items||[];
      const imgs=[];
      for(const item of items){
        if(item.kind==='file'&&/^image\//i.test(item.type)){
          const f=item.getAsFile?.();
          if(f)imgs.push(f);
        }
      }
      if(imgs.length){
        event.preventDefault();
        await handleUnifiedFiles(imgs);
      }
    }

    async function onWindowMessage(event){
      if(destroyed||event.origin!==location.origin||event.data?.type!=='lifeos-hero-intent')return;
      const intentAction=event.data.action;
      cancelIntake();toolsOpen=false;taskEditor=null;blockEditor=null;importModal=null;error='';
      if(intentAction==='import'){
        view='overview';zoomLevel='day';
        importModal=emptyImportModal();
        render();return;
      }
      if(intentAction==='portal_import'&&event.data.portalPayload){
        view='overview';zoomLevel='day';
        const imp=window.LifeOSScheduleImporter;
        const curModel=adapter.getModel()||{};
        const existingBell=Array.isArray(curModel.bellSchedule)?curModel.bellSchedule:[];
        const baseDate=new Date((curModel.today||initToday)+'T12:00:00');
        try{
          const parsedPortal=imp.parsePortalCells(event.data.portalPayload,{now:baseDate,days:126,bellSchedule:existingBell});
          const summaryLines=(parsedPortal.portalClasses||[]).map(c=>`每周${'日一二三四五六日'[c.weekday]||'一'} ${c.section}节 ${c.title}${c.location?' ('+c.location+')':''}`);
          importModal=emptyImportModal({sourceKind:'portal',text:summaryLines.join('\n'),analysis:parsedPortal,stepText:'已从教务网页零误差抓取完成，核对后点下方即可一键写入时间线。'});
        }catch(e){
          importModal=emptyImportModal({errorMsg:e?.message||'教务课表回传数据解析失败'});
        }
        render();return;
      }
      if(intentAction==='c2'||intentAction==='exam'||intentAction==='paper'){
        demoScenario=intentAction==='exam'?'exam':intentAction==='paper'?'paper':'c2';
        await send(intentAction==='c2'?'demo-c2':'demo-scenario',{scenario:demoScenario});
        if(!error){const t=adapter.getModel()?.today||initToday;selectedDay=t;activeYm=t.slice(0,7);zoomLevel='day';view='overview';notice='已载入示例日程，左右滑动时间线即可切换日期与查看早中晚安排。';render();}
        return;
      }
      if(intentAction==='calibration'){view='settings';render();return;}
      if(intentAction==='prompt'&&typeof event.data.prompt==='string'&&event.data.prompt.trim()){
        const pText=event.data.prompt.trim().slice(0,2000);
        quickText=pText;view='overview';zoomLevel='day';
        importModal=emptyImportModal({text:pText,sourceKind:'note'});
        render();
        try{await runUnifiedAnalyze(pText,'note');}catch(e){if(importModal){importModal.busy=false;importModal.errorMsg=e?.message||'';render();}}
        return;
      }
      view='overview';render();
    }

    function onWindowScroll(){
      const y=typeof window.scrollY==='number'?window.scrollY:0;
      root.querySelector?.('.rs-top')?.classList?.toggle('is-scrolled',y>16);
      const pct=Math.max(0,Math.min(1,y/420));
      root.querySelector?.('.rs-workspace')?.style?.setProperty?.('--rs-scroll',pct.toFixed(3));
    }
    window.addEventListener('message',onWindowMessage);window.addEventListener('pagehide',flushOnHide);window.addEventListener('beforeunload',beforeLeave);window.addEventListener('scroll',onWindowScroll,{passive:true});window.addEventListener('paste',onPaste);
    root.addEventListener('pointerdown',onPointerDown);root.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',onPointerUp);root.addEventListener('wheel',onWheel,{passive:false});
    root.addEventListener('dragstart',onDragStart);root.addEventListener('dragend',onDragEnd);root.addEventListener('dragover',onDragOver);root.addEventListener('dragleave',onDragLeave);root.addEventListener('drop',onDrop);
    root.addEventListener('keydown',onKey);root.addEventListener('input',onInput);root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);root.addEventListener('change',onChange);
    render();
    return {render,flush,openTools(){toolsOpen=true;view='settings';error='';render();},editNew(values){cancelIntake();taskEditor=values;view='overview';render();},setPrompt(text,id){cancelIntake();materialId=id||'';materialText=text;quickText=text;view='overview';void flush().catch(e=>{error=e.message;});notice='已放入资料摘录。';render();},destroy(){stopFocusTimer();flushOnHide();window.removeEventListener('message',onWindowMessage);window.removeEventListener('pagehide',flushOnHide);window.removeEventListener('beforeunload',beforeLeave);window.removeEventListener('scroll',onWindowScroll);window.removeEventListener('paste',onPaste);root.removeEventListener('pointerdown',onPointerDown);root.removeEventListener('pointermove',onPointerMove);window.removeEventListener('pointerup',onPointerUp);root.removeEventListener('wheel',onWheel);root.removeEventListener('dragstart',onDragStart);root.removeEventListener('dragend',onDragEnd);root.removeEventListener('dragover',onDragOver);root.removeEventListener('dragleave',onDragLeave);root.removeEventListener('drop',onDrop);destroyed=true;cooldown.destroy();cancelIntake();void adapter.dispatch('ai-cancel');root.removeEventListener('keydown',onKey);root.removeEventListener('input',onInput);root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);root.removeEventListener('change',onChange);root.replaceChildren();}};
  }
  window.LifeOSRestartUI={mount};
})();
