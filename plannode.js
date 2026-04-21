const V='#6b4ef6',RD='#dc2626',GY='#4b5563';
const DC=['#9ca3af','#6b4ef6','#818cf8','#f59e0b','#10b981','#f43f5e','#0ea5e9','#a78bfa'];
const DN=['루트','모듈','기능','상세기능','서브기능','세부항목','하위항목','기타'];
const BCLS={tdd:'btdd',ai:'bai',crud:'bcrud',api:'bapi',usp:'busp'};
const ON={tdd:'background:#fff1f0;color:#dc2626;border-color:#fca5a5',ai:'background:#f0fdf4;color:#16a34a;border-color:#86efac',crud:'background:#eff6ff;color:#1d4ed8;border-color:#93c5fd',api:'background:#faf5ff;color:#7c3aed;border-color:#c4b5fd',usp:'background:#fffbeb;color:#b45309;border-color:#fcd34d'};
const OFF='background:#fff;color:#888;border-color:#d0cbc4';
const BTYPES=['tdd','ai','crud','api','usp'];
const bl=b=>({tdd:'TDD',ai:'AI',crud:'CRUD',api:'API',usp:'USP'}[b]||b);
const esc=s=>{const d=document.createElement('div');d.textContent=s||'';return d.innerHTML;};
const COL_W=244,ROW_H=122;

const R_=document.getElementById('R'),CW=document.getElementById('CW'),CV=document.getElementById('CV'),EG=document.getElementById('EG'),CTX=document.getElementById('CTX'),PM=document.getElementById('PM'),ES=document.getElementById('ES'),TST=document.getElementById('TST');
let scale=0.85,panX=24,panY=24,panning=false,ps={x:0,y:0},selId=null,nc=500,ctxOpen=false;
let projects=[],curP=null,nodes=[],lm={},curView='tree';

function toast(m){TST.textContent=m;TST.style.display='block';clearTimeout(TST._t);TST._t=setTimeout(()=>TST.style.display='none',2400);}
const find=id=>nodes.find(n=>n.id===id);
const getDC=d=>DC[Math.min(d,DC.length-1)];
function getDepth(id,v=new Set()){if(v.has(id))return 0;v.add(id);const n=find(id);if(!n||!n.parent_id)return 0;return 1+getDepth(n.parent_id,v);}

document.querySelectorAll('.vtab').forEach(t=>{
  t.addEventListener('click',()=>{
    curView=t.dataset.view;
    document.querySelectorAll('.vtab').forEach(x=>x.classList.toggle('on',x===t));
    const map={tree:'V-TREE',prd:'V-PRD',spec:'V-SPEC',ai:'V-AI'};
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById(map[curView]).classList.add('active');
    if(curView==='prd')buildPRD();
    if(curView==='spec')buildSpec();
  });
});

function mkB(lbl,bg,fn){
  const b=document.createElement('button');b.textContent=lbl;
  b.setAttribute('style',`display:inline-flex;align-items:center;height:26px;padding:0 10px;background:${bg};color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer`);
  b.onmouseenter=()=>b.style.opacity='.82';b.onmouseleave=()=>b.style.opacity='1';
  b.onclick=e=>{e.stopPropagation();fn();};return b;
}

