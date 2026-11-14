# Momentum Business Rebuild

**[Open and share the app](https://rss-app-2gwd.onrender.com/)**
· [Render dashboard](https://dashboard.render.com/static/srv-dblmkehsrm7s73f2prh0)
· [Permanent links to both apps](https://github.com/6244abaman/transition-companion/blob/main/LIVE-APPS.md)

Momentum helps Israeli reservists restart their businesses. The browser app
starts in Hebrew and offers English. Its Claude requests go through the
separate `rss-proxy` service; credentials stay on the server.

The app runs on Render while your computer, Claude and Codex are closed.
Reviewers open the public app link; they do not need a Render account. Owners
can find the link here or in the **Momentum Claude** Render workspace.

## Open and manage it

- Windows: double-click `Start.cmd` to open the hosted app. This shortcut needs
  internet; it does not start a local background server, so no Stop is needed.
- Any device: open the app URL above. See [OPEN-ME.txt](OPEN-ME.txt).
- Updates: both existing Render services track `main` and deploy when it
  changes. Read [HOSTING.txt](HOSTING.txt) for automatic updates, the dashboard
  and **Manual Deploy → Deploy latest commit**.
- [app-deployment.json](app-deployment.json) records actual non-secret service
  identifiers and settings. [APP-OPERATIONS.md](APP-OPERATIONS.md) is the shared
  workflow for Codex and Claude Code; product rules remain in
  [CLAUDE.md](CLAUDE.md).

## Development checks

Use Node.js 24. Run `npm test`; tests use a simulated Claude client and do not
need an API key. `npm run build:data` refreshes the schema/reference copies
when those source files change. `npm run build:links` regenerates the small
public app-links file from deployment metadata. GitHub Actions runs the tests.

The `app/` folder is the static frontend. `proxy/` runs the external model
connection. `agents/`, `modules/` and `sectors/` contain the server's prompts.

This is a review/testing app. Each browser keeps its own local profile; this
is not an account or automatic cross-device profile sync. Use invented details
when reviewing. See [the tester guide](docs/tester-guide.md) and existing
unverified-resource notes before real-world use.
