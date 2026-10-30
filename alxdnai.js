// alxdnAI chat widget. Stays hidden unless the API answers its health check, so the site
// never shows a broken chat. API base comes from <meta name="alxdnai-api">, or ?ai=<url> for testing.
(function () {
  var meta = document.querySelector('meta[name="alxdnai-api"]');
  var params = new URLSearchParams(location.search);
  var api = (params.get('ai') || (meta && meta.content) || '').replace(/\/$/, '');
  var root = document.getElementById('alx');
  if (!api || !root || !window.fetch || !window.TextDecoder) return;

  // Pixel style to match the site: square corners, 3px outlines, offset shadows, Silkscreen labels.
  // Uses the page's color tokens (--bg, --ink, --muted, --green, --mint, --lav, --panel-line).
  var css = '' +
    '.ai-launch{position:fixed;right:20px;bottom:20px;z-index:20;display:inline-flex;align-items:center;gap:10px;padding:10px 16px;border:3px solid var(--panel-line);background:var(--green);color:var(--bg);font:14px "Silkscreen",monospace;text-transform:uppercase;cursor:pointer;box-shadow:4px 4px 0 var(--panel-line);transition:transform .08s steps(1),box-shadow .08s steps(1)}' +
    '.ai-launch:hover{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--panel-line)}' +
    '.ai-launch:focus-visible,.ai-close:focus-visible,.ai-chip:focus-visible,.ai-send:focus-visible{outline:3px dashed var(--green);outline-offset:4px}' +
    '.ai-launch[hidden],.ai-panel[hidden]{display:none}' +
    '.ai-brand{font-family:"Pixelify Sans",monospace;font-weight:700;text-transform:none}' +
    '.ai-launch .ai-brand{font-size:17px}' +
    '.ai-brand__ai{color:var(--green)}' +
    '.ai-panel{position:fixed;right:20px;bottom:20px;z-index:21;width:min(400px,calc(100vw - 32px));height:min(600px,calc(100vh - 40px));display:flex;flex-direction:column;background:var(--bg);color:var(--ink);border:3px solid var(--panel-line);box-shadow:6px 6px 0 var(--panel-line);font-family:"Public Sans",system-ui,sans-serif}' +
    '.ai-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:var(--mint);border-bottom:3px solid var(--panel-line)}' +
    '.ai-head .ai-brand{font-size:24px}' +
    '.ai-close{display:grid;place-items:center;padding:0;width:38px;height:38px;border:3px solid var(--panel-line);background:var(--bg);color:var(--ink);font:16px "Silkscreen",monospace;line-height:1;cursor:pointer;box-shadow:3px 3px 0 var(--panel-line)}' +
    '.ai-close:hover{color:var(--green)}' +
    '.ai-close:active{transform:translate(3px,3px);box-shadow:none}' +
    '.ai-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;font-size:15.5px;line-height:1.5}' +
    '.ai-note{margin:0;color:var(--muted);font-size:13.5px}' +
    '.ai-msg{max-width:88%;padding:9px 13px;white-space:pre-wrap;overflow-wrap:anywhere;border:3px solid var(--panel-line)}' +
    '.ai-msg.user{align-self:flex-end;background:var(--ink);color:var(--bg);border-color:var(--ink)}' +
    '.ai-msg.bot{align-self:flex-start;background:var(--lav);color:var(--ink)}' +
    '.ai-msg a{color:inherit;text-underline-offset:3px}' +
    '.ai-status{align-self:flex-start;display:flex;flex-direction:column;gap:4px;font:11px "Silkscreen",monospace;text-transform:uppercase;color:var(--muted)}' +
    '.ai-status-row{display:flex;align-items:center;gap:8px}' +
    '.ai-dots{display:inline-flex;gap:4px}' +
    '.ai-dots i{width:6px;height:6px;background:var(--green);animation:ai-blink 1.2s steps(1) infinite}' +
    '.ai-dots i:nth-child(2){animation-delay:.2s}.ai-dots i:nth-child(3){animation-delay:.4s}' +
    '@keyframes ai-blink{0%,100%{opacity:.25}30%,60%{opacity:1}}' +
    '.ai-timer{font-variant-numeric:tabular-nums}' +
    '.ai-slow{font-family:"Public Sans",system-ui,sans-serif;font-size:13px;text-transform:none}' +
    '.ai-chips{display:flex;flex-wrap:wrap;gap:8px}' +
    '.ai-chip{padding:7px 11px;border:2px solid var(--panel-line);background:var(--bg);color:var(--ink);font:inherit;font-size:14px;cursor:pointer;text-align:left;box-shadow:2px 2px 0 var(--panel-line)}' +
    '.ai-chip:hover{background:var(--mint)}' +
    '.ai-chip:active{transform:translate(2px,2px);box-shadow:none}' +
    '.ai-form{display:flex;gap:10px;padding:12px;border-top:3px solid var(--panel-line)}' +
    '.ai-input{flex:1;min-width:0;padding:10px 12px;border:3px solid var(--panel-line);border-radius:0;background:var(--bg);color:var(--ink);caret-color:var(--green);font:inherit;font-size:16px}' +
    '.ai-input:focus{outline:3px dashed var(--green);outline-offset:2px}' +
    '.ai-send{padding:0 14px;border:3px solid var(--panel-line);background:var(--green);color:var(--bg);font:13px "Silkscreen",monospace;text-transform:uppercase;cursor:pointer;box-shadow:3px 3px 0 var(--panel-line)}' +
    '.ai-send:active{transform:translate(3px,3px);box-shadow:none}' +
    '.ai-send:disabled{opacity:.5;cursor:default}' +
    '@media (max-width:520px){.ai-panel{right:8px;left:8px;bottom:8px;width:auto;height:min(78vh,620px)}.ai-launch{right:16px;bottom:16px}}' +
    '.ai-head-title{display:flex;align-items:center;gap:10px}' +
    '.ai-row{align-self:flex-start;display:flex;align-items:flex-end;gap:8px;max-width:94%}' +
    '.ai-row .ai-msg{max-width:none}' +
    '.ai-avatar{display:block;flex:none;color:var(--ink)}' +
    '.ai-launch .ai-avatar{color:currentColor}' +
    '.ai-mouth-closed{opacity:0}' +
    '.ai-avatar.is-typing .ai-mouth-open{animation:ai-mouth-open .5s steps(1) infinite}' +
    '.ai-avatar.is-typing .ai-mouth-closed{animation:ai-mouth-closed .5s steps(1) infinite}' +
    '@keyframes ai-mouth-open{50%{opacity:0}}@keyframes ai-mouth-closed{50%{opacity:1}}' +
    '.ai-avatar.is-thinking{animation:ai-think 1.6s steps(4) infinite;transform-origin:50% 80%}' +
    '@keyframes ai-think{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}' +
    '@media (prefers-reduced-motion:reduce){.ai-launch{transition:none}.ai-dots i{animation:none;opacity:.8}.ai-avatar.is-thinking,.ai-avatar.is-typing .ai-mouth-open,.ai-avatar.is-typing .ai-mouth-closed{animation:none}}';

  var STATUS = { search_work: 'Looking through Alex’s work…', get_profile: 'Checking Alex’s profile…', get_contact: 'Getting contact details…' };
  var EXAMPLES = ['What did Alex build for SKIMS?', 'What’s Alex’s tech stack?', 'Has Alex built AI agents?', 'How can I contact Alex?'];

  // Alex's head from the alxdna.dev stamp. The mouth is a mask cut-out, so it stays transparent;
  // while typing it flips between the open smile and a closed curved line.
  var HEAD = 'M572.1 862.6C566.2 862.0 562.8 861.0 557.4 858.5C553.5 856.7 553.1 856.8 548.5 858.9C543.2 861.4 540.7 862.0 533.9 862.0C523.2 862.0 516.6 859.3 509.0 851.8C504.6 847.6 504.3 847.4 501.7 848.3C496.3 850.2 486.8 850.6 481.1 849.2C469.2 846.2 459.5 836.7 455.9 824.5C454.8 820.8 454.4 820.4 450.9 819.8C443.6 818.7 437.3 815.6 431.8 810.1C428.2 806.6 426.8 804.7 424.6 800.2C421.7 794.2 421.6 793.7 421.6 784.3C421.5 779.2 421.4 776.1 421.3 775.8C421.1 775.5 420.4 774.5 419.6 773.6C416.9 770.2 414.2 764.9 413.0 760.5C412.0 756.8 412.0 746.6 413.0 742.8C414.0 739.4 416.9 733.4 419.1 730.5C421.8 727.0 421.8 727.0 419.2 722.8C415.1 716.0 414.0 711.9 414.0 704.0C414.0 696.0 415.3 691.1 419.4 684.8C421.3 681.7 421.2 682.0 421.1 676.8C420.7 666.4 423.5 659.2 431.0 651.5C434.7 647.7 435.2 647.0 435.2 644.9C435.2 643.3 434.8 636.4 434.4 632.6C433.7 624.4 433.7 601.4 434.4 592.8C434.6 591.2 434.9 587.4 435.1 584.3C435.3 581.3 435.7 577.3 436.0 575.3C436.2 573.4 436.6 570.7 436.7 569.3C438.6 552.5 445.1 526.1 452.2 506.9C455.3 498.6 455.3 498.9 453.1 494.6C450.9 490.4 450.1 488.4 449.1 484.8C447.8 480.1 447.7 479.9 443.8 478.3C432.8 473.8 424.9 464.1 422.6 452.3C422.0 449.6 422.0 442.1 422.6 439.2C424.7 427.1 433.6 416.8 445.4 412.6C448.6 411.5 448.9 411.2 450.4 407.0C454.2 396.2 462.0 386.6 471.3 380.9C484.7 372.8 499.9 371.8 514.4 378.2C517.8 379.7 518.0 379.6 522.2 375.2C535.1 361.9 549.7 356.5 568.0 358.2C575.9 358.9 585.0 362.3 592.6 367.5C597.4 370.7 597.2 370.7 602.3 366.3C610.5 359.4 620.3 354.8 630.7 353.0C633.7 352.5 644.8 352.5 647.8 352.9C659.7 354.8 669.9 359.8 679.7 368.7C683.1 371.8 683.5 371.9 687.5 370.0C714.4 357.4 745.8 373.2 753.5 403.2C754.7 408.1 754.7 408.1 760.0 407.8C782.2 406.8 802.7 422.5 808.6 445.1C810.5 452.5 810.7 463.1 809.1 470.4C808.1 474.7 808.2 475.1 812.2 478.0C821.9 485.2 828.8 496.2 831.6 509.1C832.7 514.0 832.7 525.1 831.6 530.0C830.3 536.2 828.0 542.1 825.3 546.7C821.4 553.0 821.4 552.3 825.0 558.1C828.1 563.1 830.3 568.9 831.6 575.1C832.4 578.9 832.8 589.4 832.2 593.0C829.8 608.3 821.9 620.8 809.4 629.2C806.0 631.4 805.9 631.9 807.5 636.1C815.5 657.3 805.2 680.1 784.1 687.8C778.7 689.8 779.0 689.4 778.8 695.0C778.5 710.9 770.2 724.1 756.3 730.8C749.5 734.1 743.4 735.2 734.2 734.7C730.7 734.6 730.6 734.7 727.8 741.0C721.3 755.8 712.4 771.3 703.2 783.7C699.7 788.4 699.8 788.2 699.6 794.0C699.1 810.6 687.4 823.3 670.7 825.3C666.3 825.8 666.0 826.1 664.2 830.3C655.7 850.7 632.3 860.6 609.9 853.2C605.4 851.7 605.3 851.7 601.1 854.8C597.0 857.8 590.7 860.6 585.6 861.7C583.5 862.1 576.5 863.0 575.6 862.9C575.4 862.9 573.9 862.8 572.1 862.6ZM698.3 760.0C702.7 753.4 708.2 742.8 712.6 732.8C714.8 727.8 714.8 727.7 711.0 723.8C702.6 715.3 699.1 707.4 698.7 695.7C698.5 689.5 698.6 689.6 695.3 687.2C685.6 680.0 679.9 669.9 679.0 658.5C677.9 645.5 682.7 633.8 692.7 625.1C696.1 622.1 696.2 621.7 695.3 619.2C695.0 618.3 694.3 616.5 693.8 615.1C688.3 599.8 689.8 583.9 698.2 569.2C700.4 565.4 700.3 565.2 695.7 561.8C685.2 554.0 678.1 542.7 675.7 530.1C674.9 525.9 674.7 525.6 670.6 523.5C664.9 520.6 661.1 517.7 656.3 512.6C652.4 508.4 651.8 508.2 647.9 509.1C644.6 509.9 634.2 509.7 629.8 508.9C617.7 506.5 607.8 501.3 598.8 492.7C594.7 488.7 594.9 488.7 590.0 493.6C578.8 504.6 566.8 509.6 551.7 509.6C542.4 509.6 535.8 508.0 527.3 503.8C522.1 501.3 522.2 501.3 518.9 504.4C505.8 516.8 489.2 520.1 473.8 513.5C469.0 511.5 468.7 511.7 466.4 518.3C461.2 533.0 456.3 553.4 454.2 569.2C453.9 571.3 453.5 574.2 453.3 575.6C453.0 578.1 452.7 580.5 452.2 587.5C452.1 589.4 451.8 592.7 451.6 594.6C451.1 598.7 451.1 627.3 451.5 630.3C451.6 631.3 451.8 633.5 451.9 635.3C452.4 641.2 452.7 641.4 460.2 641.0C463.0 640.9 465.7 640.8 466.1 640.9C467.7 641.1 469.4 640.5 471.5 638.8C475.3 636.0 478.9 634.2 483.3 632.8C488.0 631.4 497.1 631.7 501.8 633.4C510.2 636.4 516.0 641.6 520.5 650.1C522.1 653.1 522.5 653.4 525.8 653.7C541.7 655.2 553.5 665.9 555.3 680.4C555.9 685.2 556.2 685.5 560.7 686.8C569.2 689.2 577.2 696.0 581.6 704.4C583.2 707.5 584.1 707.8 587.6 706.7C591.5 705.5 599.3 705.0 603.7 705.7C607.8 706.4 613.4 708.6 617.5 711.2C620.2 713.0 625.8 718.9 627.5 721.7C630.2 726.3 630.3 726.4 636.5 725.5C643.3 724.5 653.0 724.8 659.2 726.4C677.6 730.9 690.3 743.2 693.9 759.8C694.7 763.7 695.8 763.8 698.3 760.0ZM634.3 670.6C630.9 669.5 628.5 666.4 628.3 662.8C628.1 660.7 628.5 659.8 631.8 652.1C645.0 622.0 647.1 607.5 639.7 599.1C634.9 593.7 619.4 590.1 611.8 592.5C602.2 595.7 595.5 610.4 589.7 641.5C588.2 649.5 588.0 650.1 586.4 651.8C581.1 657.7 571.6 654.0 571.6 646.1C571.6 644.1 571.8 643.0 574.0 631.8C578.6 608.7 586.3 590.6 595.0 582.6C607.8 570.7 633.9 572.1 650.5 585.6C654.2 588.7 658.6 595.7 660.4 601.6C661.5 605.2 661.4 615.8 660.3 621.6C657.8 633.7 651.0 652.8 644.9 665.0C642.6 669.7 638.4 672.0 634.3 670.6ZM544.8 617.7C541.6 616.9 539.2 614.5 538.3 611.3C537.7 609.1 538.0 607.8 540.2 601.6C552.1 568.1 551.1 555.8 536.4 552.4C526.3 550.0 518.0 550.9 513.4 554.9C509.5 558.4 505.6 567.9 503.7 578.6C503.4 580.2 503.0 582.5 502.8 583.6C502.5 585.4 502.0 589.4 501.1 598.7C500.6 604.0 500.0 605.4 498.0 607.3C493.5 611.3 486.5 609.7 484.4 604.2C482.8 599.8 485.6 577.7 489.4 564.9C494.6 547.9 501.2 539.7 512.7 536.0C527.8 531.1 547.7 534.8 557.0 544.2C567.5 554.9 568.4 567.3 560.7 594.3C559.1 599.8 555.7 610.1 554.6 612.4C552.8 616.3 548.4 618.7 544.8 617.7Z';
  var MOUTH = 'M531.2 774.3C548.2 771.8 564.1 761.1 573.8 745.6C575.8 742.5 575.9 741.1 574.3 740.0C573.7 739.6 572.9 739.6 565.6 739.6C556.8 739.5 553.6 739.3 546.8 737.9C520.5 732.8 497.3 715.8 483.6 691.7C479.7 684.9 478.4 685.2 475.7 693.5C464.7 727.5 479.7 762.9 509.2 772.4C516.0 774.6 524.4 775.3 531.2 774.3Z';
  var avatarCount = 0;
  function avatar(size) {
    var id = 'ai-mouth-' + (++avatarCount);
    var span = el('span');
    span.innerHTML = '<svg class="ai-avatar" aria-hidden="true" width="' + size + '" height="' + size + '" viewBox="392 344 462 528">' +
      '<defs><mask id="' + id + '" maskUnits="userSpaceOnUse" x="392" y="344" width="462" height="528"><rect x="392" y="344" width="462" height="528" fill="#fff"/>' +
      '<path class="ai-mouth-open" d="' + MOUTH + '" fill="#000"/>' +
      '<path class="ai-mouth-closed" d="M472 712Q506 770 572 748" fill="none" stroke="#000" stroke-width="18" stroke-linecap="round"/></mask></defs>' +
      '<path fill="currentColor" fill-rule="evenodd" mask="url(#' + id + ')" d="' + HEAD + '"/></svg>';
    return span.firstChild;
  }
  // A bot bubble with the avatar beside it.
  function botRow(bubble) {
    var row = el('div', 'ai-row');
    row.appendChild(avatar(28));
    row.appendChild(bubble);
    return row;
  }

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
    launch.innerHTML = '<span>Ask <span class="ai-brand">alxdn<b>AI</b></span></span>';
    launch.insertBefore(avatar(24), launch.firstChild);

    panel = el('div', 'ai-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat with alxdnAI');

    var head = el('div', 'ai-head');
    var title = el('div', 'ai-head-title');
    title.innerHTML = '<div class="ai-brand">alxdn<span class="ai-brand__ai">AI</span></div>';
    title.insertBefore(avatar(30), title.firstChild);
    var close = el('button', 'ai-close');
    close.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 10 10" shape-rendering="crispEdges" fill="currentColor"><path d="M1 1h2v1H1zM7 1h2v1H7zM2 2h2v1H2zM6 2h2v1H6zM3 3h4v1H3zM4 4h2v2H4zM3 6h4v1H3zM2 7h2v1H2zM6 7h2v1H6zM1 8h2v1H1zM7 8h2v1H7z"/></svg>';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close chat');
    head.appendChild(title);
    head.appendChild(close);

    log = el('div', 'ai-log');
    log.setAttribute('aria-live', 'polite');
    log.appendChild(botRow(el('div', 'ai-msg bot', 'Hi! I’m alxdnAI, an AI agent Alex built. Ask me about Alex’s work, skills, or experience.')));
    log.appendChild(el('p', 'ai-note', 'Heads up: I run on a free server Alex set up, so answers can take 20 to 60 seconds. I answer from Alex’s resume and this site, and I can still get things wrong. Chats are saved so Alex can improve my answers, so please don’t share personal details.'));
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
    // Status: a thinking avatar, bouncing dots, what the agent is doing, and how long the visitor has waited.
    var status = el('div', 'ai-row');
    status.style.alignItems = 'center';
    var thinker = avatar(28);
    thinker.classList.add('is-thinking');
    status.appendChild(thinker);
    var statusText = el('div', 'ai-status');
    status.appendChild(statusText);
    var row = el('div', 'ai-status-row');
    var dots = el('span', 'ai-dots');
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = '<i></i><i></i><i></i>';
    var label = el('span', '', 'Thinking…');
    var timer = el('span', 'ai-timer', '0s');
    timer.setAttribute('aria-hidden', 'true');
    row.appendChild(dots);
    row.appendChild(label);
    row.appendChild(timer);
    statusText.appendChild(row);
    var bubble = el('div', 'ai-msg bot');
    var reply = botRow(bubble);
    var talker = reply.firstChild;
    log.appendChild(status);
    scroll();
    var answer = '';
    var started = Date.now();
    var slowShown = false;
    // Only shown while nothing has streamed yet; typing is feedback enough.
    var slowNote = el('div', 'ai-slow', 'Still working. Alex runs me on a free server, so this can take up to a minute.');
    var tick = setInterval(function () {
      var secs = Math.floor((Date.now() - started) / 1000);
      timer.textContent = secs + 's';
      if (secs >= 10 && !slowShown && !answer) {
        slowShown = true;
        statusText.appendChild(slowNote);
        scroll();
      }
    }, 1000);

    function finish(text, isError) {
      clearInterval(tick);
      if (status.parentNode) status.parentNode.removeChild(status);
      talker.classList.remove('is-typing');
      if (!reply.parentNode) log.appendChild(reply);
      setRich(bubble, text);
      if (!isError) history.push({ role: 'assistant', content: text });
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
        if (event === 'queued' && data.position > 0) label.textContent = 'Waiting for a free spot…';
        else if (event === 'tool') label.textContent = STATUS[data.name] || 'Looking that up…';
        else if (event === 'reset') { answer = ''; thinker.style.display = ''; talker.classList.remove('is-typing'); if (reply.parentNode) reply.parentNode.removeChild(reply); }
        else if (event === 'delta') {
          answer += data.text;
          if (!reply.parentNode) log.insertBefore(reply, status);
          talker.classList.add('is-typing');
          thinker.style.display = 'none';
          if (slowNote.parentNode) slowNote.parentNode.removeChild(slowNote);
          label.textContent = 'Typing…';
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
