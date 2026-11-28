# LifeOS 排程引擎 · 交付包

给大学生用的学习计划重排引擎。核心一件事：**先用学生自己的历史估时偏差把估时修正一遍，再判断今天真正装得下多少，装不下就明确说出必须砍哪几项、什么时候能补上。**

纯规则，不联网，不调用模型。Python 与 JavaScript 两套实现，输出逐字段一致。

---

## 30 秒上手

```bash
# 1. 跑验收，确认基线是绿的
cd lifeos-kit
python tests/run_cases.py

# 2. 看引擎怎么决策
python src/engine.py

# 3. 看交互演示
#    直接双击 demo/index.html
```

## 文件地图

| 路径 | 是什么 | 谁看 |
|---|---|---|
| `SPEC.md` | **实现规格**，唯一事实来源：数据模型、算法、输出契约、UI 要求、禁止事项 | 编码 agent 必读 |
| `AGENTS.md` | 硬约束：改动流程、自查清单、绝对不做的 7 条 | 编码 agent 必读 |
| `src/engine.py` | Python 参考实现，能过全部用例 | 当伪代码读 |
| `src/engine.js` | 浏览器版，`window.LifeOS`，无依赖 | 直接引 |
| `tests/cases.json` | 6 个验收用例的输入 | 改算法前先看 |
| `tests/expected.json` | 对应的 golden 输出 | 不许改 |
| `tests/run_cases.py` | 验收脚本 | 每次改完必跑 |
| `tests/generate_cases.py` | 重新生成 golden（只在确认设计变更后跑） | 极少用 |
| `demo/index.html` | 单文件演示，可拖 k、可模拟"今天只剩 90 分钟" | 演示/答辩/截图 |
| `docs/competitor-teardown.md` | 12 家竞品的机制还原，每条设计的出处 | 写注释、写材料、答辩 |
| `docs/bp-copy.md` | 可直接粘进商业计划书与 PPT 的段落 | 交材料时复制 |

## 引擎对外接口

```python
from engine import Task, Day, schedule, calibration_factor

k = calibration_factor([(60, 95), (30, 40), (45, 70)])['k']   # → 1.333
result = schedule(tasks, days, k, today, horizon_days=0)
```

```js
const L = window.LifeOS;
const cal = L.calibrationFactor([{estimate:60, actual:95}, ...]);
const r = L.schedule(tasks, days, cal.k, today, 0);
```

返回结构见 `SPEC.md` 第 5 节，字段名 camelCase，两套实现一致。

## 验收状态

```
PASS  C1  前置校验：无时长 / 无锚点 / 未到开始日
PASS  C2  BP 3.2 案例：390 分钟任务只剩 90 分钟
PASS  C3  接个人系数 k 后的完整一周
PASS  C4  最小块边界：剩余不足 min_chunk 时不许切碎片
PASS  C5  不可拆任务必须整块放进同一窗口
PASS  C6  k 的边界：样本不足与钳制
全部通过 6/6
```

## 这套东西的立足点

三种形态的计划类产品（商业自动排程、商业容量感知、开源全功能），查过 12 家、4 家做到全文或源码级，**没有一家把「实际耗时 ÷ 估时」的比值累积成参数用于修正下一次排程**：

- Motion：按估时排程，装不下标 unschedulable 停住，等用户改时长
- Amazing Marvin：学的是"过去 30 天完成总量"作容量基准，不管单项估时
- Super Productivity：`max(0, 估时 − 已花)`，超出部分直接丢弃，只做超标通知

完整证据见 `docs/competitor-teardown.md`。

## 不做

不接 LLM 做判断、不做日历同步与账号、不做移动原生、不做积分排行、不给 `drop_cost` 加没有实验依据的权重。清单全文在 `SPEC.md` 第 2.2 节与 `AGENTS.md`。
