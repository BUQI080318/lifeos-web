/* Optional Bring-Your-Own-Key (BYOK) local DeepSeek client. Key stays solely in this browser's localStorage and is excluded from all backups/exports. */
((root) => {
  'use strict';

  const STORAGE_KEY = 'lifeos:local:deepseek-key';
  const ENDPOINT = 'https://api.deepseek.com/chat/completions';
  try { root?.localStorage?.removeItem?.('lifeos:local:vision-config'); } catch {}

  function storageOf(customStorage) {
    if (customStorage) return customStorage;
    try { return root?.localStorage || null; } catch { return null; }
  }

  function cleanKey(raw) {
    const s = String(raw || '').trim();
    if (!s || /\s/.test(s) || s.length < 12 || s.length > 256) {
      throw Error('请输入有效的 API Key（至少 12 个字符，且不能包含空格或换行）。');
    }
    return s;
  }

  function getKey(customStorage) {
    try {
      return String(storageOf(customStorage)?.getItem(STORAGE_KEY) || '').trim();
    } catch {
      return '';
    }
  }

  function hasKey(customStorage) {
    return getKey(customStorage).length >= 12;
  }

  function maskedKey(customStorage) {
    const k = getKey(customStorage);
    if (!k) return '';
    if (k.length <= 10) return '••••' + k.slice(-4);
    return `${k.slice(0, 5)}••••••${k.slice(-4)}`;
  }

  function setKey(raw, customStorage) {
    const clean = cleanKey(raw);
    const st = storageOf(customStorage);
    if (!st) throw Error('当前浏览器环境不支持本地保存 API Key。');
    st.setItem(STORAGE_KEY, clean);
    return maskedKey(st);
  }

  function clearKey(customStorage) {
    try { storageOf(customStorage)?.removeItem(STORAGE_KEY); } catch {}
  }

  function safeHttpUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    try {
      const u = new URL(s);
      return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
    } catch {
      return '';
    }
  }

  function upstreamErrorMessage(status) {
    if (status === 401 || status === 403) return 'API Key 无效、已过期或权限不足，请检查后重试。';
    if (status === 402) return '当前 DeepSeek 账户余额不足，请检查账户额度。';
    if (status === 429) return '调用过于频繁或触发限流，请稍后再试。';
    return `DeepSeek 服务暂不可用 (${status})。`;
  }

  async function callDeepSeek({ apiKey, systemPrompt, userContent, maxTokens = 1600, temperature = 0.2, jsonMode = true, fetcher, timeoutMs = 26000 }) {
    const fetchFn = fetcher || root?.fetch;
    if (typeof fetchFn !== 'function') throw Error('当前环境不支持网络请求。');
    const body = {
      model: 'deepseek-chat',
      temperature,
      max_tokens: maxTokens,
      stream: false,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: userContent }
      ]
    };
    const signal = (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {})
    });
    if (!res.ok) throw Error(upstreamErrorMessage(res.status));
    return res.json();
  }

  async function testConnection(rawKey, { fetcher, storage } = {}) {
    const apiKey = rawKey ? cleanKey(rawKey) : getKey(storage);
    if (!apiKey) throw Error('请先输入或保存自带 API Key。');
    const result = await callDeepSeek({
      apiKey,
      systemPrompt: '',
      userContent: 'Reply with OK.',
      maxTokens: 12,
      temperature: 0,
      jsonMode: false,
      fetcher,
      timeoutMs: 15000
    });
    const text = String(result?.choices?.[0]?.message?.content || '').trim();
    if (!text) throw Error('已连接但模型返回为空，请稍后重试。');
    return { ok: true, model: String(result?.model || 'deepseek-chat') };
  }

  async function analyzeImport({ text, sourceKind = 'note', today, fetcher, storage } = {}) {
    const apiKey = getKey(storage);
    if (!apiKey) throw Error('尚未配置本机 API Key。');
    const cleanText = String(text || '').trim();
    if (!cleanText) throw Error('分析内容不能为空。');
    const refToday = String(today || new Date().toISOString().slice(0, 10)).slice(0, 20);
    const wdChar = '日一二三四五六'[new Date(refToday + 'T12:00:00').getDay()] || '';
    const sysPrompt = [
      '你是大学生的温柔学习日程整理助手。请根据提供的文本（可能包含单个或多个合并导入的文件【文件 N：...】，如课表、学校作息时间安排表、.ics 摘要、便签或截图 OCR 识别结果）修复明显错字/断字，并准确归类与交叉整理。',
      `当前参考日期为今天：${refToday}（周${wdChar}）。`,
      '绝对不要捏造文本里没有的课程或作业，不要用吓人的催促语气。',
      '严格只输出一个 JSON 对象，格式如下：',
      '{',
      '  "summary": "一句温柔、清晰的人话总结",',
      '  "insights": ["最多3条贴近学生生活的轻量提醒"],',
      '  "bellSchedule": [{"section":1,"start":"08:00","end":"08:45","period":"morning"}],',
      '  "classes": [{"title":"课程名或固定会议","weekday":1,"date":"","section":"1-2","period":"morning|noon|afternoon|evening","location":"教室或空字符串","recurrence":"weekly|once"}],',
      '  "tasks": [{"title":"具体要做的事","course":"所属课程或空","due":"YYYY-MM-DD或空","effortFeel":"light|medium|heavy","priority":"high|medium|low","notes":"简短说明"}],',
      '  "dayAdjustments": [{"day":"YYYY-MM-DD","totalMinutes":90,"note":"例如今晚挺累只想保底"}]',
      '}',
      '规则：0) 若输入含「【已按课表二维表格自动定位列与节次」标记，每行开头的星期、节次及「[第N格]」列号由原图二维像素坐标得出，必须严格保留对应 weekday 与 "3-5" 等连堂节次；若某行节次、课名或教室因 OCR 模糊残缺，请主动结合「[第N格]」同列规律、同天节次严格递增规律及整表清晰课程/教学楼（如将 OCR 常错的 1m3/IC3/1C0 还原为 1003幢、1m2 还原为 1002幢、1m1 还原为 1001幢、01 还原为 301幢）上下文自行推理补全，绝不重复输出同门课程；1) 若含学校作息时间表，提取完整 bellSchedule（第一大节~第五大节展开为小节 1..11，13:15–17:59 归 "afternoon"）；2) 同时导入课表与作息表时交叉校准节次与时段；3) classes weekday 用 1..7（1=周一..7=周日）；effortFeel 仅选 light/medium/heavy。'
    ].join('\n');

    const result = await callDeepSeek({
      apiKey,
      systemPrompt: sysPrompt,
      userContent: `来源类型：${sourceKind}\n内容：\n${cleanText.slice(0, 16000)}`,
      maxTokens: 1800,
      temperature: 0.2,
      jsonMode: true,
      fetcher
    });
    const content = result?.choices?.[0]?.message?.content;
    if (!content) throw Error('模型返回结果为空。');
    return JSON.parse(content);
  }

  async function understandPlan({ text, context, today, timeZone = 'Asia/Shanghai', hasAvailableTime = false, fetcher, storage } = {}) {
    const apiKey = getKey(storage);
    if (!apiKey) throw Error('尚未配置本机 API Key。');
    const cleanText = String(text || '').trim();
    if (!cleanText || cleanText.length > 2000) throw Error('请输入 1–2000 字的学习安排。');
    const refToday = String(today || new Date().toISOString().slice(0, 10)).slice(0, 20);
    const wdChar = '日一二三四五六'[new Date(refToday + 'T12:00:00').getDay()] || '';
    const hasCtx = Array.isArray(context?.tasks) && context.tasks.length > 0;
    const sysPrompt = [
      '你是大学生的温柔学习规划助手。将用户输入的中文学习计划、待办或日程调整理解为一个结构化 JSON 对象。',
      `当前参考日期为今天：${refToday}（周${wdChar}），时区 ${timeZone}。仅使用原文明确陈述的事实，绝不捏造章节号或日期。`,
      '严格只输出一个 JSON 对象，必须精确包含以下 6 个键：',
      '{"intent":"create|adjust|material|focus","summary":"一句温柔清晰的总结","firstStep":"具体可立刻开始的下一步","tasks":[{"title":"具体行动(<=240字)","course":"课程名或空","deadline":"","deadlineText":"原文相对期限词或空","estimateMinutes":null,"priority":"high|medium|low","notes":"简短原因","missingInformation":[]}],"questions":["最多3条必要确认提问"],"adjustment":{"day":"today|tomorrow|unspecified","reductionMinutes":0,"unavailable":false,"kind":"time|postpone|pause","taskQuery":"","deadline":"","deadlineText":""}}',
      '关键规则：',
      '1) 新建计划/多条任务用 intent="create"（最多 3 条 task；含多项任务时务必拆分成多条；仅当原文写出总耗时如 "预计2小时" 时填整数分钟，否则 estimateMinutes 为 null；未同时写出完整日期与具体钟点时 deadline 必须留空 ""，仅在 deadlineText 写相对日期）；',
      '2) 若核心是「今晚挺累想休息/只保底」「今天少了X小时」「明天没空」「延期或暂停某任务」，用 intent="adjust" 且 tasks 必须为 []（"今晚挺累只保底" 设为 day="today", kind="time", reductionMinutes=60）；',
      hasCtx ? '3) 只有明确继续现有任务时才用 intent="focus" 并仅引用 context.tasks[].ref。' : '3) 当前无已有任务上下文，禁止使用 intent="focus" 或发明 taskRef。'
    ].join('\n');

    const result = await callDeepSeek({
      apiKey,
      systemPrompt: sysPrompt,
      userContent: JSON.stringify({ text: cleanText, today: refToday, hasAvailableTime, ...(hasCtx ? { context } : {}) }),
      maxTokens: 1400,
      temperature: 0.2,
      jsonMode: true,
      fetcher
    });
    const content = result?.choices?.[0]?.message?.content;
    if (!content) throw Error('模型返回结果为空。');
    return JSON.parse(content);
  }

  async function strategizePlan({ text, today, calendar = [], openTasks = [], preferences = {}, fetcher, storage } = {}) {
    const apiKey = getKey(storage);
    if (!apiKey) throw Error('尚未配置本机 API Key。');
    const cleanText = String(text || '').trim();
    if (!cleanText || cleanText.length > 2000) throw Error('请输入 1–2000 字的学习需求或调整想法。');
    const refToday = String(today || new Date().toISOString().slice(0, 10)).slice(0, 20);
    const wdChar = '日一二三四五六'[new Date(refToday + 'T12:00:00').getDay()] || '';
    const sysPrompt = [
      '你是温暖、懂生活又专业可靠的个人学业与时间顾问。用户不想自己填表算分钟；他只用自然语言说出需求，你要结合未来7天课表与负荷，给出亲切合理的分析建议，并提供 3 套像会员订阅选择一样清晰的方案。',
      `当前参考日期为今天：${refToday}（周${wdChar}），1=周一…7=周日。`,
      '严格只输出一个 JSON 对象：{"diagnosis":"亲切有人情味的2-3句全局建议","options":[{"id":"opt_balanced","recommended":true,"badge":"更适合这周节奏","title":"4-8字方案名","headlineValue":"每天约 35 分钟","headlineSub":"分 4 天散落消化","advice":"2句温暖实用的专属建议（解释原因与执行心得）","benefits":["✓ 亮点1","✓ 亮点2","✓ 亮点3"],"avoidWeekdays":[1],"preferWeekdays":[3],"tasksToCreate":[{"title":"干净简洁任务名（不带30min后缀）","course":"","due":"YYYY-MM-DD","estimateMinutes":60,"schedulePriority":"high","splittable":true,"notes":""}],"taskUpdates":[{"id":"openTasks里的id","action":"promote|defer|postpone","due":"YYYY-MM-DD"}],"dayAdjustments":[{"day":"today|tomorrow","reductionMinutes":90,"unavailable":false}],"allowLateOverride":false}]}',
      '给出 3 套明显不同的方案（稳妥均衡 / 集中突破 / 减负保底）。建议某天不宜学习时填 avoidWeekdays，task.title 禁止带 30min 后缀，只允许引用 openTasks[].id。'
    ].join('\n');

    const result = await callDeepSeek({
      apiKey,
      systemPrompt: sysPrompt,
      userContent: JSON.stringify({ text: cleanText, today: refToday, calendar, openTasks, preferences }),
      maxTokens: 2200,
      temperature: 0.35,
      jsonMode: true,
      fetcher
    });
    const content = result?.choices?.[0]?.message?.content;
    if (!content) throw Error('AI 全局分析返回为空。');
    return JSON.parse(content);
  }

  async function lookupSchoolPortals({ schoolName, fetcher, storage } = {}) {
    const apiKey = getKey(storage);
    if (!apiKey) throw Error('尚未配置本机 API Key。');
    const cleanSchool = String(schoolName || '').trim().slice(0, 80);
    if (cleanSchool.length < 2) throw Error('请输入至少 2 个字的高校名称。');

    const sysPrompt = [
      '你是面向全国高校大学生的公开校园信息整理助手。请根据输入的高校名称，整理该校常见的公开官方入口网站（官网首页、教务处 / 本科生院、统一信息门户 / 网上办事大厅、选课与课表系统、图书馆、校历与教学作息通知页等）。',
      '安全与准确原则：',
      '1) 仅提供真实存在的官方网站域名（中国高校优先使用 .edu.cn 官方域名）；严禁编造第三方培训/营销网站。',
      '2) 若细分子系统域名不确定，请给出学校官网或教务处主域名并提醒用户在右侧「试开」确认。',
      '3) 严格只输出一个 JSON 对象：',
      '{"schoolName":"标准校名","officialDomain":"edu 域名","note":"中文核对提示","portals":[{"name":"入口名称","category":"教务处|信息门户|图书馆|校历与作息|学校官网|选课课表|课程平台","url":"https://...","notes":"用途说明"}]}',
      'portals 数量 4..8 条，仅允许 https:// 或 http:// 官网地址。'
    ].join('\n');

    const result = await callDeepSeek({
      apiKey,
      systemPrompt: sysPrompt,
      userContent: `请检索并整理这所学校的公开官方学习/教务入口：${cleanSchool}`,
      maxTokens: 1400,
      temperature: 0.15,
      jsonMode: true,
      fetcher
    });
    const content = result?.choices?.[0]?.message?.content;
    if (!content) throw Error('学校官网匹配返回为空。');
    const parsed = JSON.parse(content);
    const portals = (Array.isArray(parsed?.portals) ? parsed.portals : [])
      .map(p => ({
        name: String(p?.name || '').trim().slice(0, 80),
        category: String(p?.category || '校内入口').trim().slice(0, 32) || '校内入口',
        url: safeHttpUrl(p?.url),
        notes: String(p?.notes || '').trim().slice(0, 240)
      }))
      .filter(p => p.name && p.url)
      .slice(0, 10);

    if (!portals.length) throw Error('未能匹配到合法的学校官网地址，请检查校名后重试。');
    return {
      schoolName: String(parsed?.schoolName || cleanSchool).trim().slice(0, 80),
      officialDomain: String(parsed?.officialDomain || '').trim().slice(0, 120),
      note: String(parsed?.note || '请先点「试开」核对后再保存到学习资料，部分校内系统需校园网或 VPN。').trim().slice(0, 300),
      portals
    };
  }

  const api = Object.freeze({
    STORAGE_KEY,
    getKey,
    hasKey,
    maskedKey,
    setKey,
    clearKey,
    testConnection,
    analyzeImport,
    understandPlan,
    strategizePlan,
    lookupSchoolPortals
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LifeOSLocalAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
