import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalize,departureParts} from './worker.mjs';
const now=new Date('2026-10-27T03:35:00Z');
const fixture={Metadata:{ErrorCode:'',TimeStamp:'2026-10-26 23:35:00'},NextService:{Lines:[{StopCode:'UN',TripNumber:'1639',ScheduledDepartureTime:'2026-10-26T23:47:00',ActualPlatform:'7 / 8',ScheduledPlatform:'9'}]}};
const result=normalize(fixture,'UN',now);
assert.equal(result.trips[0].minute,1427);assert.equal(result.trips[0].actualPlatform,'7 / 8');
assert.deepEqual(departureParts('2026-10-27T03:47:00Z'),{date:'2026-10-26',minute:1427});
assert.throws(()=>normalize(fixture,'UN',new Date('2026-10-27T03:38:00Z')),/Stale/);
assert.throws(()=>normalize({Metadata:{ErrorCode:'401'}},'UN',now),/rejected/);
const elements=new Map();const context=vm.createContext({Intl,Date,URL,URLSearchParams,AbortSignal,console,window:{},location:{search:''},history:{},setInterval:()=>{},fetch:()=>new Promise(()=>{}),document:{addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{addEventListener(){},value:'',textContent:''});return elements.get(id);}}});
vm.runInContext(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),context);
vm.runInContext(`now=()=>({date:'2026-10-26',time:'23:35:00',min:1415});platforms=${JSON.stringify({...result,updatedAt:new Date().toISOString()})};`,context);
assert.match(vm.runInContext(`platformLabel(['LW','',[],'1639'],1427,'2026-10-26','UN')`,context),/7 \/ 8/);
assert.match(vm.runInContext(`platformLabel(['LW','',[],'1639'],1427,'2026-10-26','OA')`,context),/unavailable/);
assert.match(vm.runInContext(`platformLabel(['LW','',[],'1639'],1428,'2026-10-26','UN')`,context),/not posted/);
vm.runInContext(`platforms.trips[0].actualPlatform='';`,context);
assert.match(vm.runInContext(`platformLabel(['LW','',[],'1639'],1427,'2026-10-26','UN')`,context),/scheduled/);
vm.runInContext(`platforms.updatedAt='2020-01-01T00:00:00Z';`,context);
assert.match(vm.runInContext(`platformLabel(['LW','',[],'1639'],1427,'2026-10-26','UN')`,context),/unavailable/);
console.log('Passed: platform matching, timezone conversion, actual/scheduled priority, unauthorized and stale data rejection.');

assert.match(vm.runInContext(`auroraIndicator(['BR','Aurora GO'])`,context),/Aurora/);
assert.equal(vm.runInContext(`auroraIndicator(['BR','Allandale Waterfront GO'])`,context),'');
assert.equal(vm.runInContext(`auroraIndicator(['LW','Aurora GO'])`,context),'');

