'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const icons = {
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  book:'<path d="M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3Z"/><path d="M12 6v15"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  sound:'<path d="m3 9 5 0 5-4v14l-5-4H3Z"/><path d="M17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  leaf:'<path d="M5 19C-1 5 13 4 20 3c1 11-6 18-15 16Zm0 0 9-9"/>',
  light:'<path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
  check:'<path d="m5 12 4 4L20 5"/>',
  trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  export:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>'
};
function icon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.book}</svg>`;}
function decorate(){ $$('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);}); }
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function readStore(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));return Array.isArray(value)?value:fallback;}catch{return fallback;}}
let saved=readStore('wordroom.saved',[]),recent=readStore('wordroom.recent',[]);
let current=null,activeTab='meanings',view='explore',searchSequence=0,suggestSequence=0,suggestIndex=-1,suggestTimer,toastTimer;
let quizQuestions=null,quizChoices={},quizSubmitted=false,stats=null;
function persist(){try{localStorage.setItem('wordroom.saved',JSON.stringify(saved));localStorage.setItem('wordroom.recent',JSON.stringify(recent));}catch{toast('浏览器无法保存记录；请导出生词本留存。');}}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3000);}
async function api(path){const r=await fetch(path);if(!r.ok){let msg='词典暂时无法连接，请稍后重试。临时分享服务可能已关闭。';try{msg=(await r.json()).error||msg;}catch{}throw new Error(msg);}return r.json();}
const isSaved = word => saved.some(s=>s.word.toLowerCase()===word.toLowerCase());
function refreshRail(){
  $('#saved-count').textContent=saved.length;
  $('#recent').innerHTML=recent.length?recent.slice(0,6).map((w,i)=>`<button class="recent-word" data-word="${esc(w)}">${esc(w)}<span>↗</span></button>`).join(''):'<p class="rail-empty">从一个感兴趣的词开始。</p>';
  $$('[data-nav]').forEach(b=>{b.classList.toggle('active',b.dataset.nav===view);if(b.dataset.nav===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('#page-name').textContent=view==='saved'?'我的生词本':'单词探索';
}
function closeSuggestions(){clearTimeout(suggestTimer);suggestSequence++;$('#suggestions').hidden=true;$('#word-input').setAttribute('aria-expanded','false');suggestIndex=-1;}
async function showSuggestions(){
  const query=$('#word-input').value.trim();if(!query){closeSuggestions();return;}
  const seq=++suggestSequence;
  try{const data=await api('/api/suggest?word='+encodeURIComponent(query));if(seq!==suggestSequence)return;
    $('#suggestions').innerHTML=data.words.map((w,i)=>`<button class="suggestion" role="option" aria-selected="false" id="suggestion-${i}" data-word="${esc(w)}"><span>${esc(w)}</span><small>查看词条 ↗</small></button>`).join('');
    $('#suggestions').hidden=!data.words.length;$('#word-input').setAttribute('aria-expanded',String(!!data.words.length));suggestIndex=-1;
  }catch{closeSuggestions();}
}
async function search(word,{push=true,tab='meanings'}={}){
  word=word.trim();if(!word){$('#word-input').focus();toast('输入一个英语单词或短语。');return;}
  const seq=++searchSequence;view='explore';activeTab=tab;closeSuggestions();refreshRail();
  $('#word-input').value=word;$('#app-content').setAttribute('aria-busy','true');
  $('#app-content').innerHTML='<div class="loading-panel" role="status">正在查找这个词的语境…</div>';
  if(push){const url=new URL(location.href);url.search='';url.searchParams.set('word',word);history.pushState({},'',url);}
  try{
    const result=await api('/api/lookup?word='+encodeURIComponent(word));if(seq!==searchSequence)return;
    current=result;quizQuestions=null;quizChoices={};quizSubmitted=false;
    if(!result.found){$('#app-content').innerHTML=`<div class="empty-panel"><span>${icon('search')}</span><h2>没有找到 “${esc(word)}”</h2><p>检查拼写，或尝试单词原形。也可以直接搜索短语。</p>${result.suggestions.length?'<p>你可能想查</p><div class="family-tags">'+result.suggestions.map(w=>`<button data-word="${esc(w)}">${esc(w)}</button>`).join('')+'</div>':''}</div>`;}
    else{recent=[result.word,...recent.filter(w=>w!==result.word)].slice(0,12);persist();refreshRail();renderWord();}
  }catch(e){if(seq!==searchSequence)return;current=null;$('#app-content').innerHTML=`<div class="empty-panel"><h2>词典暂时没有连接</h2><p>${esc(e.message)}</p><button class="secondary-button" data-word="${esc(word)}">重新查找</button></div>`;}
  finally{if(seq===searchSequence)$('#app-content').setAttribute('aria-busy','false');}
}
function renderWord(){
  if(!current?.found)return;
  const w=current,notes=w.notes;
  const savedNow=isSaved(w.word);
  const relations=notes?.family?.length?notes.family:w.related;
  $('#app-content').innerHTML=`<div class="result-layout"><article class="word-paper">
    <div class="word-header">${w.resolved?`<div class="resolved">“${esc(w.query)}” 对应的词条：${esc(w.word)}</div>`:''}
      <div class="word-overline"><span class="mini-label">今天，让这个词更熟悉一点</span><div class="word-actions"><button class="icon-button ${savedNow?'saved':''}" data-action="save" aria-label="${savedNow?'从生词本移除':'加入生词本'}" title="${savedNow?'从生词本移除':'加入生词本'}">${icon('bookmark')}</button></div></div>
      <div class="word-title-row"><h2 class="word-title">${esc(w.word)}</h2></div>
      <div class="word-pron">${w.pronunciation.uk?`<div class="pron"><span>英</span>${esc(w.pronunciation.uk)}<button data-speak="en-GB" aria-label="朗读英式发音">${icon('sound')}</button></div>`:''}${w.pronunciation.us?`<div class="pron"><span>美</span>${esc(w.pronunciation.us)}<button data-speak="en-US" aria-label="朗读美式发音">${icon('sound')}</button></div>`:''}${!w.pronunciation.uk&&!w.pronunciation.us?'<span>词典未提供音标</span>':''}</div>
      <div class="pos-tags">${w.pos.map(p=>`<span class="pos-tag">${esc(p)}</span>`).join('')}<span class="pos-tag">${notes?'附学习笔记':'内置词典'}</span></div>${notes?.summary?`<p class="word-summary">${esc(notes.summary)}</p>`:''}
    </div>
    <div class="tabs" role="tablist" aria-label="词条内容">${[['meanings','词义与例句'],['collocations','常见搭配'],['compare','近义词辨析'],['quiz','学以致用']].map(([id,label])=>`<button class="tab" id="tab-${id}" role="tab" aria-selected="${activeTab===id}" aria-controls="word-panel" tabindex="${activeTab===id?'0':'-1'}" data-tab="${id}">${label}</button>`).join('')}</div>
    <section class="panel" id="word-panel" role="tabpanel" aria-labelledby="tab-${activeTab}"></section>
  </article><aside class="study-sidebar">
    <div class="study-card"><div class="study-card-heading"><span>让理解留下来</span>${icon('leaf')}</div><h3>认识，还不够。<br>下次也要记得。</h3><p>把今天遇到的词放进生词本，<br>为下一次复习留个位置。</p><button class="save-button" data-action="save">${icon(savedNow?'check':'bookmark')}${savedNow?'已加入生词本':'加入我的生词本'}</button></div>
    ${relations?.length?`<section class="sidebar-section"><h3>${notes?.family?.length?'顺着词族再走一步':'相关短语'}</h3>${relations.slice(0,6).map(x=>`<button class="related-word" data-word="${esc(x)}">${esc(x)}<span>↗</span></button>`).join('')}</section>`:''}
    <section class="sidebar-section"><h3>把这个词用起来</h3><p class="section-intro">读完例句，试着用这个词描述一件与你有关的事。</p><button class="text-button" data-tab="quiz">做几道词汇练习 ↗</button></section>
    <p class="sidebar-source"><strong>有出处的学习</strong><br>义项与例句可在词典原文中核对。补充学习笔记单独标注。</p>
  </aside></div>`;
  renderPanel();
}
function exampleHTML(ex){return `<div class="example"><p lang="en">${esc(ex.en)}</p>${ex.zh?`<p class="translation">${esc(ex.zh)}</p>`:''}</div>`;}
function sourceDetails(){return `<details class="raw-details"><summary>展开完整词典原文</summary><div class="raw-source">${esc(current.raw).replaceAll('◆','\n◆ ').replaceAll('➤','\n➤ ').replaceAll('●','\n● ').replaceAll('🔊','')}</div></details>`;}
function sectionHeading(title,source){return `<div class="section-heading"><h3>${title}</h3><span class="source-tag">${source}</span></div>`;}
function renderMeanings(){
  const notes=current.notes;const senses=notes?.senses||current.senses;
  let content=sectionHeading(notes?.senses?'先掌握这几个意思':'词义与例句',notes?.senses?'学习笔记 · 原创例句':'从内置词典整理');
  if(senses.length){content+=senses.map((s,i)=>`<section class="sense"><span class="sense-num">${i+1}</span>${s.zh?`<h4><em>${esc(s.pos)}</em>${esc(s.zh)}</h4><p class="definition-en">${esc(s.en)}</p>`:`${s.heading?`<h4>${esc(s.heading)}</h4>`:''}<p class="source-definition">${esc(s.text)}</p>`}${s.examples.slice(0,2).map(exampleHTML).join('')}</section>`).join('');}
  else{content+='<p class="section-intro">这个词条没有清晰的分节标记，请在下方查看保留完整内容的词典原文。</p>';}
  if(notes?.tip)content+=`<div class="learning-note">${icon('light')}<div><strong>记住这个用法</strong><p>${esc(notes.tip)}</p></div></div>`;
  content+=sourceDetails()+`<p class="source-footnote">${notes?.senses?'以上为 AI 辅助整理的学习笔记，不是词典原文或官方考点。':'词典文本经自动分段，复杂词条请结合完整原文阅读。'}</p>`;
  return content;
}
function collocationList(items){return items.map(c=>`<div class="collocation"><span class="phrase" lang="en">${esc(c.en)}</span>${c.zh?`<span class="meaning">${esc(c.zh)}</span>`:''}</div>`).join('');}
function renderCollocations(){
  let html=sectionHeading('把单词放进搭配里',current.notes?.collocations?'学习笔记':'词典搭配与用法结构');
  if(current.notes?.collocations){html+=collocationList(current.notes.collocations);if(current.collocations.length)html+=`<details class="more-group"><summary>更多词典搭配与结构（${current.collocations.length}）</summary>${collocationList(current.collocations)}</details>`;}
  else if(current.collocations.length)html+=collocationList(current.collocations);
  else html+='<div class="empty-small">词典没有可单独提取的搭配。可以回到“词义与例句”，从完整例句里观察用法。</div>';
  return html+sourceDetails();
}
function comparisonItems(items){return items.map(i=>`<div class="compare-item"><button class="compare-word" data-word="${esc(i.word)}">${esc(i.word)} ↗</button><p>${esc(i.description)}</p>${i.example?exampleHTML(i.example):''}</div>`).join('');}
function groupHTML(g){return `<h4 class="comparison-title">${esc(g.title)}</h4><p class="section-intro">${esc(g.intro)}</p>${comparisonItems(g.items)}${g.notes.map(n=>`<p class="compare-note">${esc(n)}</p>`).join('')}<p class="source-footnote">来源：内置词典「${esc(g.source_word)}」词条。</p>`;}
function renderCompare(){
  let html=sectionHeading('相近，不等于相同',current.notes?.compare?'学习笔记 · 辨析':'词典辨析');
  if(current.notes?.compare){html+=`<h4 class="comparison-title">${esc(current.notes.compare.map(i=>i.word).join(' / '))}</h4>`+comparisonItems(current.notes.compare);}
  if(current.comparisons.length){html+=current.comparisons.map((g,i)=>current.notes?.compare||i>0?`<details class="more-group"><summary>词典中的 ${esc(g.title)}</summary>${groupHTML(g)}</details>`:groupHTML(g)).join('');}
  if(!current.notes?.compare&&!current.comparisons.length){
    html+='<div class="empty-small">这个词暂无专门的近义词辨析资料。相近词并不总能互换，建议结合具体句子比较。</div>';
    if(current.synonyms.length)html+=`<p class="section-intro">词典标注的近义词，可点击分别查看用法：</p><div class="family-tags">${current.synonyms.map(w=>`<button data-word="${esc(w)}">${esc(w)}</button>`).join('')}</div>`;
  }
  return html+sourceDetails();
}
async function renderQuiz(){
  const word=current.word;const panel=$('#word-panel');
  if(quizQuestions===null){panel.innerHTML='<p class="empty-small" role="status">正在找与这个词有关的练习…</p>';try{const d=await api('/api/quiz?word='+encodeURIComponent(word));if(current?.word!==word||activeTab!=='quiz'||view!=='explore')return;quizQuestions=d.questions;}catch(e){if(current?.word===word&&activeTab==='quiz'&&view==='explore')panel.innerHTML=`<p class="empty-small">${esc(e.message)}</p><button class="secondary-button" data-tab="quiz">重试</button>`;return;}}
  let html=sectionHeading('在句子里检验理解','大英赛词汇题库');
  if(!quizQuestions.length){panel.innerHTML=html+'<div class="empty-small">题库暂时没有与这个词匹配的练习。可以试试 make、affect 或 happy，也可以用这个词自己造一个句子。</div>';return;}
  html+='<p class="section-intro">目标词可能出现在选项或解析中。先完成选择，再查看答案；这些题用于词汇巩固。</p>';
  if(quizSubmitted){const correct=quizQuestions.filter((q,i)=>quizChoices[i]===q.answer).length;html+=`<div class="quiz-score"><strong>${correct} / ${quizQuestions.length}</strong>答对题数 · 看看哪些用法还需要巩固</div>`;}
  html+=quizQuestions.map((q,i)=>`<section class="quiz-question"><div class="quiz-source"><span>第 ${i+1} 题 / 共 ${quizQuestions.length} 题</span><span>${esc(q.source)}</span></div><p class="quiz-stem">${esc(q.stem)}</p>${q.choices.map((choice,j)=>`<button class="quiz-option ${quizChoices[i]===j?'chosen':''} ${quizSubmitted?(j===q.answer?'correct':quizChoices[i]===j?'incorrect':''):''}" data-question="${i}" data-choice="${j}" aria-pressed="${quizChoices[i]===j}" ${quizSubmitted?'disabled':''}><span>${String.fromCharCode(65+j)}</span>${esc(choice)}</button>`).join('')}${quizSubmitted?`<div class="quiz-explanation"><strong>正确答案：${String.fromCharCode(65+q.answer)}</strong><br>${esc(q.analysis)}</div>`:''}</section>`).join('');
  html+=quizSubmitted?'<button class="secondary-button" data-action="retry-quiz">重新练习</button>':`<button class="primary-button" data-action="submit-quiz" ${Object.keys(quizChoices).length===quizQuestions.length?'':'disabled'}>提交答案（${Object.keys(quizChoices).length}/${quizQuestions.length}）</button>`;
  panel.innerHTML=html;
}
function renderPanel(){if(!current?.found||view!=='explore')return;$$('.tab').forEach(t=>{const selected=t.dataset.tab===activeTab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;});$('#word-panel').setAttribute('aria-labelledby','tab-'+activeTab);if(activeTab==='quiz'){renderQuiz();return;}$('#word-panel').innerHTML=activeTab==='meanings'?renderMeanings():activeTab==='collocations'?renderCollocations():renderCompare();}
function saveCurrent(){if(!current?.found)return;const word=current.word;if(isSaved(word)){saved=saved.filter(s=>s.word!==word);toast('已从生词本移除');}else{saved.unshift({word,summary:current.notes?.summary||current.senses[0]?.text||'查看词典原文',date:new Date().toISOString()});toast('已加入生词本，留给下次复习。');}persist();refreshRail();renderWord();}
function renderSaved(){
  searchSequence++;view='saved';closeSuggestions();refreshRail();$('#app-content').setAttribute('aria-busy','false');
  $('#app-content').innerHTML=`<section class="collection"><div class="collection-heading"><div><h2>我的生词本</h2><p>${saved.length?'已经留下 '+saved.length+' 个值得再读的词。':'把遇见的好词，留给下一次复习。'}</p></div>${saved.length?'<button class="secondary-button" data-action="export">导出生词本</button>':''}</div>${saved.length?`<div class="saved-list">${saved.map(s=>`<article class="saved-entry"><button class="saved-open" data-word="${esc(s.word)}"><strong>${esc(s.word)}</strong><small>${esc(s.summary.slice(0,100))}</small></button><button class="icon-button" data-remove="${esc(s.word)}" aria-label="移除 ${esc(s.word)}">${icon('trash')}</button></article>`).join('')}</div>`:'<div class="empty-panel"><h2>还没有收藏的单词</h2><p>查词后，点击书签或“加入我的生词本”。</p><button class="primary-button" data-word="approach">从 approach 开始</button></div>'}</section>`;
}
function exportSaved(){const text='# 词间 · 我的生词本\n\n'+saved.map(s=>`## ${s.word}\n${s.summary}\n\n收藏日期：${s.date.slice(0,10)}\n`).join('\n');const blob=new Blob([text],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='wordroom-vocabulary.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出生词本');}
function speak(lang){if(!('speechSynthesis'in window)){toast('当前浏览器不支持朗读，请参考词典音标。');return;}const voices=speechSynthesis.getVoices();const voice=voices.find(v=>v.lang===lang)||voices.find(v=>v.lang.startsWith('en'));if(!voice){toast('没有找到英语语音，请在系统设置中添加英语语音包。');return;}speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(current.word);utterance.lang=lang;utterance.voice=voice;utterance.rate=.85;utterance.onerror=()=>toast('朗读未成功；请检查系统英语语音包。');speechSynthesis.speak(utterance);}
function showAbout(){$('#about-dialog').showModal();}
$('#search-form').addEventListener('submit',e=>{e.preventDefault();search($('#word-input').value);});
$('#word-input').addEventListener('input',()=>{clearTimeout(suggestTimer);suggestSequence++;suggestTimer=setTimeout(showSuggestions,180);});
$('#word-input').addEventListener('keydown',e=>{
  const options=$$('.suggestion');
  if(e.key==='Escape'){closeSuggestions();return;}
  if(!$('#suggestions').hidden&&options.length&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();suggestIndex=(suggestIndex+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((o,i)=>{o.classList.toggle('selected',i===suggestIndex);o.setAttribute('aria-selected',String(i===suggestIndex));});}
  if(e.key==='Enter'&&!$('#suggestions').hidden&&suggestIndex>=0){e.preventDefault();search(options[suggestIndex].dataset.word);}
});
document.addEventListener('keydown',e=>{
  if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('#about-dialog').open){e.preventDefault();$('#word-input').focus();$('#word-input').select();}
  if(e.target.matches('.tab')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=$$('.tab');let idx=tabs.indexOf(e.target);idx=e.key==='Home'?0:e.key==='End'?tabs.length-1:(idx+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;activeTab=tabs[idx].dataset.tab;renderPanel();tabs[idx].focus();}
});
document.addEventListener('click',e=>{
  const wordButton=e.target.closest('[data-word]');if(wordButton){search(wordButton.dataset.word);return;}
  const tab=e.target.closest('[data-tab]');if(tab){activeTab=tab.dataset.tab;renderPanel();return;}
  const nav=e.target.closest('[data-nav]');if(nav){if(nav.dataset.nav==='saved'){renderSaved();const url=new URL(location.href);url.search='?view=saved';history.pushState({},'',url);}else search(current?.found?current.word:'approach');return;}
  const action=e.target.closest('[data-action]');if(action){const a=action.dataset.action;if(a==='save')saveCurrent();if(a==='export')exportSaved();if(a==='submit-quiz'&&quizQuestions&&Object.keys(quizChoices).length===quizQuestions.length){quizSubmitted=true;renderQuiz();$('#word-panel').scrollIntoView({block:'start',behavior:'auto'});}if(a==='retry-quiz'){quizChoices={};quizSubmitted=false;renderQuiz();}return;}
  const option=e.target.closest('[data-question]');if(option&&!quizSubmitted){quizChoices[option.dataset.question]=Number(option.dataset.choice);renderQuiz();return;}
  const remove=e.target.closest('[data-remove]');if(remove){saved=saved.filter(s=>s.word!==remove.dataset.remove);persist();renderSaved();toast('已从生词本移除');return;}
  const speaker=e.target.closest('[data-speak]');if(speaker){speak(speaker.dataset.speak);return;}
  if(!e.target.closest('.search-area'))closeSuggestions();
});
$('#about-button').addEventListener('click',showAbout);$('#footer-about').addEventListener('click',showAbout);$('#close-about').addEventListener('click',()=>$('#about-dialog').close());
window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search);if(params.get('view')==='saved')renderSaved();else search(params.get('word')||'approach',{push:false});});
decorate();refreshRail();
api('/api/stats').then(s=>{stats=s;$('#dictionary-count').textContent=s.entries.toLocaleString()+' 条内置词条';$('#about-stats').textContent=`${s.entries.toLocaleString()} 条去重词条（含短语与变形） · ${s.comparisons} 组词典辨析 · ${s.questions} 道题库记录 · ${s.notes} 份补充笔记`;}).catch(()=>$('#dictionary-count').textContent='词典暂时未连接');
const initial=new URLSearchParams(location.search);if(initial.get('view')==='saved')renderSaved();else search(initial.get('word')||'approach',{push:false});
