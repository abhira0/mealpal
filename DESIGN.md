---
name: MealPal
description: A household's food operation as one calm, dense productivity tool — the category standard at Linear's craft.
colors:
  bg: "#EEF1F4"
  surface: "#FAFBFC"
  surface-2: "#E4E8EC"
  surface-3: "#DADFE4"
  ink: "#16191C"
  ink-2: "#56606A"
  ink-3: "#656E78"
  line: "#DCE1E6"
  line-soft: "#E7EBEF"
  accent: "#1E7A8C"
  accent-press: "#185F6E"
  accent-ink: "#175766"
  accent-weak: "#E1EDF0"
  accent-2: "#E8674F"
  accent-2-ink: "#BE4732"
  accent-2-weak: "#FCEAE6"
  danger: "#C41F1F"
  danger-weak: "#FCECEC"
  danger-line: "#F3C9C9"
  warn: "#8A5200"
  warn-weak: "#FBF1DC"
  warn-line: "#EED9AE"
  ok: "#256B3E"
  ok-weak: "#E8F3EB"
  ok-line: "#CDE6D4"
  macro-protein: "#4F5BD5"
  macro-carbs: "#E0A63A"
  macro-fat: "#E0684A"
typography:
  # Dense Operate tool: a fine discrete size scale (px) is intentional. Any literal
  # font-size in the app should be one of these steps.
  sizes: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 24, 26]
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 680
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 640
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "ui-monospace, SF Mono, SFMono-Regular, Menlo, Cascadia Mono, Roboto Mono, monospace"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.14em"
  numeral:
    fontFamily: "ui-monospace, SF Mono, SFMono-Regular, Menlo, Cascadia Mono, Roboto Mono, monospace"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
rounded:
  r1: "6px"
  r2: "8px"
  r3: "12px"
  sheet: "16px"
  pill: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    typography: "{typography.body}"
    rounded: "{rounded.r2}"
    padding: "10px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-press}"
    textColor: "#FFFFFF"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r2}"
    padding: "10px 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.accent-ink}"
    padding: "8px 0"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#FFFFFF"
    rounded: "{rounded.r2}"
    padding: "10px 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r3}"
    padding: "14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r2}"
    padding: "12px 13px"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 9px"
  chip-accent:
    backgroundColor: "{colors.accent-weak}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 9px"
---

# Design System: MealPal

## Overview

**Creative North Star: "The Kitchen Operations Console"**

MealPal is a household's food operation rendered as a single calm, dense productivity tool. It plays the category standard straight — a clean, familiar productivity-tool look executed impeccably, with no gimmick or novelty world — and holds itself to Linear's craft bar: crisp neutral surfaces, tight typography, one restrained accent, fast and information-dense. It is light-first by intent, built for the daytime kitchen scene and for a returning power user who already knows the app, not for onboarding strangers.

The world is cool and near-monochrome. A light cool-gray canvas carries white surfaces separated by hairline borders and barely-there 1px shadows; text is near-black; a single indigo accent appears sparingly to mark the one live action or the current selection. Typography is the system font stack (no webfont payload) with tight negative tracking on headings, and a monospace stack reserved for eyebrows, metadata, and every numeral — which is always set in tabular figures so quantities, prices, and macros align in columns. Corners are gently softened at 6–12px; nothing is pill-round except tags and toggles.

This build explicitly refuses the friendly rounded-card + food-photo + soft-green meal-planner look and its Notion-lite opposite. It also refuses decorative novelty: shop "tickets" are clean cards, not receipt-scallop skeuomorphism. Restraint is the aesthetic — color is a signal, not decoration, and depth is a whisper, not a stack.

