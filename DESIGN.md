---
name: Project Hub
description: Local-first project operations console for resuming and maintaining development work.
colors:
  canvas: "oklch(98.7% 0.006 245)"
  surface: "oklch(99% 0.006 245)"
  surface-muted: "oklch(97% 0.018 245)"
  surface-sidebar: "oklch(12% 0.025 260)"
  border-subtle: "oklch(88% 0.03 255)"
  text-primary: "oklch(20% 0.018 255)"
  text-strong: "oklch(24% 0.045 260)"
  text-muted: "oklch(50% 0.055 260)"
  primary: "oklch(28% 0.08 265)"
  primary-hover: "oklch(34% 0.1 265)"
  focus: "oklch(74% 0.12 230 / 0.28)"
  info: "oklch(45% 0.13 230)"
  success: "oklch(36% 0.13 145)"
  warning: "oklch(58% 0.14 75)"
  danger: "oklch(50% 0.16 25)"
typography:
  display:
    fontFamily: "Inter, Inter Fallback, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0"
  headline:
    fontFamily: "Inter, Inter Fallback, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "0"
  title:
    fontFamily: "Inter, Inter Fallback, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0"
  body:
    fontFamily: "Inter, Inter Fallback, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Inter, Inter Fallback, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "0.04em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "44px"
---

# Design System: Project Hub

## 1. Overview

**Creative North Star: "The Local Operations Console"**

Project Hub is a quiet, dense product interface for one developer managing local projects. It should feel like a dependable operations console: structured, inspectable, and ready for repeated daily use. The system favors plain hierarchy, concrete paths, visible timestamps, and direct actions over decorative drama.

Design serves the workflow. The app should help the user decide what to resume, what to inspect, and what maintenance needs attention without forcing them through oversized panels or vague productivity language. Screens should summarize first, then expose detail through tables, cards, and inline controls.

The visual system explicitly rejects flashy AI-dashboard styling, decorative marketing-page drama, oversized hero layouts, vague productivity copy, and interfaces that bury local developer actions behind ornamental UI.

**Key Characteristics:**
- Restrained slate-tinted neutrals with one deep blue-slate primary action color.
- Dense but readable product typography using Inter and system fallbacks.
- 8px-radius controls and cards, with subtle borders and low shadows.
- Concrete local context: paths, commands, report timestamps, git activity, and warnings stay visible.
- Color indicates state or selection; it is not used as decoration.

## 2. Colors

The palette is a restrained, cool-neutral console palette with semantic accents reserved for state and action.

### Primary
- **Deep Console Slate** (`oklch(28% 0.08 265)`): Primary buttons, high-emphasis quick actions, and the strongest interactive affordances.
- **Hover Console Slate** (`oklch(34% 0.1 265)`): Hover state for primary actions.

### Secondary
- **Operational Blue** (`oklch(45% 0.13 230)`): Links, selected states, focus-adjacent UI, and dependency/report navigation where extra affordance is useful.

### Tertiary
- **Status Green** (`oklch(36% 0.13 145)`): Completed or clear states.
- **Maintenance Amber** (`oklch(58% 0.14 75)`): Warnings, pinned state, or moderate maintenance risk.
- **Risk Red** (`oklch(50% 0.16 25)`): Errors, destructive actions, or high-risk dependency updates.

### Neutral
- **Canvas Mist** (`oklch(98.7% 0.006 245)`): App background.
- **Panel White** (`oklch(99% 0.006 245)`): Cards, forms, tables, and popovers.
- **Muted Panel** (`oklch(97% 0.018 245)`): Table heads, skeletons, and low-emphasis bands.
- **Sidebar Ink** (`oklch(12% 0.025 260)`): Persistent navigation sidebar.
- **Subtle Border** (`oklch(88% 0.03 255)`): Card, table, input, and divider borders.
- **Primary Text** (`oklch(20% 0.018 255)`): Default foreground.
- **Muted Text** (`oklch(50% 0.055 260)`): Metadata, helper labels, and secondary timestamps.

### Named Rules
**The Local Truth Rule.** Color must clarify state, selection, or action priority. It should not decorate maintenance data.

**The Restrained Accent Rule.** Primary and semantic accents should stay under 10% of a normal app screen.

## 3. Typography

**Display Font:** Inter, Inter Fallback, system-ui, sans-serif
**Body Font:** Inter, Inter Fallback, system-ui, sans-serif
**Label/Mono Font:** Inter for labels; native monospace for paths, commands, hashes, and versions.

**Character:** Product-native, compact, and direct. Type should feel like a serious tool, not a landing page.

