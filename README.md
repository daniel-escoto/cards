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
