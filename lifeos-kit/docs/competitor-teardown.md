# 竞品机制还原 — 设计依据

12 款计划类产品，4 家做到全文或源码级。每条设计在 `SPEC.md` 里都能指到这里。

**写进参赛材料的措辞**：这叫「基于官方文档与产品行为记录的规格还原」，不叫破解。前者是标准产品拆解方法，属于评审要点「产业认知」；后者会被当成抄袭。

---

## 1. 逐句核验过的四家

### 1.1 Super Productivity（开源，MIT）— 源码级

仓库 3,303 个 TypeScript 文件，`timeEstimate` 命中 223 个文件、`timeSpent` 366 个、`spentOnDay` 167 个。

数据模型 `src/app/features/tasks/task.model.ts`：

```ts
export const DEFAULT_TASK = {
  timeSpentOnDay: {},   // 按天记录的实际耗时
  timeSpent: 0,         // 累计实际耗时
  timeEstimate: 0,      // 估时
  ...
}
```

核心公式 `src/app/util/get-time-left-for-task.ts`：

```ts
export const getTimeLeftForTask = (task: Task): number => {
  if (task.subTaskIds.length > 0) return task.timeEstimate;
  return Math.max(0, task.timeEstimate - task.timeSpent) || 0;
};
```

`src/app/features/tasks/util/sum-sub-task-time-left.ts` 的注释把这个设计说透了：

> one that has run over its estimate is **clamped at 0 rather than going negative**.

它有「估时超标」通知（`native-time-estimate.util.ts` 的 `isTimeEstimateNotifiedNatively`），但**只通知不学**。存了 `timeSpent`，算过 `estimate - spent`，从没算过 `spent / estimate`。

### 1.2 Motion — 全文 59 万字节

输入 7 参数：start date / duration / deadline / priority / chunking / schedules & breaks / calendar events。

边界行为（官方原文）：

| 情形 | 行为 |
|---|---|
| 无 duration | `Cannot be scheduled. A duration must be provided` |
| 无 deadline 且无 priority | `Won't be scheduled` |
| start date 在未来 | 到日子才排，前面空着也不排 |
| 分块 | `splits respect a minimum block size` |
| 约束冲突 | 标 unschedulable，`The task remains unscheduled until you adjust its parameters` |
| 外部日历 | 永远压过任务块 |

排序：ASAP 覆盖一切；**更早的截止可以压过更高优先级**（官方例子：Medium 明天 > High 下月）；无公开数值权重，是规则触发不是评分函数。

估时：官方问答接口确认——文档**没有描述**从实际耗时回溯修正后续估时的闭环；要改估时，`update the task's duration`，由人来做。全文 594,250 字节里 `actual time` 出现 **0 次**。

### 1.3 Amazing Marvin — 全文 92 万字符

容量估计器原文：

> **Left to do**: how much work is still open on today's list, minus time you've already tracked.
> **Left to plan**: how much more fits before your work hours end.
> If you've planned too much, this changes to **Over by**.
> Under that, a line shows the math: the time left today, minus Events still ahead of you, minus Tasks.

个人基准从哪来：

> 🙂 & 🤩: with **Compare with your own days** on, these mark a usual day for you and one of your better days, based on your **completed work over the last 30 days** ... **Until you have at least three days of history**, 🙂 marks 2 hours.

**它学的是「过去 30 天你完成了多少工作量」，用来判断今天是不是排多了**，不是"某项任务估时该乘多少"。全文 `estimate vs actual` 出现 0 次。

它的 auto-schedule 只做两件事：到期项加进未来几天、未完成顺延。不是装箱引擎。

### 1.4 滴答清单 — 97 篇帮助文章

四象限不是固定分类，是**可编辑的筛选规则**（《如何编辑四象限规则》）：

> 规则方案 1：象限对应任务优先级
> 规则方案 2：象限对应重要程度和紧急程度 —— **使用优先级判断重要程度，使用任务时间判断紧急程度**

三个可抄的细节：

1. **拖到别的象限会反写任务属性**：`任务的优先级也会根据目标象限自动调整`
2. **多条件取交集**：`任务需同时满足所有条件，才会显示在该象限中`
3. 同一任务可出现在多个象限，因为四象限只是视图

