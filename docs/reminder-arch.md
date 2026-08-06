# 喝水提醒 · 架构设计文档

> 配套 [`reminder-prd.md`](reminder-prd.md)。本文只描述**技术设计与集成方式**，实现前需与需求方对齐。
> 设计原则：复用现有 MV3 + `chrome.alarms` 架构，**最小改动**接入；DOM 浮层为主、系统通知兜底。
>
> **已敲定决策**：① 提醒逻辑拆为独立模块 `js/water-reminder.js`，由 `background.js` 通过 `importScripts` 引入；② 已确认接受 `<all_urls>` 权限（DOM 浮层必需）。

## 1. 与现有架构的关系

现有扩展已有的后台能力（见 [`background.js`](../extension/js/background.js)）：MV3 Service Worker + `chrome.alarms`（1 分钟周期推进摸鱼计时）。喝水提醒**复用同一个 Service Worker 进程**，但使用**独立的 alarm 名称**，两套逻辑互不干扰。

```
Service Worker (js/background.js)
├── 摸鱼计时 alarm: "moyu-bg-tick"   ← 现有，保持不变
└── importScripts("js/water-reminder.js")   ← 引入提醒模块
        └── 喝水提醒 alarm: "water-remind"   ← 新增（逻辑全在 water-reminder.js）
```

## 2. V1 组件划分

```
┌─────────────── popup.html（新增"喝水提醒"设置区）───────────────┐
│  间隔下拉 / 启用开关 / 提示音开关                                │
│         │ 读写                                                  │
└─────────┼───────────────────────────────────────────────────┘
          ▼
   chrome.storage.sync   ← 用户配置（间隔/启用/提示音）
   chrome.storage.local  ← 运行态（snooze 标记等）
          ▲
          │ 读
┌─────────┴─── water-reminder.js（由 background.js importScripts 引入）─┐
│  alarm "water-remind" 触发                                     │
│    → 读配置：未启用则忽略                                       │
│    → 查询当前活动标签页 chrome.tabs.query(active)               │
│    → 能注入？                                                   │
│        ├── 是 → chrome.scripting 注入浮层（content-reminder.js）│
│        └── 否 → chrome.notifications 兜底                       │
│  接收面板/通知按钮回传（snooze / dismiss）→ 重排 alarm          │
└────────────────────────────────────────────────────────────┘
          │ 注入
          ▼
   content-reminder.js（注入到当前网页）
     渲染右下角浮层 + "叮"音 + 稍后/关闭按钮
     按钮点击 → chrome.runtime.sendMessage 回传后台
```

## 3. 新增/改动文件清单（V1）

| 文件 | 类型 | 说明 |
|---|---|---|
| `manifest.json` | 改 | 权限加 `notifications`、`scripting`、`tabs`；`host_permissions` 加 `<all_urls>` |
| `js/background.js` | 改 | 仅在 SW 内 `importScripts('js/water-reminder.js')` 引入提醒模块并注册其监听；提醒具体逻辑不写在此文件，保持与现有摸鱼计时代码解耦 |
| `js/water-reminder.js` | 新（**已确定拆分**） | 承载全部提醒逻辑：读配置、alarm 调度、注入/兜底判定、按钮消息处理。作为独立模块由 background.js 引入 |
| `js/content-reminder.js` | 新 | content script：渲染浮层、播放提示音、回传按钮事件 |
| `popup.html` | 改 | 新增「喝水提醒」设置区（间隔/开关/提示音） |
| `js/mini.js` | 改 | 绑定设置区的读写与「修改立即生效」 |
| `css/style.css` | 改 | 新增浮层与设置区样式（浮层样式建议随注入脚本内联，避免污染宿主页） |

> 注意：注入到宿主网页的浮层样式**不要**依赖扩展的 `style.css`，应由 `content-reminder.js` 内联样式并用高特异性/`all:initial` 兜底，避免被宿主页 CSS 影响，也避免影响宿主页。

## 4. 存储契约（新增键，与现有 moyu-* 键并存）

| 存储区 | 键 | 内容 |
|---|---|---|
| `storage.sync` | `water-settings` | `{ enabled: bool, intervalMin: number, sound: bool }`（默认 `{enabled:false, intervalMin:30, sound:true}`） |
| `storage.local` | `water-runtime` | `{ mode: 'periodic' \| 'snooze', nextAt: number }`（用于恢复展示，非计时权威） |

