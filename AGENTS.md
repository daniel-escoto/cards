# Agents

Before any UI work (buttons, menus, Trainer, Hand Review, layout, CSS, icons):

1. Read **[DESIGN.md](./DESIGN.md)** and follow it.
2. Reuse **`public/ui.ts`** (`HoldemUI`) and shared CSS classes — do not invent one-off controls.
3. Put new colors / spacing / font sizes in **`public/tokens.css`** only; reference them with `var(--…)` from `public/styles.css`.
4. After intentional visual changes, update Playwright baselines (`npm run test:visual:update`), commit them, and explain why in the PR.
