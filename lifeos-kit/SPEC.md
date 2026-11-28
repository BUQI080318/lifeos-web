# LifeOS 排程引擎 — 实现规格 v1

> 这份文件是给编码 agent 的唯一事实来源。读完它就能写出引擎，不需要猜，也不许加戏。
> 目录里的 `docs/` 解释每条设计为什么这么定，`tests/` 是验收用例，`reference/` 是可跑的参考实现。

---

## 0 读文件顺序

1. 本文件（**必读**）
2. `AGENTS.md`（硬约束，违反即返工）
3. `tests/cases.json` + `tests/expected.json`（你要通过的东西）
4. `reference/engine.py`（Python 参考实现，可当伪代码看）
5. `docs/competitor-teardown.md`（设计依据，写注释时引它）

---

## 1 这是什么

一个**给大学生用的学习计划重排引擎**。核心只有一件事：

> 学生把任务和估时填进来，系统先按他的历史估时偏差把估时修正一遍，再判断今天真正装得下多少，装不下就明确告诉他必须砍哪几项、每项什么时候能补上。

引擎是**纯函数 + 纯规则**，不联网、不调用任何模型、输入输出都是 JSON。前端拿它做页面，后端拿它做接口，两边跑出的结果必须逐字节一致。

---

## 2 硬边界

### 2.1 要做

| 能力 | 一句话 |
|---|---|
| 估时校准 | 用历史「实际 ÷ 估时」的比值中位数，得个人系数 k，修正所有估时 |
| 前置校验 | 缺字段的任务不进入排程，并明确指出缺哪个字段 |
| 装箱 | 按截止日与可用时段放任务，可拆任务切开塞缝隙 |
| 超载分两态 | 一块都放不下 → 整体移出；装了一部分 → 保留并给出剩余量 |
| 移出排序 | 按 `drop_cost` 从低到高，明确交出"先砍哪项" |
| 回填时段 | 每项被移出或装不完的任务，给出下一个可行时段 |
| 行为信号 | 任务被改期的次数，作为拖延提示显示在理由里 |

### 2.2 不做

以下是**明确的负面需求**，agent 擅自加上即为缺陷：

- ❌ 不调用任何 LLM 做容量判断、排序、打分。模型只允许用在"一句话 → 任务字段"的抽取上，且抽取结果必须能被用户逐字段确认
- ❌ 不做"智能推荐""AI 规划"这类文案
- ❌ 不引入日历同步、校园系统对接、成绩读取
- ❌ 不做账号体系、云同步、多人协作
- ❌ 不做 gamification（积分、徽章、排行榜）
- ❌ 不做移动端原生，只做响应式网页
- ❌ 不把 `reschedule_count` 塞进 `drop_cost` 公式（权重没有实验依据，只做提示）
- ❌ 不自行发明新的优先级档位、不新增任务状态

---

## 3 数据模型

### 3.1 Task

```ts
type Priority = 'asap' | 'high' | 'medium' | 'low' | 'none';

interface Task {
  id: string;
  name: string;
  estimateMin: number | null;   // 学生自报估时（分钟）。null 或 <=0 → 不排
  deadline: string | null;      // 'YYYY-MM-DD'。null 且 priority='none' → 不排
  priority: Priority;
  splittable: boolean;
  minChunk: number;             // 允许的最小块，默认 25
  doneRatio: number;            // 0..1
  startDate: string | null;     // 最早可开始日，早于它不提前排
  rescheduleCount: number;      // 被改期次数，仅作提示
}
```

### 3.2 Day

```ts
interface Day {
  day: string;                  // 'YYYY-MM-DD'
  windows: [number, number][];  // [[起始分钟, 时长], ...]，起始分钟从 0 点算
  protectedMin?: number;        // 专注块，不可被任务侵占（已从 windows 中扣除）
}
```

### 3.3 约束

| 字段 | 约束 |
|---|---|
| `estimateMin` | 非负整数；向上取整到 5 的倍数再参与计算 |
| `minChunk` | ≥ 10，默认 25 |
| `doneRatio` | 钳在 [0, 1] |
| `windows` | 每段时长 > 0；同一 Day 内不重叠 |
| `priority` | 只在 `'asap'` 时覆盖排序；其余仅参与同截止日内的次序 |

---

## 4 算法

执行顺序**不可调换**：校准 → 校验 → 装箱 → 分配超载 → 排序输出。

### 4.1 校准 k

```
输入: history = [(estimate, actual), ...]
1. 过滤 estimate > 0 且 actual > 0 的记录，得比值序列 r_i = actual / estimate
2. 若 r 的条数 < 3 → 返回 { k: 1.0, n: 条数, source: 'default' }
3. 取 r 的中位数（偶数取中间两个的平均）
4. 钳制: k = clamp(中位数, 0.5, 3.0)
5. 若钳制改变了值 → source = 'clamped'，否则 'personal'
```

**关键**：k 是"实际比估时慢多少倍"。k=1.33 表示学生实际花的时间是他自报的 1.33 倍。

### 4.2 校准后的真实时长

