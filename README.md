# Railboard

A static, responsive GO train departure board using official Metrolinx GTFS schedule data. Includes origin/destination filtering in stop order, seven line filters, date selection, station swapping, expandable stop sequences, Toronto local time, and shareable URLs.

## Run

From this directory:

    python3 -m http.server 4175 --directory dist

Open http://localhost:4175.

## Update schedules

Download the current GO GTFS ZIP from https://www.gotransit.com/en/partner-with-us/software-developers and run:

    python3 import-feed.py /absolute/path/to/GO-GTFS.zip

The importer has no third-party dependencies. It retains train routes only, resolves calendar_dates exceptions, and compacts trips for browser use. Publish the updated dist folder to any static host. The included daily GitHub Actions workflow refreshes the bundled schedule after deployment setup below. Platform assignments, service alerts, and live delays are not provided by this static feed.

## Verification

JavaScript syntax checked. Browser verified initial Union departures and Union → Oakville filtering (six direct remaining trains on the verification date). The design uses original CSS inspired by Union Screens' dark departure board, coloured line badges, and expandable rows.

## Automatic daily updates (Cloudflare Pages)

1. Put this entire project at the root of a GitHub repository, including `.github/workflows/update-feed.yml`, `import-feed.py`, and `dist/`. Do not upload only `dist` to GitHub.
2. Enable GitHub Actions. The workflow needs permission to write repository contents and a default branch that permits bot commits. If required by your repository settings, enable Settings → Actions → General → Workflow permissions → Read and write permissions.
3. Connect the repository to Cloudflare Pages using Git integration. Set framework to None, leave the build command empty, and set build output directory to `dist`.
4. In GitHub Actions, select **Update GO schedule → Run workflow** to verify the first run.

The workflow runs daily at 10:23 UTC (06:23 Toronto during daylight time; 05:23 during standard time), with a manual trigger available. GitHub schedules may be delayed; public-repository schedules may be disabled after 60 days without repository activity. Check GitHub Actions if updates stop.

It downloads directly from Metrolinx, validates the train timetable, and atomically replaces `dist/feed.json` only when schedule content changes. Download failures, invalid files, and expired feeds fail the workflow without replacing the last good schedule. The resulting bot commit triggers Cloudflare's Git integration to redeploy. GitHub failure notifications follow your account's Actions notification settings.

A Cloudflare drag-and-drop deployment does not update automatically. Use a new Git-integrated Pages project if your existing project uses Direct Upload. This workflow is included in the source download but is not running until you upload it to GitHub and enable it. The included Deploy GitHub Pages workflow runs after successful feed refreshes, including bot commits.

Run the updater manually from any directory:

    python3 /path/to/import-feed.py --download

Official references:
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://developers.cloudflare.com/pages/configuration/git-integration/

## GitHub Pages hosting

In repository Settings → Pages, set Source to **GitHub Actions**. The included deployment workflow publishes `dist` on site changes and after successful daily feed refreshes. The site URL is https://kilkenny1.github.io/gotransit.github.io/. The workflow can also be run manually from Actions.

## iPhone Home Screen

Open the published HTTPS site in Safari, tap Share → Add to Home Screen, then Add. It launches in standalone mode as Railboard with its own train icon. The manifest uses relative URLs so installation works under this repository's GitHub Pages path. Safe-area padding supports the notch and home indicator, and mobile form controls use 16px text to avoid focus zoom. If you installed an older version, remove its Home Screen icon and add it again to refresh installation metadata. Internet access is required to load current schedules.

Station fields support typing partial names or station codes, touch selection, arrow keys, Enter, and Escape. Uncommitted text reverts to the selected station when leaving the field. Mobile layout verified at 390px and 320px widths with no horizontal document overflow; iPhone hardware testing remains recommended.
