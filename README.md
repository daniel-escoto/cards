# holdem.nyc

Private-room Texas Hold'em for the city. Host a table, share a code, play with friends. The server owns online game state and clients connect over Socket.IO. Chip Host without a server connection runs the same rules engine in the browser (add CPU players at the table; works offline after the first visit).

## Features

- Host or join private tables with a room code/link
- Host lobby: display name, blinds, and optional money mode
- Add CPU players from the table / menu (online or local offline)
- Money-game join preview with buy-in and blinds; join during a hand and play on the next deal
- 2 to 9 players
- Shared pure engine for deck, betting, blinds, streets, side pots, showdown, and bots (`shared/`)
- Poker hand evaluation via vendored `pokersolver` (Node + browser)
- Minimal PWA shell cache so chip Host works offline after the first load when the server is unreachable
- Solo chip online tables hand off to the local engine if Socket.IO drops mid-session (money / multi-human rooms keep reconnect)
- Responsive UI for desktop and mobile browsers

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

**Host:** name, blinds, money mode. With a connection, chip Host creates an online room (friends join with the code; add bots in-table). Without a connection, chip Host starts a local offline table — add bots with **+ Add CPU player**, then ready up. Money mode always needs the server. **Join** is online rooms only.

## Tests and lint

```bash
npm test          # all tests/*.js except smoke (includes money-join)
npm run lint      # ESLint flat config
npm run format    # Prettier
```

## Smoke test

Start the server, then run:

```bash
npm run smoke
```

The smoke test creates a three-player room, plays a hand through showdown, and verifies chip totals.

## PR screenshots

Do not commit screenshot binaries into the repo. Attach before/after images in the pull request description instead (`pr-screenshots/` is gitignored).

## Deployment

[holdem.nyc](https://holdem.nyc) is served from Railway's native GitHub integration: `main` deploys to the `cards` project, `production` environment, `holdem` service. Keep **Wait for CI** enabled in the service's Source settings so deployments wait for the GitHub checks to pass.

The `.github/workflows/ci.yml` workflow runs the full test suite and a multiplayer smoke test on Node 24 for pushes and pull requests. It does not deploy directly and requires no Railway API token. The former CLI deployment workflow was removed because it duplicated native deployments and failed on an invalid token.

Check deployment status in Railway; a green GitHub test run confirms tests passed, not that the deployment has finished. To redeploy, use the service's deployment controls in Railway.

## Persistent games

The server snapshots active rooms (same JSON shape as before). Spectators are never persisted.

- **Redis (production):** when `REDIS_URL` is set, state is stored under the Redis key `holdem:game-state`. This is what Railway should use so deploys can overlap without a volume.
- **File (local / tests):** when `REDIS_URL` is unset, state is written to `GAME_STATE_FILE`, or else `RAILWAY_VOLUME_MOUNT_PATH` / `DATA_DIR` / `.data/rooms.json`.

On first boot with Redis empty, if a file still exists at `GAME_STATE_FILE`, the server migrates those rooms into Redis once so live tables carry over.

## Graceful deploys

On `SIGTERM` / `SIGINT`:

1. Stop dealing new hands; show clients a subtle **Updating after this hand** notice (`server:deploy-waiting` / `updatingAfterHand` on room updates). Bots and shot clocks keep running.
2. Wait for in-progress hands to finish, up to **`DEPLOY_HAND_WAIT_MS`** (default `25000`, must stay under Railway’s ~30s drain window).
3. If the wait cap is hit, pause timers (so nobody is auto-folded during the restart), then continue.
4. Flush state (Redis or file), publish a Redis `holdem:handoff` message when using Redis, broadcast `server:restarting`, and close sockets.

On boot the server restores rooms. **File mode** still pads `turnEndsAt` / `readyEndsAt` by time since `savedAt` (real process downtime). **Redis mode** does not pad by idle time since the last debounced save — that would inflate clocks by minutes for quiet tables. Instead the draining instance stamps `shutdownFlushedAt` on its final flush and writes a durable Redis key `holdem:handoff` (plus a pub/sub ping on `holdem:handoff-ch`). The new instance polls that key and pads only by the flush→restore gap (ideally ~0 when SIGTERM flush just happened).

With Redis, a new instance loads state at startup but treats rooms as passive until live socket activity or handoff/takeover, so it does not fight the draining instance. Handoff completes when the durable key is observed (poll or pre-existing), via pub/sub, or after `DEPLOY_TAKEOVER_MS` (default 20s, crash safety).

Clients show the soft banner, auto-rejoin by `deviceId`, and reload to the new build only between hands (or immediately when not in a hand).

`GET /healthz` returns **200** only after state has been restored and the HTTP server is listening; otherwise **503**. `railway.json` sets `deploy.healthcheckPath=/healthz`.

### Env vars

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | Redis connection URL. When set, room state is stored in Redis instead of the volume file. |
| `DEPLOY_HAND_WAIT_MS` | Max time to wait for in-progress hands on SIGTERM (default `25000`). Keep below the drain window. |
| `DEPLOY_TAKEOVER_MS` | Max time a booting Redis replica waits for a handoff marker before taking ownership (default `20000`). Keep under 30s. |
| `DEPLOY_HANDOFF_POLL_MS` | Poll interval for the durable `holdem:handoff` key (default `200`). |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | Set to **`30`** on the Railway service so SIGTERM handling can finish before SIGKILL. |
| `GAME_STATE_FILE` | File path used when `REDIS_URL` is unset (and as the source for one-time Redis migration). |

### Railway settings (Daniel)

After this change, prefer Redis over a volume so Railway can run overlapping deploys:

1. Add a Redis plugin/service to the `cards` project and set **`REDIS_URL`** on the `holdem` service (Railway’s Redis variable reference).
2. Keep **`RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30`**.
3. Deploy once with Redis + the existing volume (migration copies `rooms.json` into Redis if needed).
4. Confirm tables restore, then **remove the volume** from `holdem` so future deploys can overlap.

Do not change Railway config from this repo beyond `railway.json` healthcheck settings; set Redis / draining / volume in the Railway dashboard.