**Key Characteristics:**
- Light-first cool-neutral canvas with white surfaces and hairline (1px) borders.
- One indigo accent (#4F5BD5), used sparingly for the primary action and current selection.
- System font stack; tight tracking on headings; monospace + tabular numerals for all figures.
- 6–12px radii, 1px ambient shadows; information-dense, mobile-first, one-handed.
- Responsive shell: bottom nav on mobile, fixed left sidebar at ≥900px.

## Colors

A cool, near-monochrome neutral field with a single indigo accent and a restrained trio of semantic status colors; the macro chart adds two chart-only hues alongside the accent.

### Primary
- **Indigo Accent** (#4F5BD5): The one accent. Used sparingly for the primary button, the active nav item, selected filter/tab/toggle states, timeline nodes, week-strip dots, the checkbox fill, and video play buttons. It carries "the one thing to act on or the thing currently selected," never decoration.
- **Indigo Press** (#3F49B5): Pressed/hover state of accent surfaces (primary button hover, active step numbers under press).
- **Indigo Ink** (#3A42A8): Accent used as *text/icon* color for legibility on light backgrounds — ghost/link buttons, breadcrumbs on hover, avatar monogram, selected dropdown option text, step numerals.
- **Indigo Wash** (#EEEFFB): Tint background behind accent-tinted chips, the selected sidebar item, selected dropdown rows, step-number badges, and `::selection`.

### Neutral
- **Canvas** (#FBFBFC): App background; the cool page field everything sits on.
- **Surface** (#FFFFFF): Cards, rows, inputs, sheets, nav — every raised plane.
- **Surface 2** (#F4F5F7): Hover fill for neutral interactive surfaces; chip and thumb backgrounds; ticket headers.
- **Surface 3** (#EDEEF1): The quietest fill — sheet grab handle, inactive cook-mode dots.
- **Ink** (#17181C): Primary near-black text and headings.
- **Ink 2** (#5B6069): Secondary/body text and quiet controls.
- **Ink 3** (#6B6F77): Tertiary text — metadata, labels, placeholders, arrows, disabled hints. Darkened to clear 4.5:1 on the canvas; keep tertiary *text* at this value and reserve lighter grays for non-text hairlines only.
- **Line** (#E6E8EC): The hairline border on every surface — cards, inputs, dividers between regions.
- **Line Soft** (#F0F1F4): The even quieter inner divider (row-to-row separators inside a card/list).

### Tertiary (status + chart)
Status colors are used sparingly, always as a weak-tint background + matching line + saturated ink triad.
- **Danger** (#DC2B2B) on **Danger Weak** (#FCECEC) with **Danger Line** (#F3C9C9): destructive actions, error notices, run-out/negative stock, fail badges.
- **Warn** (#B26B00) on **Warn Weak** (#FBF1DC) with **Warn Line** (#EED9AE): low-stock and the "cooked" (in-progress) phase.
- **OK** (#2F8F52) on **OK Weak** (#E8F3EB) with **OK Line** (#CDE6D4): success notices, "served" phase, pass badges.
- **Macro chart:** Protein #4F5BD5 (the accent), Carbs #E0A63A, Fat #E0684A. These three are chart-only; the calorie bar uses Indigo Press (#3F49B5).

### Named Rules
**The One Voice Rule.** Indigo is the only accent and appears on a small fraction of any screen — the primary action and the current selection. If two things are indigo on a screen, one of them is probably wrong.

**The Weak-Line-Ink Triad Rule.** Every status color ships as a set: a `-weak` tint background, a `-line` border, and the saturated hue for text/icon. Never place a saturated status hue as a large fill; the tint carries the surface, the hue carries the label.

**The Signal-Not-Decoration Rule.** Color marks state (planned/cooked/served, low/run-out, pass/fail, selected/active). A surface with no state is neutral. Do not colorize for variety.

## Typography

**Display / Body Font:** System sans stack — `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. No webfont payload; the OS face is the face.
**Label / Numeral Font:** System mono stack — `ui-monospace, "SF Mono", "SFMono-Regular", "Menlo", "Cascadia Mono", "Roboto Mono", monospace`.

**Character:** Tight, engineered, quiet. Headings pull in with negative tracking; metadata and numbers switch to monospace to read as instrument readouts. The pairing says "operations console," not "magazine."

### Hierarchy
- **Display** (680 weight, 26px, line-height 1.1, tracking -0.03em): Page titles (`.chrome h1`) and the desktop sidebar brand. The largest type on any screen.
- **Title** (640 weight, 16–17px, tracking -0.01em): Card titles, sheet titles, ticket headers.
- **Body** (400 weight, 15px, line-height 1.5): Base reading text and control labels. Secondary body drops to 14px in Ink 2.
- **Numeral** (600 weight, 12–18px, `font-variant-numeric: tabular-nums`, mono): Every quantity, price, macro, stepper value, and day number. Always tabular so columns align.
- **Label** (600 weight, 10px, tracking 0.14em, UPPERCASE, mono, Ink 3): Field labels (`.eb` on forms), section labels, breadcrumbs, meta lines. The recurring small-caps monospace tag that structures content — but **not** a kicker above a page title (see rule below).

### Named Rules
**The Tabular Numeral Rule.** Numbers are set in the mono stack with tabular figures — never in the sans body face. Quantities, prices, macros, and dates must align vertically wherever they stack.

**The Mono-Label Rule.** Structural labels (field labels, section headers, metadata) are 10px uppercase monospace in Ink 3 with wide tracking (~0.14em). This is the house label; do not substitute a sans small-caps.

**No Page-Title Kicker.** A page title (`.chrome h1`) stands alone — no uppercase eyebrow above it restating the surface name (the active nav item already names the surface). Supplementary data (e.g. Shop's stop count + total) may sit as a plain muted line *below* the title, never as a kicker above it.

**Inputs Never Zoom.** Text inputs are 16px so iOS Safari does not auto-zoom on focus. Do not shrink field text below 16px.

## Layout

Mobile-first single column inside a `.app` shell capped at **600px** and centered, with 16px content padding and 84px of bottom padding to clear the fixed bottom nav. Vertical rhythm comes from `.stack` (12px gap) and `.stack-sm` (8px gap); the spacing scale runs 4 / 8 / 12 / 16 / 24 / 32px.

Section structure is carried by the mono eyebrow/section-label pattern rather than boxes: a `.section-label` adds a top hairline (Line Soft) and an uppercase mono heading, except the first.

**Responsive rule (≥900px):** the shell becomes a two-pane desktop layout. The bottom nav transforms into a fixed **220px left sidebar** (`order:-1`, full-height, right hairline border, vertical, with a visible brand wordmark that is hidden on mobile). Content uncaps to a **960px** centered column with 24px padding. Lists of `.row`, `.account-row`, or `button.card` reflow via `:has()` into an `auto-fill` grid of `minmax(300px, 1fr)` cards, while non-card children span the full row. Bottom sheets recenter into a 520px centered modal (grab handle hidden).

## Elevation & Depth

Near-flat. Depth is conveyed primarily by the hairline border (Line) on white surfaces against the cool canvas; shadows are a faint ambient whisper, never a drop-shadow stack. Three shadow tokens exist, escalating only with layer height, plus the timeline node uses a 3px canvas-colored ring to punch through the rail.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgba(20,22,28,.05)`): The default 1px lift on cards, rows, account rows, and tickets. Barely visible; it separates the plane from the canvas without announcing itself.
- **Raised** (`box-shadow: 0 4px 14px rgba(20,22,28,.08)`): Reserved for mid-layer surfaces; used lightly.
- **Popover** (`box-shadow: 0 16px 40px rgba(20,22,28,.16)`): Only for overlays that float above everything — dropdown popovers, bottom sheets, confirm dialogs. The one place shadow is allowed to read.

### Named Rules
**The Hairline-First Rule.** Separation is a 1px Line border, not a shadow. Resting shadow is a 1px ambient hint only; anything heavier than Resting is reserved for floating overlays.

## Shapes

A calm three-step radius scale: **6px (`r1`)** for small inset chrome (checkbox, step badges, icon badges, inline value-edit fields), **8px (`r2`)** for interactive controls (buttons, inputs, triggers, tabs, week days, thumbnails), **12px (`r3`)** for containers (cards, rows, tickets, dropdown popovers, media frames). Bottom sheets and centered modals use a slightly larger **16px**. Fully round (**999px**) is reserved for pills — chips, filter buttons, timeline/week dots, and the step-insert control. Borders are uniformly 1px hairlines in Line; the checkbox uses a 1.6px border. Avatars and timeline/week dots are perfect circles.

## Components

### Buttons
- **Shape:** Softened 8px corners (`r2`); full-width variant available via `.block`; min-height 44px touch target.
- **Primary:** Indigo fill (#4F5BD5) with matching border, white text, 600 weight, 10px×16px padding. Hover shifts to Indigo Press (#3F49B5) over a 0.12s ease. Disabled drops to 0.45 opacity with a default cursor.
- **Secondary:** White surface, Ink text, Line border; hover fills Surface 2.
- **Ghost / Link:** No border/fill, Indigo Ink text, hover to Indigo Press. Used for inline "add" and low-emphasis actions.
- **Danger:** Danger fill, white text; hover to #c02424.
- **Icon button:** 44×44 transparent hit area, Ink 2 icon, hover to Ink (or Danger for destructive).
- **Focus:** All interactive elements share one ring — `box-shadow: 0 0 0 3px rgba(79,91,213,.28)` on `:focus-visible`, no outline.

### Chips
- **Style:** Pill (999px), mono 11px 600 uppercase-weight text, Surface 2 fill with a Line border, Ink 2 text, non-wrapping.
- **Accent variant** (`.price`, `.qty`): Indigo Wash fill, Indigo Ink text, borderless.
- **Status variants:** `.low` uses the Warn triad; `.run` uses the Danger triad.

### Cards / Containers
- **Corner Style:** 12px (`r3`).
- **Background:** Surface (white) on the cool canvas.
- **Shadow Strategy:** Resting shadow only (see Elevation).
- **Border:** 1px Line hairline.
- **Internal Padding:** 14px.
- **Rows** (`.row`, `.account-row`): same recipe as cards but flex layouts with min-height 56px; `.account-row` hover fills Surface 2.

### Inputs / Fields
- **Style:** White surface, 1px Line border, 8px radius, 12×13px padding, min-height 44px, **16px** text (no iOS zoom). A `.mono` modifier switches to tabular monospace for numeric entry.
- **Hover:** Border darkens to Ink 3.
- **Focus:** Border becomes Accent and gains the focus ring; placeholders are Ink 3.
- **Triggers / dropdowns:** A `.trigger` mirrors the input; when `.open` it takes the accent border + focus ring. The `.dropdown-pop` is a 12px-radius Popover-shadow surface; selected options use Indigo Ink text on Indigo Wash, keyboard-active rows use Surface 2.

### Navigation
- **Mobile:** Fixed bottom bar, white with a top hairline, icons+labels in 10px sans, Ink 3 at rest, Accent when `.on`. Respects `env(safe-area-inset-bottom)`.
- **Desktop (≥900px):** Becomes a 220px fixed left sidebar with a visible brand wordmark, horizontal row items (14px), hover fill Surface 2, and the active item on Indigo Wash with Indigo Ink text.

### View Tabs & Filters
- **Tabs (underlined):** 13px 600 sans, Ink 2, transparent 2px bottom border; active is Ink with an Accent underline.
- **Segmented tabs / unit radios:** 8px-radius Surface buttons; selected fills Accent with white text.
- **Filter chips:** Pill Surface buttons; selected fills Accent with white text; a mono `.lbl` prefixes the group.

### Signature Components
- **Timeline (Today):** A vertical 2px Line rail with 10px circular Accent nodes ringed 3px in the canvas color to float above the line; empty/incomplete nodes drop to Ink 3.
- **Week strip (Plan):** Horizontally scrollable day cells (min 52px, 8px radius). Day-of-week in mono micro-caps, day number in tabular mono; a 5px Accent dot marks planned days; the selected day fills Accent (white text, translucent-white sub-labels), today gets an Accent border.
- **Macro bars (Nutrition/Today):** A slim track showing a *planned* fill behind a *served/cooked* fill in the nutrient's chart color — Calories in Indigo Press, Protein #4F5BD5, Carbs #E0A63A, Fat #E0684A.
- **Phase chip (agenda row):** A single small chip encoding meal state — **planned** = Surface 3 bg / Ink 2 text (not yet acted on), **cooked** = Warn triad (in progress), **served** = OK triad (done); an out-of-stock meal overrides to a solid Danger chip with white text.
- **Cook Mode overlay:** Full-viewport canvas-colored surface for hands-on counter use; large 20–32px `clamp()` step text, mono step counter, a 16:9 clip frame, and Accent progress dots.

## Do's and Don'ts

### Do:
- **Do** keep indigo rare — the primary action and the current selection only (The One Voice Rule).
- **Do** set every number in the mono stack with `font-variant-numeric: tabular-nums`.
- **Do** separate surfaces with 1px Line hairlines and Resting shadow; reserve the Popover shadow for floating overlays.
- **Do** use the mono 10px uppercase label (Ink 3, ~0.14em tracking) for field labels, section headers, and metadata — but never as a kicker above a page title.
- **Do** ship status color as the weak-tint background + `-line` border + saturated-ink triad.
- **Do** keep input text at 16px and controls at a 44px min touch target.
- **Do** use the shared focus ring (`0 0 0 3px rgba(79,91,213,.28)`) on `:focus-visible`.
- **Do** honor the responsive split: bottom nav below 900px, 220px left sidebar and 960px content at and above it.

### Don't:
- **Don't** introduce a second accent hue or use macro chart colors (carbs/fat) anywhere outside the macro charts.
- **Don't** fill large areas with a saturated status hue; the tint carries the surface, the hue carries the label.
- **Don't** add heavy or offset drop shadows, gradients, or receipt-scallop / skeuomorphic novelty — tickets are clean cards.
- **Don't** set numbers in the sans body face or use non-tabular figures in stacked data.
- **Don't** exceed the 600px mobile shell width or drop the 84px bottom-nav clearance.
- **Don't** reference the legacy CSS-variable names (`--enamel`, `--paprika`, `--paper`, `--turmeric`, `--sage`, `--low-*`, `--run-*`) in new code; they are backward-compat aliases remapped onto the canon tokens, not part of the system going forward.
