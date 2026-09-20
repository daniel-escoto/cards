# Table Stakes Hold'em

A private-room multiplayer Texas hold'em game for friends. The server owns online game state and clients connect over Socket.IO. Chip Host without a server connection runs the same rules engine in the browser (add CPU players at the table; works offline after the first visit).

## Features

- Host or join private tables with a room code/link
- Host lobby: display name, blinds, and optional money mode
- Add CPU players from the table / menu (online or local offline)
- Money-game join preview with buy-in and blinds; join during a hand and play on the next deal
- 2 to 9 players
- Shared pure engine for deck, betting, blinds, streets, side pots, showdown, and bots (`shared/`)
- Poker hand evaluation via vendored `pokersolver` (Node + browser)
- Minimal PWA shell cache so chip Host works offline after the first load when the server is unreachable
- Responsive UI for desktop and mobile browsers

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

**Host:** name, blinds, money mode. With a connection, chip Host creates an online room (friends join with the code; add bots in-table). Without a connection, chip Host starts a local offline table — add bots with **+ Add CPU player**, then ready up. Money mode always needs the server. **Join** is online rooms only.

## Smoke test

Start the server, then run:

```bash
npm run smoke
```

The smoke test creates a three-player room, plays a hand through showdown, and verifies chip totals.

## Deployment

Railway's native GitHub integration deploys `main` to the `cards` project,
`production` environment, `holdem` service. Keep **Wait for CI** enabled in the
service's Source settings so deployments wait for the GitHub checks to pass.

The `.github/workflows/ci.yml` workflow runs the full test suite and a multiplayer
smoke test on Node 24 for pushes and pull requests. It does not deploy directly
and requires no Railway API token. The former CLI deployment workflow was removed
because it duplicated native deployments and failed on an invalid token.

Check deployment status in Railway; a green GitHub test run confirms tests passed,
not that the deployment has finished. To redeploy, use the service's deployment
controls in Railway.

## Persistent games

The server snapshots active rooms to JSON so games can be restored after a restart or deploy. By default it writes to `RAILWAY_VOLUME_MOUNT_PATH`, `DATA_DIR`, or local `.data/rooms.json`.

For production deploys, attach a Railway volume or set `GAME_STATE_FILE` to a persistent path. Without a persistent filesystem, games will still be saved locally during the process lifetime but will not survive a fresh container.
