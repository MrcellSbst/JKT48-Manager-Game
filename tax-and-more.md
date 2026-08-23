# Concert, Campaign Voting, Theater Upgrade, and Annual Tax

## Summary

- Raise all concert venue costs by 50%.
- Generate SSK/RH weekly votes from 7–15% of current fanbase.
- Add mandatory year-end tax settlement, followed by optional Keep/Renovate/Change Theater decision.
- Preserve existing campaigns and theater mechanics unless explicitly changed below.

## Economy and Campaign Changes

- Set static concert venues to:
  - Concert Hall: $90M.
  - City Arena: $180M.
  - National Stadium: $405M.
- Increase generated venue costs by changing the per-seat range from $24K–38K to $36K–57K, still rounded to $5M.
- Use these prices for regular, anniversary, SSK, RH, and Janken reward concerts.
- Apply venue perk B008 after the increased base cost.
- Upgrade saved unbooked venue offers once; never retroactively charge already-announced concerts.

- During every active SSK/RH voting week:
  - Roll an integer from 7–15%.
  - Generate exactly `round(current fanbase × rolled percentage)` votes.
  - SSK distributes the total proportionally using existing popularity, performance, Oshi Sentiment, personal fanbase, and random weighting.
  - RH distributes the total through an efficient seeded uniform-random song allocation equivalent to the current ballot behavior.
  - Voting revenue remains `generated votes × current per-vote revenue`.
  - Record the weekly percentage, fanbase snapshot, votes, and revenue.
- Janken remains luck-only with zero votes.

## Year-End Settlement and Theater Changes

- Resolving Week 48 creates the annual report and a persistent `pendingYearEndSettlement`.
- Block another Resolve Week and new-year gameplay until settlement completes.
- Show the normal weekly report first, then a non-dismissible year-end settlement:
  1. Review and pay tax.
  2. Choose Keep Current Theater, Renovate Theater, or Change Theater.
  3. Start the new year.
- Tax is collected before facility spending.
- Keep Current Theater is always available. Unaffordable renovation/change choices are disabled.

- Change Theater always generates exactly three offers relative to current gross market value:
  - Expanded: 1.35× price and 1.20× seats.
  - Metropolitan: 1.70× price and 1.45× seats.
  - Grand: 2.10× price and 1.75× seats.
- Round gross prices to $5M and capacity to 10 seats.
- Recalculate weekly upkeep with the existing price/capacity formula, then apply B002.
- Calculate payment as:
  - `discounted new gross price using B001 − 50% current market value`.
- Moving theaters:
  - Preserves current ticket price.
  - Resets renovation level to zero.
  - Archives previous renovation history.
  - Stores old/new theater, resale credit, gross price, perk discount, net payment, capacity, and upkeep.
- Renovation continues using B003 and the theater’s gross market value.
- “Higher occupancy” means higher seat capacity; theater demand and attendance-rate formulas remain unchanged.

## Tax and State Interfaces

- Add versioned economy state containing:
  - `taxTrackingStartYear`.
  - `pendingYearEndSettlement`.
  - `taxHistory`/`yearEndSettlements`.
  - `ledger.debt.tax`.
  - Theater `marketValue` and `acquisitionCost`.
  - `theaterChanges`.
- Add shared engine operations for annual tax calculation, tax settlement, theater-change offers, theater replacement, and settlement completion.
- Make `resolveWeek` idempotently refuse execution while settlement is pending.

- Taxable profit is `max(0, operating income − deductible operating expenses)`.
- Include theater, media, livestream, fan-event, concert, campaign-voting, opportunity, and other operating income.
- Deduct activity costs, refunds, operations, upkeep, salaries, operating-debt payments, and prior-year tax-debt payments.
- Exclude loan proceeds/repayments, theater purchases/sales, renovations, and the current tax payment itself.
- Record immediate purchases and income in the financial-event ledger so out-of-week transactions are included without duplicating weekly reports.

- Apply one rate to the entire taxable profit:
  - Normal: 5% through $500M, 10% through $1.5B, 15% through $3B, then 20%.
  - Hard: 10%, 15%, 20%, then 25% at the same boundaries.
- Losses and zero profit produce zero tax; losses do not carry forward.
- Pay as much tax as available cash permits. Put the remainder into tax debt and allow rollover.
- Tax debt has no interest and can be manually paid from the Finance panel in either difficulty.
- Show outstanding tax debt in Command Center warnings.
- Existing saves receive an idempotent migration:
  - Infer theater gross market value from the stored purchase price and B001.
  - Upgrade unbooked venue offers once.
  - Exempt the current partial year; taxation begins with the next full year.
  - Preserve booked concert costs and historical campaign votes.

## UI, Wiki, and Tests

- Localize all settlement, tax, debt, theater comparison, campaign-vote, history, and notification text in English and Indonesian.
- Support both themes, keyboard navigation, focus trapping, mobile layouts, and reload recovery while settlement is pending.
- Update Wiki with concert prices, vote generation/revenue, theater resale and upgrade formulas, tax brackets, taxable-profit rules, and tax debt.

- Test:
  - Every concert path and one-time venue migration.
  - Exact SSK/RH vote totals, seeded distribution, revenue, and unchanged Janken behavior.
  - All tax boundaries, both difficulties, losses, exclusions, prior-tax deductions, shortages, debt repayment, and legacy exemption.
  - Week 48 settlement ordering, reload safety, duplicate-action prevention, and blocked rollover.
  - Keep, renovate, and all three theater changes, including perks, resale, capacity, upkeep, ticket preservation, and renovation reset.
  - Full automated tests, localization audit, and production build.
