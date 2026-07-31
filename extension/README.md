# 宜忌月历 · 摸鱼账本（Chrome 扩展，Manifest V3）

把 `moyu-yiji/` 下重建的**月历版**单页应用封装为 Chrome 扩展：点击工具栏图标弹出**简洁小窗**，完整月历与设置通过"打开完整页面"在新标签页查看。

- **简洁小窗（popup.html + js/mini.js）**：顶部横幅（小猫小鱼标题 + 按日期固定的今日金句）→ 今日宜忌 → 今日摸鱼账本 → 紧凑摸鱼计时器，窄高一眼看全；底部"查看全部日历 / 调整摸鱼身价"按钮在新标签页打开完整页。
- **完整页（full.html + js/popup.js）**：顶部横幅 + 薪资设置面板 + 完整月历 + 计时器，与扩展共享同一套 `chrome.storage.local` 数据，小窗与完整页数据时刻一致。
- **宜忌月历**：按月展示宜/忌，宜忌按 **按日期固定** 可复现生成 —— 同一天内反复打开完全一致，跨天自动变化（见 `js/yiji-data.js` 的日期加盐 PRNG）。
- **摸鱼账本**：每个日期格子显示当日摸鱼时长与按等效时薪折算的入账；小鱼 🐟 标记已有记录。
- **计时器**：基于真实时间戳差分累计，金额 = 时薪 × 秒数 / 3600，两位小数；三态（idle/running/paused）跨弹窗/重启恢复，且**后台持续计时（SW + alarms）、关浏览器自动暂停**。
- **薪资模型**：可手填时薪（优先）；或按 月薪 ÷ 月工作天数 ÷ 每天时长 推算等效时薪。

## 目录结构

```
extension/
├── manifest.json            # Manifest V3（background.service_worker + storage/alarms 权限）
├── popup.html               # 简洁小窗：横幅(今日金句) / 今日宜忌 / 今日账本 / 紧凑计时器 + 打开完整页
├── full.html                # 完整页：顶部横幅 → 设置面板 → 完整月历 → 计时器
├── icons/                   # 16/32/48/128 RGBA PNG（小鱼图标）
├── assets/
│   ├── mascot-cat.svg       # 打盹摸鱼小猫
│   └── mascot-fish.svg      # 摸鱼小鱼
├── css/
│   ├── style.css            # 月历画风（含 popup 紧凑小窗覆盖层）
│   └── mascots.css          # 猫/鱼 emoji 动画
├── js/
│   ├── background.js        # MV3 Service Worker：后台持续计时 + 关浏览器自动暂停
│   ├── calendar-tooltip.js  # 共享日期悬浮窗实现（网页版 index.html 亦引用同一文件）
│   ├── yiji-data.js         # YijiModule.generateYiji(dateStr) 按日期可复现
│   ├── moyu-timer.js        # MoyuTimer 状态机（idle/running/paused）
│   ├── mini.js              # 简洁小窗装配 + chrome.storage.local 持久化适配
│   └── popup.js             # 完整页装配 + chrome.storage.local 持久化适配
└── tools/
    └── gen_icons.py         # 纯 Python 标准库生成小鱼图标
```

> 旧版"单日两栏"弹窗已演进为**简洁小窗（三块）+ 完整页（月历+设置）**双形态，二者共用 `chrome.storage.local`，数据一致。

## 本地试用：加载已解压的扩展程序

1. Chrome 地址栏打开 `chrome://extensions/`。
2. 打开右上角 **开发者模式** 开关。
3. 点击左上角 **加载已解压的扩展程序**，选择本目录 `extension/`。
4. 安装后点击工具栏的扩展图标弹出小窗；未显示时点工具栏拼图图标，把"宜忌月历 · 摸鱼账本"固定（图钉）到工具栏。
5. 小窗窄高显示：顶部横幅（标题 + 按日期固定的今日金句）→ 今日宜忌 → 今日摸鱼账本（时长/入账）→ 紧凑计时器。点底部「查看全部日历 / 调整摸鱼身价」在新标签页打开完整月历 + 设置。

## 持久化（chrome.storage.local）

存储键：

| 键 | 内容 |
|---|---|
| `moyu-settings` | 薪资模型：`{ hourlyRate, monthlySalary, workdays, hoursPerDay }` |
| `moyu-log:YYYY-MM-DD` | 每日摸鱼累计秒数（单调只增，任何写入方都以 `max(旧值, acc)` 幂等合并） |
| `moyu-timer-state` | 计时器上下文：`{ status, hourlyRate, accSeconds, startAt, lastLogged, alive }` |

### 后台持续计时 + 关浏览器自动暂停（MV3 Service Worker）

`manifest.json` 增加了 `background.service_worker`（`js/background.js`）与 `alarms` 权限，实现"扩展 UI 全关时仍持续计时、关浏览器自动暂停"：

- **后台持续计时**：SW 靠 `chrome.alarms`（1 分钟周期）在弹窗/完整页都关闭时仍被唤醒。每次唤醒 `bgTick()`：
  1. 读 `moyu-timer-state`，若 `running` 且 `startAt` 有效，以**权威累计基准** = 已确认 `accSeconds` + 距上次「仍在计时」打点 `alive` 的**残余**（`now - alive`，被 alive 新鲜窗口封顶）；
  2. 用 **`max` 幂等合并**写回当天 `moyu-log:today`，并刷新 `accSeconds = lastLogged = acc`、`alive = now`。
