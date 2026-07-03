# 适配契约 · 让任意 deck 原生兼容 seele-s-html

`presenter-core.js` 三段兜底找翻页接口：**契约 → window.deck.show → 通用键盘探测**。
绝大多数 `.slide + active` 的 deck 走第 3 段就能用，无需改动。
但如果你在写一个新的 HTML 幻灯片生成器、想让它**最稳最快**地被 seele-s-html 接管，实现下面这个契约（走第 1 段）。

## 契约：在 deck 里暴露 `window.__deck`

```js
window.__deck = {
  total: 11,                        // 总页数(数字)。core 优先用它——懒加载/虚拟化 deck 必填，否则按 DOM 里数出来的会错
  current: function(){ return i; }, // 返回当前页 0-based 下标。【必填】主窗→演讲窗同步靠它
  goto:    function(n){ /* 跳到第 n 页(0-based)，并更新自己的内部状态 */ }
};
```

- `goto(n)` **必须驱动 deck 自己的翻页**（更新内部 current、进度条、动画），不要只切 class，否则 deck 后续键盘翻页会错乱。实现后 core 直接调 `__deck.goto` 瞬跳，不再派发键盘事件，最干净。
- `current` **是必填项**：core 用一个轮询(每 300ms 查 `current()` 变化)把主窗翻页同步到演讲窗。只实现 `goto` 不实现 `current` → 能跳但**主窗翻页不会同步到演讲窗**（页码/NEXT 卡在第 1 页）。
- `total` 是数字时 core 优先采信它（`total()` 会读 `window.__deck.total`）；不给则回退数 `.slide` 元素数。
- **不想实现契约**也行：`.slide`+active class 的 deck 走通用探测即可；当前页写在指示器上用 `--index-selector`，写在属性上用 `--active-attr`，deck 不认方向键用 `--next-key/--prev-key`。

## 预览模式约定

core 用 `?__pv=N` 让 deck **只显示第 N 页 + 隐藏 chrome**：
- core 给 `<html>` 加 `data-seele-preview="1"`，并用 JS 隐藏 chrome：**脱离文档流(fixed/sticky/absolute) 且 不含 slide、不在 slide 内、不是背景层(canvas/video/近全屏)** 的元素才隐。不用 class 名子串匹配（那会误吞 `credit`/`editorial`/`.slide-footer` 等正文）。
- 有横滑轨/JS 逐元素入场动画的 deck（内容默认 opacity:0 靠动画显现），预览会空白 → 用 deck 自带的静态模式：`--preview-call <window函数>`（取消 WAAPI 动画，如归藏 `__setLowPowerMode`）或 `--preview-class <class>`（如 `low-power`）。
- 个别 chrome 没藏干净，注入时加 `--hide '.my-progress,.my-footer'`，不必改 deck。

## 逐字稿约定

- 若 deck 每页带 `<aside class="notes">…</aside>`，seele-s-html 不给 `--notes` 时会自动抽取。
- 建议新生成器把逐字稿写进 `<aside class="notes">`，天然兼容。

## 最小自检

注入后浏览器打开 `<deck>.presenter.html`：
1. 页面正常、chrome 都在 → 基本注入没破坏原 deck。
2. 打开 `<deck>.presenter.html?__pv=3` → 应只显示第 4 页、无进度条/提示 → 预览机制通。
3. 按 `S` → 弹演讲窗四卡；两窗 ← → 同步 → 全通。