计时权威由 `chrome.alarms` 承担，`water-runtime` 仅辅助 UI 显示"下次提醒时间"。

## 5. alarm 调度规则（V1 核心）

| 事件 | alarm 操作 |
|---|---|
| 启用 / 修改间隔 | `alarms.clear("water-remind")` 后 `alarms.create("water-remind", { periodInMinutes: intervalMin })`，`water-runtime.mode='periodic'` |
| 禁用 | `alarms.clear("water-remind")` |
| 点「稍后」 | `alarms.clear` 周期 → `alarms.create("water-remind", { delayInMinutes: 5 })`（单次），`mode='snooze'` |
| 点「关闭」 | `alarms.clear` → 按 `intervalMin` 重建周期 alarm，`mode='periodic'` |
| snooze 单次触发后 | 弹面板；用户不操作则等待其点击；点稍后再建 5min 单次，点关闭恢复周期 |

> `chrome.alarms` 同名 create 会覆盖旧的，`periodInMinutes` 与 `delayInMinutes` 用于区分周期/单次。

## 6. 注入可行性判定与兜底

后台在 alarm 触发时执行：

```
tab = 当前窗口 active tab
可注入 = tab 存在
        && tab.url 以 http:// 或 https:// 开头
        && 不是 chrome://、edge://、about:、chrome.google.com/webstore、file://*.pdf
成功注入（scripting.executeScript 无异常）→ 展示浮层
否则 / 注入抛错 → chrome.notifications.create 兜底（带 buttons: [稍后, 关闭]）
```

兜底通知按钮通过 `chrome.notifications.onButtonClicked` 映射到同一套 snooze/dismiss 逻辑。

## 7. 消息协议（content ↔ background）

| 方向 | 消息 | 说明 |
|---|---|---|
| content → bg | `{ type: 'water-snooze' }` | 用户点稍后 |
| content → bg | `{ type: 'water-dismiss' }` | 用户点关闭 |
| bg → content | `{ type: 'water-show', text, sound }` | 触发渲染浮层（注入后立即 sendMessage，或注入即渲染） |

系统通知兜底走 `chrome.notifications.onButtonClicked(notifId, btnIdx)`，`btnIdx===0` 视为稍后，`===1` 视为关闭。

## 8. 提示音实现

浮层内 `new Audio(dataURI)` 播放一段 < 0.5s 的极短「叮」（base64 内联 wav，避免额外资源与跨域），仅在 `water-settings.sound === true` 时播放。系统通知兜底场景由操作系统决定是否有声，扩展不额外控制。

## 9. V1 → V2 演进预留

V1 的接口为 V2 留好扩展点，避免返工：

- 注入判定函数集中在一处，V2 加「白名单域名过滤」只需在此追加条件。
- content script 渲染前预留 `shouldShowNow()` 钩子，V2 在此加「全屏/输入中」检测并返回延迟策略。
- `water-settings` 用对象存储，V2 追加 `whitelist: string[]`、`quietHours: {from,to}` 等字段向后兼容。
- snooze 计数（15 分钟内次数）V2 存入 `water-runtime`，触发「暂停 1 小时」提示。

## 10. 风险与权衡（已在 PRD 第 7 节同步）

| 风险 | 说明 | 处置 |
|---|---|---|
| `<all_urls>` 权限较大 | 用户安装时会看到"读取所有网站数据"提示 | 文案说明用途；仅注入浮层不采集数据 |
| 特殊页面无法注入 | chrome://、PDF、商店页 | 系统通知兜底 |
| 浮层只在当前标签页 | 切页看不到 | 兜底通知 + 下次周期重新注入当前页 |
| SW 休眠 | MV3 SW 会被回收 | alarm 能唤醒 SW，与现有摸鱼计时同机制，无新增风险 |

## 11. 实施建议顺序（待确认后再进入编码）

```
1. manifest 权限 + storage 契约  → 验证：加载扩展无报错、权限提示符合预期
2. background 提醒 alarm + 注入/兜底调度 → 验证：手动缩短间隔能弹面板/通知
3. content-reminder 浮层 + 提示音 + 按钮回传 → 验证：稍后/关闭行为符合 PRD 4.4
4. popup 设置区 + mini.js 读写 → 验证：改间隔立即生效、重启后设置保持
5. 走一遍 PRD 第 8 节验收标准
```