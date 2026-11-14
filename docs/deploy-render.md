# Putting Momentum on Render

## Existing app: open or update it

The app is already deployed: **[Open Momentum Business Rebuild](https://rss-app-2gwd.onrender.com/)**.
Use [HOSTING.txt](../HOSTING.txt) for its actual dashboards, branch, automatic
updates and Manual Deploy steps. There is no daily Start action and no need to
create another Blueprint. [The public directory](https://github.com/6244abaman/transition-companion/blob/main/LIVE-APPS.md)
keeps both app links available from any device.

The setup instructions below are for provisioning a separate installation.

Render runs two services from this repository, both set up by `render.yaml`:

| Service | What it is | Cost |
|---|---|---|
| `rss-proxy` | The proxy. The only place the Claude API key lives. | Existing paid Starter plan; check Render Billing for current charges |
| `rss-app` | The app (the `app/` folder) at its own web address. | Free |

Claude itself is paid per message, from your Anthropic account. Set a monthly spending limit there first.

## 1. Set a spending limit on your Anthropic account (once)

1. Go to **console.anthropic.com** and sign in.
2. Open **Settings → Limits** (or **Billing**) and set a **monthly spend limit** you are comfortable with, for example $20 while testing.

## 2. Create both services with the Blueprint (once)

1. Go to **dashboard.render.com** and sign in (you can sign in with GitHub).
2. Click **New +** (top right) → **Blueprint**.
3. If asked, connect your GitHub account and allow Render to see **`6244abaman/reserve-soldier-support`**.
4. Choose **`reserve-soldier-support`**. Render reads `render.yaml` and shows two services: `rss-proxy` and `rss-app`.
5. Render asks for **`ANTHROPIC_API_KEY`**. Paste your key there. Never paste it into the chat, the code, or GitHub.
6. Click **Apply** (or **Deploy Blueprint**). Wait until both services say **Live** (a few minutes).

If Render shows an error about `ALLOWED_ORIGINS`, open **rss-proxy → Environment**, add `ALLOWED_ORIGINS` and set it to the app's address from step 3 below (for example `https://rss-app.onrender.com`), then **Save**.

## 3. Check it works

1. Click **rss-proxy**. Near the top is its address, like `https://rss-proxy-xxxx.onrender.com`.
2. Open that address with `/health` at the end in your browser, for example `https://rss-proxy-xxxx.onrender.com/health`.
3. You should see `"ok":true` and `"ready":true`. `"ready":false` means the API key is missing: go to **Environment**, add `ANTHROPIC_API_KEY`, and **Save**.
4. Click **rss-app** and open its address. The app should open, in Hebrew.

Send both addresses (not the key) to whoever is building the app, so the app can be pointed at the proxy.

## Changing the API key later

**rss-proxy → Environment → ANTHROPIC_API_KEY → Edit → Save.** Render restarts the proxy by itself.

## Before real soldiers use the app

Both services deploy from `main`. New work goes on a separate branch and is merged into `main` once approved.
