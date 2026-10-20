/* Paper-backed benchmark explorer. Data is supplied by the local build. */
(() => {
  'use strict';
  const METHODS = ['Baseline', 'Baseline+Parallel', 'Fast-dLLM', 'Dynamic-dLLM', 'Elastic-Cache', 'Polestar'];
  const MODELS = ['LLaDA-8B-Instruct', 'Dream-7B-Instruct'];
  const BENCHMARKS = ['GSM8K', 'MATH', 'HumanEval'];
  const esc = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
  const fmt = value => Number(value).toFixed(2);
  const $ = id => document.getElementById(id);
  let source, root, rows = [], state = {model:MODELS[0], length:256, methods:Object.fromEntries(BENCHMARKS.map(benchmark=>[benchmark,'Polestar']))};
  let animationFrame=null,animationToken=0,animatedProgress=1;
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const benchmarkId=benchmark=>benchmark.toLowerCase();

  function controls(id, values, key, format = value => value) {
    $(id).innerHTML = values.map(value => `<button type="button" data-rex-key="${key}" data-rex-value="${esc(value)}" aria-pressed="${state[key] === value}">${esc(format(value))}</button>`).join('');
  }
  function intersects(a,b) {return a.x < b.x+b.w+4 && a.x+a.w+4 > b.x && a.y < b.y+b.h+4 && a.y+a.h+4 > b.y;}
  function boxIntersectsCurve(box,a,b,margin=4) {
    const minX=box.x-margin,maxX=box.x+box.w+margin,minY=box.y-margin,maxY=box.y+box.h+margin;
    const dx=b.x-a.x,dy=b.y-a.y;
    let enter=0,exit=1;
    for(const [p,q] of [[-dx,a.x-minX],[dx,maxX-a.x],[-dy,a.y-minY],[dy,maxY-a.y]]) {
      if(Math.abs(p)<1e-9){if(q<0)return false;continue;}
      const t=q/p;
      if(p<0)enter=Math.max(enter,t);else exit=Math.min(exit,t);
      if(enter>exit)return false;
    }
    return true;
  }
  function boxMarkerCollision(box,point,margin=3) {
    const x=Math.max(box.x,Math.min(point.x,box.x+box.w)),y=Math.max(box.y,Math.min(point.y,box.y+box.h));
    return Math.hypot(x-point.x,y-point.y)<(point.r || 9)+margin;
  }
  function markCollisions(box,points) {
    let collisions=points.filter(point=>boxMarkerCollision(box,point)).length;
    for(let i=0;i<points.length-1;i++)if(boxIntersectsCurve(box,points[i],points[i+1]))collisions++;
    return collisions;
  }
  function accuracyPlacement(point,barTop,points,columnLeft,columnRight,top,mobile) {
    const height=mobile?19:15,width=mobile?48:39,shift=Math.min(mobile?39:35,(columnRight-columnLeft-width)/2-.6);
    const candidates=[];
    const gaps=[9,29,49,69,89,...points.map(other=>barTop-other.y+(other.r || 9)+6.1)].filter(gap=>gap>=9);
    for(const gap of gaps)for(const dx of [0,shift,-shift]) {
      const x=point.x+dx,y=barTop-gap;
      const box={x:x-width/2,y:y-height+3,w:width,h:height};
      const outside=Math.max(0,top+5-box.y)+Math.max(0,columnLeft+.5-box.x)+Math.max(0,box.x+box.w-columnRight+.5)+Math.max(0,box.y+box.h-barTop+3);
      const collisions=markCollisions(box,points);
      candidates.push({x,y,box,collisions,score:outside*10000+collisions*1000+Math.hypot(dx,gap-9)*.15});
    }
    return candidates.sort((a,b)=>a.score-b.score)[0];
  }
  function numericPlacement(point, index, points, accuracyBoxes, top, bottom, mobile) {
    const height=mobile?19:15, width=mobile?48:39;
    const offsets=mobile?[-24,30,-45,51,-66,72,-87,93,-108,114,-129,135]:[-21,25,-41,45,-61,65,-81,85,-101,105,-121,125];
    const candidates=offsets.map(offset=>({x:point.x-width/2,y:point.y+offset-height+3,w:width,h:height,baseline:point.y+offset}));
    let best=candidates[0], score=Infinity;
    for(const box of candidates) {
      const outside=Math.max(0,top+5-box.y)+Math.max(0,box.y+box.h-bottom+3);
      let penalty=outside*10000;
      for(const abox of accuracyBoxes) if(intersects(box,abox)) penalty+=1000;
      penalty+=markCollisions(box,points)*1000;
      penalty+=Math.abs(box.baseline-point.y)*.15;
      if(penalty<score){score=penalty;best=box;}
    }
    return {y:best.baseline,box:best,score};
  }
  function star(x,y,radius=9) {
    return Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?radius*.44:radius;return `${(x+Math.cos(a)*r).toFixed(2)},${(y+Math.sin(a)*r).toFixed(2)}`;}).join(' ');
  }
  function chart(group, mobile=false, secondPanel=false, benchmark=group[0]?.benchmark || BENCHMARKS[0], progress=1) {
    const width=520,height=544,left=60,right=460,top=30,bottom=350;
    const span=(right-left)/group.length,barWidth=span*.78,scale=value=>bottom-(value/100)*(bottom-top);
    const points=group.map((row,i)=>({x:left+span*(i+.5),y:scale(row.tps*progress),r:row.method==='Polestar'?(mobile?10:9):(mobile?4.4:4)}));
    const accuracyPlacements=group.map((row,i)=>accuracyPlacement(points[i],scale(row.accuracy*progress),points,left+span*i,left+span*(i+1),top,mobile));
    const accBoxes=accuracyPlacements.map(placement=>placement.box);
    let svg=`<svg class="rex-benchmark-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(state.model)} ${esc(benchmark)} at ${state.length} tokens: accuracy bars and throughput line for all six methods"><g>`;
    [0,20,40,60,80,100].forEach(value=>{const y=scale(value);svg+=`<line class="rex-grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="rex-axis" x="${left-9}" y="${y+5}" text-anchor="end">${value}</text><text class="rex-axis" x="${right+9}" y="${y+5}" text-anchor="start">${value}</text>`;});
    svg+=`<line class="rex-axis-line" x1="${left}" y1="${top}" x2="${left}" y2="${bottom}"/><line class="rex-axis-line" x1="${right}" y1="${top}" x2="${right}" y2="${bottom}"/><line class="rex-axis-line" x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}"/><text class="rex-axis-title" x="20" y="${(top+bottom)/2}" text-anchor="middle" transform="rotate(-90 20 ${(top+bottom)/2})">${benchmark==='HumanEval'?'pass@1 (%)':'Accuracy (%)'}</text><text class="rex-axis-title" x="500" y="${(top+bottom)/2}" text-anchor="middle" transform="rotate(90 500 ${(top+bottom)/2})">TPS (tokens/s)</text>`;
    group.forEach((row,i)=>{
      const x=points[i].x,y=scale(row.accuracy*progress),isPolestar=row.method==='Polestar',isSelected=row.method===state.methods[benchmark];
      const accuracyLabel=accuracyPlacements[i];
      svg+=`<g class="rex-target ${isSelected?'selected':''}" role="button" tabindex="0" data-rex-method="${esc(row.method)}" data-rex-benchmark="${esc(benchmark)}" aria-pressed="${isSelected}" aria-label="${esc(row.method)}: ${fmt(row.accuracy)} percent ${benchmark==='HumanEval'?'pass at one':'accuracy'}, ${fmt(row.tpf)} tokens per forward pass, ${fmt(row.tps)} tokens per second"><rect class="rex-hit" x="${x-span/2+2}" y="${top}" width="${span-4}" height="${bottom-top}" fill="transparent" stroke="none"/><rect class="rex-bar ${isPolestar?'polestar':''}" x="${x-barWidth/2}" y="${y}" width="${barWidth}" height="${bottom-y}"/><text class="rex-accuracy-value" x="${accuracyLabel.x}" y="${accuracyLabel.y}" text-anchor="middle" data-placement-score="${accuracyLabel.score.toFixed(2)}">${fmt(row.accuracy*progress)}</text>`;
      svg+=`<text class="rex-method" x="${x+6}" y="${bottom+26}" text-anchor="end" transform="rotate(-55 ${x+6} ${bottom+26})">${esc(row.method)}</text>`;
      if(isSelected)svg+=`<rect class="rex-focus-ring" x="${x-barWidth/2-4}" y="${y-4}" width="${barWidth+8}" height="${bottom-y+8}"/>`;
      svg+='</g>';
    });
    svg+=`<path class="rex-tps-path" d="${points.map((point,i)=>`${i?'L':'M'}${point.x} ${point.y}`).join(' ')}"/>`;
    group.forEach((row,i)=>{
      const point=points[i],placement=numericPlacement(point,i,points,accBoxes,top,bottom,mobile);
      svg+=row.method==='Polestar'?`<polygon class="rex-point polestar" points="${star(point.x,point.y,mobile?10:9)}"/>`:`<circle class="rex-point" cx="${point.x}" cy="${point.y}" r="${mobile?4.4:4}"/>`;
      svg+=`<text class="rex-tps-value ${row.method==='Polestar'&&placement.y>=scale(row.accuracy*progress)+14?'on-polestar-bar':''}" x="${point.x}" y="${placement.y}" text-anchor="middle" data-placement-score="${placement.score.toFixed(2)}">${fmt(row.tps*progress)}</text>`;
    });
    svg+=`<text class="rex-axis-title" x="${(left+right)/2}" y="${height-13}" text-anchor="middle">Method</text>`;
    return svg+'</g></svg>';
  }
  function stopAnimation() {
    animationToken++;
    if(animationFrame!==null)cancelAnimationFrame(animationFrame);
    animationFrame=null;
  }
  function drawCharts(progress) {
    animatedProgress=progress;
    BENCHMARKS.forEach(benchmark=>{
      const group=rows.filter(row=>row.benchmark===benchmark);
      $(`rex-chart-${benchmarkId(benchmark)}`).innerHTML=chart(group,true,false,benchmark,progress);
    });
  }
  function animateCharts() {
    if(reducedMotion?.matches){drawCharts(1);return;}
    const token=animationToken,start=performance.now();
    drawCharts(0);
    function advance(now) {
      if(token!==animationToken)return;
      const elapsed=Math.min(1,Math.max(0,(now-start)/500));
      drawCharts(elapsed===1?1:1-Math.pow(1-elapsed,3));
      if(elapsed<1)animationFrame=requestAnimationFrame(advance);else animationFrame=null;
    }
    animationFrame=requestAnimationFrame(advance);
  }
  function render(animate=false) {
    stopAnimation();
    const active=document.activeElement;
    const focus=active && root?.contains(active) ? {key:active.dataset?.rexKey,value:active.dataset?.rexValue,method:active.dataset?.rexMethod,benchmark:active.dataset?.rexBenchmark,tag:active.tagName} : null;
    rows=BENCHMARKS.flatMap(benchmark=>METHODS.map(method=>source.rows.find(row=>row.model===state.model && row.benchmark===benchmark && row.generation_length===state.length && row.method===method)).filter(Boolean));
    controls('rex-model-options',MODELS,'model');controls('rex-length-options',[256,512],'length',value=>`${value} tokens`);
    $('rex-view-context').textContent=`${state.model} · ${state.length}-token generation`;
    $('rex-panels').innerHTML=BENCHMARKS.map(benchmark=>{
      const id=benchmarkId(benchmark),group=rows.filter(row=>row.benchmark===benchmark);
      const table=group.map(row=>`<tr class="${row.method==='Polestar'?'polestar':''} ${row.method===state.methods[benchmark]?'selected':''}"><td><button class="rex-method-button" type="button" data-rex-method="${esc(row.method)}" data-rex-benchmark="${esc(benchmark)}" aria-pressed="${row.method===state.methods[benchmark]}">${esc(row.method)}</button></td><td>${fmt(row.accuracy)}</td><td>${fmt(row.tpf)}</td><td>${fmt(row.tps)}</td></tr>`).join('');
      return `<section class="rex-benchmark-panel" aria-labelledby="rex-heading-${id}"><h3 id="rex-heading-${id}" class="rex-benchmark-title">${esc(benchmark)}</h3><div class="rex-chart rex-benchmark-chart" id="rex-chart-${id}"></div><div class="rex-table-wrap"><table class="rex-table"><caption class="rex-visually-hidden">Exact ${esc(benchmark)} measurements for ${esc(state.model)} at ${state.length} tokens</caption><thead><tr><th scope="col">Method</th><th scope="col">${benchmark==='HumanEval'?'pass@1 (%)':'Accuracy (%)'}</th><th scope="col">TPF</th><th scope="col">TPS</th></tr></thead><tbody>${table}</tbody></table></div></section>`;
    }).join('');
    if(animate)animateCharts();else drawCharts(1);
    if(focus){const match=[...root.querySelectorAll('[data-rex-key],[data-rex-method]')].find(element=>element.tagName===focus.tag && (focus.key?element.dataset.rexKey===focus.key && element.dataset.rexValue===focus.value:element.dataset.rexMethod===focus.method && element.dataset.rexBenchmark===focus.benchmark) && element.getClientRects().length);match?.focus({preventScroll:true});}
  }
  function selectMethod(method,benchmark=BENCHMARKS[0]) {
    if(!METHODS.includes(method)||!BENCHMARKS.includes(benchmark))return;
    state.methods[benchmark]=method;
    render();
  }
  function init() {
    root=$('results-explorer');source=window.POLESTAR_RESULTS || window.POLESTAR_SITE?.results;
    if(!root || !source?.rows)return;
    root.addEventListener('click',event=>{
      const control=event.target.closest('[data-rex-key]');
      if(control){const key=control.dataset.rexKey,next=key==='length'?Number(control.dataset.rexValue):control.dataset.rexValue;if(state[key]!==next){state[key]=next;render(true);}return;}
      const method=event.target.closest('[data-rex-method]');if(method)selectMethod(method.dataset.rexMethod,method.dataset.rexBenchmark);
    });
    root.addEventListener('keydown',event=>{const method=event.target.closest('[data-rex-method]');if(method?.tagName.toLowerCase()==='g' && ['Enter',' '].includes(event.key)){event.preventDefault();selectMethod(method.dataset.rexMethod,method.dataset.rexBenchmark);}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden && animationFrame!==null){stopAnimation();drawCharts(1);}});
    reducedMotion?.addEventListener('change',event=>{if(event.matches){stopAnimation();drawCharts(1);}});
    render();
  }
  window.POLESTAR_RESULTS_EXPLORER={init,render,selectMethod,chart,numericPlacement,accuracyPlacement,markCollisions,intersects,getState:()=>({...state,methods:{...state.methods},animatedProgress}),getRows:benchmark=>rows.filter(row=>!benchmark||row.benchmark===benchmark).map(row=>({...row}))};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
