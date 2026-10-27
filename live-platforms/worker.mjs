// Deploy separately from GitHub Pages; METROLINX_API_KEY stays in Worker secrets.
const TORONTO = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function localParts(date){return Object.fromEntries(TORONTO.formatToParts(date).map(x=>[x.type,x.value]));}
function localStamp(date){const p=localParts(date);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;}
export function departureParts(value){
 if(typeof value!=='string')return null;
 const microsoft=/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(value);
 if(microsoft)value=localStamp(new Date(+microsoft[1]));
 else if(/(?:Z|[+-]\d\d:\d\d)$/.test(value)){const date=new Date(value);if(!Number.isFinite(+date))return null;value=localStamp(date);}
 const m=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(value);
 return m?{date:m[1],minute:+m[2]*60 + +m[3]}:null;
}
export function normalize(payload,station,now=new Date()){
 if(String(payload.Metadata?.ErrorCode||'0')!=='0')throw Error('Upstream rejected request');
 const stamp=String(payload.Metadata?.TimeStamp||'').replace(' ','T');
 const age=(Date.parse(localStamp(now)+'Z')-Date.parse(stamp+'Z'))/1000;
 if(!Number.isFinite(age)||age>120||age< -60)throw Error('Stale upstream data');
 if(!Array.isArray(payload.NextService?.Lines))throw Error('Invalid departure response');
 return {station,updatedAt:now.toISOString(),trips:payload.NextService.Lines.filter(t=>String(t.StopCode)===station).flatMap(t=>{
  const d=departureParts(t.ScheduledDepartureTime);if(!d||!t.TripNumber)return [];
  return [{trip:String(t.TripNumber),...d,actualPlatform:String(t.ActualPlatform||'').trim(),scheduledPlatform:String(t.ScheduledPlatform||'').trim()}];})};
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url),station=url.searchParams.get('station')||'';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':env.ALLOWED_ORIGIN||'https://kilkenny1.github.io','Cache-Control':'no-store'};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(request.method!=='GET')return reply({error:'Method not allowed'},405);
 if(!/^[A-Z0-9]{2,8}$/.test(station))return reply({error:'Invalid station'},400);
 if(!env.METROLINX_API_KEY)return reply({error:'Live platforms are not configured'},503);
 const cacheKey=new Request(url.origin+'/cached-platforms?station='+station);
 const cached=await caches.default.match(cacheKey);if(cached)return new Response(cached.body,{headers});
 try{
  const upstream=new URL('https://api.openmetrolinx.com/OpenDataAPI/api/V1/Stop/NextService/'+station);
  upstream.searchParams.set('key',env.METROLINX_API_KEY);
  const response=await fetch(upstream,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Upstream unavailable');
  const data=normalize(await response.json(),station);
  ctx.waitUntil(caches.default.put(cacheKey,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=30'}})));
  return reply(data);
 }catch{return reply({error:'Live platform data is unavailable'},502);}
}};