// Successful Metrolinx replies use code 200, and buses must not become train markers.
const {normalizeVehicles,normalizeTripUpdates,default:worker}=await import('./worker.mjs');
assert.equal(normalize({...fixture,Metadata:{...fixture.Metadata,ErrorCode:'200'}},'UN',now).trips.length,1);
const vehicle={trip:{trip_id:'20261026-LW-1639',route_id:'09261126-LW',start_date:'20261026'},position:{latitude:43.65,longitude:-79.38},timestamp:+now/1000,stop_id:'UN',current_status:'STOPPED_AT',vehicle:{license_plate:'private-unused-field'}};
const positions={header:{timestamp:+now/1000},entity:[{vehicle},{vehicle:{...vehicle,trip:{...vehicle.trip,route_id:'09261126-41'}}},{vehicle:{...vehicle,timestamp:+now/1000-300}}]};
const normalized=normalizeVehicles(positions,now);
assert.equal(normalized.vehicles.length,1);
assert.equal(normalized.vehicles[0].trip,'1639');
assert.equal(normalized.vehicles[0].line,'LW');
assert.ok(!JSON.stringify(normalized).includes('license_plate'));
assert.throws(()=>normalizeVehicles(positions,new Date(+now+180000)),/Stale/);
const tripUpdate={trip:{trip_id:'20261026-LW-1639',route_id:'09261126-LW',start_date:'20261026'},stop_time_update:[{stop_id:'UN',departure:{delay:185}},{stop_id:'OA',arrival:{delay:120}}],timestamp:+now/1000,vehicle:{private_field:'unused'}};
const updates={header:{timestamp:+now/1000},entity:[{trip_update:tripUpdate},{trip_update:{...tripUpdate,trip:{...tripUpdate.trip,route_id:'09261126-41'}}}]};
const normalizedUpdates=normalizeTripUpdates(updates,now);
assert.deepEqual(normalizedUpdates.delays,[{line:'LW',trip:'1639',date:'2026-10-26',stops:[{stop:'UN',delay:185},{stop:'OA',delay:120}],updatedAt:now.toISOString()}]);
assert.ok(!JSON.stringify(normalizedUpdates).includes('private_field'));
assert.throws(()=>normalizeTripUpdates(updates,new Date(+now+180000)),/Stale/);
const key='test-private-value',env={METROLINX_API_KEY:key,ALLOWED_ORIGIN:'https://kilkenny1.github.io'};
const request=(suffix='',origin=env.ALLOWED_ORIGIN)=>new Request('https://worker.example/'+suffix,{headers:{Origin:origin}});
assert.equal((await worker.fetch(request('?mode=vehicles','https://other.example'),env,{})).status,403);
assert.equal((await worker.fetch(request('?mode=vehicles&url=https://other.example'),env,{})).status,400);
assert.equal((await worker.fetch(request('?mode=vehicles'),{...env,CLIENT_RATE_LIMITER:{limit:async()=>({success:false})}},{})).status,429);
globalThis.caches={default:{match:async()=>null,put:async()=>{}}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('upstream error containing '+key);};
const failure=await worker.fetch(request('?mode=vehicles'),env,{waitUntil(){}});
assert.equal(failure.status,502);assert.ok(!(await failure.text()).includes(key));
globalThis.fetch=originalFetch;
console.log('Passed: HTTP-200 metadata, train-only vehicle normalization, freshness, origin checks, rate limiting, and secret-safe errors.');

vm.runInContext(`feed={stops:{UN:{name:'Union Station GO'}}};vehicleData={updatedAt:'${new Date().toISOString()}',vehicles:[{line:'LW',trip:'1639',date:'2026-10-26',latitude:43.65,longitude:-79.38,stop:'UN',status:'STOPPED_AT',updatedAt:'${new Date().toISOString()}'}]};`,context);
assert.match(vm.runInContext(`vehicleLabel(['LW','Aldershot GO',[['UN',60,60]],'1639'],0,60,'2026-10-26')`,context),/At Union Station GO/);
assert.equal(vm.runInContext(`vehicleLabel(['LE','Oshawa GO',[['UN',60,60]],'1639'],0,60,'2026-10-26')`,context),'');
vm.runInContext(`vehicleData.vehicles[0].date='2026-10-25';`,context);
assert.match(vm.runInContext(`vehicleLabel(['LW','Aldershot GO',[['UN',1500,1500]],'1639'],0,60,'2026-10-26')`,context),/At Union Station GO/);
console.log('Passed: frontend vehicle matching by line, trip, service date and midnight rollover.');

vm.runInContext(`vehicleData.delays=[{line:'LW',trip:'01639',date:'2026-10-26',stops:[{stop:'UN',delay:185}],updatedAt:'${new Date().toISOString()}'}];`,context);
assert.match(vm.runInContext(`delayLabel(['LW','Aldershot GO',[['UN',60,60]],'1639'],0,60,'2026-10-26')`,context),/\+3 min/);
vm.runInContext(`vehicleData.delays[0].stops[0].delay=25;`,context);
assert.match(vm.runInContext(`delayLabel(['LW','Aldershot GO',[['UN',60,60]],'1639'],0,60,'2026-10-26')`,context),/On time/);
vm.runInContext(`vehicleData.delays[0].stops[0].delay=-125;`,context);
assert.match(vm.runInContext(`delayLabel(['LW','Aldershot GO',[['UN',60,60]],'1639'],0,60,'2026-10-26')`,context),/2 min early/);
assert.equal(vm.runInContext(`delayLabel(['LW','Aldershot GO',[['OA',60,60]],'1639'],0,60,'2026-10-26')`,context),'');
console.log('Passed: frontend delay display, on-time status, early status, and stop-specific matching.');

