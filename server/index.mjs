import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(__filename);
const REPO_ROOT = path.resolve(SERVER_DIR, '..');
const ROOT = path.join(REPO_ROOT, 'site');
const OCR_SCRIPT = path.join(SERVER_DIR, 'win-ocr.ps1');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!Object.hasOwn(process.env, key) || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(REPO_ROOT, '.env'));

const HOST = String(process.env.HOST || '127.0.0.1').trim();
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.glb': 'model/gltf-binary',
  '.hdr': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.gz': 'application/octet-stream',
  '.woff2': 'font/woff2',
};

function readJsonBody(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', err => reject(err));
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

async function handleOcrImage(req, res) {
  try {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const dataUrl = String(body?.dataUrl || '');
    const m = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp|bmp));base64,([A-Za-z0-9+/=]+)$/i);
    if (!m) return sendJson(res, 400, { ok: false, error: '请上传 PNG / JPG / WebP 图片' });
    const ext = m[1].toLowerCase().includes('png') ? '.png' : (m[1].toLowerCase().includes('webp') ? '.webp' : '.jpg');
    const tmpFile = path.join(os.tmpdir(), `lifeos-ocr-${crypto.randomUUID()}${ext}`);
    fs.writeFileSync(tmpFile, Buffer.from(m[2], 'base64'));
    try {
      if (process.platform === 'win32' && fs.existsSync(OCR_SCRIPT)) {
        const { stdout } = await execFileAsync('powershell', [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          OCR_SCRIPT,
          '-ImagePath',
          tmpFile,
        ], { timeout: 25000, maxBuffer: 2 * 1024 * 1024 });
        const parsed = JSON.parse(stdout.trim() || '{}');
        return sendJson(res, 200, {
          ok: true,
          engine: 'windows-ocr',
          imgW: Number(parsed.imgW) || 0,
          imgH: Number(parsed.imgH) || 0,
          rows: Array.isArray(parsed.rows) ? parsed.rows : [],
          lines: Array.isArray(parsed.lines) ? parsed.lines : [],
          words: Array.isArray(parsed.words) ? parsed.words : [],
          text: String(parsed.text || ''),
        });
      }

      try {
        const { stdout } = await execFileAsync('tesseract', [tmpFile, 'stdout', '-l', 'chi_sim+eng'], {
          timeout: 25000,
          maxBuffer: 2 * 1024 * 1024,
        });
        const text = String(stdout || '').trim();
        const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        return sendJson(res, 200, {
          ok: true,
          engine: 'tesseract',
          imgW: 0,
          imgH: 0,
          rows: [],
          lines,
          words: [],
          text,
        });
      } catch {
        return sendJson(res, 501, {
          ok: false,
          error: '服务端尚未安装 OCR 引擎（Linux 服务器可安装 tesseract-ocr 与中文语言包，或直接粘贴课表文本导入）。',
        });
      }
    } finally {
      fs.unlink(tmpFile, () => {});
    }
  } catch (err) {
    return sendJson(res, err?.status || 500, { ok: false, error: err?.message || '图片文字识别失败' });
  }
}

