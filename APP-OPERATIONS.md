# Shared app delivery workflow

The public app name is **Finance/Miluim — Momentum Business Rebuild**.
It is the existing `reserve-soldier-support` app; its Render service remains
`rss-app` and its backend remains `rss-proxy`. Preserve this identity mapping
in owner-facing links so Finance/Miluim is easy to find.

Read `app-deployment.json` for actual GitHub, Render and public access settings.
The app is https://rss-app-2gwd.onrender.com/ and its dashboard is
https://dashboard.render.com/static/srv-dblmkehsrm7s73f2prh0.
Keep README and HOSTING.txt accurate. The owner can find both public apps at
https://github.com/6244abaman/transition-companion/blob/main/LIVE-APPS.md.

## Completing an update

Unless Aba requests local-only or draft-only work, an app update includes
testing, saving the change in GitHub, publishing to the configured existing
Render environment, and verifying the same public URL. Preserve any explicit
review checkpoint requested in the task. Development branches can carry a
reviewable change; this app's established deployment branch is `main`.

Reuse `rss-app` and `rss-proxy` in the confirmed Momentum Claude workspace.
Do not create replacement services or change the app URL for routine updates.
The owner and reviewers must keep finding the app from another device.

## Build and settings

- Use Node.js 24 for development and CI. Run `npm test` before publishing.
- `rss-app` is an existing Render Static Site serving `./app`. It currently
  uses `echo "No build step"`; source files in app/ are deployed directly.
- `rss-proxy` is an existing paid service. Its build is
  `npm install --prefix proxy` and its start command is `node proxy/server.js`.
- Both services auto-deploy on commits to `main`. GitHub Actions runs offline
  tests separately; the current Render commands do not gate publication on CI.
- Keep `render.yaml` and app-deployment.json aligned with actual service
  settings. Updating documentation does not itself change infrastructure.
- After changing public access metadata, run `npm run build:links`. Tests
  reject stale links and mismatches between the browser's proxy URL and the
  metadata. Keep the shared public directory accurate.
- Verify each affected deploy reaches `live`, has the intended commit, and
  serves the changed file. A queued trigger is not completion. Test the
  relevant user path; use invented examples for external AI requests.

## Product rules and credentials

Preserve the product, privacy and escalation rules in CLAUDE.md. The Anthropic
key stays in the proxy's Render environment; never expose it in app/ or Git.
Hosting changes do not enable cloud profile synchronization or mentor alerts.
The browser UI should not expose these developer/hosting instructions.

## Owner handoff

Everyday access needs only the public app URL, with no daily Start action.
End update replies with the stable app link, actual deployment/test results
and a short Render tip. HOSTING.txt covers Manual Deploy > Deploy latest commit
and where the owner checks deployment status and proxy errors.
