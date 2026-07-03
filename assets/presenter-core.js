/* =========================================================
   seele-s-html · presenter-core  (deck-agnostic)
   给任意"幻灯片式 HTML"补上演讲者模式：
   - ?__pv=N 单页预览（供演讲窗 iframe 抓当前页/下一页）
   - S 键弹演讲者双窗：CURRENT / NEXT / 逐字稿 / 计时器
   - BroadcastChannel 主窗<->演讲窗双向同步
   适配三段兜底（见 buildNav）：
   1) 契约  window.__deck = {total,current(),goto(n)}   —— 最干净
   2) 全局  window.deck.show(n)                          —— frontend-slides 家族
   3) 通用  .slide + active-class + 键盘方向键派发        —— 覆盖绝大多数
   ========================================================= */
(function(){
  var params = new URLSearchParams(location.search);
  var PREVIEW = params.has('__pv');
  var CFG = window.__SEELE_S || {};
  var SEL    = CFG.slideSelector || '.slide';
  var ACT    = CFG.activeClass   || 'active';
  var IDXSEL = CFG.indexSelector || '';       // 当 .slide 不带 active 时的当前页指示器(如归藏 #nav .dot)
  var IDXACT = CFG.indexActive   || 'active';
  var ACTATTR= CFG.activeAttr    || '';        // 当前页写在属性上(如 data-active / aria-current)时用
  var PVCLS  = CFG.previewClass  || '';        // 预览给 body 加的静态 class(如归藏 low-power)
  var PVCALL = CFG.previewCall   || '';        // 预览异步调用的 window 静态模式函数(如归藏 __setLowPowerMode)
  var NKEY   = CFG.nextKey || 'ArrowRight';    // 翻下一页的键(可配 Space/PageDown/'n' 等)
  var PKEY   = CFG.prevKey || 'ArrowLeft';
  var NOTES = CFG.notes || [];
  var CH    = CFG.channel || ('seele-s-' + location.pathname);

  var KEYCODE = { ArrowRight:39, ArrowLeft:37, ArrowUp:38, ArrowDown:40, ' ':32, Space:32, PageDown:34, PageUp:33, Enter:13, n:78, p:80, j:74, k:75 };
  function slides(){ return Array.prototype.slice.call(document.querySelectorAll(SEL)); }
  function total(){
    if(window.__deck && typeof window.__deck.total === 'number' && window.__deck.total > 0) return window.__deck.total;
    return slides().length;
  }
  function indexEls(){ return IDXSEL ? Array.prototype.slice.call(document.querySelectorAll(IDXSEL)) : []; }
  function curIdx(){
    if(window.__deck && typeof window.__deck.current === 'function') return window.__deck.current();
    var s = slides(), i;
    for(i=0;i<s.length;i++){ if(s[i].classList.contains(ACT)) return i; }
    if(ACTATTR){ for(i=0;i<s.length;i++){ var v=s[i].getAttribute(ACTATTR); if(v!==null && v!=='false') return i; } }
    var d = indexEls();                        // slide 不带 active → 退到指示器(nav dots 等)
    for(i=0;i<d.length;i++){ if(d[i].classList.contains(IDXACT)) return i; }
    return 0;
  }
  var _target = 0, _stepping = false;
  function _mkKey(k){
    var key = (k==='Space') ? ' ' : k, code = (k===' '||k==='Space') ? 'Space' : k, cc = KEYCODE[k] || 0;
    return new KeyboardEvent('keydown', { key:key, code:code, keyCode:cc, which:cc, bubbles:true, cancelable:true });
  }
  function _sendKey(fwd){
    var k = fwd ? NKEY : PKEY;
    document.dispatchEvent(_mkKey(k));
    // 有些 deck 把监听挂在聚焦元素/舞台容器上(不在 document/window) → 补派发一份
    var ae = document.activeElement;
    if(ae && ae !== document.body && ae !== document.documentElement){ try{ ae.dispatchEvent(_mkKey(k)); }catch(e){} }
  }
  function _step(){
    _stepping = true;
    var c = curIdx();
    if(c === _target){ _stepping = false; return; }
    var dir = _target > c;
    _sendKey(dir);
    // 确认式步进 + 退避重发 + 封顶：翻过去(curIdx 变)立刻下一格；没动就按"越来越长"的间隔重发
    // (退避避免顶住 debounce 锁)；重发够 8 次仍不动 → 判定翻不动，放弃并告警，杜绝无限空烧(RT1-4)。
    var waited = 0, nextResend = 300, resends = 0;
    (function poll(){
      if(curIdx() !== c){ setTimeout(_step, 25); return; }
      waited += 60;
      if(waited >= nextResend){
        if(resends >= 8){
          _stepping = false;
          if(window.console) console.warn('[seele-s-html] goto 卡住：deck 对翻页键无响应。检查 --next-key/--prev-key，或让 deck 实现契约 window.__deck');
          return;
        }
        _sendKey(dir); resends++;
        nextResend = waited + Math.min(300 * (resends + 1), 1400);   // 退避
      }
      setTimeout(poll, 60);
    })();
  }
  function goto(n){
    n = Math.max(0, Math.min(n, total()-1));
    if(window.__deck && typeof window.__deck.goto === 'function'){ window.__deck.goto(n); return; }
    // window.deck.show：排除 DOM 元素——<div id="deck">/<dialog id="deck"> 会被具名 id 自动挂到 window.deck(RT2-T8)
    if(window.deck && typeof window.deck.show === 'function' && !(window.deck instanceof Element)){ window.deck.show(n); return; }
    _target = n;
    if(!_stepping) _step();
  }
  function onChange(cb){
    var container = (slides()[0] && slides()[0].parentNode) || document.body;
    try{
      var mo = new MutationObserver(function(){ cb(curIdx()); });
      mo.observe(container, {attributes:true, attributeFilter:['class'], subtree:true, childList:true});
      indexEls().forEach(function(el){ mo.observe(el, {attributes:true, attributeFilter:['class']}); });
    }catch(e){}
    // 轮询兜底：状态写在属性/scroll/hash、契约只有 goto 没 current、或 DOM 被重建 →
    // MutationObserver 覆盖不到，定时查 curIdx 变化补上(覆盖 RT2-T9/T3、RT1-8)。
    var last = curIdx();
    setInterval(function(){ var i = curIdx(); if(i !== last){ last = i; cb(i); } }, 300);
  }

  /* ---------- 预览模式：演讲窗的 iframe 里跑的就是这支 ---------- */
  if(PREVIEW){
    document.documentElement.setAttribute('data-seele-preview','1');
    // 静态 class(如归藏 low-power)：强制内容可见 + 去掉翻页动画/锁。加在 goto 之前，翻页从一开始就瞬时。
    if(PVCLS){
      var assertCls = function(){ try{ document.body.classList.add(PVCLS); }catch(e){} };
      assertCls(); setTimeout(assertCls, 80); setTimeout(assertCls, 400);
    }
    // 静态模式函数(如归藏 __setLowPowerMode)：取消 WAAPI 入场动画让内容显形。
    // deck 用 module(延迟执行)注册它 + 会在 init/翻页时重启动画，故异步多次调用兜住。
    if(PVCALL){
      var callStatic = function(){ try{ if(typeof window[PVCALL]==='function') window[PVCALL](true); }catch(e){} };
      [0,150,400,900,1600].forEach(function(t){ setTimeout(callStatic, t); });
    }
    var target = parseInt(params.get('__pv'),10) || 0;
    // 隐藏 chrome：脱离文档流(fixed/sticky/absolute)且不属于幻灯的元素 = 进度条/页码/提示/边栏。
    // 三条豁免：① 含 slide=舞台容器；② 在 slide 内=正文；③ 背景层(canvas/video/近全屏)——都留(修 RT1-2/T7)。
    function isBg(el){
      var t = el.tagName;
      if(t==='CANVAS'||t==='VIDEO'||t==='IMG'||t==='SVG') return true;
      var r = el.getBoundingClientRect();
      return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
    }
    function hideChrome(){
      try{
        Array.prototype.forEach.call(document.body.querySelectorAll('*'), function(el){
          if(el.querySelector && el.querySelector(SEL)) return;   // 含 slide = 舞台容器，留
          if(el.closest && el.closest(SEL)) return;               // 在 slide 内 = 正文，留
          if(isBg(el)) return;                                    // 背景层，留
          var cs = window.getComputedStyle(el);
          if(cs.position === 'fixed' || cs.position === 'sticky' || cs.position === 'absolute'){
            el.style.setProperty('display','none','important');
          }
        });
      }catch(e){}
    }
    goto(target);
    setTimeout(hideChrome, 120);
    setTimeout(hideChrome, 750);
    window.addEventListener('message', function(e){
      var d = e.data || {};
      if(d && d.type === 'pv-goto' && typeof d.idx === 'number'){ goto(d.idx); setTimeout(hideChrome, 120); }
    });
    return;
  }

  /* ---------- 主窗：S 键 + 同步 ---------- */
  if(typeof BroadcastChannel === 'undefined') return;
  var bc = new BroadcastChannel(CH);
  var pwin = null;

  onChange(function(idx){ bc.postMessage({type:'main-goto', idx:idx}); });
  bc.onmessage = function(e){
    var d = e.data || {};
    if(d.type === 'presenter-goto' && typeof d.idx === 'number'){ goto(d.idx); }
    else if(d.type === 'presenter-hello'){ bc.postMessage({type:'main-goto', idx:curIdx()}); }
  };

  function openPresenter(){
    if(pwin && !pwin.closed){ pwin.focus(); return; }
    var base = location.href.split('?')[0].split('#')[0];
    pwin = window.open('', 'seele-s-presenter', 'width=1340,height=880');
    if(!pwin){ alert('演讲者窗口被浏览器拦了，允许弹窗后再按 S~'); return; }
    pwin.document.write(POPUP(base, total(), NOTES, CH));
    pwin.document.close();
    setTimeout(function(){ bc.postMessage({type:'main-goto', idx:curIdx()}); }, 250);
  }

  document.addEventListener('keydown', function(e){
    if(document.body.classList.contains('editing')) return;
    if((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey){
      var t = e.target;
      if(t && t.getAttribute && t.getAttribute('contenteditable') === 'true') return;
      e.preventDefault(); openPresenter();
    }
  });

  /* ---------- 演讲窗 HTML 工厂 ---------- */
  function POPUP(base, tot, notes, ch){
    // 嵌进演讲窗内联脚本的字符串必须把 "<slash" 转义成 "<backslash-slash"，否则逐字稿里含字面闭合脚本标签会提前关脚本、整窗报废(RT1-1)。本注释刻意不写该标签字面量以免自截断。
    var esc = function(x){ return JSON.stringify(x).replace(/<\//g, '<\\/'); };
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>演讲者模式</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0d10;color:#eee;font-family:'Noto Sans SC',system-ui,sans-serif;height:100vh;overflow:hidden;position:relative}
.card{background:#17171b;border:1px solid rgba(255,255,255,.14);border-radius:14px;overflow:hidden;position:absolute;display:flex;flex-direction:column;box-shadow:0 14px 44px rgba(0,0,0,.55);resize:both;min-width:240px;min-height:150px}
.card>.head{background:#212127;padding:9px 15px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace;cursor:move;display:flex;justify-content:space-between;align-items:center;user-select:none;flex:0 0 auto}
.card>.body{flex:1;overflow:auto;position:relative;min-height:0}
.card.cur>.head{color:#ff5a3c}.card.next>.head{color:#e0b84b}.card.script>.head{color:#eee}.card.timer>.head{color:#8a8a94}
.fwrap{position:relative;width:100%;height:100%;overflow:hidden;background:#000}
iframe.frame{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;display:block;pointer-events:none}
#script{padding:26px 32px;font-size:29px;line-height:1.7;white-space:pre-wrap}
#timer{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px}
#clock{font-family:'IBM Plex Mono',monospace;font-size:66px}
#meta{font-family:'IBM Plex Mono',monospace;font-size:19px;color:#8a8a94;letter-spacing:.1em}
.btns{margin-top:14px}.btns button{background:#212127;border:1px solid rgba(255,255,255,.22);color:#eee;border-radius:8px;padding:8px 18px;font-size:15px;cursor:pointer;font-family:'IBM Plex Mono',monospace}
.btns button:hover{border-color:#ff5a3c;color:#ff5a3c}
.tip{position:fixed;bottom:8px;left:50%;transform:translateX(-50%);font-size:12px;color:#8a8a94;font-family:'IBM Plex Mono',monospace}
</style></head><body>
<div class="card cur" style="left:18px;top:18px;width:640px;height:400px"><div class="head" data-h><span>&#9654; CURRENT · 当前页</span><span data-i>1/${tot}</span></div><div class="body"><div class="fwrap"><iframe class="frame" id="fCur"></iframe></div></div></div>
<div class="card next" style="left:678px;top:18px;width:560px;height:352px"><div class="head" data-h><span>NEXT · 下一页</span><span></span></div><div class="body"><div class="fwrap"><iframe class="frame" id="fNext"></iframe></div></div></div>
<div class="card script" style="left:18px;top:436px;width:860px;height:406px"><div class="head" data-h><span>SPEAKER SCRIPT · 逐字稿</span><span></span></div><div class="body"><div id="script"></div></div></div>
<div class="card timer" style="left:898px;top:392px;width:340px;height:270px"><div class="head" data-h><span>TIMER · 计时</span><span></span></div><div class="body"><div id="timer"><div id="clock">00:00</div><div id="meta">第 1 / ${tot} 页</div><div class="btns"><button id="reset">R · 归零</button></div></div></div></div>
<div class="tip">← → 翻页(同步观众)  ·  R 计时归零  ·  Esc 关闭</div>
<script>
var BASE=${esc(base)}, TOTAL=${tot}, NOTES=${esc(notes)}, CH=${esc(ch)};
var idx=0, t0=Date.now();
var bc=new BroadcastChannel(CH);
var fCur=document.getElementById('fCur'), fNext=document.getElementById('fNext');
fCur.src=BASE+'?__pv=0'; fNext.src=BASE+'?__pv=1';
function scaleFrame(f){var w=f.parentNode;if(!w||!w.clientWidth)return;var s=Math.min(w.clientWidth/1920,w.clientHeight/1080);var ox=(w.clientWidth-1920*s)/2,oy=(w.clientHeight-1080*s)/2;f.style.transform='translate('+ox+'px,'+oy+'px) scale('+s+')';}
function scaleAll(){scaleFrame(fCur);scaleFrame(fNext);}
if(window.ResizeObserver){var ro=new ResizeObserver(scaleAll);ro.observe(fCur.parentNode);ro.observe(fNext.parentNode);}
window.addEventListener('resize',scaleAll);
setTimeout(scaleAll,120); setTimeout(scaleAll,700);
function fmt(ms){var s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function tick(){document.getElementById('clock').textContent=fmt(Date.now()-t0);}
setInterval(tick,500); tick();
function render(){
  document.querySelector('[data-i]').textContent=(idx+1)+'/'+TOTAL;
  document.getElementById('meta').textContent='第 '+(idx+1)+' / '+TOTAL+' 页';
  document.getElementById('script').textContent=(NOTES[idx]||'(这一页没有逐字稿)');
  try{fCur.contentWindow.postMessage({type:'pv-goto',idx:idx},'*');}catch(e){}
  try{fNext.contentWindow.postMessage({type:'pv-goto',idx:Math.min(idx+1,TOTAL-1)},'*');}catch(e){}
}
bc.onmessage=function(e){var d=e.data||{};if(d.type==='main-goto'&&typeof d.idx==='number'){idx=d.idx;render();}};
bc.postMessage({type:'presenter-hello'});
function go(n){idx=Math.max(0,Math.min(n,TOTAL-1));bc.postMessage({type:'presenter-goto',idx:idx});render();}
document.addEventListener('keydown',function(e){
  if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' '){e.preventDefault();go(idx+1);}
  else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();go(idx-1);}
  else if(e.key==='r'||e.key==='R'){t0=Date.now();tick();}
  else if(e.key==='Escape'){window.close();}
});
document.getElementById('reset').onclick=function(){t0=Date.now();tick();};
document.querySelectorAll('.card').forEach(function(card){
  var h=card.querySelector('[data-h]'),sx,sy,ox,oy,drag=false;
  h.addEventListener('mousedown',function(e){drag=true;sx=e.clientX;sy=e.clientY;ox=card.offsetLeft;oy=card.offsetTop;e.preventDefault();});
  window.addEventListener('mousemove',function(e){if(!drag)return;card.style.left=(ox+e.clientX-sx)+'px';card.style.top=(oy+e.clientY-sy)+'px';});
  window.addEventListener('mouseup',function(){drag=false;});
});
render();
` + '<' + '/script></body></html>';
  }
})();
