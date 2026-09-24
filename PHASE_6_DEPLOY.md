# XCLUSIVE LATAGATI HOTEL — Phase 6 Deployment

## GitHub → Netlify
1. Replace the files in the existing GitHub repository with this project.
2. Commit and push the changes.
3. Netlify will automatically start a new deploy if the site is connected to that repository.
4. Build command: `npm run build`
5. Publish directory: `dist`

## If the old PWA still appears
The service-worker cache has been bumped to `xclusive-hotel-v6` and the registration URL includes `?v=6`. If a device still shows the old interface, open the browser's site settings and clear the site's stored data once, then reload.

## Default staff accounts
- Admin: Boss / admin / 9999
- Reception: Tolu / tolu / 1234
- Reception: Blessing / blessing / 2345
- Bar: Musa / musa / 1111
- Kitchen: Mama K / mamak / 2222
- Game: Peter / peter / 3333

These are seed accounts. Staff changes made in the Staff page are stored in IndexedDB and survive normal redeploys on the same device/browser.

## Phase 6 additions
- Persistent IndexedDB staff table
- Active/deactivated staff accounts
- Admin-only Staff management
- Username-based `soldBy` field
- `timeStarted` and `timeSaved` on sales
- Real Reports page using IndexedDB sales
- Today / week / month sales totals
- Department breakdown
- Highest-selling item today
- Most active staff today
- Date, department and staff filters
- CSV export
- Admin-only clear-sales control
- Analytics page using the same live sales data
- Reception can view Reports; specialist departments remain restricted to their own department
- Netlify build/SPA configuration
- Service-worker cache version bump to prevent stale deployment caching
