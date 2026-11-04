# Railboard

A static, responsive GO and UP Express train departure board using both official Metrolinx GTFS feeds. Includes origin/destination filtering in stop order, eight line filters, date selection, station swapping, expandable stop sequences, Toronto local time, and shareable URLs.

## Run

From this directory:

    python3 -m http.server 4175 --directory dist

Open http://localhost:4175.

## Update schedules

Download the current GO and UP Express GTFS ZIPs from https://www.gotransit.com/en/partner-with-us/software-developers and run:

    python3 import-feed.py /absolute/path/to/GO-GTFS.zip /absolute/path/to/UP-GTFS.zip

The importer has no third-party dependencies. It retains train routes only, resolves calendar_dates exceptions, and compacts trips for browser use. Publish the updated dist folder to any static host. The included daily GitHub Actions workflow refreshes the bundled schedule after deployment setup below. Platform assignments, service alerts, and live delays are not provided by this static feed.

## Verification

JavaScript syntax checked. Browser verified initial Union departures and Union → Oakville filtering (six direct remaining trains on the verification date). The design uses original CSS inspired by Union Screens' dark departure board, coloured line badges, and expandable rows.

## Automatic daily updates (Cloudflare Pages)

1. Put this entire project at the root of a GitHub repository, including `.github/workflows/update-feed.yml`, `import-feed.py`, and `dist/`. Do not upload only `dist` to GitHub.
2. Enable GitHub Actions. The workflow needs permission to write repository contents and a default branch that permits bot commits. If required by your repository settings, enable Settings → Actions → General → Workflow permissions → Read and write permissions.
3. Connect the repository to Cloudflare Pages using Git integration. Set framework to None, leave the build command empty, and set build output directory to `dist`.
4. In GitHub Actions, select **Update GO schedule → Run workflow** to verify the first run.

The workflow runs daily at 10:23 UTC (06:23 Toronto during daylight time; 05:23 during standard time), with a manual trigger available. GitHub schedules may be delayed; public-repository schedules may be disabled after 60 days without repository activity. Check GitHub Actions if updates stop.

It downloads both feeds directly from Metrolinx, validates the train timetable, and atomically replaces `dist/feed.json` only when schedule content changes. Download failures, invalid files, and expired feeds fail the workflow without replacing the last good schedule. The resulting bot commit triggers Cloudflare's Git integration to redeploy. GitHub failure notifications follow your account's Actions notification settings.

A Cloudflare drag-and-drop deployment does not update automatically. Use a new Git-integrated Pages project if your existing project uses Direct Upload. This workflow is included in the source download but is not running until you upload it to GitHub and enable it. The included Deploy GitHub Pages workflow runs after successful feed refreshes, including bot commits.

Run the updater manually from any directory:

    python3 /path/to/import-feed.py --download

Official references:
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://developers.cloudflare.com/pages/configuration/git-integration/

## GitHub Pages hosting

In repository Settings → Pages, set Source to **GitHub Actions**. The included deployment workflow publishes `dist` on site changes and after successful daily feed refreshes. The site URL is https://kilkenny1.github.io/gotransit/. The workflow can also be run manually from Actions.

## iPhone Home Screen

Open the published HTTPS site in Safari, tap Share → Add to Home Screen, then Add. It launches in standalone mode as Railboard with its own train icon. The manifest uses relative URLs so installation works under this repository's GitHub Pages path. Safe-area padding supports the notch and home indicator, and mobile form controls use 16px text to avoid focus zoom. If you installed an older version, remove its Home Screen icon and add it again to refresh installation metadata. Internet access is required to load current schedules.

Station fields support typing partial names or station codes, touch selection, arrow keys, Enter, and Escape. Uncommitted text reverts to the selected station when leaving the field. Mobile layout verified at 390px and 320px widths with no horizontal document overflow; iPhone hardware testing remains recommended.

## Live train positions and platform assignments

The frontend calls a Cloudflare Worker. Only the Worker calls Metrolinx, using its encrypted `METROLINX_API_KEY` secret. Never put the key in `dist`, `config.js`, a GitHub secret used during frontend builds, or a committed dotenv file. `dist/config.js` contains only the public Worker endpoint.

