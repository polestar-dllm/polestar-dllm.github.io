(() => {
  'use strict';
  function initialize() {
    const hero = document.querySelector('.hero');
    const control = document.getElementById('replay-hero-intro');
    const prepared = window.POLESTAR_SITE?.heroIntro;
    if (!hero || !control || !prepared?.by_text || !prepared.targets) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const TPS_PER_TRACK = 80, TPF = 3.59, HIGHLIGHT = 650, TRACKS = 2;

    function visibleTextNodes(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        let parent = node.parentElement, hidden = false;
        while (parent && parent !== root) {
          if (parent.getAttribute('aria-hidden') === 'true') { hidden = true; break; }
          parent = parent.parentElement;
        }
        if (!hidden) nodes.push(node);
      }
      return nodes;
    }
    const records = prepared.targets.map(meta => {
      const target = hero.querySelector('[data-hero-stream="' + meta.target_id + '"]');
      if (!target) return null;
      const text = visibleTextNodes(target).map(node => node.textContent).join('');
      return {target, meta, text, original:[...target.childNodes].map(node => node.cloneNode(true)), units:[]};
    });
    if (records.some(record => !record || record.text !== record.meta.text)) return;
    let units = [], tracks = [], frame = null, running = false, startedAt = 0, streamEndedAt = 0, observer;

    function finish(celebrate = false) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; running = false;
      records.forEach(record => {
        record.target.replaceChildren(...record.original.map(node => node.cloneNode(true)));
        delete record.target.dataset.heroVisible;
      });
      units = [];
      hero.dataset.introState = 'complete'; hero.dataset.introPhase = 'complete';
      hero.dataset.introStar = 'idle';
      control.innerHTML = '<span aria-hidden="true">↻</span> Replay intro';
      control.setAttribute('aria-label','Replay title animation');
      control.hidden = motion.matches;
      if (celebrate === true && !motion.matches && !document.hidden) {
        const star = hero.querySelector('.hero-star');
        if (star) {
          star.addEventListener('animationend', () => {
            if (hero.querySelector('.hero-star') === star) hero.dataset.introStar = 'idle';
          }, {once:true});
          hero.dataset.introStar = 'twinkling';
        }
      }
    }
    function encoding(text) {
      const entry = prepared.by_text[text];
      if (!entry || entry.token_count !== entry.token_pieces.length || entry.token_pieces.join('') !== text) {
        throw new Error('Hero token pieces must reconstruct their source text.');
      }
      return entry;
    }
    function tokenElement(text) {
      const span = document.createElement('span');
      span.className = 'hero-token'; span.dataset.tokenState = 'pending'; span.textContent = text;
      return span;
    }
    function wordGroups(pieces) {
      const groups = [];
      let text = '', cost = 0;
      for (const piece of pieces) {
        if (text.trim() && piece.trim() && (/\s$/.test(text) || /^\s/.test(piece))) {
          groups.push({text,cost}); text = ''; cost = 0;
        }
        text += piece; cost += 1;
      }
      if (cost) groups.push({text,cost});
      return groups;
    }
    function spreadOrder(list) {
      const regions = [0,Math.ceil(list.length / 3),Math.ceil(2 * list.length / 3),list.length];
      const ordered = [];
      for (let offset = 0; offset < Math.ceil(list.length / 3); offset += 1) {
        for (let region = 0; region < 3; region += 1) {
          const index = regions[region] + offset;
          if (index < regions[region + 1]) ordered.push(list[index]);
        }
      }
      return ordered;
    }
    function prepare() {
      units = [];
      records.forEach(record => {
        record.units = [];
        const accessible = document.createElement('span');
        accessible.className = 'sr-only hero-accessible-copy'; accessible.textContent = record.text;
        const visual = document.createElement('span');
        visual.className = 'hero-visual'; visual.setAttribute('aria-hidden','true');
        visual.append(...record.original.map(node => node.cloneNode(true)));
        const nodes = visibleTextNodes(visual);
        if (record.meta.atomic) {
          const elements = [];
          nodes.forEach(node => {
            if (!node.textContent.trim()) return;
            const run = document.createElement('span'); run.className = 'hero-text-run';
            const token = tokenElement(node.textContent); run.append(token); node.replaceWith(run); elements.push(token);
          });
          record.units.push({elements,cost:encoding(record.text).token_count,record,revealedAt:null});
        } else {
          nodes.forEach(node => {
            if (!node.textContent.trim()) return;
            const run = document.createElement('span'); run.className = 'hero-text-run';
            wordGroups(encoding(node.textContent).token_pieces).forEach(group => {
              const token = tokenElement(group.text); run.append(token);
              record.units.push({elements:[token],cost:group.cost,record,revealedAt:null});
            });
            node.replaceWith(run);
          });
        }
        record.target.replaceChildren(accessible,visual);
        record.target.dataset.heroVisible = 'false';
        units.push(...record.units);
      });
      if (units.reduce((sum,unit) => sum + unit.cost, 0) !== prepared.total_token_count) {
        throw new Error('Hero token budget does not match its prepared text.');
      }
      const queues = records.map(record => spreadOrder(record.units));
      const order = [];
      for (let round = 0; queues.some(queue => round < queue.length); round += 1) {
        queues.forEach(queue => { if (queue[round]) order.push(queue[round]); });
      }
      tracks = Array.from({length:TRACKS}, () => ({units:[],total:0,cursor:0,spent:0}));
      order.forEach(unit => {
        const track = tracks.reduce((best,candidate) => candidate.total < best.total ? candidate : best);
        track.units.push(unit); track.total += unit.cost;
      });
      hero.dataset.introTrackCount = String(TRACKS);
      hero.dataset.introTrackCosts = tracks.map(track => track.total).join(',');
    }
    function tick(now) {
      frame = null;
      if (!running) return;
      const elapsed = Math.max(0,(now - startedAt) / 1000);
      const passes = Math.floor(elapsed * TPS_PER_TRACK / TPF);
      tracks.forEach(track => {
        const budget = elapsed * TPS_PER_TRACK >= track.total ? track.total : Math.min(track.total,passes * TPF);
        while (track.cursor < track.units.length && track.spent + track.units[track.cursor].cost <= budget + 1e-8) {
          const unit = track.units[track.cursor++]; track.spent += unit.cost; unit.revealedAt = now;
          unit.record.target.dataset.heroVisible = 'true';
          unit.elements.forEach(element => { element.dataset.tokenState = 'committing'; });
        }
      });
      units.forEach(unit => {
        if (unit.revealedAt !== null && now - unit.revealedAt >= HIGHLIGHT) {
          unit.elements.forEach(element => { element.dataset.tokenState = 'committed'; });
        }
      });
      hero.dataset.introCommitted = String(tracks.reduce((sum,track) => sum + track.spent, 0));
      hero.dataset.introBatch = String(passes);
      if (tracks.every(track => track.cursor === track.units.length)) {
        if (!streamEndedAt) {
          streamEndedAt = now;
          hero.dataset.introStreamMs = String(Math.round(now - startedAt));
          hero.dataset.introPhase = 'settling';
        }
        if (now - streamEndedAt >= HIGHLIGHT) { finish(true); return; }
      }
      frame = requestAnimationFrame(tick);
    }
    function begin() {
      if (motion.matches || document.hidden) { finish(); return; }
      finish();
      try { prepare(); } catch(error) { finish(); control.hidden = true; return; }
      running = true; startedAt = performance.now(); streamEndedAt = 0;
      hero.dataset.introState = 'running'; hero.dataset.introPhase = 'streaming';
      hero.dataset.introCommitted = '0'; hero.dataset.introTpsPerTrack = String(TPS_PER_TRACK);
      delete hero.dataset.introStreamMs;
      control.hidden = false; control.textContent = 'Skip animation';
      control.setAttribute('aria-label','Skip title animation');
      tick(startedAt);
    }
    control.addEventListener('click', () => { if (running) finish(); else begin(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && (running || hero.dataset.introStar === 'twinkling')) finish(); });
    motion.addEventListener('change', finish);
    hero.dataset.introState = 'complete'; hero.dataset.introPhase = 'complete';
    control.hidden = motion.matches;
    if (!motion.matches) {
      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); begin(); }
        }, {threshold:.12});
        observer.observe(hero);
      } else begin();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
})();

