# OctoRaidCost

OctoRaidCost estimates the gold value of consumables used by each player in an OctoWoW raid. Collect prices in game, load a Chronicle raid in the analyzer, and review the quantities, costs and individual player reports.

The amounts represent estimated replacement costs, not what players actually paid. The addon and analyzer interface are in English.

## Requirements

- An English OctoWoW client.
- **Nampower enabled in the game client.** Installing its settings addon alone is not enough.
- A current Chrome, Edge or Firefox browser. The analyzer runs online without Python or other installations.
- An internet connection to load a raid published on OctoWoW Chronicle.
- **Aux is optional**, for importing its cached market prices.

## Install

1. Download `OctoRaidCost.zip` from the [latest release](https://github.com/thetimel3ss/OctoRaidCost/releases/latest).
2. Extract the `OctoRaidCost` folder into your game's `Interface/AddOns/` directory.
3. Enable OctoRaidCost in the character selection addon list.
4. Restart the game after installing or updating.
5. In game, type `/orc` to open the window.

You do not need to edit any addon files to use it.

## 1. Collect prices

1. Open an Auction House and type `/orc`.
2. Click **Scan**. The button changes to **Stop** while the scan runs.
3. Keep the Auction House open and avoid other auction searches until it finishes.
4. Wait for **Complete**. Prices are exported automatically.

The window opens with instructions and the last scan time. Progress and quotation results appear when you start a new scan.

- **Complete** means all catalog searches finished. Some items can still be unavailable.
- **Unavailable** means no usable buyout quotation was found for an item.
- **Incomplete** means the scan stopped before finishing. Collected prices are retained, along with the previous complete scan when available.

To export again without scanning, click **Export TXT**. No `/reload` is needed for export.

Your price file is saved here:

```text
<WoW>/CustomData/OctoRaidCost_<realm>.txt
```

Each export replaces the file for that realm. Characters on the same realm share this filename. Chronicle logs are separate files and are not changed by OctoRaidCost.

### Optional: use Aux prices

Click **Import Aux** to capture prices already stored by Aux. This also exports the TXT. It does not load a TXT file or perform a new AH scan; refresh prices in Aux first if necessary.

## 2. Open the analyzer

Open **[OctoRaidCost Online](https://thetimel3ss.github.io/OctoRaidCost/)** in your browser. There is no server to start and no Python installation is required.

## 3. Load the raid and prices

1. Paste the raid's OctoWoW Chronicle instance URL and click **Load raid**.
2. Under **Price TXT from CustomData**, select `OctoRaidCost_<realm>.txt` from your game's `CustomData` folder.
3. Check the realm, scan status, quotation coverage and price age before reviewing spending.

You select the file yourself; the page cannot automatically search your game folder. Prices are read on your device and are not uploaded to GitHub or Chronicle. Only the raid download contacts Chronicle.

Import only the OctoRaidCost price TXT. Chronicle combat logs and SavedVariables Lua files are not price imports.

## 4. Review the results

The default spending total includes direct item evidence and eligible estimates. Repeated identified uses accumulate quantity and cost.

| Label | Meaning and action |
| --- | --- |
| **Direct item evidence** | The log directly identifies the item and a timestamped use. |
| **Effect-derived** | A recorded effect identifies an eligible estimated use. Its cost is shown separately from direct evidence. |
| **Needs review** | The item or a new use cannot be established automatically. Inspect the evidence before choosing an item and quantity, or excluding it. |
| **Unknown / missing quotation** | The quantity is retained, but its cost is excluded from monetary totals until a price is available. |
| **Outside catalog** | The log identifies an item that the addon does not search. You can enter its price manually. |
| **Usage only** | The action is counted separately from spending, such as soulstones, Innervate and rogue poison applications. |

Use **Pending decisions** to review unresolved evidence or fill missing quotations. An identified item without a price does not need another identity decision.

The log can omit uses or record effects shared by several items. An already-active buff does not automatically count as a new consumption, so the report may not account for every item used.

### Prices

Choose **Minimum buyout**, **Scan median**, or **Aux historical** when available. NPC and supported ingredient valuations are applied automatically to the corresponding items.

- Enter a **manual price** in gold per whole item to override the automatic quotation. Clear the field to restore automatic pricing.
- Check **Charges** for items with multiple applications.
- Expand **Price calculation** to see the source, ingredient quantities, output quantity and cost per application.
- Use the price-editor filters to find missing prices, items outside the catalog or quotations older than seven days.
- Refresh old market prices with a new scan. Age warnings do not remove the existing quotations.

Unknown prices are not treated as free items. Some items have an explicit zero valuation; this is shown in their price source.

### Filters

Filter by player, category, encounter, bosses/trash, kills/wipes or time range. Use **Full raid / include pre-pull** to restore the full period while keeping the selected player.

Time values are minutes relative to the first encounter. A start of `0` excludes uses recorded before that encounter; leave the time fields empty to include recorded pre-pull uses.

## Reports, PDFs and backups

- **Player reports** lists only the selected player's recorded consumables.
- **Download TXT — this player** or **Download TXT — all players** saves quantities, costs, price sources and usage-only actions as readable text.
- **Save PDF — this player** or **Save PDF — all players** opens the browser print dialog. Choose **Save as PDF**. Select detailed pages or compact cards; printing follows the active filters.
- **Export CSV** saves the eligible consumable rows under the current filters.
- **Download share summary** saves a readable text summary.
- **Save report** keeps a snapshot with its prices and review decisions. You can reopen it or compare reports from the same realm.
- **Download JSON** creates a portable report backup. **Restore JSON** opens that backup later.

Browser history is local to the browser and analyzer address. To move reports from the previous local analyzer, use **Download JSON** there and **Restore JSON** on the online page. Download backups before clearing browser data or changing browsers. Older saved reports retain their original analysis; reload the Chronicle raid to use updated analysis rules.

## Commands

| Command | Action |
| --- | --- |
| `/orc` | Open or close the window. |
| `/orc help` | Show the commands in game chat. |
| `/orc scan` | Start an AH scan. |
| `/orc stop` | Stop the current scan. |
| `/orc export` | Export the current prices to TXT. |
| `/orc aux` | Import Aux cached prices and export them. |
| `/orc status` | Show scan status in chat. |
| `/orc reset` | Clear saved addon data and known realm price TXT files, and restore the default window position. |

### Reset

Use `/orc reset` when you want to start over. It stops the scan, removes stored prices and window settings, and replaces the known realm TXT exports with headers containing no prices. The analyzer will request a new scan when you import a cleared file.

If reset reports a file-writing failure, fix the problem and run `/orc reset` again. Saved addon data is retained when clearing the TXT fails. Browser report history, manual prices and downloaded backups are separate and are not cleared by this command.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| **Nampower required** | Enable Nampower in the client and restart WoW. |
| Scan does not start | Open the Auction House and check that Nampower is available. |
| Scan is incomplete | Keep the AH open, avoid other searches, and scan again. |
| TXT export fails | Check Nampower and write permissions for the game folder, then retry **Export TXT**. |
| Price TXT is not found | Click **Export TXT** in game, then select the realm file in `CustomData`. |
| TXT was cleared | Run a new scan or use **Import Aux**, then load the new TXT. |
| Raid does not load | Check the Chronicle URL and your connection. Use an updated browser and retry if Chronicle is temporarily unavailable. |
| Prices show **Unknown** | Check quotation coverage and ingredients; rescan or enter a manual price. |
| A player shows zero spending | Check active filters, the direct/estimated display setting and missing prices. |
| Window position needs restoring | `/orc reset` restores it, but also clears the addon's stored prices and TXT exports. |
