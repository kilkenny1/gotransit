import csv
import importlib.util
import io
import pathlib
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('importer', pathlib.Path(__file__).resolve().parents[1] / 'import-feed.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture(source):
    out = io.BytesIO()
    files = {
        'routes.txt': [['route_id', 'route_type', 'route_short_name', 'route_long_name', 'route_color'], ['R', '2', source, source, '0075D2']],
        'stops.txt': [['stop_id', 'stop_name', 'wheelchair_boarding'], ['UN', 'Union Station GO', '1'], ['PA' if source == 'UP' else 'OA', 'Destination', '1']],
        'trips.txt': [['route_id', 'service_id', 'trip_id', 'trip_headsign'], ['R', 'weekday', 'T-101', 'Destination']],
        'stop_times.txt': [['trip_id', 'stop_id', 'arrival_time', 'departure_time', 'stop_sequence', 'pickup_type', 'drop_off_type'], ['T-101', 'PA' if source == 'UP' else 'OA', '25:00:00', '25:00:00', '2', '1', '0'], ['T-101', 'UN', '24:30:00', '24:30:00', '1', '0', '1']],
        'calendar.txt': [['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'], ['weekday', '1', '1', '1', '1', '1', '0', '0', '20261026', '20261028']],
        'calendar_dates.txt': [['service_id', 'date', 'exception_type'], ['weekday', '20261027', '2'], ['weekday', '20261031', '1']]
    }
    with zipfile.ZipFile(out, 'w') as z:
        for name, rows in files.items():
            text = io.StringIO();csv.writer(text).writerows(rows);z.writestr(name, text.getvalue())
    out.seek(0)
    return module.read_feed(out, source)


class FeedTests(unittest.TestCase):
    def test_calendar_exceptions_and_overnight(self):
        f = fixture('UP')
        self.assertNotIn('20261027', f['days'])
        self.assertIn('20261031', f['days'])
        self.assertEqual(f['patterns'][0][2][0], ['UN', 1470, 1470, '0', '1'])
        self.assertEqual(f['patterns'][0][2][1][0], 'UP:PA')

    def test_combined_station_merge_and_trip_offsets(self):
        go, up = fixture('GO'), fixture('UP')
        result = module.combine({'GO': go, 'UP': up}, today='20261026')
        self.assertEqual(len(result['stops']), 3)
        self.assertEqual(result['stops']['UN']['name'], 'Union Station GO')
        self.assertEqual(result['days']['20261026'], [0, 1])
        self.assertEqual([p[0] for p in result['patterns']], ['GO', 'UP'])
        self.assertEqual(result['sources']['UP']['end'], '20261031')
        self.assertEqual(go['stops']['UN']['name'], 'Union Station GO')

    def test_each_source_must_be_current(self):
        with self.assertRaisesRegex(ValueError, 'expired'):
            module.combine({'GO': fixture('GO'), 'UP': fixture('UP')}, today='20261101')


if __name__ == '__main__':
    unittest.main()