### Hierarchy
- **Display** (600, 30px, 1.2): Large page headings only when a screen needs strong orientation.
- **Headline** (600, 24px, 1.333): Primary dashboard and detail headings.
- **Title** (600, 16px, 1.5): Card titles, table section titles, and panel headings.
- **Body** (400-500, 14px, 1.5): Descriptions, table cells, metadata, and helper text. Keep prose at 65-75ch when possible.
- **Label** (600, 12px, 0.04em when uppercase): Eyebrows, table heads, and compact metadata labels.

### Named Rules
**The No Display Labels Rule.** Buttons, filters, chips, and data labels use product-scale type. Do not use display styling inside compact controls.

**The Zero Letter-Spacing Rule.** Body, title, and headline text use normal letter spacing. Only uppercase utility labels may use positive tracking.

## 4. Elevation

Project Hub uses a hybrid of tonal layering, borders, and low shadows. Surfaces are mostly flat at rest. Shadow is used to separate cards from the canvas, popovers from content, and hover states from static rows.

### Shadow Vocabulary
- **Surface Low** (`shadow-sm` plus `ring-1 ring-slate-950/[0.03]`): Default cards, search panels, and tables.
- **Surface Hover** (`shadow-md`): Hovered project cards only.
- **Overlay** (`shadow-lg` or `shadow-xl`): Popovers, sidebars, and drawers.
- **Detail Lift** (`0 1px 2px oklch(25% 0.04 260 / 0.08)`): OKLCH-native detail cards where the surrounding surface also uses OKLCH values.

### Named Rules
**The Flat-By-Default Rule.** Do not stack heavy shadows on ordinary cards. Use border, ring, and background tone first.

## 5. Components

### Buttons
- **Shape:** 8px radius, with 40-44px minimum height depending on density.
- **Primary:** Deep Console Slate background, Panel White text, 14px semibold label, 12-16px horizontal padding.
- **Hover / Focus:** Hover darkens or lightens within the same hue family. Focus uses a visible 2px blue-slate ring with offset on light surfaces.
- **Secondary / Ghost:** White or transparent background, subtle slate border or no border, slate text, and a light slate hover fill.
- **Destructive:** Red text and red-tinted hover only. Destructive actions should not visually dominate the default path.

### Chips
- **Style:** Rounded pill or 6px chip, small semibold label, subtle ring, and a tinted background.
- **State:** Selected/filter chips may use blue tint. Tech tags should stay muted unless they convey risk or status.

### Cards / Containers
- **Corner Style:** 8px by default; 12px only for major grouped panels.
- **Background:** Panel White for content. Muted Panel for table heads, skeletons, and low-emphasis strips.
- **Shadow Strategy:** Surface Low at rest. Surface Hover only for clickable cards.
- **Border:** Subtle Border is the default edge. Avoid colored side stripes.
- **Internal Padding:** 16px for standard cards, 20-24px for page headers or high-density overview panels.

### Inputs / Fields
- **Style:** White background, subtle slate border, 8px radius, 40-44px minimum height, 12px horizontal padding.
- **Focus:** Border shifts to Operational Blue with a low-opacity blue focus ring.
- **Error / Disabled:** Error uses red border and red text. Disabled uses reduced opacity and a non-interactive cursor.

### Navigation
- **Style:** Dark sidebar with muted slate links and white active text. Navigation should stay calm and compact.
- **States:** Hover uses subtle slate fill or text brightening. Active routes use a filled slate background.
- **Mobile Treatment:** Sidebar is hidden behind a fixed 44px toggle; main content must reserve enough top/left space so the toggle does not obscure headings.

### Data Tables
- **Style:** White container, subtle border, muted header band, compact 12px uppercase headers, 14px body cells.
- **Behavior:** Tables may scroll horizontally on small screens. Row hover should be subtle and not change row height.
- **Selection:** Selected row uses a low blue tint and inset ring.

## 6. Do's and Don'ts

### Do:
- **Do** keep the current quest, dependency health, or maintenance summary visible above detailed lists.
- **Do** use concrete local truth: paths, commands, report timestamps, git hashes, and warnings.
- **Do** keep meaningful information above the fold through density and clear hierarchy.
- **Do** make actions explicit with recognizable labels such as "Run report", "Copy path", and "Open in VS Code".
- **Do** use OKLCH values for new hand-authored color values.
- **Do** preserve keyboard-visible focus states on every interactive element.

### Don't:
- **Don't** use flashy AI-dashboard styling.
- **Don't** use decorative marketing-page drama.
- **Don't** introduce oversized hero layouts.
- **Don't** write vague productivity copy.
- **Don't** bury local developer actions behind ornamental UI.
- **Don't** turn practical maintenance data into long, page-dominating lists when summaries and drill-downs work better.
- **Don't** use gradient text, glassmorphism, side-stripe accents, or repeated icon-card grids as default patterns.
- **Don't** use pure `#000` or `#fff` in new custom CSS. Use tinted neutrals or Tailwind's existing slate/white utilities where already established.
