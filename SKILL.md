---
name: seele-s-html
description: 给任意"幻灯片式 HTML deck"一键补上演讲者模式(Presenter Mode)——按 S 弹出双窗(当前页/下一页像素级预览 + 逐字稿 + 计时器)，两窗 ← → 实时同步。是一个后处理器(post-processor)：不改原生成器，吃一个 HTML deck 吐一个 .presenter.html。当用户用 frontend-slides / guizang / huashu 等任意 HTML PPT skill 生成了一版满意的 deck，想给它加"演讲者视图/逐字稿/提词器/计时器/S 功能"时使用。触发词：加演讲者模式、加逐字稿、加提词器、presenter mode、演讲者视图、S 功能、把 S 加上、给这个 deck 加个演讲者、seele-s-html。
---

# seele-s-html · 给任意 HTML deck 补演讲者模式

一句话：**把 html-ppt 那套招牌 S 演讲者模式，做成一个能贴到任何 HTML 幻灯片上的后处理器。**

## 何时用
- 用户用**任意 HTML 幻灯片 skill**（frontend-slides / guizang-ppt-skill / huashu-design / html-ppt 之外的任何一个）生成了一版满意的 deck，想加：演讲者双窗、逐字稿提词器、计时器、S 键。
- 用户说"把 3 号那个 S 功能加到别的上"、"给这个 deck 加个演讲者模式/提词器"。

## 加不了的场景（说清边界，别硬上）
- **非 HTML 产物**：baoyu 的图片流(PNG)、ppt-master 的 .pptx——没有网页运行时可挂钩，射程外。
- 需要"能在浏览器里按 S 运行 JS"的 deck 才行。

## 怎么用（一条命令）
```bash
python3 scripts/inject.py <deck.html> [--notes notes.md] [--out out.html]
# 产出：<deck>.presenter.html —— 浏览器打开，按 S 开演讲者模式
```
- 逐字稿 `--notes`：`.json`(字符串数组，每项一页) 或 `.md`(用 `\n---\n` 分页)。
- 不给 `--notes` 时：先尝试从 deck 里已有的 `<aside class="notes">` 抽；都没有则逐字稿留空（演讲窗仍可用，只是没词）。

## 它怎么工作（三段适配兜底）
注入的 `presenter-core.js` 运行时按优先级找"翻页接口"：
1. **契约**（最干净）：deck 暴露 `window.__deck = { total, current(), goto(n) }` → 直接用。
2. **全局 deck**：存在 `window.deck.show(n)`（frontend-slides 家族）→ 用它。
3. **通用探测**：认 `.slide` + `active` class；跳页靠**派发 ← → 键盘事件**驱动 deck 自己的翻页逻辑（因此不会打乱它内部页码），当前页靠 `MutationObserver` 观察 class 变化上报。覆盖绝大多数 deck。

选择器不匹配时用 `--slide-selector` / `--active-class` 覆盖（见下）。

## 常见 deck 的参数
| deck 来源 | 参数 |
|---|---|
| frontend-slides / 本家 `.slide.active` 系 | 默认即可 |
| 其它：页元素 class 不同 | `--slide-selector '.your-slide' --active-class 'is-active'` |
| 当前页写在**指示器**上(slide 无 active，如归藏 nav 圆点) | `--index-selector '#nav .dot'` |
| 当前页写在**属性**上 | `--active-attr 'data-active'`（或 `aria-current`） |
| deck **不认方向键**(只认 Space/PageDown/n/j) | `--next-key Space --prev-key PageUp` |
| 有**横滑轨+JS 入场动画**、需强制静态显形(归藏这类) | `--preview-call __setLowPowerMode --preview-class low-power` |
| chrome 角标没自动藏干净 | `--hide '.your-progress,.your-footer'` |

**归藏(guizang)完整预设**（已转正）：
```bash
inject.py deck_guizang.html --notes 稿子.json \
  --index-selector '#nav .dot' --preview-call __setLowPowerMode --preview-class low-power
```