async function handleImportAnalyze(req, res) {
  try {
    const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
    if (!apiKey) {
      return sendJson(res, 503, { ok: false, code: 'NO_API_KEY', error: '未检测到 DeepSeek API Key，将使用本地规则梳理' });
    }
    const body = await readJsonBody(req, 256 * 1024);
    const text = String(body?.text || '').trim();
    const today = String(body?.today || new Date().toISOString().slice(0, 10)).slice(0, 20);
    const sourceKind = String(body?.sourceKind || 'note').slice(0, 24);
    if (!text || text.length > 16000) {
      return sendJson(res, 400, { ok: false, error: '请先输入或识别 1–16000 字内容' });
    }

    const sysPrompt = [
      '你是大学生的温柔学习日程整理助手。请根据提供的文本（可能包含单个或多个合并导入的文件【文件 N：...】，如课表、学校作息时间安排表、.ics 摘要、便签或截图 OCR 识别结果）修复明显错字/断字，并准确归类与交叉整理。',
      `当前参考日期为今天：${today}（周${'日一二三四五六'[new Date(today + 'T12:00:00').getDay()] || ''}）。`,
      '绝对不要捏造文本里没有的课程或作业，不要用吓人的催促语气。',
      '严格只输出一个 JSON 对象，格式如下：',
      '{',
      '  "summary": "一句温柔、清晰的人话总结（如：识别到学校作息时间表 10 个节次，已精准校准 2 门课程）",',
      '  "insights": ["最多3条贴近学生生活的轻量提醒，例如某天课少适合集中做事、已按作息表自动校准钟点"],',
      '  "bellSchedule": [{"section":1,"start":"08:00","end":"08:45","period":"morning"}],',
      '  "classes": [{"title":"课程名或固定会议","weekday":1,"date":"","section":"1-2","period":"morning|noon|afternoon|evening","location":"教室或空字符串","recurrence":"weekly|once"}],',
      '  "tasks": [{"title":"具体要做的事","course":"所属课程或空","due":"YYYY-MM-DD或空","effortFeel":"light|medium|heavy","priority":"high|medium|low","notes":"简短说明"}],',
      '  "dayAdjustments": [{"day":"YYYY-MM-DD","totalMinutes":90,"note":"例如今晚挺累只想保底"}]',
      '}',
      '规则：',
      '0) 若输入包含「【已按课表二维表格自动定位列与节次」标记，每行开头的「每周X」与「X-Y节」（以及横向表中的「[第N格]」列号）均通过原图二维像素坐标得出：必须严格保留对应的 weekday（绝不擅自挪动星期），且保留 "3-5" 等连堂而不拆分；若某行节次残缺或受 OCR 噪音影响（如 07 节、&9 节、3 巧），请主动结合「[第N格]」在整张表中的同列对应节次（如第1格多为1-2、第2格多为3-4/3-5、第3格多为6-7、第4格多为8-9、第5格多为10-11）以及同一天内节次从左到右严格递增的规律自行推理补全；同时对照整表中清晰格子的课程名与教学楼编号（OCR 常把 "1003幢" 错识为 "1m3"/"IC3"/"1C0"，"1002幢" 错识为 "1m2"，"1001幢" 错识为 "1m1"，"301幢" 错识为 "01"/"301"），自动修复错别字与模糊教室，输出干净完整的课程名与标准教室（如 1003幢3205、1002幢2205、301幢1114），绝不重复输出同门课程；',
      '1) 若文本包含学校作息时间安排表（如第一大节~第五大节、各小节上下课钟点），务必完整提取 bellSchedule（整数 section 1..16 与具体 "HH:MM" 起止时间）：如第一大节展开为 section 1-2 或 1 与 2，第二大节为 3 与 4，第三大节为 5 与 6，第四大节为 7 与 8，第五大节按时长展开为 9-10 或 9-11；13:15–17:59 务必归为 "afternoon"（如 13:30 属于 "afternoon"，绝非 "noon"）。',
      '2) 若同时导入了课表与作息时间表（或多份通知/截图），请一并提取 classes、tasks 与 bellSchedule，并在 classes 中填写准确小节（如 "1-2"、"5-6"）和对应时段。',
      '3) classes 的 weekday 用 1..7（1=周一,7=周日）；tasks 的 effortFeel 只能选 light、medium、heavy。若输入仅为作息时间表，classes 和 tasks 保持 [] 即可。'
    ].join('\n');

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1800,
        stream: false,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: `来源类型：${sourceKind}\n内容：\n${text}` },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      return sendJson(res, 502, { ok: false, code: `UPSTREAM_${upstream.status}`, error: `DeepSeek 服务暂不可用 (${upstream.status})，将使用本地规则整理` });
    }
    const result = await upstream.json();
    const content = result?.choices?.[0]?.message?.content;
    if (!content) {
      return sendJson(res, 502, { ok: false, error: 'DeepSeek 返回为空，已切回本地规则整理' });
    }
    const analysis = JSON.parse(content);
    return sendJson(res, 200, { ok: true, mode: 'deepseek', analysis });
  } catch (err) {
    return sendJson(res, err?.status || 500, { ok: false, error: err?.message || '归纳分析失败' });
  }
}

function sanitizeHttpUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
  } catch {
    return '';
  }
}

