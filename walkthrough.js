(() => {
  'use strict';
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let c;
  const text=(x,y,value,cls='svg-node',anchor='middle')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${escape(value)}</text>`;
  const rect=(x,y,w,h,fill=c.surface,stroke=c.line,r=6,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" ${extra}/>`;
  const arrow=(x1,y1,x2,y2,active=false)=>`<path d="M${x1} ${y1} L${x2} ${y2}" class="${active?'svg-update-flow':'svg-flow'}" marker-end="url(#demo-arrow-${active?'blue':'gray'})"/>`;
  function node(x,y,w,h,line1,line2='',active=false){return rect(x,y,w,h,active?c.paleBlue:c.surface,active?c.blue:c.line)+text(x+w/2,y+h/2+(line2?-5:5),line1,'svg-main-label')+(line2?text(x+w/2,y+h/2+18,line2,'svg-small'):'');}
  function dot(x,y,label,r=13){return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c.paleBlue}" stroke="${c.blue}" stroke-width="1.5"/>`+text(x,y+4,label,'svg-micro');}
  const clusters=[['P1','P3'],['P2','P4','S1','S3'],['S2','S4']];
  function clusterBox(x,y,w,h,i){
    let out=rect(x,y,w,h,c.paleBlue,c.blue)+text(x+w/2,y+21,`Cluster C${i+1}`,'svg-small');
    const labels=clusters[i],gap=Math.min(34,(w-24)/labels.length),start=x+w/2-gap*(labels.length-1)/2;
    labels.forEach((label,j)=>out+=dot(start+j*gap,y+h-21,label,Math.min(12,gap/2-2)));return out;
  }
  function sequence(s,mobile){
    let out='';
    ['Cached prefix','Current block','Cached suffix'].forEach((label,row)=>{
      const y=mobile?37+row*75:64, base=mobile?131:40+row*252, gap=mobile?66:52, width=mobile?49:44;
      out+=text(mobile?24:140+row*252,mobile?y+24:32,mobile?['Prefix','Current','Suffix'][row]:label.toUpperCase(),'svg-main-label',mobile?'start':'middle');
      if(row===1)out+=rect(mobile?119:282,mobile?y-8:50,mobile?282:232,mobile?58:112,c.surfaceSoft,s===0?c.ink:c.line,8);
      for(let i=0;i<4;i++){
        const pos=row*4+i, committed=(s>=5&&[4,5,7].includes(pos))||(s>=6&&pos===8),chosen=s>=2&&[1,3,8,10].includes(pos),x=base+i*gap;
        const fill=committed?c.paleGreen:row===1?c.surface:c.paleBlue;
        const edge=committed?c.green:chosen?c.blue:row===1?c.ink:c.blue;
        const value=committed?`✓ ${pos===8?'E':['A','B','C','D'][i]}`:row===0?`P${i+1}`:'M';
        if(s===6&&pos===8)out+=rect(x-4,y-4,width+8,47,'none',c.green,8,'class="svg-spotlight"');
        out+=rect(x,y,width,39,fill,edge,5,(chosen&&!committed?'class="svg-update-cell" ':'')+(!committed&&row>0?'stroke-dasharray="4 3"':''))+text(x+width/2,y+26,value,'svg-token');
        if(chosen&&!committed)out+=`<circle cx="${x+width-3}" cy="${y+1}" r="8" fill="${c.surface}" stroke="${c.blue}"/>`+text(x+width-3,y+5,'↑','svg-update-label');
        if(!mobile)out+=rect(x,125,width,17,row===1?c.surfaceSoft:c.paleBlue,chosen?c.blue:c.line,3,chosen?'class="svg-update-cell"':'');
      }
      out+=text(mobile?261:140+row*252,mobile?y+57:177,row===1?'recompute the active block':'reuse cached KV','svg-small');
    });
    return out+`<line x1="${mobile?25:38}" y1="${mobile?263:210}" x2="${mobile?435:762}" y2="${mobile?263:210}" stroke="${c.line}"/>`;
  }
  function drift(x,y,w,h,event){
    const points=event?[0.75,0.71,0.76,0.64,0.79,0.71,0.08]:[0.71,0.66,0.74,0.62,0.69,0.65,0.70];
    const path=points.map((v,i)=>`${i?'L':'M'}${x+i*w/(points.length-1)} ${y+v*h}`).join(' ');
    return `<line x1="${x}" y1="${y+h}" x2="${x+w}" y2="${y+h}" stroke="${c.line}"/><path d="${path}" fill="none" stroke="${event?c.blue:c.muted}" stroke-width="2.5"/>`+(event?`<circle cx="${x+w}" cy="${y+0.08*h}" r="4" fill="${c.blue}"/>`:'');
  }
  function desktop(s){
    let out='';
    if(s===0){
      out+=node(67,280,190,76,'Cached context','prefix and suffix')+node(304,280,190,76,'Block forward','bidirectional attention',true)+node(541,280,190,76,'Predictions','current positions');
      out+=arrow(263,318,298,318)+arrow(500,318,535,318,true)+text(400,433,'Reuse context. Recompute only the active block.','svg-label');
    }else if(s===1){
      out+=text(400,233,'Cached hidden states · clustered at block entry','svg-small');
      [65,305,545].forEach((x,i)=>{
        out+=clusterBox(x,247,180,70,i)+arrow(x+90,324,x+90,343);
        out+=`<circle cx="${x+90}" cy="371" r="25" fill="${c.paleBlue}" stroke="${c.blue}" stroke-width="1.7"/>`+text(x+90,377,`C${i+1}`,'svg-main-label')+text(x+90,417,'centroid → query','svg-small')+arrow(x+90,424,x+90,443,true);
      });
      out+=node(111,452,578,54,'Proxy attention over shared keys and values','',true)+text(400,529,'Each centroid comes from its cluster’s cached states.','svg-small');
    }else if(s===2){
      [80,310,540].forEach((x,i)=>{out+=rect(x,260,180,132,i===1?c.paleBlue:c.surfaceSoft,i===1?c.blue:c.line,6,i===1?'class="svg-update-cell"':'')+text(x+90,291,`Cluster C${i+1}`,'svg-main-label')+text(x+90,327,i===1?'Higher KL drift':'Lower KL drift','svg-label')+text(x+90,365,i===1?'Select P2, P4, S1, S3':'Reuse cached states',i===1?'svg-update-label':'svg-small');});
      out+=text(400,461,'Compare proxy attention with its previous distribution.','svg-label');
    }else if(s===3){
      [0,1,2,3].forEach(i=>out+=dot(104+i*38,309,['P2','P4','S1','S3'][i],15));
      out+=text(161,368,'Selected hidden states','svg-small')+node(300,263,177,93,'Sparse layer','forward',true)+node(553,263,170,93,'Update packet','states + positions',true)+arrow(246,309,289,309,true)+arrow(486,309,542,309,true)+text(400,459,'Position indices carry the update to the same locations.','svg-label');
    }else if(s===4){
      out+=text(400,231,'One packet → the next layer','svg-small');
      ['Layer ℓ output','Layer ℓ + 1'].forEach((label,row)=>{
        const y=247+row*92;out+=text(130,y+23,label,'svg-small','end');
        for(let i=0;i<12;i++){const chosen=[1,3,8,10].includes(i);out+=rect(147+i*43,y,34,32,chosen?c.paleBlue:c.surfaceSoft,chosen?c.blue:c.line,4,chosen?'class="svg-update-cell"':'');}
        if(row===0)[1,3,8,10].forEach(i=>out+=arrow(164+i*43,y+38,164+i*43,y+81,true));
      });
      out+=text(713,299,'same','svg-small')+text(713,316,'indices','svg-small');
      out+=text(400,434,'Patch matching hidden states, KV entries, and centroids.','svg-label');
      out+=text(400,476,'Selection is evaluated again at each layer.','svg-small');
    }else if(s===5){
      const xs=[229,393,557,721];out+=text(25,244,'Token','svg-small','start')+text(25,284,'Confidence','svg-small','start')+text(25,332,'Token drift','svg-small','start')+text(25,413,'Decision','svg-small','start');
      xs.forEach((x,i)=>{
        out+=text(x,244,['A','B','C','D'][i],'svg-main-label')+rect(x-53,260,106,14,c.surfaceSoft,c.line,5)+`<rect x="${x-53}" y="260" width="${[100,72,35,72][i]}" height="14" rx="5" fill="${i===2?c.muted:c.blue}"/>`+text(x,296,['High','Sufficient','Lower','Sufficient'][i],'svg-small');
        out+=drift(x-46,313,92,31,i===1||i===3)+text(x,367,i===1||i===3?'Event':'Quiet',i===1||i===3?'svg-drift-event':'svg-small');
        out+=rect(x-58,389,116,40,i===2?c.surfaceSoft:c.paleGreen,i===2?c.line:c.green,5)+text(x,415,i===2?'M · hold':'✓ Commit',i===2?'svg-node':'svg-commit');
      });
      out+=text(400,479,'A: confidence path · B / D: drift event + confidence','svg-small');
    }else if(s===6){
      out+=text(139,241,'Final-layer packet','svg-main-label')+text(402,241,'Confidence','svg-main-label')+text(662,241,'Decision','svg-main-label');
      [0,1].forEach(i=>{const y=267+i*116,ready=i===0;out+=rect(48,y,183,75,c.paleBlue,c.blue,7,'class="svg-update-cell"')+text(139,y+35,ready?'E':'F','svg-candidate')+text(139,y+59,'selected suffix state','svg-small')+node(310,y+7,182,61,ready?'Sufficient':'Insufficient','',ready)+rect(568,y,183,75,ready?c.paleGreen:c.surfaceSoft,ready?c.green:c.line,7,ready?'':'stroke-dasharray="4 3"')+text(660,y+46,ready?'✓ E':'M','svg-candidate')+arrow(239,y+37,300,y+37,ready)+arrow(500,y+37,558,y+37,ready);});
      out+=text(400,497,'Selection makes E eligible. Confidence makes E commit.','svg-small');
    }else{
      out+=node(77,287,215,82,'Calibrated context','reuse the updated cache',true)+node(486,287,235,82,'Continue denoising','remaining masked positions')+arrow(302,328,476,328,true)+text(400,455,'Advance when the current block is complete.','svg-label');
    }return out;
  }
  function mobile(s){
    let out='';
    if(s===0){out+=node(56,294,348,63,'Cached prefix and suffix','reused context')+arrow(230,365,230,386)+node(56,395,348,63,'Current-block forward','bidirectional attention',true);}
    else if(s===1){
      out+=text(230,289,'Cached states · built at block entry','svg-small');
      [40,165,310].forEach((x,i)=>{const w=i===1?130:110,cx=x+w/2;out+=clusterBox(x,309,w,76,i)+arrow(cx,393,cx,413)+`<circle cx="${cx}" cy="440" r="24" fill="${c.paleBlue}" stroke="${c.blue}"/>`+text(cx,446,`C${i+1}`,'svg-main-label');});
      out+=text(230,485,'Cluster centroids → query projection','svg-label')+arrow(230,497,230,517,true)+node(55,526,350,64,'Proxy attention','over the shared keys and values',true);
    }else if(s===2){[40,170,300].forEach((x,i)=>out+=rect(x,291,120,133,i===1?c.paleBlue:c.surfaceSoft,i===1?c.blue:c.line,6,i===1?'class="svg-update-cell"':'')+text(x+60,326,`Cluster C${i+1}`,'svg-main-label')+text(x+60,365,i===1?'Higher drift':'Lower drift','svg-node')+text(x+60,403,i===1?'Select':'Reuse',i===1?'svg-update-label':'svg-small'));out+=text(230,486,'KL drift prioritizes the update locations.','svg-label');}
    else if(s===3){[0,1,2,3].forEach(i=>out+=dot(125+i*70,296,['P2','P4','S1','S3'][i],16));out+=text(230,337,'Selected hidden states','svg-label')+arrow(230,348,230,365,true)+node(60,375,340,57,'Sparse layer forward','',true)+arrow(230,441,230,459,true)+node(60,468,340,57,'Update packet','states + positions',true);}
    else if(s===4){
      out+=text(230,278,'One packet → the next layer','svg-small');
      ['Layer ℓ out','Layer ℓ + 1'].forEach((label,row)=>{const y=298+row*85;out+=text(20,y+21,label,'svg-small','start');for(let i=0;i<12;i++){const chosen=[1,3,8,10].includes(i);out+=rect(110+i*26,y,22,28,chosen?c.paleBlue:c.surfaceSoft,chosen?c.blue:c.line,3,chosen?'class="svg-update-cell"':'');}if(row===0)[1,3,8,10].forEach(i=>out+=arrow(121+i*26,y+34,121+i*26,y+77,true));});
      out+=text(230,461,'Patch hidden states, KV, and centroids.','svg-label');
      out+=text(230,501,'Each layer evaluates its own selection.','svg-small');
    }
    else if(s===5){
      [0,1,2,3].forEach(i=>{const x=i%2===0?35:245,y=i<2?285:452,event=i===1||i===3;out+=rect(x,y,180,143,c.surface,c.line,7)+text(x+90,y+26,['A','B','C','D'][i],'svg-main-label')+text(x+90,y+51,['High confidence','Sufficient confidence','Lower confidence','Sufficient confidence'][i],'svg-small')+drift(x+31,y+65,118,25,event)+text(x+90,y+110,event?'Drift event':'Quiet drift',event?'svg-drift-event':'svg-small')+rect(x+28,y+118,124,21,i===2?c.surfaceSoft:c.paleGreen,i===2?c.line:c.green,4)+text(x+90,y+133,i===2?'M · hold':'✓ Commit',i===2?'svg-node':'svg-commit');});out+=text(230,629,'Confidence and token drift are separate signals.','svg-small');
    }else if(s===6){
      out+=text(230,292,'Final packet → confidence → decision','svg-label');
      [0,1].forEach(i=>{const y=321+i*121,ready=i===0;out+=rect(39,y,92,75,c.paleBlue,c.blue,6,'class="svg-update-cell"')+text(85,y+45,ready?'E':'F','svg-candidate')+node(173,y+7,145,61,ready?'Sufficient':'Insufficient','',ready)+rect(359,y,62,75,ready?c.paleGreen:c.surfaceSoft,ready?c.green:c.line,6,ready?'':'stroke-dasharray="4 3"')+text(390,y+44,ready?'✓ E':'M',ready?'svg-commit':'svg-node')+arrow(137,y+37,165,y+37,ready)+arrow(324,y+37,351,y+37,ready);});out+=text(230,561,'Eligible E passes confidence → early commit.','svg-label');
    }else{out+=node(55,296,350,64,'Calibrated context','reuse the updated cache',true)+arrow(230,368,230,389,true)+node(55,398,350,64,'Continue denoising','remaining masked positions')+text(230,517,'Advance after block completion.','svg-label');}
    return out;
  }
  window.drawPolestarWalkthrough=(stage,steps)=>{
    const style=getComputedStyle(document.documentElement),v=name=>style.getPropertyValue(name).trim();
    c={ink:v('--ink'),muted:v('--muted'),line:v('--line'),green:v('--green'),blue:v('--blue'),surface:v('--surface'),surfaceSoft:v('--surface-soft'),paleGreen:v('--pale-green'),paleBlue:v('--pale-blue')};
    const small=window.matchMedia('(max-width:760px)').matches;
    const height=small?(stage===1?625:stage===5?655:stage===6?596:550):550;
    const svg=document.getElementById('demo-svg');svg.setAttribute('viewBox',`0 0 ${small?460:800} ${height}`);
    const defs=`<defs><marker id="demo-arrow-gray" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c.muted}"/></marker><marker id="demo-arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c.blue}"/></marker></defs>`;
    svg.innerHTML=`<title id="demo-svg-title">${escape(steps[stage].title)}</title><desc id="demo-svg-description">${escape(steps[stage].summary)} Qualitative signals and symbolic positions illustrate the method.</desc>${defs}${sequence(stage,small)}${small?mobile(stage):desktop(stage)}`;
  };
})();