## 实测兼容（2026-07-03，v1 + 对抗审查加固）
| deck | 结果 | 说明 |
|---|---|---|
| **frontend-slides**（朱批墨） | ✅ 满 | `.slide.active` + opacity 切换，通用路径精准落点 |
| **huashu-design** | ✅ 满 | 同上，精准命中第 N 页 |
| **guizang-ppt-skill** | ✅ 满（需预设） | 横滑轨+Motion One：靠 `--index-selector` 读 nav 圆点定位、`--preview-call __setLowPowerMode` 取消 WAAPI 入场动画显形、退避重发穿 700ms 翻页锁。三点 pv0/pv5/pv10 均验证精准+内容全 |

**规律**：opacity/display 切换型 deck → 默认即可；横滑轨+JS 逐元素入场动画型 → 加上面归藏那套预设。**最稳**永远是让 deck 实现 3 行契约 `window.__deck`（见 `references/adapter-contract.md`），走瞬跳路径。

## 内置健壮性（已固化进 core/inject，无需使用者操心）
**v1 定稿：**
1. **预览满格不错位**：iframe 内部按原生 1920×1080 满渲染(deck 自己 fit→scale=1)，再 CSS 等比缩放居中塞进卡片 + `ResizeObserver` 跟随拖拉重适配。不依赖各 deck 缩放锚点。
2. **多窗不踩 localStorage**：预览 iframe 在 deck 脚本前把 `localStorage.setItem` 置空，防"记当前页"的 deck 三窗互踩(只堵写、不动读，免撑挂存储自检)。
3. **确认式步进**：发键→轮询等 curIdx 真变→下一格，杜绝过冲。

**对抗审查加固（2026-07-03，两红队 11 项）：**
4. **`</script>` 自截断根治**：① 演讲窗内联字符串(逐字稿/base/channel)统一转义 `</`→`<\/`，逐字稿含字面闭合脚本标签也不炸；② inject 内联 core 前把任何 `</script` 转 `<\/script`(注释里写了也不翻车)。
5. **合成键补 `code`+`cancelable`**、并向 `document` 与聚焦元素双派发——认 `e.code`/监听挂容器的 deck 也翻得动。
6. **步进退避+封顶**：没翻动按"越来越长"间隔重发(不顶 debounce 锁)，8 次仍不动则放弃并 `console.warn`，杜绝无限空烧。
7. **`total()` 认契约 `__deck.total`**（懒加载/虚拟化 deck 页数不再按 DOM 误数）。
8. **`window.deck.show` 排除 DOM 元素**（`<div id="deck">`/`<dialog id="deck">` 具名全局不再被误当翻页）。
9. **onChange 轮询兜底**：状态写在属性/scroll/hash、或契约只有 goto 没 current、或 DOM 重建 → MutationObserver 盖不到，定时查 curIdx 补上，主→演讲窗不再单向失联。
10. **chrome 隐藏改精准 JS**：脱流(fixed/sticky/absolute)+非 slide+非背景(canvas/video/近全屏)才隐——不再用 class 名子串匹配(那会误吞 `credit`/`editorial`/`.slide-footer` 等正文)。
11. **注入位置**：无 `<head>` 插 `<!doctype>` 之后(免 quirks)；用**最后一个** `</body>`(免命中 deck JS 里的字面量)；channel 掺路径哈希(免同名文件串台)。

**现地验证**：frontend-slides / huashu / **guizang** 三例均已在真实浏览器按 S 跑通(双窗同步/逐字稿/计时器/满格预览)，且 pv0/pv5/pv10 边界 + 回归全过。

## 机制细节
- 预览：给 deck 加 `?__pv=N` 参数 = 只渲染第 N 页并隐藏 chrome，供演讲窗用 iframe 抓当前页/下一页做**像素级预览**（和观众看到的同一套 CSS/字体）。
- 同步：主窗与演讲窗走 `BroadcastChannel`（每个 deck 独立 channel）。演讲窗 ← → 翻页会同步观众窗；观众窗翻页也会同步演讲窗。
- 自包含：注入是纯内联 JS/CSS，不新增外部文件，保持 deck"单文件可带走"。

## 新 deck 想更稳？实现契约
如果某个生成器以后想"原生兼容"，只需在它的 deck 里暴露 3 个方法，见 `references/adapter-contract.md`。实现后本 skill 走第 1 段，最稳最快。

## 注意
- 演讲窗用 `window.open` 弹窗，浏览器可能拦——首次按 S 若无反应，允许该页弹窗后再按。
- headless 环境无法弹窗；验证预览机制用 `<deck>.presenter.html?__pv=N` 截图即可。