async function handleSchoolPortals(req, res) {
  try {
    const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
    if (!apiKey) {
      return sendJson(res, 503, { ok: false, code: 'NO_API_KEY', error: '未检测到 DeepSeek API Key，请手动填写学校网站或稍后再试' });
    }
    const body = await readJsonBody(req, 32 * 1024);
    const schoolName = String(body?.schoolName || '').trim().slice(0, 80);
    if (schoolName.length < 2) {
      return sendJson(res, 400, { ok: false, error: '请输入至少 2 个字的高校名称' });
    }

    const sysPrompt = [
      '你是面向中国及全球高校大学生的公开校园信息整理助手。请根据用户输入的高校名称，整理该校常见的公开官方入口网站（官网首页、教务处 / 本科生院、统一信息门户 / 网上办事大厅、选课与课表系统、图书馆、校历与教学作息通知页等）。',
      '安全与准确原则：',
      '1) 仅提供真实存在的官方网站域名（中国高校优先使用 .edu.cn 官方域名）；严禁编造第三方培训/营销网站。',
      '2) 若某个细分子系统域名不确定，请直接提供该校官网或教务处主域名并提醒用户在右侧「试开验证」确认，不要猜造复杂长路径。',
      '3) 严格只输出一个 JSON 对象：',
      '{',
      '  "schoolName": "标准校名全称",',
      '  "officialDomain": "主域名如 xxx.edu.cn",',
      '  "note": "一句友好提示：请先点试开确认后保存，部分系统需校园网或 VPN 登录",',
      '  "portals": [',
      '    {"name":"学校教务处","category":"教务处","url":"https://...","notes":"查看课表、校历、作息通知与选课入口"}',
      '  ]',
      '}',
      'portals 数量 4..8 条，category 可选：教务处 / 信息门户 / 图书馆 / 校历与作息 / 学校官网 / 选课课表 / 课程平台。'
    ].join('\n');

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        response_format: { type: 'json_object' },
        temperature: 0.15,
        max_tokens: 1400,
        stream: false,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: `请检索并整理这所学校的公开官方学习/教务入口：${schoolName}` },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      return sendJson(res, 502, { ok: false, error: `学校网站检索服务暂不可用 (${upstream.status})` });
    }
    const result = await upstream.json();
    const content = result?.choices?.[0]?.message?.content;
    if (!content) {
      return sendJson(res, 502, { ok: false, error: '返回结果为空，请重试或手动添加网址' });
    }
    const parsed = JSON.parse(content);
    const portals = (Array.isArray(parsed?.portals) ? parsed.portals : [])
      .map(p => ({
        name: String(p?.name || '').trim().slice(0, 80),
        category: String(p?.category || '校内入口').trim().slice(0, 32) || '校内入口',
        url: sanitizeHttpUrl(p?.url),
        notes: String(p?.notes || '').trim().slice(0, 240),
      }))
      .filter(p => p.name && p.url)
      .slice(0, 10);

    if (!portals.length) {
      return sendJson(res, 502, { ok: false, error: '未能匹配到有效官网链接，请检查校名拼写或手动填写网址' });
    }
    return sendJson(res, 200, {
      ok: true,
      mode: 'deepseek',
      data: {
        schoolName: String(parsed?.schoolName || schoolName).trim().slice(0, 80),
        officialDomain: String(parsed?.officialDomain || '').trim().slice(0, 120),
        note: String(parsed?.note || '请点右侧「试开」核对后再保存到学习资料，部分教务系统需校园网访问。').trim().slice(0, 300),
        portals,
      },
    });
  } catch (err) {
    return sendJson(res, err?.status || 500, { ok: false, error: err?.message || '学校入口匹配失败' });
  }
}

async function handleUnderstandPlan(req, res) {
  try {
    const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
    if (!apiKey) {
      return sendJson(res, 503, { ok: false, code: 'NO_API_KEY', error: '未检测到 DeepSeek API Key' });
    }
    const body = await readJsonBody(req, 64 * 1024);
    const text = String(body?.text || '').trim();
    const hasCtx = Array.isArray(body?.context?.tasks) && body.context.tasks.length > 0;
    const today = String(body?.today || new Date().toISOString().slice(0, 10)).slice(0, 20);
    const wdChar = '日一二三四五六'[new Date(today + 'T12:00:00').getDay()] || '';
    if (!text || text.length > 2000) {
      return sendJson(res, 400, { ok: false, error: '请输入 1–2000 字的学习安排' });
    }
    const sysPrompt = [
      '你是大学生的温柔学习规划助手。将用户输入的中文学习计划、待办或日程调整理解为一个结构化 JSON 对象。',
      `当前参考日期为今天：${today}（周${wdChar}）。只允许使用文本明确陈述的事实，不要捏造日期或课程章节。`,
      '严格只输出一个 JSON 对象，必须精确包含以下 6 个键：',
      '{"intent":"create|adjust|material|focus","summary":"一句温柔清晰的总结","firstStep":"一句最具体可立刻开始的下一步","tasks":[{"title":"具体行动标题(<=240字)","course":"课程名或空","deadline":"","deadlineText":"原文相对日期描述或空","estimateMinutes":null,"priority":"high|medium|low","notes":"简短原因","missingInformation":[]}],"questions":["如有必要最多3条待确认问题"],"adjustment":{"day":"today|tomorrow|unspecified","reductionMinutes":0,"unavailable":false,"kind":"time|postpone|pause","taskQuery":"","deadline":"","deadlineText":""}}',
      '关键规则：',
      '1) 新建任务/计划用 intent="create"（tasks 最多 3 条，遇到逗号/分号/换行串联的多项任务要分别拆开成多条 task；未写明总用时时 estimateMinutes 保持 null，写了明确时长如 "预计2小时"/"40分钟" 才填整数分钟；未写明完整年月日和具体时刻时 deadline 必须留空 "" 并在 deadlineText 保留原词如 "下周三" 或 "周五前"）；',
      '2) 若核心是「今晚挺累想休息/只保底」「今天少了2小时」「明天下午没空」「把某任务延期/暂停」，用 intent="adjust"，此时 tasks 必须为 []！例如 "今晚挺累只保底" 设为 day="today", kind="time", reductionMinutes=60, unavailable=false；',
      hasCtx ? '3) 只有当用户明确问现有任务下一步且 context.tasks 非空时才用 intent="focus" 并仅引用已有 taskRef。' : '3) 当前没有任务上下文，禁止使用 intent="focus" 或返回 taskRef。'
    ].join('\n');

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1400,
        stream: false,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: JSON.stringify({ text, today, context: body?.context || undefined }) }
        ]
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!upstream.ok) {
      return sendJson(res, 502, { ok: false, error: `LifeOS 计划理解暂不可用 (${upstream.status})` });
    }
    const result = await upstream.json();
    const content = result?.choices?.[0]?.message?.content;
    if (!content) return sendJson(res, 502, { ok: false, error: '返回结果为空' });
    return sendJson(res, 200, { ok: true, mode: 'deepseek', value: JSON.parse(content) });
  } catch (err) {
    return sendJson(res, err?.status || 500, { ok: false, error: err?.message || '计划理解失败' });
  }
}

