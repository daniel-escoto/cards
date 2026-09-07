# Table Stakes Hold'em

A private-room multiplayer Texas hold'em game for friends. The server owns all game state and clients connect over Socket.IO.

## Features

- Host or join private tables with a room code/link
- 2 to 8 players
- Server-side deck, betting order, blinds, streets, side pots, and showdown payouts
- Poker hand evaluation via `pokersolver`
- Responsive UI for desktop and mobile browsers

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Smoke test

Start the server, then run:

```bash
npm run smoke
```

The smoke test creates a three-player room, plays a hand through showdown, and verifies chip totals.

## Deployment

Every push to `main` runs the GitHub Actions workflow in `.github/workflows/deploy.yml` and deploys to the Railway `cards` project, `production` environment, `holdem` service with `railway up --ci`.

Add this GitHub repository secret:

- `RAILWAY_API_TOKEN`: Railway account or workspace token with access to the project.

## Persistent games

The server snapshots active rooms to JSON so games can be restored after a restart or deploy. By default it writes to `RAILWAY_VOLUME_MOUNT_PATH`, `DATA_DIR`, or local `.data/rooms.json`.

For production deploys, attach a Railway volume or set `GAME_STATE_FILE` to a persistent path. Without a persistent filesystem, games will still be saved locally during the process lifetime but will not survive a fresh container.
