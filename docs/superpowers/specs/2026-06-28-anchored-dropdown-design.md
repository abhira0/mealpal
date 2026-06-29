# Anchored Dropdown — site-wide custom select

## Goal
Replace the bottom-sheet `Dropdown` with one anchored popover that opens at the
trigger, and use it everywhere a select is needed — including the two native
`<select>`s in `AddExtra`.

## Why
The bottom sheet is heavy for a single field, opens a sheet-on-a-sheet inside
modals (PlanEditor, RecipeSheet), and felt wrong for the Bill product-swap.

## Design (approved: direction A)
- Trigger: existing `.trigger` button (label/placeholder + caret). Caret flips ▾→▴ when open.
- Panel: portaled to `document.body`, `position: fixed` at the trigger's rect
  (`getBoundingClientRect`), matching the trigger width. Escapes any `overflow`
  / `filter` clipping (e.g. `.ticket`'s drop-shadow).
- Flip: opens below by default; opens upward when there isn't room below.
- Options: one row each, selected row gets a ✓ and tint; hover/keyboard row highlighted.
- Long lists: `max-height` + scroll.
- Close on: outside mousedown, Escape, or selection. Focus returns to trigger.
- Keyboard: ↑/↓ move active row, Enter/Space select, Escape closes.

## API (unchanged — call sites untouched)
`{ label?, value, options: {id,label}[], placeholder?, onChange }`

## Scope
- Rewrite `src/components/Dropdown.tsx` (drop `Sheet` dependency).
- Add `.trigger.open` + `.dropdown-pop` CSS to `globals.css`.
- Replace the 2 native `<select>`s in `AddExtra.tsx` with `<Dropdown>`.
- `Sheet.tsx` stays (still used by RecipeSheet/PlanEditor modals).

## Check
Manual: open each call site (Bill swap, AddExtra product + stop, PlanEditor,
RecipeSheet, EntityForm); confirm it anchors, flips near screen bottom, isn't
clipped inside a ticket/modal, and keyboard-selects.