async function handleStrategizePlan(req, res) {
  try {
    const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
    if (!apiKey) {
      return sendJson(res, 503, { ok: false, code: 'NO_API_KEY', error: '未检测到 DeepSeek API Key' });
    }
    const body = await readJsonBody(req, 96 * 1024);
    const text = String(body?.text || '').trim();
    const today = String(body?.today || new Date().toISOString().slice(0, 10)).slice(0, 20);
    const wdChar = '日一二三四五六'[new Date(today + 'T12:00:00').getDay()] || '';
    if (!text || text.length > 2000) {
      return sendJson(res, 400, { ok: false, error: '请输入 1–2000 字的学习需求或调整想法' });
    }
    const sysPrompt = [
      '你是温暖、懂生活又专业可靠的个人学业与时间顾问（类似贴心学长/学姐）。用户不想自己填表、算分钟或排日期；他只用自然语言说出想法或现状，你要结合他未来7天真实的课表空档、每天课程密度与已有待办，给出有温度、有道理的贴心分析建议，并提供 3 套风格鲜明、像“会员方案选购卡片”一样清晰明了的重排方案让他直接选定。',
      `当前参考日期为今天：${today}（周${wdChar}）。请确保所有相对日期严格基于 ${today} 推算为 YYYY-MM-DD（1=周一 … 7=周日）。`,
      '严格只输出一个 JSON 对象：',
      '{"diagnosis":"用亲切、有人情味的口吻写2-3句局势判断与真诚建议（比如关心哪天课太多别太累、提醒哪天最整块适合主攻、安慰什么事不必急），不要冰冷列公式或满篇分钟算数","options":[{"id":"opt_balanced","recommended":true,"badge":"更适合这周节奏","title":"4-8字方案名（如：错峰稳推 / 周三集中清 / 轻量保底）","headlineValue":"核心投入感（如：每天约 35 分钟 / 周三集中 2.5 小时 / 今晚留白休息）","headlineSub":"简短副标（如：分 4 天散落消化 · 避开满课日）","advice":"2句温暖且言之有物的专属建议（告诉用户为什么这样排对精力和效率更好，以及怎么做最顺手，不要只冷冰冰复述时间表）","benefits":["✓ 简洁明确亮点1（如：周一五节课满课后不加压，好好吃饭休息）","✓ 亮点2（结合具体周几空档，不出现截断）","✓ 亮点3（学习方法或心理减负建议）"],"avoidWeekdays":[1],"preferWeekdays":[3],"tasksToCreate":[{"title":"干净简洁的任务名（绝不要带 30min、约60分钟 等字样）","course":"课程名或空","due":"YYYY-MM-DD","estimateMinutes":60,"schedulePriority":"high","splittable":true,"notes":"简短贴士"}],"taskUpdates":[{"id":"已有openTasks里的id","action":"promote|defer|postpone","due":"仅postpone填YYYY-MM-DD"}],"dayAdjustments":[{"day":"today|tomorrow","reductionMinutes":90,"unavailable":false}],"allowLateOverride":false}]}',
      '关键约束：',
      '1) 必须给出 3 套取舍真正不同的方案：通常第一套 recommended=true 为「稳妥均衡」，第二套为「高效集中突破（挑周中最宽裕的那天主攻）」，第三套为「温和减负保底（优先早休息或顺延次要项）」。',
      '2) 若某个方案建议“周一/周某天太满不要安排学习”，务必在 avoidWeekdays 填入对应星期几数字（1..7），确保后续排期与建议言行一致！',
      '3) tasksToCreate 的 title 必须干净直观（例如「高等数学重难点梳理」「羽毛球动作要领预习」），禁止出现 "30min"、"预复习30min" 这类机器后缀。',
      '4) 只允许引用输入中真实存在的 openTasks[].id 做 taskUpdates；不存在时 taskUpdates 为 []。'
    ].join('\n');

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        response_format: { type: 'json_object' },
        temperature: 0.35,
        max_tokens: 2200,
        stream: false,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: JSON.stringify({ text, today, calendar: body?.calendar || [], openTasks: body?.openTasks || [], preferences: body?.preferences || {} }) }
        ]
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok) {
      return sendJson(res, 502, { ok: false, error: `LifeOS 智能统筹暂不可用 (${upstream.status})` });
    }
    const result = await upstream.json();
    const content = result?.choices?.[0]?.message?.content;
    if (!content) return sendJson(res, 502, { ok: false, error: 'AI 分析结果为空' });
    return sendJson(res, 200, { ok: true, mode: 'deepseek', value: JSON.parse(content) });
  } catch (err) {
    return sendJson(res, err?.status || 500, { ok: false, error: err?.message || 'AI 全局分析失败' });
  }
}

