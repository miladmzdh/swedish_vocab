// Tiny DOM toolkit: hyperscript, bottom sheets, toasts, confetti.

export function h(tag, props, ...children) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const r of rest) {
    if (r[0] === '.') el.classList.add(r.slice(1));
    else if (r[0] === '#') el.id = r.slice(1);
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export function toast(msg, ms = 2600) {
  const host = document.getElementById('toasts');
  const t = h('div.toast', { role: 'status' }, msg);
  host.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

const sheets = [];

/** Bottom sheet. Returns a close() function. */
export function sheet(content, { onClose, tall = false } = {}) {
  const panel = h('div.sheet' + (tall ? '.tall' : ''), { role: 'dialog', 'aria-modal': 'true' }, h('div.grab'), content);
  const back = h('div.backdrop', panel);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.classList.remove('show');
    sheets.splice(sheets.indexOf(close), 1);
    setTimeout(() => back.remove(), 250);
    onClose && onClose();
  };
  back.addEventListener('click', (e) => e.target === back && close());
  // Swipe down on the grab handle to close.
  let y0 = null;
  panel.addEventListener('touchstart', (e) => (panel.scrollTop <= 0 ? (y0 = e.touches[0].clientY) : (y0 = null)), { passive: true });
  panel.addEventListener('touchend', (e) => {
    if (y0 != null && e.changedTouches[0].clientY - y0 > 90) close();
    y0 = null;
  });
  document.body.append(back);
  sheets.push(close);
  requestAnimationFrame(() => back.classList.add('show'));
  return close;
}

export const closeTopSheet = () => (sheets.length ? (sheets[sheets.length - 1](), true) : false);

export function confirmDialog(title, text, ok = 'OK', danger = false) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => {
      answered = true;
      close();
      resolve(v);
    };
    const close = sheet(
      h(
        'div.confirm',
        h('h2', title),
        text && h('p', text),
        h(
          'div.row',
          h('button.btn.ghost', { onclick: () => done(false) }, 'Cancel'),
          h('button.btn' + (danger ? '.danger' : ''), { onclick: () => done(true) }, ok),
        ),
      ),
      { onClose: () => !answered && resolve(false) },
    );
  });
}

export function confetti(n = 90) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = h('canvas.confetti');
  document.body.append(c);
  const ctx = c.getContext('2d');
  const W = (c.width = innerWidth * devicePixelRatio);
  const H = (c.height = innerHeight * devicePixelRatio);
  const colors = ['#006aa7', '#fecc00', '#ff6b6b', '#2ecc71', '#a66cff', '#ff9f43'];
  const ps = Array.from({ length: n }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 16 * devicePixelRatio,
    vy: (-Math.random() * 14 - 6) * devicePixelRatio,
    r: (Math.random() * 6 + 4) * devicePixelRatio,
    a: Math.random() * 6,
    va: (Math.random() - 0.5) * 0.4,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.45 * devicePixelRatio;
      p.x += p.vx;
      p.y += p.vy;
      p.a += p.va;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (++frame < 150) requestAnimationFrame(tick);
    else c.remove();
  };
  tick();
}

export function fmtNum(n) {
  return n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n);
}

export function ago(ts) {
  if (!ts) return 'never';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