- **不采用旧 startAt 差分**：累计统一以 `alive`（最近一次确认在计时的打点）为补账基准，绝不拿某个过期/旧会话的 `startAt` 去算 `now - startAt`。这能杜绝多写入者（popup/full/SW 各有 timer 实例）用 `Math.max` 把暂停/关闭后不该算的时段顶成虚高值——即"暂停后今日已摸冒出超大数字"的根因。
- **幂等 / 不重复记账**：累计秒数 `acc` 是"只增不减"的总量，页面（`mini.js`/`popup.js`）与 SW 都遵守 `写 max(旧值, acc)`。无论写入顺序，都不会重复记、不倒退。
- **暂停/重置定格**：点击暂停/重置时，先按**当时真实累计** `timer.getSeconds()` 落账当天，再冻结为 `paused`/`idle`（`startAt=null`、`alive=null`），不调用会额外写 running 快照的 `settlePending`，杜绝晚到的 running 快照顶高。
- **关浏览器自动暂停**：SW 随浏览器关闭被终止，`alive` 水印停止更新。下一次任一 UI 打开时，若读到 `running` 但 `now - alive > STALE_ALIVE_MS`（5 分钟），即判定浏览器期间被关闭 → 自动暂停：只把**已提交**的 `accSeconds` 留账、关闭期间未提交的剩余时间不记、置为 `paused`，并向 UI 显示「已自动暂停」提示（点开始/继续后清除）。反过来，若 `alive` 新鲜：续算时只补 `base + (now - alive)` 的残余，`startAt` 以当前时刻为新起点续跑实时时钟。

### 为什么用 chrome.storage 而非常规 localStorage

`chrome-extension://` 页面其实也支持 `localStorage`，但为了跨弹窗/跨浏览器会话稳定持久化、支持 SW 后台计时，且让**简洁小窗（popup）、完整页（full.html）与 SW 三方数据一致**，这里统一改用 **`chrome.storage.local`**（需 `storage`、`alarms` 权限）。由于 chrome.storage 是 **异步 API**，而渲染与 `effectiveRate()` 等以 **同步读** 为主，`js/mini.js` 与 `js/popup.js` 做了相同的适配：

- **同步内存缓存**：`logCache`（每日秒数）、`settings`（薪资）在初始化 **`await`/回调恢复后** 载入内存；后续读全部走缓存，保证渲染即时正确。
- **异步落盘**：写操作仅更新缓存并调用 `chrome.storage.local.set`，不阻塞渲染。
- **共享契约**：小窗、完整页、SW 读写同一批键（`moyu-log:*`、`moyu-settings`、`moyu-timer-state`）和同一套计时器三态恢复约定，任一方的操作对其它方立刻可见。
- **初始化时序**：先取回全量数据 → 恢复日志、薪资、计时器上下文 → **再**渲染，避免闪变。

### 计时器三态恢复边界

| 保存时状态 | 恢复行为 |
|---|---|
| `idle` | 累计从 0 开始，`lastLogged` 归零（保留设置值，不强制回填时薪） |
| `paused` | 保持冻结束累计（`startAt=null`，时间不再流逝），`lastLogged`=当前累计 |
| `running` + alive 新鲜 | 浏览器仍在/SW 持续计：保留 `startAt` 按差分续算，把已流逝累计以 `max` 幂等补记当天 |
| `running` + alive 过期 | 浏览器被关闭 → 自动暂停：只把已提交 `accSeconds` 留账、置 `paused`、提示「已自动暂停」 |

每次状态变化（start/pause/resume/reset）、每秒心跳、`beforeunload` 以及 SW 每次 alarm 唤醒都会写入 `moyu-timer-state`，确保崩溃/断电/直接关闭弹窗也不丢上下文。

## 唯一数据源（跨界面一致）

- **扩展内（唯一真源）**：`chrome.storage.local` 里的当天 `moyu-log:*` + `moyu-timer-state` 是唯一真源。小窗 `popup`、完整页 `full`、Service Worker 三方都以"恢复→按现值渲染"取同一份，写一律走单调 `max` 幂等合并，不重复累计。任一界面/页面改动，其余界面通过 **`chrome.storage.onChanged`** 监听即时同步（自身写入用最近自写标记抑制反馈，只对其它界面/SW 的外部写入刷新），保证同时打开弹窗与完整页也不各跑各的；某处点击重置/暂停也会同步到其它界面。
- **重置语义统一**：running/paused 点时，先 `settlePending`（把已计秒留账当天）→ `timer.reset()` 清零回 idle → 持久化为 `idle`（`alive=null`，不再被心跳/SW 续跑或补记），当日已记账秒数保留。

## 关联的网页版（数据域取舍）

网页版 `moyu-yiji/index.html + js/app.js` 用 **localStorage**，且运行在 `file://` / 普通网页环境，`chrome.*` API 不可用，因此**无法与扩展的 chrome.storage 直接打通**——这是两个独立数据域（当前取舍：扩展为 Canonical 实现，网页版为独立可双击演示的 localStorage 版）。扩展内的两页走 `chrome.storage.local` 且契合同一、互相衔接一致。