```
effectiveMinutes(estimate, k) = ceil(estimate * k / 5) * 5
```

向上取整到 5 分钟，避免出现 37 这种碎片值。

### 4.3 前置校验

按顺序判断，命中即停：

| 条件 | 状态 | 前端提示 |
|---|---|---|
| `estimateMin` 为空或 ≤0 | `invalid` | 缺估时，请填写预计需要多少分钟 |
| `deadline` 为空且 `priority` 为 `none` | `invalid` | 至少给一个截止日或一个优先级 |
| `startDate` 晚于今天 | `deferred` | 还没到开始日，X 月 X 日起可排 |

`invalid` 与 `deferred` 都不进入装箱，但要出现在输出的 `invalid` 数组里带原因。

### 4.4 排序键

进入装箱的任务按三级排序：

```
1. asap 优先 (asap → 0，其余 → 1)
2. 截止日升序（无截止日视为 +∞）
3. 优先级降序 (asap=4, high=3, medium=2, low=1, none=0)
```

### 4.5 装箱

对每个任务，按 Day 升序、每 Day 内按 window 顺序扫描：

```
need = effectiveMinutes(task.estimateMin, k)
只扫 horizonDays 内的 Day（默认 7；单日模式传 0）
遇到 day > task.deadline → 停止
对每个 window [start, length]:
    若 length <= 0 → 跳过
    若任务不可拆:
        若 length < need → 跳过这个 window（不许跨窗口）
        否则取 take = need
    若任务可拆:
        take = min(length, need)
        rest = need - take
        若 0 < rest < minChunk:            // 剩余会变碎片
            若 length >= need → take = need      // 窗口够，整块塞
            否则 → take = need - minChunk        // 少切，留够下一块
        若 take <= 0 → 跳过
    写入: windows[i] = [start + take, length - take]
          task.placed.push({ day, min: take })
          need -= take
    若 need <= 0 → 该任务结束
```

**这条最小块规则必须实现**：任何一块都 ≥ `minChunk`。反例见 `tests/cases.json` 的 C4——160 分钟可拆任务、minChunk=30、窗口 150 + 60，正确结果是 `[130, 30]`，不是 `[150, 10]`。

### 4.6 超载分两态

装箱结束后：

| 状态 | 判定 | 处理 |
|---|---|---|
| `scheduled` | `placed` 总时长 == 校准后需求 | 正常输出 |
| `partially` | 装了一部分，`need > 0` | **保留已排块**，输出 `remainder`（剩余分钟 + 下一个时段） |
| `unschedulable` | 一块都没放下 | 进入 `dropped`，输出 `nextSlot` |

`partially` **不许**整体移出——学生至少能做一部分，这正是产品要的"今天还能做什么"。

### 4.7 drop_cost

只对 `unschedulable` 的任务计算：

```
urgency   = deadline ? (days < 0 ? 1 : 1 / (1 + days)) : 0
progress  = clamp(doneRatio, 0, 1)
rigidity  = splittable ? 0 : 1
drop_cost = round(0.55 * urgency + 0.30 * progress + 0.15 * rigidity, 4)
```

含义：砍不急的、砍没动过的、不可拆的反而更该整天保留。`dropped` 数组按 `drop_cost` **升序**（先砍代价最低的）。

### 4.8 回填时段

对 `dropped` 与 `remainder` 的每一项，扫描 horizon 之后的全部 Day，找第一个满足 `length >= min(need, minChunk)` 的窗口，返回 `{ day, startMin, fitsFull }`。找不到返回 `null`。

### 4.9 理由文案

```
reason = [截止描述, 完成度, 可拆性, 改期提示].join('；')

截止描述: '已过期' | '距截止 N 天' | '无固定期限'
完成度:   '已完成 NN%'
可拆性:   '可拆分' | '不可拆分'
改期提示: rescheduleCount >= 2 时追加 '已改期 N 次'，否则不出现
```

---

## 5 输出契约

```ts
interface ScheduleResult {
  k: number;
  capacityRawMin: number;          // horizon 内可用分钟总和
  capacityCalibratedMin: number;   // floor(capacityRawMin / k)
  capacityNote: string;            // '可用 840 分钟，按 k=1.333 折算相当于 630 分钟的原始估时'
  scheduled: Array<{
    task: string; name: string;
    effMin: number;                // 校准后实际占用
    rawMin: number;                // 原始估时
    blocks: Array<{ day: string; min: number }>;
    status: 'scheduled' | 'partially';
    eta: string;                   // 截止日或 '—'
  }>;
  dropped: Array<{
    task: string; name: string;
    dropCost: number;
    reason: string;
    nextSlot: { day: string; startMin: number; fitsFull: boolean; window: number } | null;
  }>;
  remainder: Array<{
    task: string; name: string;
    placedMin: number;
    remainderMin: number;
    nextSlot: { ... } | null;
    reason: string;
  }>;
  invalid: Array<{ task: string; name: string; why: 'invalid' | 'deferred' }>;
  leftoverMin: number;             // 排完后 horizon 内剩下的可用分钟
}
```