// UP uses its separate feed, the same private key, and the schedule's canonical stops.
const upVehicle={...vehicle,trip:{trip_id:'20261026-4341',route_id:'UP',start_date:'20261026'},stop_id:'PA'};
const upPositions={header:{timestamp:+now/1000},entity:[{vehicle:upVehicle}]};
const up=normalizeVehicles(upPositions,now,'UP').vehicles[0];
assert.equal(up.line,'UP');assert.equal(up.trip,'4341');assert.equal(up.stop,'UP:PA');
assert.equal(normalizeVehicles({...upPositions,entity:[{vehicle:{...upVehicle,stop_id:'UN'}}]},now,'UP').vehicles[0].stop,'UN');
const upUpdates={header:{timestamp:+now/1000},entity:[{trip_update:{trip:{trip_id:'20261026-4341',route_id:'UP',start_date:'20261026'},stop_time_update:[{stop_id:'PA',departure:{delay:60}},{stop_id:'UN',departure:{delay:0}}],timestamp:+now/1000}}]};
assert.deepEqual(normalizeTripUpdates(upUpdates,now,'UP').delays[0].stops,[{stop:'UP:PA',delay:60},{stop:'UN',delay:0}]);
const current=()=>({header:{timestamp:Date.now()/1000},entity:[{vehicle:{...upVehicle,timestamp:Date.now()/1000}}]});
const currentUpdates=()=>({header:{timestamp:Date.now()/1000},entity:[{trip_update:{...upUpdates.entity[0].trip_update,timestamp:Date.now()/1000}}]});
let calls=[];
globalThis.fetch=async url=>{
 calls.push(new URL(url));
 return Response.json(new URL(url).pathname.endsWith('/TripUpdates')?currentUpdates():current());
};
try{
 const response=await worker.fetch(request('?mode=vehicles'),env,{waitUntil(){}});
 const combined=await response.json();
 assert.equal(response.status,200);
 assert.equal(calls.length,4);
 assert.deepEqual(calls.map(url=>url.pathname),['/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition','/OpenDataAPI/api/V1/Gtfs/Feed/TripUpdates','/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition','/OpenDataAPI/api/V1/UP/Gtfs/Feed/TripUpdates']);
 assert.ok(calls.every(url=>url.searchParams.get('key')===key));
 assert.equal(combined.sources.UP.available,true);
 assert.equal(combined.sources.UP.delaysAvailable,true);
 assert.ok(combined.vehicles.some(v=>v.line==='UP'&&v.stop==='UP:PA'));
 assert.ok(combined.delays.some(d=>d.line==='UP'&&d.stops.some(s=>s.stop==='UP:PA')));
 assert.ok(!JSON.stringify(combined).includes(key));
 for(const failedSource of ['GO','UP']){
  globalThis.fetch=async url=>{
   const source=new URL(url).pathname.includes('/UP/')?'UP':'GO';
   if(source===failedSource)throw Error('Unavailable '+key);
   return Response.json(new URL(url).pathname.endsWith('/TripUpdates')?currentUpdates():current());
  };
  const partial=await worker.fetch(request('?mode=vehicles'),env,{waitUntil(){}});
  const data=await partial.json();
  assert.equal(partial.status,200);
  assert.equal(data.sources[failedSource].available,false);
  assert.equal(data.sources[failedSource==='UP'?'GO':'UP'].available,true);
  assert.ok(data.vehicles.length>0);
  assert.ok(!JSON.stringify(data).includes(key));
 }
}finally{globalThis.fetch=originalFetch;}
console.log('Passed: GO and UP position/delay paths, stop mapping, shared secret, and independent feed failures.');