The Worker supports `?mode=vehicles` for combined GO and UP Express train-only GTFS-Realtime VehiclePosition data and `?station=UN` for departure platforms. Union uses `ServiceUpdate/UnionDepartures/All` for announced platform pairs, with `Stop/NextService/UN` as a fallback; other stations use `Stop/NextService/{StopCode}`. The checked UnionDepartures response contains GO trains but no UP trips. It accepts only these fixed request shapes, validates inputs, strips unrelated upstream fields, rejects stale data, and uses a 30-second server-side cache. GO uses `Gtfs/Feed/VehiclePosition`; UP uses `UP/Gtfs/Feed/VehiclePosition`, both with the same encrypted secret. Each feed is validated independently, so one unavailable feed does not suppress the other; the response includes per-source availability. UP stop IDs use the same shared-station and Pearson mapping as the schedule importer. It restricts browser origins and rate-limits clients and every upstream call. Worker request logging is disabled. Errors are generic and do not contain upstream URLs or credentials.

The board refreshes live feeds every 30 seconds while visible and preserves expanded rows during updates. Actual platforms take precedence over explicitly labelled scheduled platforms. Expanded trips show a fresh, matching train's latest reported stop. **View trip map**, visible directly in each departure row, opens a mobile-friendly interactive map for any scheduled trip, with official GTFS route geometry, station times, a live marker when available, route fitting, train following, and optional other GO/UP markers. Live positions update every 30 seconds; stale markers disappear. Maps can be shared using their trip/line/service-date URL fragment. Leaflet 1.9.4 is vendored with its license; OpenStreetMap tiles load on demand with attribution. At Union, individual reported platforms 5–12 are displayed as their paired track boarding sides (5 / 6, 7 / 8, 9 / 10, 11 / 12). Explicit pairs, other Union platforms and all other stations are kept as reported. Matching uses line, train number and service date. UP Express live platform assignments are not supplied by the checked official NextService or UP TripUpdates responses. UP Express defaults to platform 1 when no matching assignment is supplied. A matching live or scheduled assignment takes priority. Missing live data leaves the scheduled timetable usable.

### Deploy the live backend

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up.
2. From `live-platforms`, run `npx wrangler@4 login --scopes account:read user:read workers_scripts:write` and authorize Worker script access.
3. Run `npx wrangler@4 deploy` to create the backend.
4. Run `npx wrangler@4 secret put METROLINX_API_KEY` and enter your Metrolinx key at the hidden prompt. This stores the key as a Worker secret, not source code.
5. Put the returned HTTPS Worker URL in `platformEndpoint` in `dist/config.js`, then push that frontend change.
6. Run `node live-platforms/test.mjs` from the repository root to verify normalization and security-related response behavior.

The public website displays public transit data. Keeping the key secret prevents visitors from extracting the Metrolinx credential. Origin restrictions are not authentication: a determined non-browser client can spoof an Origin header. Caching and rate limits reduce proxy abuse; making the data endpoint owner-only would require sign-in on the website as well.

Cloudflare setup: https://developers.cloudflare.com/workers/get-started/guide/
Secret storage: https://developers.cloudflare.com/workers/configuration/secrets/


## UP Express

Both feeds are downloaded in each daily refresh. A failure or expired feed prevents replacement of the combined last-good schedule. UP Express is a separate blue line; Pearson Airport is searchable. Shared Union, Bloor, Mount Dennis and Weston stops are merged by their explicit official station codes; other UP stops are namespaced to avoid ID collisions. The date selector shows operator-specific coverage warnings. UP Express live platforms are unavailable because the included platform adapter has only been prepared for GO service; UP schedule data does not contain platform assignments.

## Favourite routes

Choose a start and end station, then select **Save route**. Saved route buttons sit between the journey search and line filters. Select a favourite to apply both stations immediately; select ⇄ on the favourite to reverse the journey. The same station pair remains a single favourite in either direction. Use × to remove a route. Reset clears the current journey without deleting favourites. Favourites are saved locally in the current browser, do not contain API credentials, and do not sync across devices.

The journey search starts collapsed with only the From field visible. Focusing or clicking that field expands the destination, date and search controls. Use the up-arrow button to collapse it again; selected route and date values are preserved.