let portalSession = null;

function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

const PORTAL_STATE_FILE = path.join(os.tmpdir(), 'lifeos-portal-session.json');

function closePortalSession() {
  if (!portalSession) return;
  const s = portalSession;
  portalSession = null;
  try { if (fs.existsSync(PORTAL_STATE_FILE)) fs.unlinkSync(PORTAL_STATE_FILE); } catch {}
  try { if (s.proc && !s.proc.killed) s.proc.kill(); } catch {}
  if (s.pid) {
    try { process.kill(s.pid); } catch {}
  }
  if (s.userDataDir) {
    setTimeout(() => {
      try { fs.rmSync(s.userDataDir, { recursive: true, force: true }); } catch {}
    }, 800);
  }
}
process.on('exit', closePortalSession);

const CDP_EXTRACT_EXPR = `(() => {
  const WM = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7};
  function pd(s){s=(s||'').replace(/\\s+/g,'');const m=s.match(/(?:星期|礼拜|周)([一二三四五六日天1-7])/);return m?WM[m[1]]||0:0;}
  function collectDocs(w,d){
    const a=[];try{if(w.document)a.push(w.document);}catch{return a;}
    if(d>3)return a;
    for(const f of w.document.querySelectorAll('iframe,frame')){
      try{if(f.contentWindow)a.push(...collectDocs(f.contentWindow,d+1));}catch{}
    }
    return a;
  }
  let best=[];
  for(const doc of collectDocs(window,0)){
    for(const tbl of doc.querySelectorAll('table')){
      const trs=tbl.rows;if(!trs||trs.length<3)continue;
      const grid=[],occ=[],uc=[];
      for(let r=0;r<trs.length;r++){
        grid[r]=grid[r]||[];occ[r]=occ[r]||[];let c=0;
        for(const el of trs[r].cells){
          while(occ[r][c])c++;
          const rs=Math.max(1,el.rowSpan||1),cs=Math.max(1,el.colSpan||1);
          const obj={r,c,rs,t:(el.innerText||el.textContent||'').trim()};
          uc.push(obj);
          for(let dr=0;dr<rs;dr++){
            grid[r+dr]=grid[r+dr]||[];occ[r+dr]=occ[r+dr]||[];
            for(let dc=0;dc<cs;dc++){occ[r+dr][c+dc]=1;grid[r+dr][c+dc]=obj;}
          }
          c+=cs;
        }
      }
      // Mode A: Vertical columns (星期一..星期日 in top rows)
      let colDay={},hr=-1;
      for(let r=0;r<Math.min(4,grid.length);r++){
        const mp={};let cnt=0;
        for(let c=0;c<(grid[r]||[]).length;c++){const d=pd(grid[r][c]&&grid[r][c].t);if(d){mp[c]=d;cnt++;}}
        if(cnt>=3){colDay=mp;hr=r;break;}
      }
      if(hr>=0){
        const minC=Math.min(...Object.keys(colDay).map(Number));
        const rowSec={};let seq=0;
        for(let r=hr+1;r<grid.length;r++){
          let sn=0;
          for(let c=0;c<minC;c++){
            const ax=(grid[r][c]&&grid[r][c].t||'').trim();
            const sm=ax.match(/第?\\s*(\\d{1,2})\\s*节/)||ax.match(/^(\\d{1,2})$/);
            if(sm){sn=+sm[1];break;}
          }
          if(!sn){for(let c=minC;c<(grid[r]||[]).length;c++){if(grid[r][c]&&grid[r][c].t){seq++;sn=seq;break;}}}
          else seq=sn;
          if(sn>=1&&sn<=16)rowSec[r]=sn;
        }
        const out=[];
        for(const u of uc){
          if(u.r<=hr||!u.t)continue;
          const wd=colDay[u.c];if(!wd)continue;
          const s1=rowSec[u.r];if(!s1)continue;
          const s2=rowSec[u.r+u.rs-1]||Math.min(16,s1+u.rs-1);
          out.push({weekday:wd,section:s2>s1?(s1+'-'+s2):(''+s1),text:u.t});
        }
        if(out.length>best.length)best=out;
        continue;
      }
      // Mode B: Horizontal rows (星期一..星期日 stacked in left column, e.g. SUDA homepage 课表)
      let rowDay={},dayCol=-1;
      for(let c=0;c<Math.min(2,grid[0]?.length||0);c++){
        const mp={};let cnt=0;
        for(let r=0;r<grid.length;r++){const d=pd(grid[r][c]&&grid[r][c].t);if(d){mp[r]=d;cnt++;}}
        if(cnt>=3){rowDay=mp;dayCol=c;break;}
      }
      if(dayCol>=0){
        const out=[];
        for(const u of uc){
          if(u.c<=dayCol||!u.t)continue;
          const wd=rowDay[u.r];if(!wd)continue;
          const sm=u.t.match(/(\\d{1,2})(?:\\s*[-~到至]\\s*(\\d{1,2}))?\\s*节/);
          const sec=sm?(sm[2]&&+sm[2]>+sm[1]?(sm[1]+'-'+sm[2]):sm[1]):'';
          out.push({weekday:wd,section:sec,text:u.t});
        }
        if(out.length>best.length)best=out;
      }
    }
    // Mode C: Div/Flex horizontal rows (星期一..星期日 in row-first child + cells with X-Y节)
    if(!best.length){
      const out=[];
      for(const el of doc.querySelectorAll('tr,[role="row"],div,li')){
        if(el.children.length<2||el.children.length>12)continue;
        const firstT=(el.children[0].innerText||el.children[0].textContent||'').trim();
        const wd=pd(firstT);
        if(!wd||firstT.length>12)continue;
        for(let k=1;k<el.children.length;k++){
          const ct=(el.children[k].innerText||el.children[k].textContent||'').trim();
          const sm=ct.match(/(\\d{1,2})(?:\\s*[-~到至]\\s*(\\d{1,2}))?\\s*节/);
          if(ct&&sm){
            const sec=sm[2]&&+sm[2]>+sm[1]?(sm[1]+'-'+sm[2]):sm[1];
            out.push({weekday:wd,section:sec,text:ct});
          }
        }
      }
      if(out.length>best.length)best=out;
    }
  }
  return {host:location.host,url:location.href,cells:best};
})()`;

