# Design system (holdem.nyc)

Read this before any UI change. Prefer shared helpers in `public/ui.ts` and shared CSS classes over one-offs.

## Controls

- **Never more than 2 buttons in a row.** Extra secondary actions go in `.action-links` as small text links (`text-action-link` / `textActionLinkHtml`).
- **One clear primary button** per row (default `<button>` with no variant class).
- **Trainer / Hand Review controls** must match the live game table (same classes, labels, key badges, Fold/Confirm patterns).
- **Fold is red** — use the `danger` variant.
- **Key badges** use the same markup everywhere: `setButtonLabel` / `keyBadgeHtml` (`<span>` + optional `<kbd>` + `has-shortcut`).

## Icons & copy

- **No emoji glyphs in UI chrome.** Use inline SVG with `currentColor` (`iconCloseSvg`, `verdictIconSvg`, nav chevrons). Card suit letters ♠♥♦♣ on card faces are allowed content.
- Prefer `HoldemUI` helpers over duplicating SVG or button markup.

## Layout stability

- **No layout shift** when text or state changes.
- Keep controls **rendered but disabled** when it is not the hero’s turn (do not unmount the row).
- Reserve **fixed-width slots** for labels that change (amounts, Ready / Not ready, Call / Raise).

## Hand Review

- Hand Review **stops only on the hero’s decisions**.

## Visual regression

- Anything not intentionally changed must **match prior approved screenshots**.
- Playwright baselines live in `tests/visual/baselines`. Diffs fail CI.
- After intentional UI changes: run `npm run test:visual:update`, **commit the updated baselines**, and explain why in the PR.

## Tokens & reuse

- **Reuse shared components** (`public/ui.ts` + shared CSS classes). No one-off button skins.
- Design tokens live in `public/tokens.css`. **No raw hex/rgb** or spacing/font-size **px** outside `tokens.css` (styles reference `var(--…)` only).
