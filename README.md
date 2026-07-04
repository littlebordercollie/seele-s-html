# seele-s-html

**给任意「幻灯片式 HTML deck」一键补上演讲者模式（Presenter Mode）。**

你用任何工具做出一版 HTML 网页 PPT——frontend-slides、guizang、huashu，或者纯手写——只要它能在浏览器里按方向键翻页，这个后处理器就能给它贴上一套**演讲者视图**：

按 `S` 弹出双窗——**当前页 / 下一页的像素级预览 + 逐字稿提词器 + 计时器**，演讲窗和观众窗 `←` `→` 实时同步。

> 一句话：把 keynote 那种「演讲者屏」体验，做成一个吃 HTML、吐 HTML 的通用后处理器。**不改你的原生成器，不引入任何外部依赖，产物仍是单文件可带走。**

---

## 它长什么样

```
┌─────────────── 演讲者窗（你的笔记本屏）───────────────┐
│  ┌──────────────┐   ┌──────────────┐                 │
│  │   CURRENT    │   │     NEXT     │    ⏱ 03:12      │
│  │  第 5 页预览  │   │  第 6 页预览  │                 │
│  └──────────────┘   └──────────────┘                 │
│  逐字稿：这一页要讲的话就写在这里，←→ 翻页时同步滚动…    │
└──────────────────────────────────────────────────────┘
        观众窗（投影/外接屏）：只显示当前页，两窗双向同步
```

---

## 为什么要它

网页 PPT 好看、好带走、好改，但几乎都缺一块：**没有演讲者屏**。上台时你只能看到观众看到的那一页，记不住下一页是什么、这页该讲什么、讲了多久。`seele-s-html` 补的就是这块，而且**与生成器解耦**——你不必换工具、不必重做 deck，做完了再套上即可。

---

## 安装

### 方式一：作为 Claude Code Skill（推荐）

```bash
git clone https://github.com/littlebordercollie/seele-s-html.git \
  ~/.claude/skills/seele-s-html
```

之后在 Claude Code 里，做完一版满意的 HTML deck，直接说：

> 给这个 deck 加个演讲者模式 / 把 S 功能加上 / 加逐字稿提词器

Claude 会自动调用本 skill 完成注入。

### 方式二：纯命令行（不依赖 Claude Code）

它本质就是一个零依赖的 Python3 脚本，clone 到任何地方直接跑：

```bash
git clone https://github.com/littlebordercollie/seele-s-html.git
python3 seele-s-html/scripts/inject.py <你的deck.html>
```

只需要 Python 3，无需 pip install。

---

## 用法

```bash
python3 scripts/inject.py <deck.html> [--notes notes.md] [--out out.html]
```

产出 `<deck>.presenter.html`——浏览器打开，按 **S** 进入演讲者模式。

**逐字稿 `--notes`：**
- `.json`：字符串数组，每项对应一页
- `.md`：用 `\n---\n` 分页
- 不给时：自动尝试从 deck 里已有的 `<aside class="notes">` 抽取；都没有则逐字稿留空（演讲窗仍可用）

### 常见 deck 的参数

大多数 `.slide` + `active` class 的 deck **默认参数即可**。少数需要微调：

| 情况 | 参数 |
|---|---|
| 页元素 class 不同 | `--slide-selector '.your-slide' --active-class 'is-active'` |
| 当前页写在指示器上（如 nav 圆点） | `--index-selector '#nav .dot'` |
| 当前页写在属性上 | `--active-attr 'data-active'`（或 `aria-current`） |
| deck 不认方向键（只认 Space/PageDown） | `--next-key Space --prev-key PageUp` |
| 横滑轨 + JS 入场动画，预览空白 | `--preview-call <你的静态模式函数> --preview-class <class>` |
| 有 chrome（进度条/页脚）没自动藏干净 | `--hide '.your-progress,.your-footer'` |

---

## 它怎么工作（三段适配兜底）

注入的 `presenter-core.js` 在运行时按优先级找「翻页接口」：

1. **契约**（最干净）：deck 暴露 `window.__deck = { total, current(), goto(n) }` → 直接调用，瞬跳。
2. **全局 deck**：存在 `window.deck.show(n)` → 用它。
3. **通用探测**：认 `.slide` + `active` class；跳页靠**派发 `←` `→` 键盘事件**驱动 deck 自己的翻页逻辑（因此不打乱它内部页码），当前页靠 `MutationObserver` 观察 class 变化上报。**覆盖绝大多数 deck。**

- **预览**：给 deck 加 `?__pv=N` 参数 = 只渲染第 N 页并隐藏 chrome，供演讲窗用 iframe 抓当前页/下一页做像素级预览（和观众看到的同一套 CSS/字体）。
- **同步**：主窗与演讲窗走 `BroadcastChannel`（每个 deck 独立 channel），双向。
- **自包含**：注入是纯内联 JS/CSS，不新增外部文件。

想让你的新生成器**最稳最快**地兼容？实现 3 行契约即可，见 [`references/adapter-contract.md`](references/adapter-contract.md)。

---

## 兼容性（实测）

| deck 来源 | 结果 | 说明 |
|---|---|---|
| frontend-slides 类（`.slide.active` + opacity 切换） | ✅ | 默认参数即可 |
| huashu 类 | ✅ | 默认参数即可 |
| guizang 类（横滑轨 + Motion One 入场动画） | ✅ | 需预设：`--index-selector` 读 nav 圆点 + `--preview-call` 取消入场动画显形 |

**规律**：opacity/display 切换型 deck → 默认即可；横滑轨 + JS 逐元素入场动画型 → 加上面 guizang 那套预设。最稳永远是让 deck 实现 3 行 `window.__deck` 契约，走瞬跳路径。

---

## 边界（说清楚，别硬上）

- **只吃 HTML deck**：非网页产物（PNG 图片流、`.pptx`）没有浏览器运行时可挂钩，射程外。
- 演讲窗用 `window.open` 弹窗，浏览器可能拦——首次按 S 若无反应，允许该页弹窗后再按。
- headless 环境无法弹窗；验证预览机制可用 `<deck>.presenter.html?__pv=N` 直接截图。

---

## 目录

```
seele-s-html/
├── SKILL.md                        # Claude Code skill 定义（触发词 / 用法）
├── scripts/inject.py               # 注入器（零依赖 Python3）
├── assets/presenter-core.js        # 注入到 deck 的演讲者模式运行时
└── references/adapter-contract.md  # 给生成器作者：3 行契约让 deck 原生兼容
```

---

## License

[MIT](LICENSE) © Seele

欢迎 issue / PR。如果你把它接到了某个新的 HTML PPT 生成器上，欢迎回来补一行兼容性记录。