「推荐任务」用改期次数判拖延（《推荐任务》）：

> 在「多次修改」分组中，任务会按修改时间的次数顺序从高到低排序。
> 查看修改**超过 5 次**、**超过 3 次**、**超过 2 次**的任务，选择并优先处理那些拖延很久的任务。

其他：自然语言识别日期时间（可关）、重复预设含「法定工作日」「艾宾浩斯记忆法」、智能清单 = 条件筛选器。

---

## 2. 只拿到文档或未取到的

| 产品 | 拿到什么 | 用在哪 |
|---|---|---|
| Morgen | 68KB llms.txt | 未逐句核验，矩阵里的词频只作初筛 |
| Any.do | 42KB | 同上 |
| Routine | 21KB | 同上 |
| Notion | 6.8KB | 同上 |
| Sunsama / Akiflow / Vimcal / Superlist / SavvyCal | 3.8KB / 4KB / 1.3KB / 4.8KB / 2.4KB | **只是营销壳**，没进帮助文档。不能据此判断它们没有该能力 |
| Goblin Tools | 未取到 | 本机 TLS 握手被断（curl exit 35 / node socket disconnected），换 TLS 版本与密码套件都不通 |
| Todoist | 未取到 | NLP 页 JS 渲染，正文抽不出 |
| Teambition | 未取到 | llms.txt 返回 HTML 壳 |

---

## 3. 三源交叉的结论

| 形态 | 代表 | 做到哪 | 停在哪 |
|---|---|---|---|
| 商业自动排程 | Motion | 按估时装箱、分块、ETA、重排 | 不校验估时，装不下停住推回用户 |
| 商业容量感知 | Amazing Marvin | 30 天完成量算个人容量基准 | 不算单项估时误差，不自动排 |
| 开源全功能 | Super Productivity | 存了 estimate + spent 双字段 | `max(0, 估时−已花)`，超出即丢 |

**三种形态、三条技术路线，都停在同一步之前。** 这一步不需要新算法，只需要把比值存下来做一次乘法。

---

## 4. 设计映射

| SPEC 里的设计 | 依据 |
|---|---|
| 无估时不排、无锚点不排 | Motion 硬规则 |
| 最小块约束（不许切出碎片） | Motion `minimum block size` |
| 装不下要有明确状态 | Motion unschedulable |
| **超载分两态**（partially 保留） | **本项目判断**：Motion 一律停住，丢掉了"今天还能做一部分"这个选项 |
| 二维优先级（紧急由系统算） | 滴答清单四象限方案二 |
| 象限反写属性 | 滴答清单拖动行为 |
| 改期次数作拖延提示 | 滴答清单「推荐任务」 |
| **估时校准 k** | **无人做过**（见第 3 节） |
| 不用 LLM 做判断 | 纯规则可离线复核，答辩能现场跑 |

---

## 5. drop_cost 的权重说明

```
cost = 0.55 × 紧迫度 + 0.30 × 已完成比例 + 0.15 × 不可拆性
紧迫度 = 1 / (1 + 距截止天数)，已过期为 1，无截止为 0
```

三项分别对应：越靠近截止砍了代价越高、已投入越多砍了浪费越大、不可拆的砍了就整块没了。

权重是设计值，不是实验结果。答辩被问"为什么是这三个数"，答：按三项各自能造成的返工量排序给出，原型试用后按建议采纳率调整。**不要包装成实验结论。**

`rescheduleCount` 故意不进这个公式——没有依据的权重不编。

---

## 6. 复现

```powershell
# 探测 30 个域名的文档入口（87 次请求，40 命中）
node probe_hosts.js

# 批量拉 llms.txt / llms-full.txt
node sweep_llms.js

# 概念矩阵初筛
python matrix.py

# 滴答清单 97 篇（从页面内嵌 JSON 剥离）
python dida_json.py

# 开源源码
git clone --depth 1 https://github.com/johannesjo/super-productivity.git
Get-ChildItem .\super-productivity\src -Recurse -Filter *.ts |
  Select-String -Pattern 'getTimeLeftForTask' -List
```

原始数据：`C:\re_competitors\`（probe/hosts.json、sweep/、sweep/dida_articles/、oss/）。
