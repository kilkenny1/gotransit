"""Build a compact timetable from both official Metrolinx GTFS feeds."""
import argparse
import collections
import csv
import datetime as dt
import io
import json
import pathlib
import time
import urllib.request
import zipfile

BASE = pathlib.Path(__file__).resolve().parent
FEED_URLS = {name: 'https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/' + filename for name, filename in [('GO', 'GO-GTFS.zip'), ('UP', 'UP-GTFS.zip')]}
SHARED = {'UN', 'BL', 'MD', 'WE'}


def download(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Railboard/1.0 (GO and UP schedule updater)'})
            with urllib.request.urlopen(request, timeout=90) as response:
                data = response.read(50 * 1024 * 1024 + 1)
            if len(data) > 50 * 1024 * 1024:
                raise ValueError('Feed exceeds 50 MiB limit')
            return io.BytesIO(data)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def minutes(value):
    hour, minute, second = map(int, value.split(':'))
    return hour * 60 + minute


def read_feed(archive, source):
    with zipfile.ZipFile(archive) as z:
        def rows(name):
            if name not in z.namelist():
                return []
            with io.TextIOWrapper(z.open(name), encoding='utf-8-sig') as f:
                return list(csv.DictReader(f))

        routes = {r['route_id']: r for r in rows('routes.txt') if r['route_type'] == '2'}
        trips = {t['trip_id']: t for t in rows('trips.txt') if t['route_id'] in routes}
        stop_rows = {s['stop_id']: s for s in rows('stops.txt')}
        def stop_id(value):
            return value if source == 'GO' or value in SHARED else 'UP:' + value
        times = collections.defaultdict(list)
        for r in rows('stop_times.txt'):
            if r['trip_id'] in trips:
                times[r['trip_id']].append([int(r['stop_sequence']), stop_id(r['stop_id']), minutes(r['arrival_time']), minutes(r['departure_time']), r.get('pickup_type') or '0', r.get('drop_off_type') or '0'])
        patterns, lookup, services, used = [], {}, collections.defaultdict(list), set()
        for trip_id, t in trips.items():
            stops = [s[1:] for s in sorted(times[trip_id])]
            if len(stops) < 2:
                raise ValueError(f'{source}: incomplete trip {trip_id}')
            used.update(s[0] for s in stops)
            route = routes[t['route_id']]
            line = 'UP' if source == 'UP' else route['route_short_name']
            pattern = [line, t['trip_headsign'].split(' - ', 1)[-1], stops, t.get('trip_short_name') or trip_id.split('-')[-1]]
            key = json.dumps(pattern)
            if key not in lookup:
                lookup[key] = len(patterns)
                patterns.append(pattern)
            services[t['service_id']].append(lookup[key])
        # Support both weekly calendars and date-specific exceptions.
        active = collections.defaultdict(set)
        weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        for row in rows('calendar.txt'):
            day = dt.datetime.strptime(row['start_date'], '%Y%m%d').date()
            end = dt.datetime.strptime(row['end_date'], '%Y%m%d').date()
            while day <= end:
                if row[weekdays[day.weekday()]] == '1':
                    active[day.strftime('%Y%m%d')].add(row['service_id'])
                day += dt.timedelta(days=1)
        for row in rows('calendar_dates.txt'):
            if row['exception_type'] == '1':
                active[row['date']].add(row['service_id'])
            elif row['exception_type'] == '2':
                active[row['date']].discard(row['service_id'])
        days = {date: sorted({i for service in service_ids for i in services[service]}) for date, service_ids in sorted(active.items())}
        days = {day: ids for day, ids in days.items() if ids}
        stops = {stop_id(k): {'name': r['stop_name'], 'accessible': r.get('wheelchair_boarding') == '1'} for k, r in stop_rows.items() if stop_id(k) in used}
        lines = {('UP' if source == 'UP' else r['route_short_name']): {'name': 'UP Express' if source == 'UP' else r['route_long_name'], 'color': '#' + (r.get('route_color') or '0075D2'), 'source': source} for r in routes.values()}
        if not patterns or not days or not stops or not used.issubset(stops):
            raise ValueError(f'{source}: invalid or empty train schedule')
        return {'stops': stops, 'lines': lines, 'patterns': patterns, 'days': days}


def combine(feeds, today=None):
    today = today or dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d')
    result = {'stops': {}, 'lines': {}, 'patterns': [], 'days': {}, 'sources': {}}
    for source, feed in feeds.items():
        if max(feed['days']) < today:
            raise ValueError(f'{source}: downloaded schedule has expired; retaining previous data')
        offset = len(result['patterns'])
        result['patterns'].extend(feed['patterns'])
        result['lines'].update(feed['lines'])
        for key, stop in feed['stops'].items():
            if key in result['stops']:
                # Only the explicit shared GO/UP interchange codes are merged.
                if key not in SHARED:
                    raise ValueError(f'Unexpected station collision: {key}')
                existing = result['stops'][key]
                existing['accessible'] = existing['accessible'] or stop['accessible']
            else:
                result['stops'][key] = dict(stop)
        for date, ids in feed['days'].items():
            result['days'].setdefault(date, []).extend(i + offset for i in ids)
        result['sources'][source] = {'start': min(feed['days']), 'end': max(feed['days']), 'dates': sorted(feed['days'])}
    result['days'] = dict(sorted(result['days'].items()))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('go_zip', nargs='?')
    parser.add_argument('up_zip', nargs='?')
    parser.add_argument('--download', action='store_true', help='Download both official feeds')
    args = parser.parse_args()
    if args.download:
        archives = {source: download(url) for source, url in FEED_URLS.items()}
    else:
        if not args.go_zip or not args.up_zip:
            parser.error('Provide both GO and UP ZIP paths, or use --download')
        archives = {'GO': args.go_zip, 'UP': args.up_zip}
    payload = combine({source: read_feed(archive, source) for source, archive in archives.items()})
    output = BASE / 'dist/feed.json'
    if output.exists():
        previous = json.loads(output.read_text())
        if all(previous.get(k) == value for k, value in payload.items()):
            print('Both schedules unchanged; no update required')
            return
    payload['imported'] = dt.datetime.now(dt.timezone.utc).date().isoformat()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, separators=(',', ':')))
    temporary.replace(output)
    print(len(payload['patterns']), 'trips;', len(payload['stops']), 'stations; sources:', ', '.join(payload['sources']))


if __name__ == '__main__':
    main()