function cdpEval(wsUrl, expression) {
  return new Promise((resolve) => {
    let settled = false;
    const done = val => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      resolve(val);
    };
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => done(null), 4000);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
    ws.addEventListener('message', ev => {
      try {
        const msg = JSON.parse(String(ev.data || ''));
        if (msg.id === 1) {
          clearTimeout(timer);
          done(msg?.result?.result?.value || null);
        }
      } catch {
        clearTimeout(timer);
        done(null);
      }
    });
    ws.addEventListener('error', () => { clearTimeout(timer); done(null); });
  });
}

async function launchVisibleBrowser(exe, args) {
  if (process.platform === 'win32') {
    const psCmd = [
      "$rawArgs = [string[]]($env:PORTAL_ARGS_JSON | ConvertFrom-Json)",
      "$quotedArgs = [string[]]($rawArgs | ForEach-Object { '\"' + ($_ -replace '\"', '\\\"') + '\"' })",
      "$p = Start-Process -FilePath $env:PORTAL_EXE -ArgumentList $quotedArgs -WindowStyle Normal -PassThru",
      "Write-Output $p.Id",
    ].join('; ');
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psCmd,
    ], {
      env: {
        ...process.env,
        PORTAL_EXE: exe,
        PORTAL_ARGS_JSON: JSON.stringify(args),
      },
      windowsHide: true,
      timeout: 8000,
    });
    const pid = Number.parseInt(String(stdout || '').trim().split(/\s+/).pop() || '0', 10);
    return { pid: Number.isFinite(pid) && pid > 0 ? pid : 0, proc: null };
  }
  const proc = spawn(exe, args, { stdio: 'ignore', detached: true });
  proc.unref();
  return { pid: proc.pid || 0, proc };
}

