(() => {
  'use strict';
  const number = value => Number(value).toFixed(2).replace(/\.00$/, '');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const BLOCK = 32;
  const FAST_PREVIEW_FACTOR = 2;
  const HIGHLIGHT_MS = 650;

  function currentBlockOrder(start, end, parallel) {
    if (!parallel) return Array.from({length:end-start}, (_,offset) => start+offset);
    // Schematic confidence-ready positions across the active block, not a measured trace.
    const indices = [];
    const regionSize = BLOCK / 4;
    for (let offset = 0; offset < regionSize; offset += 1) {
      for (let region = 0; region < 4; region += 1) {
        const index = start + region * regionSize + offset;
        if (index < end) indices.push(index);
      }
    }
    return indices;
  }

  function createState(method) {
    const pieces = method.token_pieces;
    if (!Array.isArray(pieces) || pieces.length !== method.token_count || pieces.join('') !== method.response) {
      throw new Error('Tokenizer pieces must reconstruct the authored response exactly.');
    }
    return { method, pieces, rate: Math.min(1000,Number(method.tps)), budget: 0, passCredit: 0, passes: 0,
      committed: new Set(), suffixOrigins: new Set(), prefix: 0, newGroups: [], refreshEvent: false };
  }
  function commitPass(state, at) {
    const n = state.pieces.length;
    const blockStart = Math.floor(state.prefix / BLOCK) * BLOCK;
    const blockEnd = Math.min(n, blockStart + BLOCK);
    const nextEnd = Math.min(n, blockEnd + BLOCK);
    let quota = Math.max(0, Math.floor(state.budget + 1e-8) - state.committed.size);
    const group = { indices: [], current: [], suffix: [], at, blockStart, blockEnd, pass:state.passes+1 };
    state.passes += 1;
    // This authored event schedule illustrates eligibility, not a measured refresh trace.
    state.refreshEvent = state.method.method === 'Polestar' && state.passes % 4 === 0;
    if (state.refreshEvent && blockEnd < n && quota >= 2) {
      const selectedOffsets = [2, 6, 10, 14, 18, 22, 26, 30];
      const suffixQuota = Math.min(2, Math.max(1,Math.floor(quota / 3)));
      for (const offset of selectedOffsets) {
        const index = blockEnd + offset;
        if (index >= nextEnd || state.committed.has(index)) continue;
        state.committed.add(index);
        state.suffixOrigins.add(index);
        group.indices.push(index); group.suffix.push(index);
        quota -= 1;
        if (group.suffix.length >= suffixQuota) break;
      }
    }
    // The active block is frozen for this pass. Unused credit carries to a later pass.
    const order = currentBlockOrder(blockStart, blockEnd, state.method.tpf > 1);
    for (const index of order) {
      if (quota <= 0) break;
      if (state.committed.has(index)) continue;
      state.committed.add(index);
      group.indices.push(index); group.current.push(index);
      quota -= 1;
    }
    while (state.committed.has(state.prefix) && state.prefix < n) state.prefix += 1;
    if (group.indices.length) state.newGroups.push(group);
    return group;
  }
  function advanceState(state, seconds, at) {
    if (state.committed.size >= state.pieces.length || seconds <= 0) return;
    const n = state.pieces.length;
    state.passCredit += seconds * state.rate / state.method.tpf;
    while (state.passCredit >= 1 && state.budget < n) {
      state.passCredit -= 1;
      state.budget = Math.min(n, state.budget + state.method.tpf);
      commitPass(state, at);
    }
    // Rounded benchmark averages leave a partial final pass; spend only existing credit.
    if (state.budget + state.passCredit * state.method.tpf >= n - 1e-8) {
      state.budget = n;
      state.passCredit = 0;
      while (state.committed.size < n) {
        const before = state.committed.size;
        commitPass(state, at);
        if (state.committed.size === before) break;
      }
    }
  }
  window.POLESTAR_GENERATION_REPLAY_CORE = { createState, commitPass, advanceState, blockSize: BLOCK };

  window.initPolestarGenerationComparison = (root, data) => {
    if (!root || !data?.examples?.length || root.dataset.initialized === 'true') return null;
    root.dataset.initialized = 'true';
    const query = selector => root.querySelector(selector);
    const play = query('.gc-play'), reset = query('.gc-reset'), show = query('.gc-show');
    const paperRates = query('.gc-paper-rates'), fastPreview = query('.gc-fast-preview');
    const status = query('.gc-playback-status');
    let example = data.examples[0], lanes = [], running = false, frame = null, previousTime = null, destroyed = false;

    function complete() { return lanes.length > 0 && lanes.every(lane => lane.state.committed.size === lane.state.pieces.length); }
    function stop() {
      running = false;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; previousTime = null;
      play.textContent = complete() ? '↻ Replay comparison' : '▶ Play comparison';
      play.setAttribute('aria-pressed', 'false');
    }
    function renderLane(lane, now) {
      const state = lane.state, n = state.pieces.length;
      const finished = state.committed.size === n;
      const fraction = state.committed.size / n;
      const currentBlock = Math.min(Math.floor(state.prefix / BLOCK), Math.floor((n - 1) / BLOCK));
      const currentEnd = Math.min(n, (currentBlock + 1) * BLOCK);
      state.newGroups = state.newGroups.filter(group => now - group.at < HIGHLIGHT_MS);
      const latestGroup = state.newGroups[state.newGroups.length-1];
      lane.root.dataset.finished = String(finished);
      lane.progress.style.width = lane.summaryProgress.style.width = `${fraction * 100}%`;
      lane.percent.textContent = lane.summaryPercent.textContent = `${Math.round(fraction * 100)}%`;
      lane.summary.dataset.finished = String(finished);
      lane.status.textContent = finished ? 'Replay complete' : state.committed.size ? 'Committing' : 'Ready';
      lane.bar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
      lane.waiting.hidden = state.committed.size > 0;
      lane.tokenProgress.textContent = `${state.committed.size} / ${n} tokens`;
      lane.blockMap.hidden = finished;
      if (!finished) {
        const mapStart = latestGroup ? latestGroup.blockStart : currentBlock * BLOCK;
        const mapEnd = Math.min(n, mapStart + BLOCK);
        lane.blockLabel.textContent = `Current block · ${Math.floor(mapStart / BLOCK) + 1}`;
        lane.groupLabel.textContent = latestGroup ? `${latestGroup.indices.length} ${latestGroup.indices.length === 1 ? 'token' : 'tokens'} in this forward${latestGroup.suffix.length ? ` · ${latestGroup.suffix.length} suffix` : ''}` : state.committed.size ? 'Ready for the next forward' : 'Positions commit within each block';
        lane.blockPositions.innerHTML = Array.from({length:mapEnd-mapStart}, (_,offset) => {
          const index = mapStart + offset;
          const isNew = latestGroup?.current.includes(index) || false;
          return `<i data-committed="${state.committed.has(index)}" data-new="${isNew}" aria-hidden="true"></i>`;
        }).join('');
      }
      lane.outcome.hidden = !finished;
      if (finished) {
        const outcome = state.method.illustrative_outcome;
        lane.outcome.dataset.correct = String(outcome.correct);
        lane.outcome.innerHTML = `<span class="gc-outcome-label">Illustrative outcome</span><strong>${outcome.correct ? '✓ Correct' : '× Incorrect'}</strong><span>${escape(outcome.detail)}</span>`;
      } else lane.outcome.textContent = '';
      const changed = lane.renderedCount !== state.committed.size;
      if (changed) {
        let html = '', gap = false;
        if (state.committed.size > 0) for (let index = 0; index < (finished ? n : currentEnd); index += 1) {
          if (state.committed.has(index)) {
            const suffixOrigin = state.suffixOrigins.has(index);
            html += `<span data-token-index="${index}" data-revealed="true" data-origin="${suffixOrigin ? 'suffix' : 'current'}" title="${suffixOrigin ? 'Early suffix commit, now integrated into the response' : 'Current-block commit'}">${escape(state.pieces[index])}</span>`;
            gap = false;
          } else if (!gap) { html += '<span class="gc-gap" aria-label="Uncommitted positions"> ··· </span>'; gap = true; }
        }
        lane.response.innerHTML = html;
        lane.renderedCount = state.committed.size;
        clearTimeout(lane.flashTimer);
        lane.flashTimer = setTimeout(() => renderLane(lane, performance.now()), HIGHLIGHT_MS);
        if (running && root.dataset.expanded !== 'true') lane.output.scrollTop = lane.output.scrollHeight;
      }
      lane.response.querySelectorAll('[data-token-index]').forEach(span => {
        const index = Number(span.dataset.tokenIndex);
        span.dataset.current = String(state.newGroups.some(group => group.indices.includes(index)));
      });
      if (lane.suffix) {
        const recent = new Set(state.newGroups.flatMap(group => group.suffix));
        const ahead = [...recent].filter(index => index >= currentEnd && index < Math.min(n, currentEnd + BLOCK)).sort((a,b) => a-b);
        lane.suffix.hidden = ahead.length === 0;
        lane.suffixTotal.textContent = `◇ Suffix commit · ${ahead.length} new ${ahead.length === 1 ? 'token' : 'tokens'}`;
        lane.suffixBlock.textContent = `Next block · ${currentBlock + 2}`;
        lane.suffixDetail.textContent = 'Refresh-selected · confidence-ready';
        if (ahead.length) {
          const groups = [];
          for (const index of ahead) {
            const last = groups[groups.length - 1];
            if (last && index === last.end + 1) { last.end = index; last.text += state.pieces[index]; }
            else groups.push({start:index, end:index, text:state.pieces[index]});
          }
          lane.suffixPieces.innerHTML = groups.map(group => `<span class="gc-suffix-piece" title="Committed tokenizer positions ${group.start + 1}–${group.end + 1}"><i aria-hidden="true">◇</i>${escape(group.text.trim() || '␠')}</span>`).join('');
        } else lane.suffixPieces.textContent = '';
      }
    }
    function renderProgress(now = performance.now()) {
      root.dataset.expanded = String(complete());
      lanes.forEach(lane => renderLane(lane, now));
    }
    function tick(now) {
      if (!running || destroyed) return;
      if (previousTime !== null) lanes.forEach(lane => advanceState(lane.state, Math.max(0,(now - previousTime)/1000), now));
      previousTime = now;
      renderProgress(now);
      if (complete()) { stop(); status.textContent = 'Illustrative replay complete'; return; }
      frame = requestAnimationFrame(tick);
    }
    function restart() {
      stop();
      lanes.forEach(lane => {
        clearTimeout(lane.flashTimer);
        const rate = lane.state.rate;
        lane.state = createState(lane.state.method);
        lane.state.rate = rate;
        lane.renderedCount = -1;
      });
      renderProgress();
      lanes.forEach(lane => { lane.output.scrollTop = 0; });
      status.textContent = 'Ready to replay';
    }
    function begin() {
      if (complete()) restart();
      running = true; previousTime = null;
      play.textContent = 'Ⅱ Pause comparison'; play.setAttribute('aria-pressed','true');
      status.textContent = 'Playing · illustrative replay';
      frame = requestAnimationFrame(tick);
    }
    function select(id) {
      const selected = data.examples.find(item => item.id === id);
      if (!selected) return;
      stop(); lanes.forEach(lane => clearTimeout(lane.flashTimer));
      example = selected;
      root.dataset.language = example.language;
      paperRates.setAttribute('aria-pressed','true'); fastPreview.setAttribute('aria-pressed','false');
      query('.gc-context').textContent = `${example.model} · ${example.benchmark} · ${example.generation_length}-token benchmark`;
      query('.gc-prompt').textContent = example.prompt;
      query('.gc-display-source').textContent = `Authored proxy responses · ${example.response_source.case} · ${example.generation_length}-token benchmark calibration.`;
      query('.gc-example-options').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.example === id)));
      const valid = example.methods.every(method => Array.isArray(method.token_pieces) && method.token_count > 0 && method.token_count === method.token_pieces.length && method.token_pieces.join('') === method.response);
      [play,reset,show,paperRates,fastPreview].forEach(button => { button.disabled = !valid; });
      if (!valid) { lanes = []; query('.gc-lanes').textContent = ''; status.textContent = 'Tokenizer data is being prepared.'; return; }
      query('.gc-lanes').innerHTML = example.methods.map(method => `
        <article class="gc-lane" data-method="${escape(method.method)}" data-finished="false">
          <h3 class="gc-method-name"><i aria-hidden="true"></i>${escape(method.method === 'Polestar' ? 'Polestar (ours)' : method.method)}</h3>
          <p class="gc-metrics-source">${escape(example.benchmark)} benchmark averages</p>
          <dl class="gc-metrics">
            <div><dt>${example.language === 'python' ? 'Pass@1' : 'Accuracy'}</dt><dd>${number(method.accuracy)}<small>%</small></dd></div>
            <div><dt>Paper TPS</dt><dd>${number(method.tps)}</dd></div>
            <div><dt>Paper TPF</dt><dd>${number(method.tpf)}</dd></div>
          </dl>
          <label class="gc-tps-control">Replay TPS <input type="number" min="1" max="1000" step="0.01" value="${number(Math.min(1000,method.tps))}" aria-label="${escape(method.method)} replay tokens per second"/><span>tokens / second</span></label>
          <div class="gc-progress-label"><span class="gc-lane-status">Ready</span><span class="gc-percent">0%</span></div>
          <div class="gc-progress-track" role="progressbar" aria-label="${escape(method.method)} illustrative replay progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
          <div class="gc-block-map"><p><span class="gc-block-label"></span><span class="gc-group-label"></span></p><div class="gc-block-positions" aria-hidden="true"></div></div>
          <p class="gc-response-title"><span>Proxy response</span><span class="gc-token-progress"></span></p>
          ${method.method === 'Polestar' ? '<div class="gc-suffix" hidden><p><strong class="gc-suffix-total">◇ Suffix commits</strong><span class="gc-suffix-block"></span></p><div class="gc-suffix-pieces"></div><small class="gc-suffix-detail"></small></div>' : ''}
          <div class="gc-output" tabindex="0" aria-label="${escape(method.method)} proxy response; follows new commits while playing"><pre class="gc-response"></pre><p class="gc-waiting">Waiting for the first commit.</p></div>
          <p class="gc-outcome" hidden></p>
        </article>`).join('');
      query('.gc-race-summary').innerHTML = example.methods.map(method => `<div data-summary-method="${escape(method.method)}"><p>${escape(method.method)}</p><strong>0%</strong><div><i></i></div></div>`).join('');
      lanes = [...query('.gc-lanes').children].map(element => {
        const method = example.methods.find(method => method.method === element.dataset.method);
        const get = selector => element.querySelector(selector);
        const summary = query(`[data-summary-method="${element.dataset.method}"]`);
        const lane = {root:element, state:createState(method), progress:get('.gc-progress-track i'), bar:get('.gc-progress-track'), percent:get('.gc-percent'), status:get('.gc-lane-status'), response:get('.gc-response'), output:get('.gc-output'), waiting:get('.gc-waiting'), outcome:get('.gc-outcome'), tokenProgress:get('.gc-token-progress'), blockMap:get('.gc-block-map'), blockLabel:get('.gc-block-label'), groupLabel:get('.gc-group-label'), blockPositions:get('.gc-block-positions'), rateInput:get('.gc-tps-control input'), suffix:get('.gc-suffix'), suffixPieces:get('.gc-suffix-pieces'), suffixBlock:get('.gc-suffix-block'), suffixTotal:get('.gc-suffix-total'), suffixDetail:get('.gc-suffix-detail'), summary, summaryProgress:summary.querySelector('i'), summaryPercent:summary.querySelector('strong'), renderedCount:-1, flashTimer:null};
        lane.rateInput.addEventListener('change', () => {
          const raw = lane.rateInput.value.trim(), value = Number(raw);
          lane.state.rate = raw && Number.isFinite(value) ? Math.max(1,Math.min(1000,value)) : lane.state.rate;
          lane.rateInput.value = number(lane.state.rate);
          paperRates.setAttribute('aria-pressed','false'); fastPreview.setAttribute('aria-pressed','false');
          status.textContent = running ? 'Playing · replay TPS updated' : 'Replay TPS updated';
        });
        return lane;
      });
      restart();
    }
    query('.gc-example-options').innerHTML = data.examples.map(item => `<button type="button" data-example="${escape(item.id)}" aria-pressed="false">${escape(item.label)}</button>`).join('');
    const handleSelection = event => { const button = event.target.closest('button[data-example]'); if (button && root.contains(button)) select(button.dataset.example); };
    const handlePlay = () => { if (running) { stop(); status.textContent = 'Paused · illustrative replay'; } else begin(); };
    const handleShow = () => {
      stop();
      const now = performance.now();
      lanes.forEach(lane => {
        const state = lane.state;
        const remainingTokens = Math.max(0,state.pieces.length - state.budget - state.passCredit * state.method.tpf);
        advanceState(state,remainingTokens / state.rate + 1e-7,now);
      });
      renderProgress(); play.textContent = '↻ Replay comparison'; status.textContent = 'Illustrative responses complete';
    };
    const setRates = factor => { lanes.forEach(lane => { lane.state.rate = Math.min(1000,lane.state.method.tps * factor); lane.rateInput.value = number(lane.state.rate); }); paperRates.setAttribute('aria-pressed',String(factor === 1)); fastPreview.setAttribute('aria-pressed',String(factor !== 1)); status.textContent = factor === 1 ? 'Paper TPS restored' : 'Fast preview rates selected'; };
    const handlePaperRates = () => setRates(1), handleFastPreview = () => setRates(FAST_PREVIEW_FACTOR);
    const handleVisibility = () => { if (document.hidden && running) { stop(); status.textContent = 'Paused while tab is hidden'; } };
    query('.gc-example-options').addEventListener('click',handleSelection);
    play.addEventListener('click',handlePlay); reset.addEventListener('click',restart); show.addEventListener('click',handleShow);
    paperRates.addEventListener('click',handlePaperRates); fastPreview.addEventListener('click',handleFastPreview);
    document.addEventListener('visibilitychange',handleVisibility);
    select(example.id);
    return {select, pause:stop, reset:restart, destroy() {
      stop(); lanes.forEach(lane => clearTimeout(lane.flashTimer)); destroyed = true; root.dataset.initialized = 'false';
      query('.gc-example-options').removeEventListener('click',handleSelection);
      play.removeEventListener('click',handlePlay); reset.removeEventListener('click',restart); show.removeEventListener('click',handleShow);
      paperRates.removeEventListener('click',handlePaperRates); fastPreview.removeEventListener('click',handleFastPreview);
      document.removeEventListener('visibilitychange',handleVisibility);
    }};
  };
})();