function toMdLine(n,d=0,lines=[]){
  const indent='  '.repeat(d),badges=(n.badges||[]).map(b=>bl(b)).join(' ');
  const prefix=d===0?'#':d===1?'##':d===2?'###':'-';
  lines.push(`${indent}${prefix} [${n.num||'—'}] ${n.name}${badges?' ('+badges+')':''}`);
  if(n.description)lines.push(`${indent}  ${n.description}`);
  nodes.filter(c=>c.parent_id===n.id).forEach(c=>toMdLine(c,d+1,lines));
  return lines;
}
function buildPRD(){
  if(!curP){document.getElementById('prd-tree').textContent='프로젝트를 먼저 열어줘.';return;}
  document.getElementById('prd-title').textContent=curP.name+' — PRD';
  document.getElementById('prd-meta').innerHTML=`<span><strong>작성자:</strong> ${esc(curP.author)}</span><span><strong>기간:</strong> ${curP.start_date} ~ ${curP.end_date}</span><span><strong>노드:</strong> ${nodes.length}개</span>`;
  document.getElementById('prd-tree').textContent=nodes.filter(n=>!n.parent_id).flatMap(r=>toMdLine(r)).join('\n');
  const tddN=nodes.filter(n=>(n.badges||[]).includes('tdd'));
  document.getElementById('prd-tdd').innerHTML=tddN.length?tddN.map(n=>`• [${n.num||'—'}] ${esc(n.name)}`).join('<br>'):'없음';
  const aiN=nodes.filter(n=>(n.badges||[]).includes('ai'));
  document.getElementById('prd-ai').innerHTML=aiN.length?aiN.map(n=>`• [${n.num||'—'}] ${esc(n.name)}`).join('<br>'):'없음';
}
function buildSpec(){
  const tbody=document.getElementById('spec-tbody');
  if(!curP||!nodes.length){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:40px;color:#bbb;font-size:13px">프로젝트를 먼저 열어줘.</td></tr>';return;}
  tbody.innerHTML=[...nodes].sort((a,b)=>(a.num||'').localeCompare(b.num||'')).map(n=>{
    const d=getDepth(n.id),color=getDC(d);
    const bgs=(n.badges||[]).map(b=>`<span class="bg ${BCLS[b]}">${bl(b)}</span>`).join(' ');
    return `<tr><td style="font-family:monospace;color:#888;font-size:11px">${esc(n.num||'—')}</td><td><span class="depth-pill" style="background:${color}">${DN[d]??'Lv'+d}</span></td><td style="font-weight:500;color:#1a1a1a">${esc(n.name)}</td><td style="color:#888">${esc(n.description||'—')}</td><td>${bgs||'<span style="color:#ddd;font-size:11px">—</span>'}</td></tr>`;
  }).join('');
}
function getTreeText(){return nodes.filter(n=>!n.parent_id).flatMap(r=>toMdLine(r)).join('\n');}
function triggerAI(type){
  if(!curP){toast('프로젝트를 먼저 열어줘');return;}
  const prompts={
    prd:`다음 기능 트리를 완전한 PRD 문서로 변환해줘:\n\n${getTreeText()}`,
    miss:`다음 기능 트리에서 누락된 기능을 탐지해줘:\n\n${getTreeText()}`,
    tdd:`다음 기능 트리에서 TDD 우선순위(P0/P1/P2)를 정리해줘. 각 도메인별 핵심 테스트 케이스도 제안해줘:\n\n${getTreeText()}`,
    harness:`다음 기능 트리를 Cursor AI Harness 워크플로우 플랜으로 변환해줘:\n\n${getTreeText()}`
  };
  const res=document.getElementById('ai-result');res.className='ai-result show';res.textContent='분석 준비 중... (실제 배포 시 Claude API 연동)';
}
document.getElementById('ai-prd').onclick=()=>triggerAI('prd');
document.getElementById('ai-miss').onclick=()=>triggerAI('miss');
document.getElementById('ai-tdd').onclick=()=>triggerAI('tdd');
document.getElementById('ai-harness').onclick=()=>triggerAI('harness');

function fitToScreen(){
  if(!nodes.length){toast('노드가 없어');return;}
  const xs=nodes.map(n=>gp(n).x),ys=nodes.map(n=>gp(n).y);
  const minX=Math.min(...xs)-20,minY=Math.min(...ys)-20,maxX=Math.max(...xs)+200,maxY=Math.max(...ys)+100;
  const ns=Math.max(Math.min(Math.min((CW.offsetWidth-40)/(maxX-minX),(CW.offsetHeight-40)/(maxY-minY)),1.2),0.15);
  panX=(CW.offsetWidth-40)/2+20-(minX+maxX)/2*ns;panY=(CW.offsetHeight-40)/2+20-(minY+maxY)/2*ns;scale=ns;applyTx();toast('전체 노드 맞춤 완료 ⊡');
}
function dlFile(c,t,f){const b=new Blob([c],{type:t}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=f;a.click();URL.revokeObjectURL(u);}
document.getElementById('BFT').onclick=fitToScreen;
document.getElementById('BMD').onclick=()=>{
  if(!curP){toast('프로젝트를 먼저 선택해줘');return;}
  const md=`# ${curP.name} — Feature Map\n작성자: ${curP.author} | 기간: ${curP.start_date} ~ ${curP.end_date}\n\n---\n\n${nodes.filter(n=>!n.parent_id).flatMap(r=>toMdLine(r)).join('\n')}`;
  dlFile(md,'text/markdown',(curP.name||'plannode')+'-feature-map.md');toast('MD 다운로드 완료 ✓');
};
document.getElementById('BPR').onclick=()=>{
  if(!curP){toast('프로젝트를 먼저 선택해줘');return;}
  const tree=nodes.filter(n=>!n.parent_id).flatMap(r=>toMdLine(r)).join('\n');
  const rows=[...nodes].sort((a,b)=>(a.num||'').localeCompare(b.num||'')).map(n=>{const d=getDepth(n.id);return`| ${n.num||'—'} | ${DN[d]??'Lv'+d} | ${n.name} | ${n.description||'—'} | ${(n.badges||[]).map(b=>bl(b)).join(', ')||'—'} |`;});
  const prd=`# ${curP.name} PRD\n\n> 작성자: ${curP.author}  \n> 기간: ${curP.start_date} ~ ${curP.end_date}\n\n---\n\n## 기능 트리\n\n\`\`\`\n${tree}\n\`\`\`\n\n---\n\n## 기능명세서\n\n| 번호 | 뎁스 | 기능명 | 설명 | 배지 |\n|------|------|--------|------|------|\n${rows.join('\n')}\n\n---\n\n## TDD 필수 도메인\n\n${nodes.filter(n=>(n.badges||[]).includes('tdd')).map(n=>`- [${n.num||'—'}] **${n.name}**`).join('\n')||'없음'}\n\n## AI 연동 기능\n\n${nodes.filter(n=>(n.badges||[]).includes('ai')).map(n=>`- [${n.num||'—'}] **${n.name}**`).join('\n')||'없음'}\n`;
  dlFile(prd,'text/markdown',(curP.name||'plannode')+'-prd.md');toast('PRD 다운로드 완료 ✓');
};

function bld(nid,col,r){const kids=nodes.filter(n=>n.parent_id===nid);if(!kids.length){lm[nid]={col,row:r};return r+1;}let row=r,cs=r;for(const k of kids)row=bld(k.id,col+1,row);lm[nid]={col,row:(cs+row-1)/2};return row;}
const ap=id=>{const l=lm[id];return l?{x:l.col*COL_W+28,y:l.row*ROW_H+30}:{x:0,y:0};};
const gp=n=>(n.mx!=null&&n.my!=null)?{x:n.mx,y:n.my}:ap(n.id);

function render(){
  lm={};nodes.filter(n=>!n.parent_id).forEach((n,i)=>{let r=i===0?0:Object.keys(lm).length;bld(n.id,0,r);});
  CV.querySelectorAll('.nw,.cp').forEach(e=>e.remove());EG.innerHTML='';
  const mc=Math.max(0,...nodes.map(n=>lm[n.id]?.col||0));
  for(let i=0;i<=mc;i++){const p=document.createElement('div');p.className='cp cp'+Math.min(i,4);p.style.left=(i*COL_W+28)+'px';p.textContent=DN[i]??`Lv${i}`;CV.appendChild(p);}
  nodes.forEach(n=>{
    const d=getDepth(n.id),bc=getDC(d),pos=gp(n);
    const w=document.createElement('div');w.className='nw';w.id='nw-'+n.id;w.style.cssText=`left:${pos.x}px;top:${pos.y}px`;
    const nd=document.createElement('div');nd.className='nd'+(d===0?' rnd':'')+(selId===n.id?' sel':'');nd.id='nd-'+n.id;
    const bgs=(n.badges||[]).map(b=>`<span class="bg ${BCLS[b]}">${bl(b)}</span>`).join('');
    nd.innerHTML=`<div class="ndt"><div class="nb" style="background:${bc}"></div><div style="flex:1;min-width:0"><div class="nn">${esc(n.name)}<span class="ndepth">L${d}</span></div></div></div>${n.description?`<div class="nds">${esc(n.description)}</div>`:''}<div class="nm">${bgs}<span class="nnum">${n.num||''}</span></div><div class="na" id="na-${n.id}"></div>`;
    nd.addEventListener('mousedown',e=>{if(e.button!==0||e.target.closest('.na'))return;selId=n.id;sDrag(e,n);});
    nd.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();selId=n.id;render();showCtx(e,n);});
    const na=nd.querySelector('#na-'+n.id);
    na.appendChild(mkB('+ 추가',V,()=>addChild(n.id)));
    if(n.parent_id)na.appendChild(mkB('✕ 삭제',RD,()=>cDel(n.id)));
    w.appendChild(nd);
    const pb=document.createElement('button');pb.className='pb2';pb.textContent='+';
    pb.setAttribute('style',`position:absolute;right:-19px;top:50%;transform:translateY(-50%);width:20px;height:20px;border-radius:50%;border:none;background:${bc};color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:6;box-shadow:0 2px 5px rgba(0,0,0,.2)`);
    pb.addEventListener('mousedown',e=>e.stopPropagation());pb.addEventListener('click',e=>{e.stopPropagation();addChild(n.id);});
    pb.onmouseenter=()=>pb.style.opacity='.8';pb.onmouseleave=()=>pb.style.opacity='1';
    w.appendChild(pb);CV.appendChild(w);
  });
  drawEdges();updMM();applyTx();
  if(curView==='prd')buildPRD();
  if(curView==='spec')buildSpec();
}