function bringPortalWindowToFront(port) {
  return (async () => {
    try {
      const listRes = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1200) });
      if (!listRes.ok) return;
      const targets = await listRes.json();
      const pageTarget = (Array.isArray(targets) ? targets : []).find(t => t?.webSocketDebuggerUrl && t.type === 'page');
      if (!pageTarget) return;
      await new Promise((resolve) => {
        const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
        const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(); }, 1000);
        ws.addEventListener('open', () => {
          ws.send(JSON.stringify({ id: 1, method: 'Page.bringToFront', params: {} }));
        });
        ws.addEventListener('message', () => { clearTimeout(timer); try { ws.close(); } catch {} resolve(); });
        ws.addEventListener('error', () => { clearTimeout(timer); resolve(); });
      });
    } catch {}
  })();
}

let cachedDesktopInfo = null;
async function getDesktopCapability() {
  if (cachedDesktopInfo) return cachedDesktopInfo;
  if (process.platform !== 'win32') {
    const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
    cachedDesktopInfo = { desktop: hasDisplay ? 'posix' : 'headless', canSpawnVisibleWindow: hasDisplay };
    return cachedDesktopInfo;
  }
  try {
    const psScript = `Add-Type -TypeDefinition 'using System;using System.Text;using System.Runtime.InteropServices;public class LDesk{[DllImport("kernel32.dll")]public static extern uint GetCurrentThreadId();[DllImport("user32.dll")]public static extern IntPtr GetThreadDesktop(uint id);[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern bool GetUserObjectInformation(IntPtr h,int i,StringBuilder s,int l,out int n);public static string N(){var b=new StringBuilder(256);int n=0;GetUserObjectInformation(GetThreadDesktop(GetCurrentThreadId()),2,b,256,out n);return b.ToString();}}' -ErrorAction SilentlyContinue; [LDesk]::N()`;
    const enc = Buffer.from(psScript, 'utf16le').toString('base64');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], { windowsHide: true, timeout: 6000 });
    const desktop = String(stdout || '').trim() || 'Default';
    cachedDesktopInfo = { desktop, canSpawnVisibleWindow: /^default$/i.test(desktop) };
  } catch {
    cachedDesktopInfo = { desktop: 'unknown', canSpawnVisibleWindow: false };
  }
  return cachedDesktopInfo;
}

async function handlePortalCapabilities(_req, res) {
  const cap = await getDesktopCapability();
  return sendJson(res, 200, { ok: true, ...cap });
}

async function handlePortalOpen(req, res) {
  try {
    const cap = await getDesktopCapability();
    if (!cap.canSpawnVisibleWindow && !req.headers['x-lifeos-allow-headless-test']) {
      return sendJson(res, 200, {
        ok: true,
        sandboxDesktop: true,
        desktop: cap.desktop,
        message: '当前运行在隔离桌面沙盒，请用浏览器新标签页打开教务系统并全选复制课表。',
      });
    }
    const body = await readJsonBody(req);
    let targetUrl = String(body?.url || '').trim();
    if (!targetUrl) targetUrl = 'http://xk.suda.edu.cn/';
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'http://' + targetUrl;
    const exe = findBrowserExecutable();
    if (!exe) return sendJson(res, 500, { ok: false, error: '未在本机找到 Edge 或 Chrome 浏览器。' });
    closePortalSession();
    const port = await getFreePort();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-portal-'));
    const launchArgs = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--new-window',
      '--window-position=120,70',
      '--window-size=1220,820',
      targetUrl,
    ];
    const launched = await launchVisibleBrowser(exe, launchArgs);
    portalSession = { proc: launched.proc, pid: launched.pid, port, userDataDir, url: targetUrl, launchedAt: Date.now() };
    try { fs.writeFileSync(PORTAL_STATE_FILE, JSON.stringify({ pid: launched.pid, port, userDataDir, url: targetUrl })); } catch {}
    let ready = false;
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const probe = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(800) });
        if (probe.ok) { ready = true; break; }
      } catch {}
    }
    if (!ready) {
      closePortalSession();
      return sendJson(res, 500, { ok: false, error: '启动教务登录窗口超时，请重试。' });
    }
    await bringPortalWindowToFront(port);
    return sendJson(res, 200, { ok: true, url: targetUrl, message: '已弹出学校教务登录窗口，请自行登录并进入课表页。' });
  } catch (err) {
    return sendJson(res, err?.status || 500, { ok: false, error: err?.message || '打开教务窗口失败' });
  }
}

