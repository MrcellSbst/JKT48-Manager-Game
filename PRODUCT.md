# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React with Vite. Browser save data persists in IndexedDB; optional accounts add encrypted D1 cloud checkpoints.

## Users

JKT48 fans and management-simulation players building an alternate multi-year history for the group through repeated weekly decisions.

## Product Purpose

JKT48 Manager is a roguelike idol-management simulation. Players schedule members, manage energy and finances, develop talent, produce fan activities and releases, and respond to long-term roster turnover. Success means creating a distinct, readable history rather than reproducing real careers.

## Positioning

Real active-member identity anchors each run while seeded fictional stats, development, outcomes, and procedural events make every timeline different.

## Operating Context

Play happens in weekly turns across a seven-day calendar. Players repeatedly compare roster condition, schedule activities, queue standalone training, resolve the week, and review operational and fan outcomes across multiple in-game years.

## Capabilities and Constraints

- Current active members come from `src/data/newmemberdata.js`.
- Member portraits come from `src/Asset/member_active/`.
- Real names and images provide identity only. Skills, potential, ego, chemistry, performance, and story outcomes are fictional per-run values.
- One game year contains 48 weekly turns: twelve four-week months.
- Schedule owns fixed daily work and campaigns. Training owns ordered per-member development queues of up to seven sessions, which resolve onto the earliest otherwise-free days.
- Energy is capped at 100 and recovers by 40 at the start of a new week.
- Guest saves remain local to browser IndexedDB. Signed-in saves retain IndexedDB as the local source and add monthly, manual, and logout cloud checkpoints.
- Features are implemented in modular stages following `plan.md`, with balance values stored outside UI components.

## Brand Commitments

The product name is JKT48 Manager. The interface must respect JKT48 identity while clearly framing game statistics and events as alternate-timeline simulation data.

## Evidence on Hand

- Product and simulation specification: `plan.md`
- Member identity data: `src/data/newmemberdata.js`
- Active-member portraits: `src/Asset/member_active/`
- No testimonials, performance claims, or external brand assets are provided.

## Product Principles

- Members provide identity; simulation creates story.
- Strong management creates better choices, not guaranteed outcomes.
- Calendar space, money, energy, and fan expectations impose real opportunity cost.
- Sorting by one overall rating must not solve lineup decisions.
- Every meaningful result should leave readable history.

## Accessibility & Inclusion

Keyboard-operable controls, visible focus, sufficient contrast, reduced-motion support, and layouts usable on desktop and mobile web.
