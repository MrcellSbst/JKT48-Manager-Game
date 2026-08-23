# Design System

## Direction

JKT48 Manager uses the visual grammar of a professional squad operations room: roster availability, weekly fixtures, selection pressure, performance reports, and season history. It is an operational game surface, not a marketing page.

## Palette

- Canvas: `#f3f3f1`
- Paper: `#ffffff`
- Ink: `#181817`
- Muted ink: `#6b6965`
- Rule: `#d9d8d4`
- JKT48 red: `#d71920`
- Selection red: `#b50f15`
- Success: `#17824f`
- Warning: `#c47a08`
- Critical: `#b42318`
- Information: `#2166c2`

## Typography

Use `Barlow Condensed` for score-like headings and numeric displays, with `Barlow` for UI copy. Labels remain compact and readable; letter spacing is always zero.

## Composition

Persistent left navigation on desktop, compact top navigation on mobile. A narrow match-week header owns time and primary action. Main content uses full-width bands and data tables, with cards reserved for roster members, save slots, events, and result summaries.

The Training page uses a persistent member rail beside a selected-member workspace. Skill and intensity actions feed an ordered queue; capacity, projected Energy, template controls, and resolved history remain visible as operational data rather than calendar assignments.

## Components

- Buttons use icons from Lucide and direct action labels.
- Status is communicated through text plus color.
- Member portraits are functional identity anchors, cropped consistently.
- Metrics use fixed-height score blocks to prevent layout shift.
- Cards use 6px radius and either a border or shadow, never both.

## Motion

Short 160-220ms transitions for selection and navigation. Week resolution uses restrained count and progress changes. Reduced-motion preference disables nonessential transitions.

## Responsive Rules

Desktop prioritizes scanning across roster and calendar. Mobile shifts to a selected-member scheduling flow, keeps the week action sticky, and never compresses controls below touch-safe dimensions.