vm.runInContext(`feed.stops['UP:PA']={name:'UP Express Pearson Airport'};vehicleData.vehicles=[{line:'UP',trip:'4341',date:'2026-10-26',latitude:43.68,longitude:-79.61,stop:'UP:PA',status:'STOPPED_AT',updatedAt:'${new Date().toISOString()}'}];`,context);
assert.match(vm.runInContext(`vehicleLabel(['UP','Pearson Airport',[['UN',60,60]],'4341'],0,60,'2026-10-26')`,context),/At UP Express Pearson Airport/);
console.log('Passed: UP live position renders on a matching scheduled departure.');

assert.equal(vm.runInContext(`pairedPlatform('7','UN')`,context),'7 / 8');
assert.equal(vm.runInContext(`pairedPlatform('8','UN')`,context),'7 / 8');
assert.equal(vm.runInContext(`pairedPlatform('11','UN')`,context),'11 / 12');
assert.equal(vm.runInContext(`pairedPlatform('7 / 8','UN')`,context),'7 / 8');
assert.equal(vm.runInContext(`pairedPlatform('4','UN')`,context),'4');
assert.equal(vm.runInContext(`pairedPlatform('7','OA')`,context),'7');
console.log('Passed: Union paired platforms preserve explicit pairs, single platforms and other stations.');
vm.runInContext(`platforms={station:'UN',updatedAt:'${new Date().toISOString()}',trips:[{line:'UP',trip:'4341',date:'2026-10-26',minute:1427,actualPlatform:'1'}]};`,context);
assert.match(vm.runInContext(`platformLabel(['UP','',[],'4341'],1427,'2026-10-26','UN')`,context),/<strong>1<\/strong>/);
vm.runInContext(`platforms.trips[0].line='LW';`,context);
assert.match(vm.runInContext(`platformLabel(['UP','',[],'4341'],1427,'2026-10-26','UN')`,context),/<strong>1<\/strong>/);
console.log('Passed: UP assignments can display when supplied; GO trip numbers cannot be matched to UP.');

vm.runInContext(`platforms.trips[0].line='UP';platforms.trips[0].actualPlatform='2';`,context);
assert.match(vm.runInContext(`platformLabel(['UP','',[],'4341'],1427,'2026-10-26','UN')`,context),/<strong>2<\/strong>/);
vm.runInContext(`platforms=null;`,context);
assert.match(vm.runInContext(`platformLabel(['UP','',[],'4341'],1427,'2026-10-26','UN')`,context),/<strong>1<\/strong>/);
const {normalizeUnion}=await import('./worker.mjs');
const unionFixture={Metadata:fixture.Metadata,AllDepartures:{Trip:[{TripNumber:'1639',Service:'Lakeshore West',ServiceType:'T',Time:'2026-10-26 23:47:00',Platform:'7 & 8'},{TripNumber:'1',ServiceType:'B',Time:'2026-10-26 23:47:00',Platform:'5'}]}};
assert.deepEqual(normalizeUnion(unionFixture,now).trips,[{trip:'1639',line:'LW',date:'2026-10-26',minute:1427,actualPlatform:'7 / 8',scheduledPlatform:''}]);
assert.throws(()=>normalizeUnion(unionFixture,new Date(+now+180000)),/Stale/);
assert.throws(()=>normalizeUnion({Metadata:fixture.Metadata},now),/Invalid/);
const currentMetadata=()=>({ErrorCode:'200',TimeStamp:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date())});
try{
 const paths=[];
 globalThis.fetch=async url=>{paths.push(new URL(url).pathname);if(paths.length===1)throw Error('Union feed unavailable');return Response.json({...fixture,Metadata:currentMetadata()});};
 const fallback=await worker.fetch(request('?station=UN'),env,{waitUntil(){}});
 assert.equal(fallback.status,200);
 assert.deepEqual(paths,['/OpenDataAPI/api/V1/ServiceUpdate/UnionDepartures/All','/OpenDataAPI/api/V1/Stop/NextService/UN']);
}finally{globalThis.fetch=originalFetch;}
console.log('Passed: Union platform pairs, buses excluded, freshness and NextService fallback.');