async function handlePortalGrab(req, res) {
  try {
    if (!portalSession && fs.existsSync(PORTAL_STATE_FILE)) {
      try { portalSession = JSON.parse(fs.readFileSync(PORTAL_STATE_FILE, 'utf8')); } catch {}
    }
    if (!portalSession?.port) {
      return sendJson(res, 400, { ok: false, error: '请先点击「1. 打开学校教务窗口」并在弹出的窗口内登录进课表页面。' });
    }
    let targets = [];
    try {
      const listRes = await fetch(`http://127.0.0.1:${portalSession.port}/json`, { signal: AbortSignal.timeout(2500) });
      if (listRes.ok) targets = await listRes.json();
    } catch {
      closePortalSession();
      return sendJson(res, 400, { ok: false, error: '未检测到打开的教务登录窗口（可能被关闭了），请重新点击「1. 打开学校教务窗口」。' });
    }
    const candidates = (Array.isArray(targets) ? targets : []).filter(t => t?.webSocketDebuggerUrl && t.type !== 'browser' && !String(t.url || '').startsWith('devtools://'));
    let best = null;
    const seenUrls = [];
    for (const t of candidates) {
      if (t.url) seenUrls.push(t.url);
      const val = await cdpEval(t.webSocketDebuggerUrl, CDP_EXTRACT_EXPR);
      if (val && Array.isArray(val.cells) && val.cells.length && (!best || val.cells.length > best.cells.length)) {
        best = val;
      }
    }
    if (!best || !best.cells.length) {
      const hintUrl = seenUrls.find(u => /^https?:\/\//i.test(u)) || '';
      return sendJson(res, 400, { ok: false, error: `在当前打开的教务窗口（${hintUrl.slice(0, 60) || '等待加载'}）里还没看到课程表。请确认已在弹出窗口登录并看到带「星期一~五」的课表后再点一次读取。` });
    }
    closePortalSession();
    return sendJson(res, 200, { ok: true, host: best.host || '', url: best.url || '', cells: best.cells });
  } catch (err) {
    return sendJson(res, err?.status || 500, { ok: false, error: err?.message || '读取教务课表失败' });
  }
}

async function handlePortalClose(req, res) {
  closePortalSession();
  return sendJson(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const rawPath = decodeURIComponent(url.pathname);
  if (req.method === 'GET' && rawPath === '/lifeos-web/api/portal-capabilities') {
    await handlePortalCapabilities(req, res);
    return;
  }
  if (req.method === 'POST' && rawPath === '/lifeos-web/api/portal-open') {
    await handlePortalOpen(req, res);
    return;
  }
  if (req.method === 'POST' && rawPath === '/lifeos-web/api/portal-grab') {
    await handlePortalGrab(req, res);
    return;
  }
  if (req.method === 'POST' && rawPath === '/lifeos-web/api/portal-close') {
    await handlePortalClose(req, res);
    return;
  }
  if (req.method === 'POST' && rawPath === '/lifeos-web/api/ocr-image') {
    await handleOcrImage(req, res);
    return;
  }
  if (req.method === 'POST' && rawPath === '/lifeos-web/api/import-analyze') {
    await handleImportAnalyze(req, res);
    return;
  }
  if (req.method === 'POST' && rawPath === '/lifeos-web/api/school-portals') {
    await handleSchoolPortals(req, res);
    return;
  }
  if (req.method === 'POST' && rawPath === '/lifeos-web/api/understand') {
    await handleUnderstandPlan(req, res);
    return;
  }
  if (req.method === 'POST' && rawPath === '/lifeos-web/api/strategize') {
    await handleStrategizePlan(req, res);
    return;
  }

  let pathname = rawPath;
  if (pathname === '/') {
    pathname = '/index.html';
  } else if (pathname === '/lifeos-web') {
    res.writeHead(302, { Location: '/lifeos-web/' });
    res.end();
    return;
  } else if (pathname.startsWith('/lifeos-web/')) {
    pathname = pathname.slice('/lifeos-web'.length);
  }
  let filePath = path.resolve(ROOT, '.' + (pathname.startsWith('/') ? pathname : '/' + pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found: ' + pathname);
    return;
  }
  if (pathname === '/config.js') {
    const pubKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
    const raw = fs.readFileSync(filePath, 'utf8');
    const body = pubKey ? raw.replace('__LIFEOS_BROWSER_KEY__', pubKey) : raw;
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(body);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const isImmutable = ext !== '.html' && ext !== '.json';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': isImmutable ? 'public, max-age=86400' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`LifeOS server listening at http://${HOST}:${PORT}/ (DeepSeek configured: ${Boolean(process.env.DEEPSEEK_API_KEY)})`);
});
