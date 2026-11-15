# Tournament mode (plan)

Docs-only. No code yet. Grounded in today’s holdem.nyc: private Socket.IO rooms, shared engine (`shared/create-holdem-engine.ts`), money ledger (`server/money/ledger.ts`), ready-up + shot clock, bots, `MAX_PLAYERS = 9`, `STARTING_STACK = 1000`, Redis/file room persistence.

## Goal

Add a **freezeout tournament** room type that coexists with chip and cash (`moneyMode`) rooms. Live cash behavior stays unchanged.

## Format

- **Freezeout:** one buy-in, play until one player has all chips (or host ends). No mid-event chip cash-out.
- **Table size:** same 2–9 seats as today (`MAX_PLAYERS`).
- **Starting stack:** host-set chip count (default `STARTING_STACK` 1000). Independent of cash buy-in dollars.
- **Buy-in:** host-set cents (like cash `buyInCents` / `DEFAULT_BUY_IN_CENTS` 2000). Prize pool = buy-ins collected on the tournament ledger.

## Blind schedule (timed levels)

Cash rooms keep **fixed** blinds. Chip rooms already bump blinds by **hand count** (`BLIND_LEVELS` / `blindLevelForHand`). Tournaments need **clocked levels** instead:

- Host picks a **preset** (e.g. 5 / 8 / 12 / 15 min) or a **custom** list of `{ smallBlind, bigBlind, durationMs }`.
- Level advances on a server timer (same persistence/pad patterns as `turnEndsAt` / `readyEndsAt`). Blind change applies on the **next deal** (never mid-hand), matching how cash blind edits already wait for a safe phase.
- UI: level index, current SB/BB, countdown — reuse shot-clock / ready-bar chrome (`HoldemUI`, tokens), not a one-off widget.

## Elimination & places

- Bust when stack hits 0 after a hand settles (same chip accounting as today).
- Record **finish place** (9th … 1st) on eliminate; last player standing = 1st; room → `gameover`.
- Disconnect / sit-out: keep today’s grace (`DISCONNECT_GRACE_MS` / background grace). While out of chips or blinded off, they **post blinds/antes when due** and can be eliminated; no special “pause the clock for AFK” in v1.

## Payouts

- Prize pool from tournament buy-ins on a ledger shaped like `moneyLedger` (`buyInsCents` / `cashOutCents`).
- Default: **top ~15% paid**, classic splits (examples for seats paid):
  - 2–4 players → top 1 (100%)
  - 5–7 → top 2 (65/35)
  - 8–9 → top 3 (50/30/20)
- On finish, write `cashOutCents` for paid places and run `optimizeSettlements` so the existing settle-up screen works.
- Host can override paid places / percents later; v1 ships the preset table.

## Registration knobs (host at create)

| Knob | v1 default |
| --- | --- |
| Late registration | **No** (doors close when hand 1 deals) |
| Rebuys / add-ons | **No** (true freezeout) |
| Bots | **No** (`moneyMode` already blocks bots; tournaments match that) |

## Create & coexistence

- Welcome Host mode: third path next to chip / money — **Tournament** (or Host → format toggle). Creates `room.tournamentMode` (name TBD) **instead of** flipping cash `moneyMode` semantics.
- Same room codes, invite URLs (`/{CODE}`), credentials rejoin, Redis/file snapshot fields extended — cash rooms ignore the new fields.
- Offline Practice / local chip host: **out of scope** for v1 (server-timed levels + ledger).

## UI (reuse shared controls)

- Lobby: buy-in, starting stack, level preset, late-reg/rebuy toggles (disabled off), ready-up unchanged.
- In-hand: existing Fold/Call/Raise; add **level/blinds clock** in topbar or panel header (no layout shift on the control panel height).
- Between hands: places remaining / players left (short status line, not a card stack).
- Final: reuse money **Settle up** score screen with places + payouts.

## Test plan

1. **Unit:** blind schedule advance (timer → next deal only); elimination place assignment; payout table math; settlements from ledger.
2. **Integration:** create tournament room; 3–9 humans; play to busts; verify places + settlements; cash room regression (fixed blinds, cash-in, no bots rule unchanged).
3. **Reconnect:** refresh mid-level keeps seat + clock (same credential rejoin as #92).
4. **Visual:** lobby tournament host fields; in-hand level clock; final settle-up (375/1280 × dark/light) — update only affected baselines.

## Phased PRs

1. **Types + room flag** — `tournamentMode` (or equivalent) on room create/serialize; cash paths ignore it; no UX yet.
2. **Timed blind levels** — schedule on room, server timer, next-deal apply; host preset; level clock UI.
3. **Elimination + places** — bust → place; tournament end when one remains; results chrome.
4. **Ledger payouts** — buy-in collection, top-N splits, settlements + settle-up screen.
5. **Polish** — late-reg/rebuy hooks (still default off), visual baselines, disconnect/blind-off edge cases.

## Decisions for Daniel

1. **Late registration?** → Recommend **No** for v1 (simplest; doors close at hand 1).
2. **Rebuys / add-ons?** → Recommend **No** (freezeout only).
3. **Bots in tournaments?** → Recommend **No** (same as cash; humans-only prize pool).
4. **Payout structure?** → Recommend **top ~15% with 1/2/3-place splits by field size** (table above); host overrides later.
5. **Blind clock default preset?** → Recommend **10-minute levels** with a short built-in SB/BB ladder (scale from today’s chip `BLIND_LEVELS` ratios, timed not hand-counted).