字段名保持 camelCase，不改。Python 参考实现用 snake_case，序列化时转成上面这套。

---

## 6 验收用例

`tests/cases.json` 有 6 个用例，`tests/expected.json` 是对应的 golden 输出。

```bash
python tests/run_cases.py        # 跑全部，比对 golden
```

必过：

| ID | 验的是什么 | 关键断言 |
|---|---|---|
| C1 | 前置校验 | t1/t2 → invalid，t3 → deferred，只有 t4 进排程 |
| C2 | BP 案例 90 分钟 | 现代汉语 partial 90 / 剩 90；dropped 顺序 `[课外阅读, 英语写作]`，cost `0.0` < `0.0611` |
| C3 | 接 k 后的一周 | k=1.333，容量 840→630，4 个任务全部 scheduled，无 dropped |
| C4 | 最小块 | 块尺寸 `[130, 30]`，不是 `[150, 10]` |
| C5 | 不可拆 | 100 分钟任务跳过 90 的窗口，落在 120 的窗口 |
| C6 | k 边界 | 比值 5~6 → 钳到 3.0；只有 2 条样本 → 用默认 1.0 |

**任何一条不过，实现就是错的。** 不许改 golden 去迁就实现。

---

## 7 UI 要求

三屏，不要更多。

### 7.1 任务录入

- 一句话输入框 + 结构化表单二选一，表单字段与 Task 一一对应
- 缺 `estimateMin` 或既无截止日又无优先级时，**在输入处直接标红**，不让它进入排程
- 优先级用二维选择器替代 1—4 级下拉：横轴"紧急"（由截止日自动算，只读），纵轴"重要"（学生选）。学生改任一项，另一项自动跟随
- 可拆任务显示 `minChunk` 的默认值，允许改

### 7.2 排程结果

三块区域，顺序固定：

1. **装得下** — 任务名、原始估时、校准后占用、每天几块、ETA
2. **装了一部分** — 已排多少、还剩多少、下一个时段
3. **必须移出** — 按 `drop_cost` 从低到高，每项显示 cost、理由、回填时段

容量条：一条横条，左边已排、右边空余，上方显示 `capacityNote` 原句。

### 7.3 校准记录

- 每个已完成任务记一条 `(estimate, actual)`
- 显示 `k`、样本数、`source`（personal / clamped / default）
- 样本 <3 时明确写"样本不足，暂用 1.0"

### 7.4 视觉

- 深色底（参考 `#09141c`），主色青绿 `#7fe3c0`
- 不用圆角卡片堆叠，用留白和细分隔线分组
- 数字一律等宽对齐
- 不出现"AI""智能""自动优化"字样

---

## 8 每条设计的依据

写代码注释时引这里。

| 设计 | 依据 | 出处 |
|---|---|---|
| 无估时不排 | Motion 的硬规则：`Cannot be scheduled. A duration must be provided` | `docs/competitor-teardown.md` §2.1 |
| 最小块约束 | Motion：`splits respect a minimum block size` | 同上 |
| 装不下要有明确状态 | Motion 标 `unschedulable` 并停住，等用户改参数 | 同上 §2.3 |
| 超载分两态 | 本项目判断：Motion 一律停住，丢掉了"今天还能做一部分"这个选项 | — |
| 二维优先级 | 滴答清单四象限方案二：`使用优先级判断重要程度，使用任务时间判断紧急程度` | §4.1 |
| 象限反写属性 | 滴答清单：拖到别的象限会反写优先级与日期 | §4.1 |
| 改期次数作拖延提示 | 滴答清单「推荐任务」：按修改次数分 >5 / >3 / >2 三组 | §4.2 |
| 估时校准 k | **没有任何一家做**。Motion 无回写、Marvin 学的是 30 天容量基准、Super Productivity 用 `max(0, estimate - spent)` 把超出部分丢弃 | §6 |
| 不用 LLM 做判断 | 纯规则可离线复核，答辩时可现场跑 | — |

---

## 9 禁止事项（重申）

1. 不改数据模型的字段名与语义
2. 不为 `drop_cost` 的三项权重"优化"成别的数——0.55 / 0.30 / 0.15 是设计值，改动要重新跑 6 个用例
3. 不在 `drop_cost` 里加 `rescheduleCount`
4. 不把 `partially` 的任务整体移出
5. 不在没有 golden 用例的情况下改算法
6. 不新增依赖。Python 只用标准库，JS 不用框架
7. 不在 UI 上出现"AI 规划""智能排程"

---

## 10 分阶段

| 阶段 | 交付 | 完成判据 |
|---|---|---|
| P0 | 引擎核心（校准 / 校验 / 装箱 / 超载 / 输出） | `tests/run_cases.py` 6 个用例全绿 |
| P1 | 三屏 UI + 本地存储 | 手动录 5 个任务，能跑出与用例 C2 一致的结果 |
| P2 | 校准记录页 | 录 3 条实际耗时后，k 从 1.0 变为个人值 |
| P3 | 导出 / 导入 JSON | 导出后重新导入，结果不变 |

P0 不过，P1 之后一律不做。
