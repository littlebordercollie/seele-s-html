#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
seele-s-html · inject.py
给任意"幻灯片式 HTML deck"注入 S 演讲者模式（双窗 + 逐字稿 + 计时器）。

用法：
  python3 inject.py <deck.html> [选项]

选项：
  --notes PATH          逐字稿来源。.json = 字符串数组；.md = 用 "\\n---\\n" 分隔每页。
                        不给则：① 尝试从 deck 里已有的 <aside class="notes"> 抽取；② 都没有则留空。
  --out PATH            输出路径。默认 <deck>.presenter.html
  --slide-selector CSS  幻灯片选择器（默认 .slide）
  --active-class NAME   "当前页"的 class（默认 active）
  --channel NAME        BroadcastChannel 名（默认 seele-s-<文件名>）
  --hide SEL[,SEL...]   预览模式额外要隐藏的 chrome 选择器（逗号分隔）

退出码 0 = 成功。stdout 打印注入摘要。
"""
import sys, os, re, json, argparse, hashlib, html as _html

HERE = os.path.dirname(os.path.abspath(__file__))
CORE = os.path.join(HERE, '..', 'assets', 'presenter-core.js')

# chrome 隐藏改由 core.js 的 hideChrome 在预览里精准处理(脱流+非slide+非背景)，
# 不再用 class 名子串匹配——那会误伤 credit/editorial/.slide-footer 等正文(RT1-2)。
# 这里的 build_hide_css 只放用户显式 --hide 的选择器。

def extract_inline_notes(html):
    """从 deck 已有的 <aside class="notes"> 抽取逐字稿，折叠空白。"""
    blocks = re.findall(r'<aside[^>]*class="[^"]*notes[^"]*"[^>]*>(.*?)</aside>', html, re.S | re.I)
    out = []
    for b in blocks:
        t = re.sub(r'<[^>]+>', '', b)
        t = _html.unescape(t)
        t = ' '.join(t.split())
        out.append(t)
    return out

def load_notes(path):
    raw = open(path, encoding='utf-8').read()
    if path.lower().endswith('.json'):
        data = json.loads(raw)
        if not isinstance(data, list):
            raise ValueError('--notes .json 必须是字符串数组')
        return [' '.join(str(x).split()) for x in data]
    # markdown：按 \n---\n 分页
    parts = re.split(r'\n-{3,}\n', raw)
    return [' '.join(p.split()) for p in parts if p.strip()]

def build_hide_css(extra_selectors):
    if not extra_selectors:
        return "<style>html[data-seele-preview]{cursor:default}</style>"
    sels = ['html[data-seele-preview] %s' % s for s in extra_selectors]
    return ("<style>\n/* seele-s-html · 预览额外隐藏(用户显式 --hide) */\n"
            + ',\n'.join(sels) + "{ display:none !important; }\n"
            + "html[data-seele-preview]{ cursor:default; }\n</style>")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('deck')
    ap.add_argument('--notes')
    ap.add_argument('--out')
    ap.add_argument('--slide-selector', default='.slide')
    ap.add_argument('--active-class', default='active')
    ap.add_argument('--channel')
    ap.add_argument('--hide', default='')
    # 复杂 deck 用：当前页指示器与 slide 分离(如归藏的 #nav .dot)、预览需加静态 class
    ap.add_argument('--index-selector', default='',
                    help="当 .slide 不带 active 时，读当前页用的指示器元素(如归藏 '#nav .dot')")
    ap.add_argument('--index-active', default='active', help='指示器"当前"的 class(默认 active)')
    ap.add_argument('--preview-class', default='',
                    help="预览模式给 body 加的 class，用 deck 自带的静态/无动画模式(如归藏 'low-power')强制内容可见并去掉翻页动画")
    ap.add_argument('--preview-call', default='',
                    help="预览模式异步调用的 window 函数名(传 true)。用 deck 自带的静态模式开关(如归藏 '__setLowPowerMode')，它会取消 WAAPI 入场动画让内容显形。比 --preview-class 更彻底")
    # deck 不认方向键 / 当前页写在属性上时用
    ap.add_argument('--next-key', default='ArrowRight',
                    help="翻下一页的键(deck 只认 Space/PageDown/n/j 时改这个；'Space' 表示空格)")
    ap.add_argument('--prev-key', default='ArrowLeft', help='翻上一页的键')
    ap.add_argument('--active-attr', default='',
                    help="当前页写在属性上时用(如 'data-active' / 'aria-current')——有此属性且非 'false' 的 slide 视为当前页")
    a = ap.parse_args()

    if not os.path.isfile(a.deck):
        print('❌ 找不到 deck: ' + a.deck); sys.exit(1)
    html = open(a.deck, encoding='utf-8').read()

    # 逐字稿
    note_src = 'empty'
    if a.notes:
        notes = load_notes(a.notes); note_src = a.notes
    else:
        notes = extract_inline_notes(html)
        note_src = 'deck 内嵌 <aside class=notes>' if notes else 'none'

    # channel 掺入绝对路径短哈希，避免两个同名文件(index.html)在同浏览器串台(RT1-5)
    pathkey = hashlib.md5(os.path.abspath(a.deck).encode('utf-8')).hexdigest()[:6]
    channel = a.channel or ('seele-s-' + re.sub(r'[^A-Za-z0-9_-]', '-', os.path.basename(a.deck)) + '-' + pathkey)
    extra_hide = [s.strip() for s in a.hide.split(',') if s.strip()]

    core_js = open(CORE, encoding='utf-8').read()
    # 护栏：core 内联进 <script> 后，任何字面 </script（注释/字符串里都可能有）都会被 HTML 解析器
    # 当成外层脚本收尾而截断。统一转 <\/script（JS 里 \/ == /，字符串/注释里等价无害），根治自截断。
    core_js = re.sub(r'</script', r'<\\/script', core_js, flags=re.I)
    cfg = {
        'slideSelector': a.slide_selector,
        'activeClass': a.active_class,
        'channel': channel,
        'notes': notes,
        'indexSelector': a.index_selector,
        'indexActive': a.index_active,
        'previewClass': a.preview_class,
        'previewCall': a.preview_call,
        'nextKey': a.next_key,
        'prevKey': a.prev_key,
        'activeAttr': a.active_attr,
    }
    cfg_json = json.dumps(cfg, ensure_ascii=False).replace('</', '<\\/')  # 防 </script> 截断

    injection = (
        "\n" + build_hide_css(extra_hide) + "\n"
        + "<script>window.__SEELE_S=" + cfg_json + ";</script>\n"
        + "<script>\n/* seele-s-html injected */\n" + core_js + "\n</script>\n"
    )

    # head 守卫：预览 iframe 里、deck 脚本运行前把 localStorage 写入 no-op，防"用 localStorage 记当前页"
    # 的 deck(如 huashu)三窗互相踩 key。只堵 setItem(写)——不动 getItem，否则会撑挂做存储可用性自检的 deck(RT1-3B)。
    guard = ("<script>if(new URLSearchParams(location.search).has('__pv')){"
             "try{Storage.prototype.setItem=function(){};}catch(e){}}</script>\n")
    m = re.search(r'<head[^>]*>', html, re.I)
    if m:
        html = html[:m.end()] + '\n' + guard + html[m.end():]
    else:
        # 无 <head>：插到 <!doctype> 之后(不能插它之前，否则 doctype 前有内容→quirks mode 布局错乱 RT1-6)
        dm = re.search(r'<!doctype[^>]*>', html, re.I)
        if dm:
            html = html[:dm.end()] + '\n' + guard + html[dm.end():]
        else:
            html = guard + html

    # 用最后一个 </body>：避免命中 deck JS 字符串 / <pre> 里展示的字面 </body>(RT1-7)
    bidx = html.rfind('</body>')
    if bidx != -1:
        out_html = html[:bidx] + injection + html[bidx:]
    else:
        out_html = html + injection

    out_path = a.out or (os.path.splitext(a.deck)[0] + '.presenter.html')
    open(out_path, 'w', encoding='utf-8').write(out_html)

    # 自校验：字面 </script> 应为 原有 + 我注入的 2 个（config + core）
    print('✅ 注入完成')
    print('  输出       : ' + out_path)
    print('  幻灯选择器 : %s   当前页 class: %s' % (a.slide_selector, a.active_class))
    print('  逐字稿     : %d 页（来源: %s）' % (len(notes), note_src))
    print('  Channel    : ' + channel)
    print('  额外隐藏   : ' + (', '.join(extra_hide) if extra_hide else '（无，用默认启发式）'))
    lit = out_html.count('</script>')
    print('  自校验     : 字面 </script> = %d（含注入的 2 个 script 收尾）' % lit)
    print('  用法       : 浏览器打开输出文件，按 S 开演讲者模式；← → 双窗同步')

if __name__ == '__main__':
    main()
