# Tournament mode (plan)

Grounded in today’s holdem.nyc: private Socket.IO rooms, shared engine (`shared/create-holdem-engine.ts`), money ledger (`server/money/ledger.ts`), ready-up + shot clock, bots, `MAX_PLAYERS = 9`, `STARTING_STACK = 1000`, Redis/file room persistence.

**Phases 1–2 (this PR):** `tournamentMode` create/serialize, host lobby toggle, timed blind levels (server timer → next deal), level clock UI.

## Goal

Add a **freezeout tournament** room type that coexists with chip and cash (`moneyMode`) rooms. Live cash behavior stays unchanged.

## Format

- **Freezeout:** one buy-in, play until one player has all chips (or host ends). No mid-event chip cash-out.
- **Table size:** same 2–9 seats as today (`MAX_PLAYERS`).
- **Starting stack:** host-set chip count (default `STARTING_STACK` 1000). Independent of cash buy-in dollars.
- **Buy-in:** host-set cents (like cash `buyInCents` / `DEFAULT_BUY_IN_CENTS` 2000). Prize pool = buy-ins collected on the tournament ledger. *(Phase 4.)*

## Blind schedule (timed levels)

Cash rooms keep **fixed** blinds. Chip rooms already bump blinds by **hand count** (`BLIND_LEVELS` / `blindLevelForHand`). Tournaments use **clocked levels**:

- Default preset: **10-minute** levels (ladder from chip `BLIND_LEVELS` ratios). Future: host presets / custom `{ smallBlind, bigBlind, durationMs }`.
- Level advances on a server timer (same persistence/pad patterns as `turnEndsAt` / `readyEndsAt`). Blind change applies on the **next deal** (never mid-hand).
- UI: level index, current SB/BB, countdown — pot-chip chrome in `.table-meta` (no control-panel height shift).

## Elimination & places

*(Phase 3.)* Bust when stack hits 0 after a hand settles. Record finish place; last standing = 1st; room → `gameover`. Disconnect / sit-out: keep today’s grace; blinding off while out.

## Payouts

*(Phase 4.)* Prize pool from tournament buy-ins on a ledger shaped like `moneyLedger`. Default: **top ~15% paid** with classic splits:

- 2–4 players → top 1 (100%)
- 5–7 → top 2 (65/35)
- 8–9 → top 3 (50/30/20)

On finish, write `cashOutCents` and run `optimizeSettlements` so settle-up works.

## Registration knobs (host at create)

| Knob | v1 default |
| --- | --- |
| Late registration | **No** (doors close when hand 1 deals) |
| Rebuys / add-ons | **No** (true freezeout) |
| Bots | **No** (same as cash) |

## Create & coexistence

- Welcome Host: **Tournament** toggle (mutually exclusive with Money mode). Sets `room.tournamentMode` without flipping cash `moneyMode` semantics.
- Same room codes, invite URLs, credentials rejoin, Redis/file snapshot fields extended — cash rooms ignore the new fields.
- Offline Practice / local chip host: **out of scope** for v1 (server-timed levels).

## UI (reuse shared controls)

- Lobby: Tournament toggle; blinds fields hidden (schedule owns blinds). Buy-in / starting-stack host fields land with payouts (phase 4).
- In-hand: **level/blinds clock** beside the pot chip.
- Later: places remaining; final settle-up reuse.

## Test plan

1. **Unit:** blind schedule advance (timer → next deal only); (later) elimination places; payout math.
2. **Integration:** create tournament room; no bots; timed level apply on next deal; cash room regression.
3. **Reconnect:** refresh mid-level keeps seat + clock.
4. **Visual:** lobby tournament host; in-hand level clock (375/1280 × dark/light).

## Phased PRs

1. **Types + room flag** — `tournamentMode` on create/serialize; cash paths ignore it. ✅ (this PR)
2. **Timed blind levels** — schedule, server timer, next-deal apply; level clock UI. ✅ (this PR)
3. **Elimination + places** — bust → place; tournament end; results chrome.
4. **Ledger payouts** — buy-in collection, top-N splits, settlements + settle-up.
5. **Polish** — late-reg/rebuy hooks (still default off), more baselines, disconnect edges.

## Decisions for Daniel — approved

1. **Late registration?** → **No** for v1 (doors close at hand 1). ✅
2. **Rebuys / add-ons?** → **No** (freezeout only). ✅
3. **Bots in tournaments?** → **No** (same as cash). ✅
4. **Payout structure?** → **Top ~15% with 1/2/3-place splits by field size**. ✅
5. **Blind clock default preset?** → **10-minute levels** from chip `BLIND_LEVELS` ratios, timed not hand-counted. ✅
