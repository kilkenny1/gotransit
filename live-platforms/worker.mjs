// The API key is a Cloudflare secret. It is never returned or sent to the browser.
const TORONTO = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const LINES=new Set(['LW','LE','BR','KI','MI','RH','ST','UP']);
function localStamp(date){const p=Object.fromEntries(TORONTO.formatToParts(date).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;}
function fresh(timestamp,now,maxAge=120){const age=(+now-Date.parse(timestamp))/1000;return Number.isFinite(age)&&age>=-60&&age<=maxAge;}
export function departureParts(value){
 if(typeof value!=='string')return null;
 const microsoft=/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(value);
 if(microsoft)value=localStamp(new Date(+microsoft[1]));
 else if(/(?:Z|[+-]\d\d:\d\d)$/.test(value)){const date=new Date(value);if(!Number.isFinite(+date))return null;value=localStamp(date);}
 const m=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(value);
 return m?{date:m[1],minute:+m[2]*60 + +m[3]}:null;
}
export function normalize(payload,station,now=new Date()){
 if(!payload.Metadata||!['0','200'].includes(String(payload.Metadata.ErrorCode||'0')))throw Error('Upstream rejected request');
 const stamp=String(payload.Metadata.TimeStamp||'').replace(' ','T');
 if(!fresh(stamp+'Z',new Date(localStamp(now)+'Z')))throw Error('Stale upstream data');
 if(!Array.isArray(payload.NextService?.Lines))throw Error('Invalid departure response');
 return {station,updatedAt:now.toISOString(),trips:payload.NextService.Lines.filter(t=>String(t.StopCode)===station&&(!t.ServiceType||t.ServiceType==='T')).flatMap(t=>{
  const d=departureParts(t.ScheduledDepartureTime);if(!d||!t.TripNumber)return [];
  return [{trip:String(t.TripNumber),line:String(t.LineCode||''),...d,actualPlatform:String(t.ActualPlatform||'').trim(),scheduledPlatform:String(t.ScheduledPlatform||'').trim()}];})};
}
export function normalizeUnion(payload,now=new Date()){
 if(!Array.isArray(payload.AllDepartures?.Trip))throw Error('Invalid Union departures');
 const lines={'Lakeshore West':'LW','Lakeshore East':'LE','Barrie':'BR','Kitchener':'KI','Milton':'MI','Richmond Hill':'RH','Stouffville':'ST','UP Express':'UP'};
 return normalize({Metadata:payload.Metadata,NextService:{Lines:payload.AllDepartures.Trip.filter(t=>t.ServiceType==='T').map(t=>({StopCode:'UN',ServiceType:'T',TripNumber:t.TripNumber,LineCode:lines[t.Service]||'',ScheduledDepartureTime:t.Time,ActualPlatform:String(t.Platform||'').replace(/\s*&\s*/g,' / '),ScheduledPlatform:''}))}},'UN',now);
}
export function normalizeVehicles(payload,now=new Date(),source='GO'){
 const timestamp=Number(payload.header?.timestamp)*1000;
 if(!Number.isFinite(timestamp)||!fresh(new Date(timestamp).toISOString(),now))throw Error('Stale vehicle feed');
 if(!Array.isArray(payload.entity))throw Error('Invalid vehicle feed');
 const vehicles=payload.entity.flatMap(entity=>{
  if(entity.is_deleted)return [];
  const v=entity.vehicle,t=v?.trip,p=v?.position;if(!v||!t||!p)return [];
  const line=source==='UP'?'UP':String(t.route_id||'').split('-').at(-1),trip=String(t.trip_id||'').split('-').at(-1),day=String(t.start_date||'');
  const updated=Number(v.timestamp)*1000;
  if(!LINES.has(line)||!/^\d{8}$/.test(day)||!trip||!Number.isFinite(updated))return [];
  if(!fresh(new Date(updated).toISOString(),now))return [];
  const lat=Number(p.latitude),lon=Number(p.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<41||lat>46||lon< -84||lon> -75)return [];
  const stop=String(v.stop_id||''),canonicalStop=source==='UP'&&stop&&!['UN','BL','MD','WE'].includes(stop)&&!stop.startsWith('UP:')?'UP:'+stop:stop;
  return [{line,trip,date:`${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6,8)}`,latitude:lat,longitude:lon,stop:canonicalStop,status:['INCOMING_AT','STOPPED_AT','IN_TRANSIT_TO'].includes(v.current_status)?v.current_status:'',updatedAt:new Date(updated).toISOString()}];
 });
 return {updatedAt:now.toISOString(),vehicles};
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url),origin=request.headers.get('Origin'),allowed=env.ALLOWED_ORIGIN||'https://kilkenny1.github.io';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':allowed,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(request.method!=='GET')return reply({error:'Method not allowed'},405);
 if(origin!==allowed)return reply({error:'Origin not allowed'},403);
 const mode=url.searchParams.get('mode')||'platforms',station=url.searchParams.get('station')||'';
 if(!['platforms','vehicles'].includes(mode))return reply({error:'Unknown feed'},400);
 if(mode==='platforms'&&!/^[A-Z0-9]{2,8}$/.test(station))return reply({error:'Invalid station'},400);
 // No arbitrary upstream URLs, API keys, or additional caller-supplied parameters.
 if([...url.searchParams.keys()].some(k=>!['station','mode'].includes(k)))return reply({error:'Unknown parameter'},400);
 if(!env.METROLINX_API_KEY)return reply({error:'Live data is not configured'},503);
 if(env.CLIENT_RATE_LIMITER){const result=await env.CLIENT_RATE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});if(!result.success)return reply({error:'Too many requests'},429);}
 const cacheKey=new Request(url.origin+'/cache/'+mode+(mode==='platforms'?'/union-v2/'+station:'/go-up-v1'));
 const cached=await caches.default.match(cacheKey);if(cached)return new Response(cached.body,{headers});
 try{
  const fetchFeed=async path=>{
   if(env.UPSTREAM_RATE_LIMITER){const result=await env.UPSTREAM_RATE_LIMITER.limit({key:'metrolinx'});if(!result.success)throw Error('Upstream rate limit');}
   const upstream=new URL('https://api.openmetrolinx.com/OpenDataAPI/api/V1/'+path);
   upstream.searchParams.set('key',env.METROLINX_API_KEY);
   const response=await fetch(upstream,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('Upstream unavailable');
   return response.json();
  };
  let data;
  if(mode==='vehicles'){
   const sources=['GO','UP'];
   const results=await Promise.allSettled(sources.map(async source=>normalizeVehicles(await fetchFeed((source==='UP'?'UP/':'')+'Gtfs/Feed/VehiclePosition'),new Date(),source)));
   if(results.every(result=>result.status==='rejected'))throw Error('Vehicle feeds unavailable');
   data={updatedAt:new Date().toISOString(),vehicles:results.flatMap(result=>result.status==='fulfilled'?result.value.vehicles:[]),sources:Object.fromEntries(sources.map((source,i)=>[source,{available:results[i].status==='fulfilled'}]))};
  }else if(station==='UN'){
   try{data=normalizeUnion(await fetchFeed('ServiceUpdate/UnionDepartures/All'));}
   catch{data=normalize(await fetchFeed('Stop/NextService/'+station),station);}
  }else data=normalize(await fetchFeed('Stop/NextService/'+station),station);
  ctx.waitUntil(caches.default.put(cacheKey,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=30'}})));
  return reply(data);
 }catch{return reply({error:'Live data is temporarily unavailable'},502);}
}};