function drawEdges(){
  EG.innerHTML='';
  const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
  const mk=document.createElementNS('http://www.w3.org/2000/svg','marker');
  mk.setAttribute('id','ar');mk.setAttribute('markerWidth','5');mk.setAttribute('markerHeight','5');mk.setAttribute('refX','4');mk.setAttribute('refY','2.5');mk.setAttribute('orient','auto');
  const py=document.createElementNS('http://www.w3.org/2000/svg','polygon');py.setAttribute('points','0 0,5 2.5,0 5');py.setAttribute('fill','#a78bfa');mk.appendChild(py);defs.appendChild(mk);EG.appendChild(defs);
  nodes.forEach(n=>{nodes.filter(c=>c.parent_id===n.id).forEach(c=>{
    const d=getDepth(n.id),pp=gp(n),cp=gp(c),pw=d===0?168:188;
    const x1=pp.x+pw,y1=pp.y+44,x2=cp.x,y2=cp.y+44,mx=(x1+x2)/2;
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    p.setAttribute('stroke',getDC(d)+'66');p.setAttribute('stroke-width','1.5');p.setAttribute('fill','none');p.setAttribute('marker-end','url(#ar)');EG.appendChild(p);
  });});
}

function sDrag(e,n){
  const p=gp(n),sx=(e.clientX-panX)/scale-p.x,sy=(e.clientY-panY)/scale-p.y;let moved=false;
  const mv=ev=>{moved=true;n.mx=(ev.clientX-panX)/scale-sx;n.my=(ev.clientY-panY)/scale-sy;const w=document.getElementById('nw-'+n.id);if(w){w.style.left=n.mx+'px';w.style.top=n.my+'px';}drawEdges();updMM();};
  const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);if(moved)render();};
  document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
}
function addChild(pid){
  const p=find(pid);if(!p)return;
  const kids=nodes.filter(n=>n.parent_id===pid);
  const id='n'+(++nc),num=(p.num?p.num+'.':'')+(kids.length+1);
  const d=getDepth(pid),typeMap={0:'module',1:'feature'};
  const nn={id,parent_id:pid,name:'새 노드',description:'',node_type:typeMap[d]??'detail',num,badges:[],mx:null,my:null};
  nodes=[...nodes,nn];render();
  requestAnimationFrame(()=>requestAnimationFrame(()=>showEdit(nn)));
}
function cDel(id){
  const n=find(id);if(!n)return;
  const gAll=nid=>[nid,...nodes.filter(x=>x.parent_id===nid).flatMap(c=>gAll(c.id))];
  const ids=gAll(id),cc=ids.length-1;
  showIM(`<h3>노드 삭제 확인</h3><p style="font-size:13px;color:#444;line-height:1.7"><span style="color:#dc2626;font-weight:700">"${esc(n.name)}"</span>을 삭제할까요?</p>${cc>0?`<p style="font-size:12px;color:#999;margin-top:5px">하위 <strong style="color:#dc2626">${cc}개</strong>도 함께 삭제돼.</p>`:''}<p style="font-size:12px;color:#bbb;margin-top:4px">되돌릴 수 없어.</p>`,
  [['취소',GY,null],['삭제',RD,()=>{nodes=nodes.filter(x=>!ids.includes(x.id));render();toast('삭제 완료');}]]);
}
function showEdit(n){
  const d=getDepth(n.id),cb=[...n.badges];
  const bh=BTYPES.map(b=>`<button type="button" data-b="${b}" style="padding:3px 9px;border-radius:20px;font-size:10px;font-weight:600;cursor:pointer;border:1.5px solid;${cb.includes(b)?ON[b]:OFF}">${bl(b)}</button>`).join('');
  showIM(`<h3>노드 편집 <span style="font-size:11px;color:#bbb;font-weight:400">— ${DN[d]??'Lv'+d}</span></h3>
    <label class="fl">이름</label><input class="fi ein" value="${esc(n.name)}" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;margin-bottom:10px">
    <label class="fl">설명</label><textarea class="fi eid" rows="2" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;resize:vertical;margin-bottom:10px">${esc(n.description||'')}</textarea>
    <label class="fl">번호</label><input class="fi einum" value="${esc(n.num||'')}" style="width:100%;background:#faf9f7;border:1.5px solid #e0dbd4;border-radius:8px;color:#1a1a1a;font-size:13px;padding:8px 10px;outline:none;font-family:inherit;margin-bottom:10px">
    <label class="fl">배지</label><div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${bh}</div>`,
  [['취소',GY,null],['저장',V,()=>{
    const nm=document.querySelector('.ein').value.trim();if(nm)n.name=nm;
    n.description=document.querySelector('.eid').value.trim();n.num=document.querySelector('.einum').value.trim();
    n.badges=[...cb];nodes=[...nodes];render();toast('저장 완료 ✓');
  }]],bg=>{
    bg.querySelectorAll('[data-b]').forEach(btn=>{btn.onclick=()=>{const b=btn.dataset.b,idx=cb.indexOf(b);if(idx>=0){cb.splice(idx,1);btn.setAttribute('style',`padding:3px 9px;border-radius:20px;font-size:10px;font-weight:600;cursor:pointer;border:1.5px solid;${OFF}`);}else{cb.push(b);btn.setAttribute('style',`padding:3px 9px;border-radius:20px;font-size:10px;font-weight:600;cursor:pointer;border:1.5px solid;${ON[b]}`);}}; });
  });
  document.querySelector('.ein')?.focus();
}
function showIM(html,btns,extra){
  const bg=document.createElement('div');bg.className='mbg';
  bg.innerHTML=`<div class="mo">${html}<div id="ima" style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"></div></div>`;
  R_.appendChild(bg);const acts=bg.querySelector('#ima');
  btns.forEach(([l,c,fn])=>{const b=mkB(l,c,()=>{fn&&fn();bg.remove();});b.style.cssText+=';padding:8px 18px;font-size:13px;border-radius:8px';acts.appendChild(b);});
  if(extra)extra(bg);bg.addEventListener('click',e=>{if(e.target===bg)bg.remove();});
}
function showCtx(e,n){
  CTX.innerHTML=`
    <div class="cx" data-a="edit" data-id="${n.id}">✎  이름·설명 편집</div>
    <div class="cx" data-a="add" data-id="${n.id}">+  하위 노드 추가</div>
    <div class="cxsp"></div><div class="cxsc">배지</div>
    ${BTYPES.map(b=>`<div class="cx" data-a="badge" data-badge="${b}" data-id="${n.id}">${(n.badges||[]).includes(b)?'✓':'○'}  ${bl(b)}</div>`).join('')}
    <div class="cxsp"></div>
    <div class="cx" data-a="reset" data-id="${n.id}">↺  위치 초기화</div>
    ${n.parent_id?`<div class="cxsp"></div><div class="cx dng" data-a="del" data-id="${n.id}">✕  삭제</div>`:''}`;
  const ar=R_.getBoundingClientRect();let lx=e.clientX-ar.left+2,ly=e.clientY-ar.top+2;
  CTX.style.cssText=`display:block;left:${lx}px;top:${ly}px`;
  requestAnimationFrame(()=>{if(lx+CTX.offsetWidth>R_.offsetWidth-4)CTX.style.left=(lx-CTX.offsetWidth-4)+'px';if(ly+CTX.offsetHeight>R_.offsetHeight-4)CTX.style.top=(ly-CTX.offsetHeight)+'px';});ctxOpen=true;
}
CTX.addEventListener('click',e=>{
  const row=e.target.closest('[data-a]');if(!row)return;
  const{a,id,badge}=row.dataset,n=find(id);CTX.style.display='none';ctxOpen=false;if(!n)return;
  if(a==='edit')showEdit(n);else if(a==='add')addChild(id);else if(a==='del')cDel(id);
  else if(a==='reset'){n.mx=null;n.my=null;render();toast('위치 초기화');}
  else if(a==='badge'){const i=n.badges.indexOf(badge);i>=0?n.badges.splice(i,1):n.badges.push(badge);nodes=[...nodes];render();}
});
document.addEventListener('click',e=>{if(ctxOpen&&!CTX.contains(e.target)){CTX.style.display='none';ctxOpen=false;}});
function applyTx(){CV.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;document.getElementById('ZP').textContent=Math.round(scale*100)+'%';updMM();}
function updMM(){
  const mc=document.getElementById('MMC');if(!mc)return;
  const mw=mc.offsetWidth||120,mh=mc.offsetHeight||72;mc.width=mw;mc.height=mh;
  const c=mc.getContext('2d');c.clearRect(0,0,mw,mh);if(!nodes.length)return;
  const xs=nodes.map(n=>gp(n).x),ys=nodes.map(n=>gp(n).y);
  const mnX=Math.min(...xs)-12,mnY=Math.min(...ys)-12,mxX=Math.max(...xs)+198,mxY=Math.max(...ys)+78;
  const rw=mxX-mnX,rh=mxY-mnY,s2=Math.min(mw/rw,mh/rh)*.88;
  const ox=(mw-rw*s2)/2-mnX*s2,oy=(mh-rh*s2)/2-mnY*s2;
  nodes.forEach(n=>{const p=gp(n),d=getDepth(n.id);c.fillStyle=getDC(d)+'22';c.strokeStyle=getDC(d)+'88';c.lineWidth=.5;c.beginPath();c.roundRect(p.x*s2+ox,p.y*s2+oy,(d===0?168:188)*s2,42*s2,2);c.fill();c.stroke();});
  const vp=document.getElementById('MMV'),W=CW.offsetWidth,H=CW.offsetHeight;
  vp.style.cssText=`left:${(-panX/scale)*s2+ox}px;top:${(-panY/scale)*s2+oy}px;width:${(W/scale)*s2}px;height:${(H/scale)*s2}px`;
}
CW.addEventListener('mousedown',e=>{if(e.target===CW||e.target===CV||e.target===EG){panning=true;ps={x:e.clientX,y:e.clientY};CW.style.cursor='grabbing';}});
document.addEventListener('mousemove',e=>{if(!panning)return;panX+=e.clientX-ps.x;panY+=e.clientY-ps.y;ps={x:e.clientX,y:e.clientY};applyTx();});
document.addEventListener('mouseup',()=>{panning=false;CW.style.cursor='default';});
CW.addEventListener('wheel',e=>{
  if(e.shiftKey||e.ctrlKey){e.preventDefault();const r=CW.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,d=e.deltaY<0?1.1:.909;panX=mx-(mx-panX)*d;panY=my-(my-panY)*d;scale=Math.min(Math.max(scale*d,.12),3);applyTx();}
  else{e.preventDefault();panX-=e.deltaX;panY-=e.deltaY;applyTx();}
},{passive:false});
document.getElementById('ZI').onclick=()=>{scale=Math.min(scale*1.15,3);applyTx();};
document.getElementById('ZO').onclick=()=>{scale=Math.max(scale*.87,.12);applyTx();};
function getDemoNodes(pid){return[
  {id:pid+'-r',parent_id:null,name:'크레이지샷 리뉴얼',description:'카메라 렌탈 플랫폼',node_type:'root',num:'PRD',badges:[],mx:null,my:null},
  {id:pid+'-m1',parent_id:pid+'-r',name:'M1. 상품 관리',description:'카탈로그·재고·이미지',node_type:'module',num:'1',badges:[],mx:null,my:null},
  {id:pid+'-m2',parent_id:pid+'-r',name:'M2. 예약·재고',description:'원자성 보장 도메인',node_type:'module',num:'2',badges:['tdd'],mx:null,my:null},
  {id:pid+'-m3',parent_id:pid+'-r',name:'M3. 결제·정산',description:'Toss v2 PG',node_type:'module',num:'3',badges:['tdd'],mx:null,my:null},
  {id:pid+'-f11',parent_id:pid+'-m1',name:'F1-1. 상품 등록',description:'카메라/렌즈/드론 CRUD',node_type:'feature',num:'1.1',badges:['crud'],mx:null,my:null},
  {id:pid+'-f12',parent_id:pid+'-m1',name:'F1-2. AI 추천',description:'Sales Agent 연동',node_type:'feature',num:'1.2',badges:['ai'],mx:null,my:null},
  {id:pid+'-d111',parent_id:pid+'-f11',name:'카탈로그 구성',description:'카테고리·시리얼·썸네일',node_type:'detail',num:'1.1.1',badges:['crud'],mx:null,my:null},
  {id:pid+'-d112',parent_id:pid+'-f11',name:'단가 3중화',description:'12h/24h/purchase',node_type:'detail',num:'1.1.2',badges:['tdd'],mx:null,my:null},
  {id:pid+'-f21',parent_id:pid+'-m2',name:'F2-1. 가용성 달력',description:'tsrange 충돌방지',node_type:'feature',num:'2.1',badges:['tdd'],mx:null,my:null},
  {id:pid+'-f31',parent_id:pid+'-m3',name:'F3-1. Toss v2',description:'내국인 일반결제',node_type:'feature',num:'3.1',badges:['tdd'],mx:null,my:null},
  {id:pid+'-f32',parent_id:pid+'-m3',name:'F3-2. 국제카드',description:'H-5 비자 검증 USP',node_type:'feature',num:'3.2',badges:['tdd','usp'],mx:null,my:null},
];}
function openProj(p){
  curP=p;PM.style.display='none';document.getElementById('PNT').textContent=p.name;
  nodes=p.id==='s1'?getDemoNodes(p.id):[{id:p.id+'-r',parent_id:null,name:p.name,description:p.description||'',node_type:'root',num:'PRD',badges:[],mx:null,my:null}];
  ES.style.display='none';render();renderCards();toast(`"${p.name}" 열었어`);
}
function renderCards(){
  const area=document.getElementById('PLC');
  document.getElementById('PLT').textContent=`생성된 프로젝트 (${projects.length})`;area.innerHTML='';
  projects.forEach(p=>{
    const isc=curP&&curP.id===p.id;const c=document.createElement('button');c.className='pc'+(isc?' acp':'');
    c.innerHTML=`<div class="pi" style="background:${isc?V:'#ede9fe'}">📋</div><div class="pif"><div class="pn2">${esc(p.name)}</div><div class="pm2">${p.author} | ${p.start_date} ~ ${p.end_date}</div></div>${isc?'<span class="ct">현재</span>':''}`;
    c.onclick=()=>openProj(p);area.appendChild(c);
  });
}
function openModal(){PM.style.display='flex';renderCards();}
function closeModal(){PM.style.display='none';document.getElementById('FER').style.display='none';}
document.getElementById('BPN').onclick=openModal;
document.getElementById('BNE').onclick=openModal;
document.getElementById('MCL').onclick=closeModal;
PM.addEventListener('click',e=>{if(e.target===PM)closeModal();});
document.getElementById('BCR').onclick=()=>{
  const name=document.getElementById('FN').value.trim(),author=document.getElementById('FA').value.trim(),start=document.getElementById('FS').value,end=document.getElementById('FE').value,desc=document.getElementById('FD').value.trim(),er=document.getElementById('FER');
  if(!name){er.textContent='프로젝트 이름을 입력해줘';er.style.display='block';return;}
  if(!author){er.textContent='작성자를 입력해줘';er.style.display='block';return;}
  if(!start){er.textContent='시작일을 선택해줘';er.style.display='block';return;}
  if(!end){er.textContent='종료일을 선택해줘';er.style.display='block';return;}
  er.style.display='none';
  const p={id:'p'+(++nc),name,author,start_date:start,end_date:end,description:desc};
  projects=[p,...projects];openProj(p);['FN','FA','FS','FE','FD'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});toast(`"${p.name}" 생성 완료 ✓`);
};

projects=[
  {id:'s1',name:'크레이지샷 리뉴얼',author:'Stephen Cconzy',start_date:'2026-04-01',end_date:'2026-07-31',description:'카메라 렌탈 플랫폼 전체 리뉴얼'},
  {id:'s2',name:'1TeamWorks v2',author:'Stephen Cconzy',start_date:'2026-05-01',end_date:'2026-12-31',description:'B2G SaaS 2차 개발'},
];
openProj(projects[0]);
