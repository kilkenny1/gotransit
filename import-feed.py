import zipfile,csv,io,json,collections,pathlib,sys,datetime,urllib.request,time

BASE = pathlib.Path(__file__).resolve().parent
FEED_URL = "https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip"
OUTPUT = BASE / "dist/feed.json"
if "--download" in sys.argv:
 for attempt in range(3):
  try:
   request = urllib.request.Request(FEED_URL, headers={"User-Agent":"Railboard/1.0 (GO schedule updater)"})
   with urllib.request.urlopen(request, timeout=90) as response:
    data = response.read(50 * 1024 * 1024 + 1)
   if len(data) > 50 * 1024 * 1024:
    raise ValueError("Feed exceeds 50 MiB limit")
   archive = io.BytesIO(data)
   break
  except Exception:
   if attempt == 2: raise
   time.sleep(2 ** attempt)
else:
 archive = sys.argv[1] if len(sys.argv)>1 else BASE.parent / "go-feed.zip"
z=zipfile.ZipFile(archive)
def rows(f):return csv.DictReader(io.TextIOWrapper(z.open(f),encoding='utf-8-sig'))
routes={r['route_id']:r for r in rows('routes.txt') if r['route_type']=='2'}
trips={t['trip_id']:t for t in rows('trips.txt') if t['route_id'] in routes}
times=collections.defaultdict(list)
def mins(t):
 h,m,s=map(int,t.split(':'));return h*60+m
for r in rows('stop_times.txt'):
 if r['trip_id'] in trips:times[r['trip_id']].append([int(r['stop_sequence']),r['stop_id'],mins(r['arrival_time']),mins(r['departure_time']),r['pickup_type'],r['drop_off_type']])
used=set();patterns=[];lookup={};services=collections.defaultdict(list)
for id,t in trips.items():
 stops=[s[1:] for s in sorted(times[id])];used.update(s[0] for s in stops)
 r=routes[t['route_id']];p=[r['route_short_name'],t['trip_headsign'].split(' - ',1)[-1],stops,id.split('-')[-1]];key=json.dumps(p)
 if key not in lookup:lookup[key]=len(patterns);patterns.append(p)
 services[t['service_id']].append(lookup[key])
days={}
for r in rows('calendar_dates.txt'):
 if r['exception_type']=='1':days.setdefault(r['date'],[]).extend(services[r['service_id']])
stops={r['stop_id']:{'name':r['stop_name'],'accessible':r['wheelchair_boarding']=='1'} for r in rows('stops.txt') if r['stop_id'] in used}
lines={r['route_short_name']:{'name':r['route_long_name'],'color':'#'+r['route_color']} for r in routes.values()}
# Validate completely before replacing the working schedule.
if not patterns or not days or not stops:
 raise ValueError("Feed has no usable train schedules; retaining previous data")
if any(s[0] not in stops for p in patterns for s in p[2]):
 raise ValueError("Unknown stop in train schedule")
if max(days) < datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d'):
 raise ValueError("Downloaded schedule has expired; retaining previous data")
payload = {'stops':stops,'lines':lines,'patterns':patterns,'days':days}
if OUTPUT.exists():
 previous = json.loads(OUTPUT.read_text())
 if all(previous.get(k) == v for k,v in payload.items()):
  print("Schedule unchanged; no update required")
  sys.exit(0)
payload['imported'] = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
temporary = OUTPUT.with_suffix('.tmp')
temporary.write_text(json.dumps(payload,separators=(',',':')))
temporary.replace(OUTPUT)
print(len(patterns),'trips;',len(stops),'stations;',min(days),max(days))
