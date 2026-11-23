# Changelog

## 0.6.0 — 2026-11-23

- Removed Conjured Crystal Water from AH searches and marked it as a free conjured item.
- Added Ez-Thro Dynamite and Ez-Thro Dynamite II, all six Survival healing salves and Solid Weightstone to AH searches.
- Added a visible Chronicle attribution link.
- Redesigned the analyzer with Overview, Players, Prices, Evidence and History navigation, spending cards, rankings and category breakdowns.
- Added missing potions, elixirs, Merlot and all six standard scroll families at ranks I–IV to AH searches.
- Added Enriched Manna Biscuit at its base vendor price of 12 silver per biscuit (five for 60 silver).
- Included Simple Slingshot in AH searches while keeping tool activations outside consumable spending.
- Tracked Mana Ruby and Simple Slingshot activations separately from purchased consumables.
- Removed Stratholme Holy Water from AH searches and assigned a zero loot valuation while retaining usage counts.

## 0.5.0 — 2026-11-23

- Published a browser-only analyzer with direct Chronicle downloads, gzip/protobuf decoding and classification in a Web Worker.
- Read the shared Lua catalogs directly in the browser, removing Python from the user workflow.
- Replaced automatic local TXT discovery with manual price-file selection.
- Added individual and all-player TXT reports alongside PDFs, CSV and full JSON backups.
- Added automatic GitHub Pages deployment and installation ZIP packaging for versioned releases.

## 0.4.0 — 2026-11-21

- Added separate outside-catalog diagnostics and price-editor filters, retaining quantities and manual quotations.
- Added expandable price calculations with ingredient quantities, output yield, applications and quotation sources.
- Highlighted quotations older than seven days, including the oldest priced ingredient in recipe estimates.
- Added `/orc reset` to cancel scanning, clear known realm TXT prices to header-only exports, remove saved addon data and restore the default window position.
- Recognized cleared exports in the analyzer without restoring older scan prices.
- Opened the collector with last-scan information and instructions, showing quotation results only after a new scan and preserving live progress when reopened during scanning.
- Required Nampower's file-writing API for scanning and Aux imports, with a startup warning and disabled collector actions when unavailable.
- Restricted price imports to the TXT export, removing the SavedVariables Lua fallback and clarifying export failures.
- Persisted the in-game window position in SavedVariables while retaining internal price snapshots.
- Removed the redundant /orc toggle command while preserving the Scan/Stop button through the explicit scan and stop actions.
- Added ingredient recipes for `R.O.I.D.S.`, `Ground Scorpok Assay`, `Cerebral Cortex Compound` and `Gizzard Gum`, including the missing BoP Gizzard Gum catalog entry.
- Added all seven Juju recipes and the nine missing tradeable materials; excluded the quest consumables from AH/Aux searches.
- Ignored old AH/Aux quotations for non-auctionable items while preserving manual price overrides.
- Replaced the three-identical-coin Zanza approximation with one Honor Token valued through the cheapest fully quoted valid coin-set or bijou route.
- Added missing coins, bijous and the non-auctionable token to the shared catalog, and displayed the selected ingredient route in quotation sources.
- Added alternative-recipe support while preserving manual overrides, realm checks and saved-report snapshots.
- Corrected `Small Dream Shard` valuation to `Nordanaar Herbal Tea` (61675), added its catalog entry and excluded it from AH searches.
- Removed the ingredient recipe from `Tea with Sugar` (15723) and assigned a zero quest-reward valuation while preserving uses and manual overrides.
- Excluded the ten BoP recipe consumables from AH/Aux searches while retaining ingredient searches and recipe valuation.
- Excluded 15 BoP items from AH/Aux searches and added unit-normalized NPC base prices for 14 items, with manual overrides and explicit quotation sources.
- Valued Demonic Rune at zero temporarily while retaining recorded uses, without using the unconfirmed vendor quotation.
- Moved supplemental Chronicle item names to ItemNames.lua, removing the remaining runtime JSON data file.
- Made Catalog.lua and Recipes.lua the shared item/recipe sources, removing runtime JSON duplicates and the catalog generation step.
- Added restricted Lua data reading to the analyzer without executing Lua or requiring a Lua interpreter.
- Added `/orc help` to display all supported commands in game chat.
- Removed unused provenance annotations from the runtime catalog and ingredient recipes.
- Separate evidence-decision and missing-quotation queues, with a dedicated missing-price editor filter; retain identified quantities while excluding unknown costs.
- Limit Needs review to ambiguous identities, already-active effects, and effect-derived groups without an eligible use; keep accepted estimates and completed manual decisions in their dedicated views.

