# 给 Antigravity 的启动指令

## 第一步：放置

把 `lifeos-kit/` 整个目录解压到项目根目录下，保持目录结构不变：

```
<你的项目>/
├── lifeos-kit/
│   ├── SPEC.md
│   ├── AGENTS.md
│   ├── src/
│   ├── tests/
│   ├── docs/
│   └── demo/
└── 你原来的代码...
```

## 第二步：把下面这段原样发给 agent

```
读 lifeos-kit/SPEC.md 和 lifeos-kit/AGENTS.md，然后执行第 10 节的 P0。

要求：
1. 在 src/ 下写实现，语言与现有项目一致；先看 reference/=src/engine.py 的 Python 版和 src/engine.js 的 JS 版，行为要一致。
2. 每改一版都跑 python lifeos-kit/tests/run_cases.py，必须 6/6 全绿。
3. 不许改 tests/expected.json。
4. SPEC.md 第 2.2 节列的"不做"逐条遵守，尤其不许调用任何模型做容量判断、排序、打分。
5. 六个用例全绿之后再动 UI，UI 要求见 SPEC.md 第 7 节。
6. 交付时按 AGENTS.md 末尾的格式报告。

做完前不要问我，卡住才停。
```

## 第三步：验收

```
cd lifeos-kit
python tests/run_cases.py        # 期望：全部通过 6/6
```

再手动验一遍 UI：

1. 录 3 个任务，其中两个带截止日、一个不带
2. 点"今天只剩 90 分钟"
3. 结果应该出现三块：装得下 / 装了一部分 / 必须移出
4. "必须移出"的顺序应该是：无固定期限的那个在最前面

---

## 如果 agent 跑偏了

| 症状 | 原因 | 纠正 |
|---|---|---|
| 加了"AI 推荐""智能排序" | 没读 SPEC 2.2 | 贴 `AGENTS.md` 的"绝对不做"那一节 |
| 把 partially 的任务整个移除了 | 漏了 SPEC 4.6 | 指出 C2 用例：现代汉语应该 partial 保留 90 分钟 |
| 切出 10 分钟的碎片块 | 漏了最小块规则 | 指出 C4 用例：块数组必须是 `[130, 30]` |
| 改了 expected.json 让测试通过 | 严重问题 | 从压缩包重新解压 tests/，让它重做 |
| 给 drop_cost 换了权重 | 自作聪明 | 指出 SPEC 第 9 节第 2 条 |
| 引入了 npm 包 / pip 包 | 违反"不新增依赖" | 要求移除 |

---

## 想要更长的一步到位指令

```
按 lifeos-kit/SPEC.md 实现 P0 到 P3，每阶段单独提交。

P0：引擎核心，tests/run_cases.py 6/6 绿
P1：三屏 UI（SPEC 第 7 节），手动跑通 C2 场景
P2：校准记录页，录 3 条实际耗时后 k 从 1.0 变成个人值
P3：导出/导入 JSON，往返结果不变

每阶段做完停下来给我看，我确认后再继续下一阶段。
任何一步过不了自己的测试就不要往下走。
```
