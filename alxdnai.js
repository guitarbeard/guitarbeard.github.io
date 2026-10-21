// alxdnAI chat widget. Stays hidden unless the API answers its health check, so the site
// never shows a broken chat. API base comes from <meta name="alxdnai-api">, or ?ai=<url> for testing.
(function () {
  var meta = document.querySelector('meta[name="alxdnai-api"]');
  var params = new URLSearchParams(location.search);
  var api = (params.get('ai') || (meta && meta.content) || '').replace(/\/$/, '');
  var root = document.getElementById('alx');
  if (!api || !root || !window.fetch || !window.TextDecoder) return;

  var css = '' +
    '.ai-launch{position:fixed;right:20px;bottom:20px;z-index:20;display:inline-flex;align-items:center;gap:10px;padding:14px 22px;border:0;border-radius:999px;background:var(--accent);color:var(--on-accent);font:inherit;font-size:16px;font-weight:600;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.18);transition:box-shadow .2s,transform .2s}' +
    '.ai-launch:hover,.ai-launch:focus-visible{box-shadow:0 0 0 2px var(--bg),0 0 0 4px var(--accent),0 8px 28px rgba(0,0,0,.18)}' +
    '.ai-launch[hidden],.ai-panel[hidden]{display:none}' +
    '.ai-brand{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;letter-spacing:-.02em}' +
    '.ai-panel{position:fixed;right:20px;bottom:20px;z-index:21;width:min(400px,calc(100vw - 32px));height:min(600px,calc(100vh - 40px));display:flex;flex-direction:column;background:var(--tile);color:var(--ink);border:1.5px solid var(--line);border-radius:20px;box-shadow:0 18px 60px rgba(0,0,0,.25);overflow:hidden}' +
    '.ai-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}' +
    '.ai-head .ai-brand{font-size:22px}' +
    '.ai-close{width:40px;height:40px;border-radius:999px;border:1.5px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:20px;line-height:1;cursor:pointer}' +
    '.ai-close:hover,.ai-close:focus-visible{border-color:var(--accent);color:var(--accent)}' +
    '.ai-log{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:12px;font-size:15.5px;line-height:1.5}' +
    '.ai-note{margin:0;color:var(--muted);font-size:13.5px}' +
    '.ai-msg{max-width:88%;padding:10px 14px;border-radius:16px;white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.ai-msg.user{align-self:flex-end;background:var(--ink);color:var(--bg);border-bottom-right-radius:6px}' +
    '.ai-msg.bot{align-self:flex-start;background:var(--bg);color:var(--text);border:1px solid var(--line);border-bottom-left-radius:6px}' +
    '.ai-msg a{color:var(--accent)}' +
    '.ai-status{align-self:flex-start;font-family:"JetBrains Mono",monospace;font-size:12.5px;color:var(--muted)}' +
    '.ai-chips{display:flex;flex-wrap:wrap;gap:8px}' +
    '.ai-chip{padding:8px 12px;border-radius:999px;border:1.5px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:14px;cursor:pointer;text-align:left}' +
    '.ai-chip:hover,.ai-chip:focus-visible{border-color:var(--accent);color:var(--accent)}' +
    '.ai-form{display:flex;gap:8px;padding:12px;border-top:1px solid var(--line)}' +
    '.ai-input{flex:1;min-width:0;padding:12px 14px;border-radius:999px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font:inherit;font-size:16px}' +
    '.ai-input:focus{outline:2px solid var(--accent);outline-offset:1px}' +
    '.ai-send{padding:0 18px;border:0;border-radius:999px;background:var(--accent);color:var(--on-accent);font:inherit;font-weight:600;cursor:pointer}' +
    '.ai-send:disabled{opacity:.5;cursor:default}' +
    '@media (max-width:520px){.ai-panel{right:8px;left:8px;bottom:8px;width:auto;height:min(78vh,620px)}.ai-launch{right:16px;bottom:16px}}' +
    '@media (prefers-reduced-motion:reduce){.ai-launch{transition:none}}';

  var STATUS = { search_work: 'Looking through Alex’s work…', get_profile: 'Checking Alex’s profile…', get_contact: 'Getting contact details…' };
  var EXAMPLES = ['What did Alex build for SKIMS?', 'What’s Alex’s tech stack?', 'Has Alex built AI agents?', 'How can I contact Alex?'];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  // Builds text with clickable emails and URLs, without ever parsing model output as HTML.
  function setRich(node, text) {
    node.textContent = '';
    var re = /([\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/[^\s)]+|\b(?:alxdna\.dev|mapsonmaps\.com)\b[^\s)]*)/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var raw = m[0].replace(/[.,;:]+$/, '');
      var a = document.createElement('a');
      a.href = raw.indexOf('@') > 0 ? 'mailto:' + raw : (/^https?:/.test(raw) ? raw : 'https://' + raw);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = raw;
      node.appendChild(a);
      last = m.index + raw.length;
      re.lastIndex = last;
    }
    node.appendChild(document.createTextNode(text.slice(last)));
  }

  var sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var history = [];
  var busy = false;
  var launch, panel, log, input, send, chips;

  function build() {
    var style = el('style');
    style.textContent = css;
    document.head.appendChild(style);

    launch = el('button', 'ai-launch');
    launch.type = 'button';
    launch.hidden = true;
    launch.setAttribute('aria-haspopup', 'dialog');
    launch.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path></svg><span>Ask <span class="ai-brand">alxdn<b>AI</b></span></span>';

    panel = el('div', 'ai-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat with alxdnAI');

    var head = el('div', 'ai-head');
    var title = el('div');
    title.innerHTML = '<div class="ai-brand">alxdn<span style="color:var(--accent)">AI</span></div>';
    var close = el('button', 'ai-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close chat');
    head.appendChild(title);
    head.appendChild(close);

    log = el('div', 'ai-log');
    log.setAttribute('aria-live', 'polite');
    log.appendChild(el('div', 'ai-msg bot', 'Hi! I’m alxdnAI, an AI agent Alex built. Ask me about Alex’s work, skills, or experience.'));
    log.appendChild(el('p', 'ai-note', 'I run on Alex’s own server and answer from Alex’s resume and this site. I can still get things wrong. Chats are saved so Alex can improve my answers, so please don’t share personal details.'));
    chips = el('div', 'ai-chips');
    EXAMPLES.forEach(function (q) {
      var c = el('button', 'ai-chip', q);
      c.type = 'button';
      c.addEventListener('click', function () { ask(q); });
      chips.appendChild(c);
    });
    log.appendChild(chips);

    var form = el('form', 'ai-form');
    input = el('input', 'ai-input');
    input.type = 'text';
    input.maxLength = 800;
    input.placeholder = 'Ask about Alex’s work';
    input.setAttribute('aria-label', 'Your question');
    send = el('button', 'ai-send', 'Send');
    send.type = 'submit';
    form.appendChild(input);
    form.appendChild(send);

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(form);
    root.appendChild(launch);
    root.appendChild(panel);

    launch.addEventListener('click', open);
    close.addEventListener('click', shut);
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') shut(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ask(input.value);
    });
  }

  function open() {
    panel.hidden = false;
    launch.hidden = true;
    input.focus();
  }
  function shut() {
    panel.hidden = true;
    launch.hidden = false;
    launch.focus();
  }
  function scroll() { log.scrollTop = log.scrollHeight; }

  function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    send.disabled = true;
    input.value = '';
    if (chips.parentNode) chips.parentNode.removeChild(chips);
    log.appendChild(el('div', 'ai-msg user', text));
    history.push({ role: 'user', content: text });
    var status = el('div', 'ai-status', 'Thinking…');
    var bubble = el('div', 'ai-msg bot');
    log.appendChild(status);
    scroll();
    var answer = '';

    function finish(reply, isError) {
      if (status.parentNode) status.parentNode.removeChild(status);
      if (!bubble.parentNode) log.appendChild(bubble);
      setRich(bubble, reply);
      if (!isError) history.push({ role: 'assistant', content: reply });
      else history.pop();
      busy = false;
      send.disabled = false;
      scroll();
      input.focus();
    }

    fetch(api + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, messages: history.slice(-12) })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (b) {
          finish(b.error || 'Sorry, I couldn’t answer that. You can email Alex at alxdna@gmail.com.', true);
        });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      var done = false;
      function handle(event, data) {
        if (event === 'queued' && data.position > 0) status.textContent = 'Waiting for a free spot…';
        else if (event === 'tool') status.textContent = STATUS[data.name] || 'Looking that up…';
        else if (event === 'reset') { answer = ''; if (bubble.parentNode) bubble.parentNode.removeChild(bubble); }
        else if (event === 'delta') {
          answer += data.text;
          if (!bubble.parentNode) log.insertBefore(bubble, status);
          status.textContent = 'Typing…';
          setRich(bubble, answer);
          scroll();
        } else if (event === 'done') { done = true; finish(data.reply || answer); }
        else if (event === 'error') { done = true; finish(data.error, true); }
      }
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            if (!done) finish(answer || 'The connection dropped. Please try again.', !answer);
            return;
          }
          buf += decoder.decode(r.value, { stream: true });
          var parts = buf.split('\n\n');
          buf = parts.pop();
          parts.forEach(function (block) {
            var ev = 'message', data = '';
            block.split('\n').forEach(function (line) {
              if (line.indexOf('event:') === 0) ev = line.slice(6).trim();
              else if (line.indexOf('data:') === 0) data += line.slice(5).trim();
            });
            try { handle(ev, JSON.parse(data || '{}')); } catch (e) {}
          });
          return pump();
        });
      }
      return pump();
    }).catch(function () {
      finish('I can’t reach my server right now. You can email Alex at alxdna@gmail.com.', true);
    });
  }

  var ctrl = window.AbortController ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
  fetch(api + '/api/health', ctrl ? { signal: ctrl.signal } : {}).then(function (r) { return r.ok ? r.json() : null; }).then(function (h) {
    clearTimeout(timer);
    if (!h || !h.ok) return;
    build();
    launch.hidden = false;
  }).catch(function () {});
})();
