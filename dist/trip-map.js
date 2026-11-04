// Leaflet is vendored locally. Only public tiles and sanitized vehicle data reach this page.
(()=>{
 let map,routeLayer,trainLayer,selection=null,following=false,lastButton=null,hashOpening=false;
 const dialog=document.createElement('dialog');dialog.id='trip-map-dialog';dialog.setAttribute('aria-labelledby','map-title');
 dialog.innerHTML=`<div class="map-heading"><div><span class="eyebrow">TRIP MAP</span><h2 id="map-title"></h2></div><button type="button" id="map-close" aria-label="Close trip map">×</button></div>
 <div class="map-toolbar"><button id="map-fit" type="button">Fit route</button><button id="map-follow" type="button" aria-pressed="false">Follow train</button><label><input id="map-route-toggle" type="checkbox" checked>Route & stops</label><label><input id="map-go-toggle" type="checkbox">Other GO</label><label><input id="map-up-toggle" type="checkbox">Other UP</label></div>
 <div class="map-canvas-wrap"><div id="trip-map-canvas" role="region" aria-label="Interactive trip map"></div><p id="map-tile-error" hidden>Basemap unavailable. Route and train positions are still shown.</p></div>
 <div class="map-trip-card"><p id="map-status" role="status"></p><details id="map-stops"><summary>Stops <span id="map-stop-count"></span></summary><ol class="stops" id="map-stop-list"></ol></details></div>`;
 document.body.append(dialog);
 const el=id=>document.getElementById(id);
 const serviceDate=(trip,index,departure,date)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+(departure-trip[2][index][2])/1440);return d.toISOString().slice(0,10);};
 function liveVehicles(){
  if(!vehicleData||Date.now()-Date.parse(vehicleData.updatedAt)>90000)return [];
  return vehicleData.vehicles.filter(v=>Date.now()-Date.parse(v.updatedAt)<120000&&Date.now()-Date.parse(v.updatedAt)>=-60000);
 }
 function selectedVehicle(){return selection&&liveVehicles().find(v=>v.line===selection.trip[0]&&v.trip===String(selection.trip[3])&&v.date===selection.service);}
 function init(){
  if(map)return true;
  if(!window.L){el('map-status').textContent='The map could not load. Please reload the page.';return false;}
  map=L.map('trip-map-canvas',{zoomControl:false,minZoom:6,maxZoom:19}).setView([43.75,-79.5],9);
  L.control.zoom({position:'bottomleft'}).addTo(map);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
  tiles.on('tileerror',()=>{el('map-tile-error').hidden=false;});
  routeLayer=L.featureGroup().addTo(map);trainLayer=L.layerGroup().addTo(map);
  new ResizeObserver(()=>map.invalidateSize({pan:false})).observe(el('trip-map-canvas'));
  map.on('dragstart',()=>setFollow(false));
  return true;
 }
 function setFollow(value){following=value;el('map-follow').setAttribute('aria-pressed',String(value));}
 function fit(){if(routeLayer?.getBounds().isValid())map.fitBounds(routeLayer.getBounds(),{padding:[28,28],maxZoom:14});setFollow(false);}
 function drawRoute(){
  routeLayer.clearLayers();if(!selection||!el('map-route-toggle').checked)return;
  const trip=selection.trip,color=feed.lines[trip[0]].color;
  const points=feed.shapes?.[trip[4]]||trip[2].map(s=>feed.stops[s[0]]).filter(s=>Number.isFinite(s.latitude)&&Number.isFinite(s.longitude)).map(s=>[s.latitude,s.longitude]);
  if(points.length>1)L.polyline(points,{color,weight:5,opacity:0.9}).addTo(routeLayer);
  trip[2].forEach((stop,index)=>{
   const station=feed.stops[stop[0]];if(!Number.isFinite(station.latitude)||!Number.isFinite(station.longitude))return;
   const endpoint=index===0||index===trip[2].length-1;
   L.circleMarker([station.latitude,station.longitude],{radius:endpoint?7:5,color,weight:3,fillColor:'#fff',fillOpacity:1}).bindPopup(`<strong>${esc(station.name)}</strong><br>${time(index===0?stop[2]:stop[1])} ET`).addTo(routeLayer);
  });
 }
 function drawTrains(){
  if(!map||!selection)return;trainLayer.clearLayers();
  const selected=selectedVehicle(),showToday=selection.date===now().date||Boolean(selected);
  const visible=showToday?liveVehicles().filter(v=>v===selected||(v.line==='UP'?el('map-up-toggle').checked:el('map-go-toggle').checked)):[];
  visible.forEach(v=>{
   const active=v===selected,color=feed.lines[v.line]?.color||'#fff';
   const marker=L.marker([v.latitude,v.longitude],{zIndexOffset:active?1000:0,icon:L.divIcon({className:'train-map-icon'+(active?' selected-train':''),html:`<span style="--train-color:${esc(color)}">${esc(v.line)}<small>${esc(v.trip)}</small></span>`,iconSize:[54,44],iconAnchor:[27,22]}),title:`${v.line} train ${v.trip}`,keyboard:true});
   marker.bindPopup(`<strong>${esc(v.line)} · Train ${esc(v.trip)}</strong><br>${esc(feed.stops[v.stop]?.name||'Live position')}<br>Updated ${esc(new Date(v.updatedAt).toLocaleTimeString('en-CA',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}))} ET${active?'':'<br><button type="button" class="map-select-train" data-map-line="'+esc(v.line)+'" data-map-number="'+esc(v.trip)+'" data-map-service="'+esc(v.date)+'">View this trip</button>'}`).addTo(trainLayer);
  });
  el('map-follow').disabled=!selected||!showToday;
  if(selected&&showToday){
   const prefix={STOPPED_AT:'At',INCOMING_AT:'Approaching',IN_TRANSIT_TO:'Heading toward'}[selected.status]||'Near';
   el('map-status').textContent=`Live · ${prefix} ${feed.stops[selected.stop]?.name||'reported location'} · Updated ${new Date(selected.updatedAt).toLocaleTimeString('en-CA',{timeZone:'America/Toronto',hour12:false})} ET`;
   if(following)map.panTo([selected.latitude,selected.longitude]);
  }else{setFollow(false);el('map-status').textContent=showToday?'Scheduled route · No fresh live position for this train. Positions refresh every 30 seconds.':'Scheduled route · Live positions are available on the travel day.';}
 }
 function open(id,index,departure,date,button){
  const trip=feed?.patterns[id];if(!trip)return;
  lastButton=button||document.activeElement;selection={id,trip,index,departure,date,service:serviceDate(trip,index,departure,date)};
  el('map-title').innerHTML=`<span class="badge" style="background:${esc(feed.lines[trip[0]].color)}">${esc(trip[0])}</span><span>${esc(trip[1])}<small>Train ${esc(trip[3])} · ${esc(date)} · ET</small></span>`;
  el('map-stop-count').textContent=trip[2].length;
  el('map-stop-list').style.setProperty('--route-color',feed.lines[trip[0]].color);
  el('map-stop-list').innerHTML=trip[2].map((stop,i)=>`<li class="stop"><span class="stop-name">${esc(feed.stops[stop[0]].name)}</span><span class="stop-time">${time(i===0?stop[2]:stop[1])}</span></li>`).join('');
  if(!dialog.open){dialog.showModal();document.body.classList.add('map-open');}
  if(init()){map.invalidateSize();drawRoute();drawTrains();fit();}
  if(!hashOpening)history.replaceState(null,'','#'+new URLSearchParams({trip:trip[3],line:trip[0],service:selection.service}));
 }
 function fromHash(){
  if(!feed)return;const q=new URLSearchParams(location.hash.slice(1)),number=q.get('trip'),line=q.get('line'),service=q.get('service')||now().date;
  if(!number)return;
  const id=(feed.days[service.replaceAll('-','')]||[]).find(id=>String(feed.patterns[id][3])===number&&(!line||feed.patterns[id][0]===line));
  if(id===undefined)return;hashOpening=true;open(id,0,feed.patterns[id][2][0][2],service);hashOpening=false;
 }
 el('map-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{document.body.classList.remove('map-open');selection=null;setFollow(false);if(location.hash.startsWith('#trip='))history.replaceState(null,'',location.pathname+location.search);if(lastButton?.isConnected)lastButton.focus({preventScroll:true});});
 el('map-fit').onclick=()=>{if(!el('map-route-toggle').checked){el('map-route-toggle').checked=true;drawRoute();}fit();};
 el('map-follow').onclick=()=>{const v=selectedVehicle();if(v){setFollow(!following);if(following)map.setView([v.latitude,v.longitude],Math.max(13,map.getZoom()));}};
 el('map-route-toggle').onchange=drawRoute;
 for(const id of ['map-go-toggle','map-up-toggle'])el(id).onchange=drawTrains;
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-map-trip]');
  if(button){event.preventDefault();open(Number(button.dataset.mapTrip),Number(button.dataset.mapIndex),Number(button.dataset.mapDeparture),button.dataset.mapDate,button);return;}
  const other=event.target.closest('.map-select-train');if(other){const q=other.dataset;const id=(feed.days[q.mapService.replaceAll('-','')]||[]).find(id=>feed.patterns[id][0]===q.mapLine&&String(feed.patterns[id][3])===q.mapNumber);if(id!==undefined)open(id,0,feed.patterns[id][2][0][2],q.mapService,other);}
 });
 window.addEventListener('hashchange',fromHash);
 window.railboardMap={refresh(){if(dialog.open)drawTrains();else fromHash();}};
 // Expire stale markers even while the network is unavailable or the board has no departures.
 setInterval(()=>{if(dialog.open)drawTrains();},10000);
 if(feed)fromHash();
})();
