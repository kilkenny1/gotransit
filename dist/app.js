const $=id=>document.getElementById(id);let platforms=null,platformRequest=0;let feed,line='',lastRefresh=new Date();const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});function now(){let p=Object.fromEntries(fmt.formatToParts(new Date()).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,min:+p.hour*60 + +p.minute + +p.second/60,time:`${p.hour}:${p.minute}:${p.second}`}}function time(m){return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}${m>=1440?' +1':''}`}function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function tick(){let n=now();$('clock').textContent=n.time;$('today').textContent=new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto',weekday:'short',month:'short',day:'numeric'}).toUpperCase()+' · ET'}tick();setInterval(tick,1000);
function render(){if(!feed)return;let n=now(),date=$('date').value,from=$('from').value,to=$('to').value;let key=date.replaceAll('-',''),dayOffset=date===n.date?0:1;let results=[];let sources=feed.sources||{},relevant=line?[feed.lines[line].source]:Object.keys(sources),missing=relevant.filter(s=>!sources[s]?.dates.includes(key));let available=relevant.length&&missing.length===relevant.length?undefined:feed.days[key];$('coverage-notice').hidden=!missing.length;$('coverage-notice').textContent=missing.map(s=>(s==='UP'?'UP Express':'GO Transit')+' schedules are unavailable for this date.').join(' ');let ids=(available||[]).map(id=>[id,0]);if(date===n.date){let d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);let prev=d.toISOString().slice(0,10).replaceAll('-','');ids.push(...(feed.days[prev]||[]).map(id=>[id,-1440]))}
for(let [id,offset] of ids){let p=feed.patterns[id];if(line&&p[0]!==line)continue;let i=p[2].findIndex(s=>s[0]===from&&s[3]!=='1');if(i<0)continue;let j=to?p[2].findIndex((s,k)=>k>i&&s[0]===to&&s[4]!=='1'):p[2].length-1;if(j<=i)continue;let departure=p[2][i][2]+offset;if(date===n.date&&departure<n.min)continue;if(offset<0&&departure<0)continue;results.push({p,i,j,departure,arrival:p[2][j][1]+offset})}results.sort((a,b)=>a.departure-b.departure);$('code').textContent=from;$('station').textContent=feed.stops[from].name;$('subtitle').textContent='Train departures · '+(to?'To '+feed.stops[to].name:'All destinations');$('count').textContent=results.length+' scheduled departure'+(results.length===1?'':'s')+(date===n.date?' remaining today':' on '+date);$('coverage').textContent=`Schedule imported ${feed.imported}. Feed coverage: ${Object.entries(feed.sources||{}).map(([s,c])=>(s==='UP'?'UP Express':'GO Transit')+': '+c.start+'–'+c.end).join('; ')}. Automatic feed refresh runs daily when the included GitHub workflow is enabled.`;
if(!results.length){$('rows').innerHTML=`<div class="empty"><h3>${!available?'Schedule unavailable':from===to?'Choose different stations':'No direct trains found'}</h3><p>${!available?'This date is outside the downloaded feed. Choose a date within the feed coverage.':from===to?'Your start and end station must be different.':'Try another line, destination, or travel date. Only direct trains with remaining departures are shown.'}</p></div>`;return}
$('rows').innerHTML=results.slice(0,100).map(({p,i,j,departure,arrival})=>{let l=feed.lines[p[0]];return `<details class="train"><summary class="train-main"><span class="depart">${time(departure)}</span><span class="destination"><span class="badge" style="background:${esc(l.color)}">${esc(p[0])}</span><span><div class="dest-name">${esc(to?feed.stops[to].name:l.name)}${!to?auroraIndicator(p):''}</div><div class="line-name">${esc(to?l.name:'Direct train')}${to?auroraIndicator(p):''}</div></span></span><span class="arrival">${time(arrival)}<small>${to?'At selected station':'Arrival'}</small></span><span class="platform-cell">${platformCell(p,departure,date,from)}</span><span class="chevron">⌄</span></summary><div class="train-meta"><span>Train <strong>${esc(p[3])}</strong></span><span>Final destination <strong>${esc(p[1])}</strong></span></div><div class="stop-section"><h3>Stops</h3><ol class="stops" style="--route-color:${esc(l.color)}">${p[2].slice(i,j+1).map((s,index)=>`<li class="stop"><span class="stop-name">${esc(feed.stops[s[0]].name)}</span><span class="stop-time">${time(index===0?s[2]:s[1])}</span></li>`).join('')}</ol></div></details>`}).join('');}

fetch('feed.json', {cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Feed unavailable');return r.json()}).then(d=>{feed=d;let q=new URLSearchParams(location.search);$('from').value=d.stops[q.get('from')]?q.get('from'):'UN';$('to').value=d.stops[q.get('to')]?q.get('to'):'';$('date').value=/^\d{4}-\d{2}-\d{2}$/.test(q.get('date')||'')?q.get('date'):now().date;$('lines').innerHTML='<button class="selected" data-line="">All lines</button>'+Object.entries(d.lines).sort().map(([id,l])=>`<button data-line="${esc(id)}"><i style="background:${esc(l.color)}"></i>${esc(l.name)}</button>`).join('');setupStationSearch();syncStationSearch();render();refreshPlatforms()}).catch(e=>{$('rows').innerHTML='<div class="empty"><h3>Unable to load the schedule</h3><p>Check your connection and refresh the page.</p></div>';$('count').textContent='Schedule unavailable';console.error(e)});
function update(){syncStationSearch();refreshPlatforms();let q=new URLSearchParams({from:$('from').value,to:$('to').value,date:$('date').value});history.replaceState(null,'','?'+q);render()}['from','to','date'].forEach(id=>$(id).addEventListener('change',update));$('lines').addEventListener('click',e=>{let b=e.target.closest('button');if(!b)return;line=b.dataset.line;document.querySelectorAll('#lines button').forEach(x=>x.classList.toggle('selected',x===b));render()});$('swap').onclick=()=>{if(!$('to').value)return;let a=$('from').value;$('from').value=$('to').value;$('to').value=a;update()};$('reset').onclick=()=>{buttonFeedback($('reset'),document.querySelector('.journey'));$('from').value='UN';$('to').value='';$('date').value=now().date;line='';document.querySelectorAll('#lines button').forEach(x=>x.classList.toggle('selected',x.dataset.line===''));update()};$('refresh').onclick=()=>{buttonFeedback($('refresh'),document.querySelector('.board'));refreshPlatforms();render();$('updated').textContent='Board refreshed '+now().time};$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{})};setInterval(()=>{if(!document.querySelector('.train[open]'))render()},30000);

function syncStationSearch(){if(!feed)return;for(const id of ['from','to'])$(id+'-search').value=feed.stops[$(id).value]?.name||(id==='to'?'All destinations':'');}
function setupStationSearch(){
 const stations=Object.entries(feed.stops).sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([id,s])=>({id,name:s.name}));
 for(const id of ['from','to']){
  const input=$(id+'-search'),list=$(id+'-options');let matches=[],active=-1,pointerStart=null;
  input.disabled=false;
  function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function paint(){list.innerHTML=matches.length?matches.map((s,i)=>`<span role="option" id="${id}-option-${i}" data-index="${i}" aria-selected="${i===active}" class="station-option">${esc(s.name)}</span>`).join(''):'<span class="station-no-results">No matching stations</span>';if(active>=0){input.setAttribute('aria-activedescendant',`${id}-option-${active}`);$(id+'-option-'+active).scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
  function show(all=false){const query=all?'':input.value.trim().toLowerCase();const choices=id==='to'?[{id:'',name:'All destinations'},...stations]:stations;matches=choices.filter(s=>s.name.toLowerCase().includes(query)||s.id.toLowerCase()===query);active=-1;list.hidden=false;input.setAttribute('aria-expanded','true');paint();}
  function choose(index){if(!matches[index])return;$(id).value=matches[index].id;close();update();input.blur();}
  input.addEventListener('focus',()=>{input.select();show(true);});
  input.addEventListener('input',()=>show());
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){close();syncStationSearch();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(list.hidden)show(true);if(matches.length){active=(active+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;paint();}}if(e.key==='Enter'){e.preventDefault();choose(active<0?0:active);}});
  // Commit a tap before mobile blur can hide the result; allow dragging to scroll.
  list.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
  list.addEventListener('pointerup',e=>{
   const start=pointerStart;pointerStart=null;
   const option=e.target.closest('[data-index]');
   if(start&&option&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<12){e.preventDefault();e.stopPropagation();choose(+option.dataset.index);}
  });
  list.addEventListener('pointercancel',()=>{pointerStart=null;});
  // Prevent the wrapping label from refocusing the search and reopening the list.
  list.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();let option=e.target.closest('[data-index]');if(option&&!list.hidden)choose(+option.dataset.index);});
  input.addEventListener('blur',()=>{if(pointerStart)return;close();syncStationSearch();});
  document.addEventListener('pointerdown',e=>{if(!input.parentElement.contains(e.target)){pointerStart=null;close();input.value=feed.stops[$(id).value]?.name||(id==='to'?'All destinations':'');}});
 }
}

function platformLabel(p,departure,date,station){
 if(p[0]==='UP')return 'Platform <span class="platform-unknown">unavailable</span>';
 if(date!==now().date)return 'Platform <span class="platform-unknown">—</span>';
 if(!platforms||platforms.station!==station||Date.now()-Date.parse(platforms.updatedAt)>90000)return 'Platform <span class="platform-unknown">unavailable</span>';
 const travel=new Date(date+'T12:00:00Z');travel.setUTCDate(travel.getUTCDate()+Math.floor(departure/1440));const departureDate=travel.toISOString().slice(0,10),minute=((departure%1440)+1440)%1440;
 const trip=platforms.trips.find(t=>String(t.trip).replace(/^0+/,'')===String(p[3]).replace(/^0+/,'')&&t.date===departureDate&&t.minute===minute);
 const clean=value=>{value=String(value||'').trim();return /^(?:|[-—]|0|TBA|TBD|N\/A|Unknown)$/i.test(value)?'':value;};
 const actual=clean(trip?.actualPlatform),scheduled=clean(trip?.scheduledPlatform);
 return actual?'Platform <strong>'+esc(actual)+'</strong>':scheduled?'Platform <strong>'+esc(scheduled)+'</strong> <span class="platform-unknown">scheduled</span>':'Platform <span class="platform-unknown">not posted</span>';
}
async function refreshPlatforms(){
 if(!feed)return;const endpoint=window.RAILBOARD_CONFIG?.platformEndpoint,version=++platformRequest,station=$('from').value;
 platforms=null;
 if(!endpoint){$('platform-status').textContent='Live platforms are not connected.';return;}
 if($('date').value!==now().date){$('platform-status').textContent='Platforms are available on the travel day.';return;}
 $('platform-status').textContent='Checking live platforms…';
 try{
  const url=new URL(endpoint);url.searchParams.set('station',station);
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Platforms unavailable');
  const data=await response.json();const age=Date.now()-Date.parse(data.updatedAt);
  if(data.station!==station||!Array.isArray(data.trips)||!Number.isFinite(age)||age>90000||age< -60000)throw Error('Invalid platforms');
  if(version!==platformRequest)return;platforms=data;$('platform-status').textContent='Platforms checked '+now().time+' ET.';render();
 }catch{if(version!==platformRequest)return;platforms=null;$('platform-status').textContent='Live platforms are temporarily unavailable.';render();}
}
setInterval(()=>{if(!document.hidden)refreshPlatforms();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPlatforms();});

function platformCell(p,departure,date,station){
 const label=platformLabel(p,departure,date,station);
 if(label.includes('<strong>'))return label.replace(/^Platform /,'');
 const reason=label.replace(/<[^>]*>/g,'');
 return '<span class="platform-missing" aria-label="'+esc(reason)+'" title="'+esc(reason)+'">—</span>';
}

function buttonFeedback(button,region){
 if(button._feedbackTimer)clearTimeout(button._feedbackTimer);
 button.classList.remove('action-feedback');region.classList.remove('region-feedback');
 // Restart feedback for repeated taps without delaying the action itself.
 void button.offsetWidth;
 button.classList.add('action-feedback');region.classList.add('region-feedback');
 button._feedbackTimer=setTimeout(()=>{button.classList.remove('action-feedback');region.classList.remove('region-feedback');},650);
}

function auroraIndicator(trip){return trip[0]==='BR'&&/^Aurora(?: GO)?$/i.test(trip[1].trim())?'<span class="aurora-indicator" aria-label="Final destination Aurora">Aurora</span>':'';}
