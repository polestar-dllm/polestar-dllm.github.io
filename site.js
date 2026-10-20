(() => {
  'use strict';
  const data = window.POLESTAR_SITE;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = ['Context','Centroids','Drift','Packet','Refresh','Commit','Suffix','Continue'];
  let stage=0,timer=null;
  const draw=s=>window.drawPolestarWalkthrough(s,data.demo.steps);
  function setFigureFocus(ids,label) {
    const dimensions=data.demo.dimensions||[1600,736];
    const selected=ids.map(id=>data.demo.regions[id]).filter(Boolean);
    $('method-highlights').innerHTML=selected.map(r=>{
      const [x,y,w,h]=r.rect;
      return `<div class="method-highlight" style="left:${100*x/dimensions[0]}%;top:${100*y/dimensions[1]}%;width:${100*w/dimensions[0]}%;height:${100*h/dimensions[1]}%"></div>`;
    }).join('');
    $('method-focus-label').textContent=label;
  }
  function selectFigureControl(region){
    document.querySelectorAll('[data-method-region]').forEach(button=>{const chosen=button.dataset.methodRegion===region;button.classList.toggle('selected',chosen);button.setAttribute('aria-pressed',String(chosen));});
  }
  function render() {
    const s=data.demo.steps[stage];
    $('phase-label').textContent=s.phase==='cache'?'Polestar-Cache':s.phase==='commit'?'Polestar-Commit':'Context';
    $('stage-count').textContent=`Stage ${stage+1} / ${data.demo.steps.length}`;
    $('stage-title').textContent=s.title;
    $('stage-summary').textContent=s.summary;
    $('stage-details').replaceChildren(...s.details.map(value=>{const li=document.createElement('li');li.textContent=value;return li;}));
    $('stage-range').value=stage;
    $('stage-range').setAttribute('aria-valuetext',`Stage ${stage+1}: ${s.title}`);
    $('previous-stage').disabled=stage===0;
    $('next-stage').disabled=stage===data.demo.steps.length-1;
    document.querySelectorAll('#stage-navigation button').forEach((b,i)=>{if(i===stage)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    draw(stage);
  }
  function stop() { if(timer)clearInterval(timer);timer=null;$('play-demo').innerHTML=`${stage===7?'↺':'▶'} <span>${stage===7?'Replay':'Play'}</span>`;$('play-demo').setAttribute('aria-label',stage===7?'Replay walkthrough':'Play walkthrough'); }
  function choose(value) { stop();stage=Math.max(0,Math.min(7,Number(value)));render();stop(); }
  $('stage-navigation').innerHTML=labels.map((label,i)=>`<button type="button" data-stage="${i}" aria-label="Stage ${i+1}: ${escape(data.demo.steps[i].title)}">${i+1}. ${label}</button>`).join('');
  $('stage-navigation').addEventListener('click',event=>{const b=event.target.closest('button');if(b)choose(b.dataset.stage);});
  $('previous-stage').addEventListener('click',()=>choose(stage-1));
  $('next-stage').addEventListener('click',()=>choose(stage+1));
  $('reset-demo').addEventListener('click',()=>choose(0));
  $('stage-range').addEventListener('input',event=>choose(event.target.value));
  function startPlayback(){
    if(stage===7){stage=0;render();}
    $('play-demo').innerHTML='Ⅱ <span>Pause</span>';$('play-demo').setAttribute('aria-label','Pause walkthrough');
    timer=setInterval(()=>{if(stage<7){stage++;render();}if(stage===7)stop();},2200/Number($('demo-speed').value));
  }
  $('play-demo').addEventListener('click',()=>{if(timer)stop();else startPlayback();});
  $('demo-speed').addEventListener('change',()=>{if(timer){stop();startPlayback();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('polestar-theme-change',()=>draw(stage));
  $('demo').addEventListener('keydown',event=>{
    if(event.target.matches('input,select')||event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.key==='ArrowRight'){event.preventDefault();choose(stage+1);}
    if(event.key==='ArrowLeft'){event.preventDefault();choose(stage-1);}
  });
  document.querySelectorAll('[data-method-region]').forEach(button=>button.addEventListener('click',()=>{
    const region=button.dataset.methodRegion;selectFigureControl(region);
    if(region==='all')setFigureFocus([],'The full diagram from the paper.');
    else setFigureFocus([region],region==='cache'?'Polestar-Cache · sparse calibration':'Polestar-Commit · current and suffix decisions');
  }));
  const figures={method:{src:document.querySelector('#original-method img').getAttribute('src'),title:'Polestar-Cache & Polestar-Commit',caption:'The original method diagram.'},teaser:{title:'Accuracy–throughput trade-off',caption:'Accuracy–throughput trade-off from the paper.'}};
  document.querySelectorAll('[data-enlarge]').forEach(button=>button.addEventListener('click',()=>{
    const kind=button.dataset.enlarge,f=figures[kind],container=document.querySelector('.dialog-image');
    $('dialog-title').textContent=f.title;$('dialog-caption').textContent=f.caption;container.dataset.kind=kind;
    container.querySelector('.tradeoff-svg')?.remove();$('dialog-img').hidden=kind==='teaser';
    if(kind==='teaser'){
      const chart=document.querySelector('.teaser-layout .tradeoff-svg').cloneNode(true);
      const ids=new Map([...chart.querySelectorAll('[id]')].map(node=>[node.id,'dialog-'+node.id]));
      chart.querySelectorAll('*').forEach(node=>{for(const attribute of [...node.attributes]){let value=attribute.value;for(const [oldId,newId] of ids){value=value.replaceAll('url(#'+oldId+')','url(#'+newId+')');if(attribute.name==='id'&&value===oldId)value=newId;if(attribute.name==='aria-labelledby')value=value.split(' ').map(id=>ids.get(id)||id).join(' ');}if(value!==attribute.value)node.setAttribute(attribute.name,value);}});
      chart.setAttribute('aria-labelledby',chart.getAttribute('aria-labelledby').split(' ').map(id=>ids.get(id)||id).join(' '));
      container.append(chart);
    }else{$('dialog-img').src=f.src;$('dialog-img').alt=f.title;}
    $('figure-dialog').showModal();
  }));
  $('close-dialog').addEventListener('click',()=>$('figure-dialog').close());
  $('figure-dialog').addEventListener('click',event=>{const r=event.currentTarget.getBoundingClientRect();if(event.target===event.currentTarget&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))event.currentTarget.close();});
  $('model-results').innerHTML=data.content.performance.model_results.map(r=>`<tr><td>${escape(r.model)}</td><td>${escape(r.benchmark)}</td><td>${r.accuracy.toFixed(2)}</td><td>${r.tpf.toFixed(2)}</td><td>${r.tps.toFixed(2)}</td></tr>`).join('');
  $('model-list').innerHTML=data.content.models.map(model=>`<div class="model-item"><a href="${escape(model.checkpoint_url)}">${escape(model.name)} ↗</a><p>${escape(model.input)}</p></div>`).join('');
  let selectedExample=0;
  function showExample(index) {
    selectedExample=index;
    const ex=data.content.examples[index];
    const reference=ex.type==='benchmark_reference';
    document.querySelectorAll('#example-tabs button').forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});
    $('example-content').setAttribute('aria-labelledby',`example-tab-${index}`);
    let prompt=ex.language==='python'?`<pre class="example-code">${escape(ex.prompt)}</pre>`:`<div class="example-input">${ex.image?`<img class="example-image ${reference?'benchmark-image':''}" src="${escape(ex.input_image)}" alt="${escape(ex.image_alt||'Example input image')}">`:''}<p class="example-prompt">${escape(ex.prompt)}</p>${reference?`<p class="benchmark-attribution">${escape(ex.attribution)} <a href="${escape(ex.source_url)}" target="_blank" rel="noopener">Source ↗</a></p>`:''}</div>`;
    let response=`<pre class="${ex.language==='python'?'example-code':'example-response full-response'}">${escape(ex.response)}</pre>`;
    $('example-content').innerHTML=`<p class="example-meta">${escape(ex.model)} <span aria-hidden="true">·</span> ${escape(ex.source_label)}</p><div class="example-columns"><div><p class="example-label">Input</p>${prompt}</div><div><p class="example-label">${reference?'Benchmark reference':ex.language==='python'?'Generated completion':'Full response'}</p>${response}</div></div><p class="example-note">${reference?'Benchmark input and dataset reference answer.':'Recorded generation using Polestar.'}</p>`;
  }
  $('example-tabs').innerHTML=data.content.examples.map((ex,i)=>`<button type="button" role="tab" id="example-tab-${i}" aria-controls="example-content" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-example="${i}">${escape(ex.label)}</button>`).join('');
  $('example-tabs').addEventListener('click',event=>{const button=event.target.closest('button');if(button)showExample(Number(button.dataset.example));});
  $('example-tabs').addEventListener('keydown',event=>{if(!['ArrowRight','ArrowLeft'].includes(event.key))return;event.preventDefault();const n=data.content.examples.length;showExample((selectedExample+(event.key==='ArrowRight'?1:n-1))%n);$(`example-tab-${selectedExample}`).focus();});
  $('bibtex').textContent=data.content.citation.bibtex;
  $('copy-citation').addEventListener('click',async()=>{
    try {
      let copied=false;
      if(navigator.clipboard&&window.isSecureContext){
        try {await navigator.clipboard.writeText(data.content.citation.bibtex);copied=true;} catch(error) {}
      }
      if(!copied){
        const focused=document.activeElement;
        const area=document.createElement('textarea');area.value=data.content.citation.bibtex;area.setAttribute('readonly','');area.style.position='fixed';area.style.left='-10000px';document.body.append(area);area.select();
        try {copied=document.execCommand('copy');} finally {area.remove();if(focused&&focused.focus)focused.focus({preventScroll:true});}
      }
      if(!copied)throw Error('Clipboard unavailable');
      $('copy-status').textContent='BibTeX copied.';
    } catch(error) {$('copy-status').textContent='Select the citation text to copy it.';}
  });
  window.matchMedia('(max-width: 760px)').addEventListener('change',()=>draw(stage));
  window.initPolestarGenerationComparison(document.querySelector('[data-generation-comparison]'),data.comparison);
  showExample(0);render();setFigureFocus([],'The full diagram from the paper.');
})();