## 0.3.4 — 2026-11-21

- Default the spending chart to direct plus eligible effect-derived estimates, with a one-time migration of older direct-only defaults.
- Show the selected total and quotation coverage explicitly so effect-derived-only players do not appear to have no spending because of a hidden display mode.
- Select the current AH scan when importing a TXT instead of restoring a stale Aux selection.
- Disable price policies absent from the selected snapshot and choose an available policy when switching sources.

## 0.3.3 — 2026-11-21

- Fixed counting of repeated eligible kind-9 outside-combat consumable uses.
- Stopped promoting effect-derived groups to direct evidence merely because an active-at-pull snapshot supplied an item ID.
- Added human-readable evidence origins, separate item/spell names and IDs, and a supplemental candidate-name registry.
- Made time/encounter filters explicit and added a full-raid/pre-pull reset control.
- Added identified-use totals and improved detailed and compact PDF layouts.

## 0.3.2 — 2026-11-21

- Added readable realm/date/time metadata and optimized per-realm TXT snapshots without internal search lists, repeated item names or temporary samples.
- Kept class/conjured items and rogue poison applications in usage-only tracking, outside spending; similarly classified Innervate and collection actions.
- Replaced the dense player/item matrix with individual player reports showing only that player's recorded items.
- Added print-to-PDF controls for one or all players, with a new page for each player.
- Removed project references from the analyzer footer while retaining repository attribution.
- Open the browser through one operating-system handler and avoid reopening it when the analyzer server is already running.
- Show Complete in green, Incomplete in red, and unavailable quotations in orange in the collector panel.
- Simplified price export filenames to `OctoRaidCost_<realm>.txt`, shared by characters on that realm.

## 0.3.1 — 2026-11-19

- Reduced the in-game panel to 380×284 and raised it above auction windows.
- Unified Scan/Stop and added a live completed-item progress bar.
- Moved current-item progress into the panel and removed per-item chat messages.
- Added automatic/manual JSON-in-TXT price exports to Nampower's CustomData folder, beside separate Chronicle logs.
- Added Load latest TXT with realm matching and optional manual TXT selection.
- Retained SavedVariables fallback when the client cannot write TXT files.

## 0.3.0 — 2026-11-19

- Added a per-use evidence ledger, cast-derived estimates and exact-time direct/effect correlation.
- Kept observed spending separate from eligible estimates and manual review decisions.
- Added per-group candidate selection, quantity review, exclusion and reset with evidence details.
- Added encounter, boss/trash, kill/wipe, category and minute-range filters.
- Added category totals, saved-report comparisons, per-player history and shareable text exports.
- Added minimum/median scan pricing, cached Aux import and ten ingredient valuation recipes.
- Added quote coverage, price age and per-source explanations.
- Expanded the catalog to 262 AH searches and two nonmarket items.
- Added an in-game progress/status panel and Windows/Linux browser launchers.
- Moved full report storage to IndexedDB to avoid localStorage quota failures; preserved portable JSON backups and legacy report reading.

## 0.2.1 — 2026-11-17

- Separated generic food/drink evidence with a dedicated review filter.
- Identified compatible single-candidate effects without adding them to confirmed spending.
- Preserved multiple/conflicting candidates and already-active effects for review.

## 0.2.0 — 2026-11-17

- Expanded the AH catalog from 48 to 250 entries, with a shared JSON source and Lua generator.
- Added known oil charge counts and cost per application.
- Preserved the previous completed scan when starting a new scan.
- Excluded scan prices belonging to another realm.
- Persisted manual prices by realm and added saved reports with fixed price snapshots.
- Added JSON report backup/restore and evidence search.

## 0.1.0

- Added the AH scanner, Chronicle evidence importer, charts, player/item matrix, manual price editor and CSV export.
