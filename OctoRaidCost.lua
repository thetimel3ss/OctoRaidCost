OctoRaidCost = {}
local frame = CreateFrame("Frame")
local scan, auctionOpen, waiting, elapsed, delay
local function say(text) OctoRaidCost.message = text; DEFAULT_CHAT_FRAME:AddMessage("|cff69ccf0OctoRaidCost:|r " .. text) end
function OctoRaidCost.HasNampower()
    return type(WriteCustomFile) == "function"
end
function OctoRaidCost.RequireNampower()
    if OctoRaidCost.HasNampower() then return true end
    OctoRaidCost.exportStatus = "Nampower is required. Enable it and restart WoW to export TXT prices."
    say(OctoRaidCost.exportStatus)
    if OctoRaidCost.RefreshUI then OctoRaidCost.RefreshUI() end
    return false
end
local function stop(reason)
    local wasScanning = scan ~= nil
    if scan then scan.status = reason; scan.finishedAt = time() end
    waiting = nil; scan = nil
    if OctoRaidCost.ExportPrices then OctoRaidCost.ExportPrices() end
    if OctoRaidCost.RefreshUI then OctoRaidCost.RefreshUI(wasScanning) end
end
local function query()
    if not scan or not auctionOpen then return end
    if CanSendAuctionQuery and not CanSendAuctionQuery() then delay = 1; return end
    local name = OctoRaidCostCatalog[scan.ids[scan.index]]
    OctoRaidCost.currentItem = name
    if OctoRaidCost.RefreshUI then OctoRaidCost.RefreshUI() end
    waiting = true; elapsed = 0; delay = nil
    QueryAuctionItems(name, nil, nil, 0, nil, nil, scan.page, false)
end
local function database()
    OctoRaidCostDB = OctoRaidCostDB or { realms = {} }
    OctoRaidCostDB.realms = OctoRaidCostDB.realms or {}
    return OctoRaidCostDB
end
function OctoRaidCost.GetScanMode()
    local db = database()
    return db.settings and db.settings.scanMode == "quick" and "quick" or "full"
end
function OctoRaidCost.SetScanMode(mode)
    if mode ~= "quick" and mode ~= "full" then return false end
    if scan then say("Stop the scan before changing modes."); return false end
    local db = database(); db.settings = db.settings or {}; db.settings.scanMode = mode
    if OctoRaidCost.RefreshUI then OctoRaidCost.RefreshUI() end
    return true
end
function OctoRaidCost.ScanIDs(mode)
    local ids = {}
    for id in pairs(OctoRaidCostCatalog) do
        local item = OctoRaidCostItems and OctoRaidCostItems[id] or {}
        if mode ~= "quick" or not item.ingredient or item.consumable then table.insert(ids, id) end
    end
    table.sort(ids)
    return ids
end
local function start()
    if not OctoRaidCost.RequireNampower() then return end
    if scan then say("A scan is already running."); return end
    if not auctionOpen then say("Open the auction house first."); return end
    local realm = GetRealmName()
    OctoRaidCostDB = OctoRaidCostDB or { realms = {} }
    OctoRaidCostDB.realms = OctoRaidCostDB.realms or {}
    local mode = OctoRaidCost.GetScanMode()
    local ids = OctoRaidCost.ScanIDs(mode)
    if table.getn(ids) == 0 then say("No items to search in the selected scan mode."); return end
    scan = { status = "incomplete", startedAt = time(), realm = realm, prices = {}, ids = ids, index = 1, page = 0, scanMode = mode }
    local previous = OctoRaidCostDB.realms[realm]
    if previous and previous.status == "complete" then
        OctoRaidCostDB.lastComplete = OctoRaidCostDB.lastComplete or {}
        OctoRaidCostDB.lastComplete[realm] = previous
    end
    OctoRaidCostDB.realms[realm] = scan
    if OctoRaidCost.RefreshUI then OctoRaidCost.RefreshUI(true) end
    say((mode == "quick" and "Quick scan: " or "Full scan: ") .. "scanning " .. table.getn(scan.ids) .. " items. Keep the AH open and do not browse auctions.")
    query()
end
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("AUCTION_HOUSE_SHOW")
frame:RegisterEvent("AUCTION_HOUSE_CLOSED")
frame:RegisterEvent("AUCTION_ITEM_LIST_UPDATE")
frame:SetScript("OnEvent", function()
    if event == "PLAYER_LOGIN" then OctoRaidCost.RequireNampower()
    elseif event == "AUCTION_HOUSE_SHOW" then auctionOpen = true
    elseif event == "AUCTION_HOUSE_CLOSED" then
        auctionOpen = nil
        if scan then stop("incomplete"); say("Scan interrupted. Previous item results were retained.") end
    elseif event == "AUCTION_ITEM_LIST_UPDATE" and scan and waiting then
        waiting = nil
        local id = scan.ids[scan.index]
        local result = scan.prices[id] or { name = OctoRaidCostCatalog[id], copper = -1, listings = 0, samples = {} }
        local count, total = GetNumAuctionItems("list")
        for i = 1, count do
            local link = GetAuctionItemLink("list", i)
            local _, _, found = string.find(link or "", "item:(%d+)")
            local name, texture, stack, quality, usable, level, minBid, increment, buyout = GetAuctionItemInfo("list", i)
            if tonumber(found) == id and buyout and buyout > 0 and stack and stack > 0 then
                local unit = buyout / stack
                if result.copper < 0 or unit < result.copper then result.copper = unit end
                result.listings = result.listings + 1
                if table.getn(result.samples) < 1000 then table.insert(result.samples, unit) end
            end
        end
        result.scannedAt = time(); scan.prices[id] = result
        if (scan.page + 1) * 50 < total then scan.page = scan.page + 1
        else
            table.sort(result.samples)
            local size = table.getn(result.samples)
            if size > 0 then
                local mid = math.floor((size + 1) / 2)
                result.medianCopper = result.samples[mid]
                if math.floor(size / 2) * 2 == size then result.medianCopper = (result.samples[mid] + result.samples[mid + 1]) / 2 end
            end
            result.sampleCount = size; result.sampled = result.listings > size; result.samples = nil
            scan.index = scan.index + 1; scan.page = 0
        end
        if scan.index > table.getn(scan.ids) then
            stop("complete"); say("Scan complete. Prices are ready in the addon window.")
        else delay = 1 end
        if OctoRaidCost.RefreshUI then OctoRaidCost.RefreshUI() end
    end
end)
frame:SetScript("OnUpdate", function()
    if not scan then return end
    if waiting then
        elapsed = (elapsed or 0) + arg1
        if elapsed > 30 then stop("incomplete"); say("Scan timed out. Open the AH and try again.") end
    elseif delay then
        delay = delay - arg1
        if delay <= 0 and (not CanSendAuctionQuery or CanSendAuctionQuery()) then query() end
    end
end)
function OctoRaidCost.ImportAux()
    if not OctoRaidCost.RequireNampower() then return end
    if scan then say("Stop the AH scan before importing Aux prices."); return end
    if not aux or type(require) ~= "function" then say("Aux is not available. Enable aux-addon first."); return end
    local ok, history = pcall(require, "aux.core.history")
    if not ok or type(history) ~= "table" or type(history.value) ~= "function" then
        say("This Aux build does not expose the supported history API."); return
    end
    local mode = OctoRaidCost.GetScanMode()
    local snapshot = { realm = GetRealmName(), source = "Aux", status = "snapshot", startedAt = time(), prices = {}, scanMode = mode }
    local count = 0
    for _, id in ipairs(OctoRaidCost.ScanIDs(mode)) do
        local name = OctoRaidCostCatalog[id]
        local key = id .. ":0"
        local success, historical = pcall(history.value, key)
        local marketOK, minimum
        if type(history.market_value) == "function" then marketOK, minimum = pcall(history.market_value, key) end
        if (success and type(historical) == "number" and historical >= 0) or (marketOK and type(minimum) == "number" and minimum >= 0) then
            local entry = { name = name, source = "Aux", capturedAt = time() }
            if success and type(historical) == "number" and historical >= 0 then entry.historicalCopper = historical end
            if marketOK and type(minimum) == "number" and minimum >= 0 then entry.copper = minimum end
            snapshot.prices[id] = entry; count = count + 1
        end
    end
    if count == 0 then say("Aux has no supported prices for this catalog. Search the AH with Aux first."); return end
    local db = database(); db.auxPrices = db.auxPrices or {}; db.auxPrices[GetRealmName()] = snapshot
    if OctoRaidCost.ExportPrices then OctoRaidCost.ExportPrices() end
    say("Captured Aux prices for " .. count .. " items.")
    if OctoRaidCost.RefreshUI then OctoRaidCost.RefreshUI() end
end
function OctoRaidCost.Progress()
    local db = database()
    local current = scan or db.realms[GetRealmName()]
    local quoted, missing, names = 0, 0, {}
    if current then
        for id, value in pairs(current.prices) do
            if value.copper and value.copper >= 0 then quoted = quoted + 1
            else missing = missing + 1; table.insert(names, value.name or tostring(id)) end
        end
    end
    local total = current and table.getn(current.ids or {}) or 0
    local done = current and math.min(total, math.max(0, (current.index or 1) - 1)) or 0
    if current and current.status == "complete" then done = total end
    table.sort(names)
    return {running = scan ~= nil, done = done, total = total, quoted = quoted, missing = missing,
        names = table.concat(names, ", "), state = scan and "Scanning" or current and current.status or "Ready",
        item = scan and (OctoRaidCost.currentItem or "") or "", page = scan and scan.page + 1 or 0,
        capturedAt = current and current.startedAt, realm = GetRealmName(), scanMode = current and current.scanMode or OctoRaidCost.GetScanMode()}
end
function OctoRaidCost.Status()
    local p = OctoRaidCost.Progress()
    return p.realm .. " | " .. (p.scanMode == "quick" and "Quick scan" or "Full scan") .. " | " .. p.state .. " | " .. p.done .. "/" .. p.total ..
        " items | " .. p.quoted .. " quoted | " .. p.missing .. " unavailable", p.names
end
function OctoRaidCost.Reset()
    if not OctoRaidCost.RequireNampower() then return end
    if scan then scan.status = "incomplete"; scan.finishedAt = time() end
    scan = nil; waiting = nil; delay = nil; elapsed = 0
    local ok, filename = OctoRaidCost.ClearPriceFiles()
    if not ok then
        OctoRaidCost.exportStatus = "Reset incomplete: failed to clear " .. filename .. ". Saved data retained; fix file writing and retry /orc reset."
        say(OctoRaidCost.exportStatus)
        if OctoRaidCost.RefreshUI then OctoRaidCost.RefreshUI() end
        return
    end
    OctoRaidCostDB = {realms={}}
    OctoRaidCost.currentItem = nil; OctoRaidCost.exportFile = nil
    OctoRaidCost.exportStatus = "Price TXT cleared. Run a new scan to collect prices."
    if OctoRaidCost.ResetUI then OctoRaidCost.ResetUI() end
    say("Reset complete: saved data cleared, window position restored, and known realm TXT prices cleared.")
    if OctoRaidCost.RefreshUI then OctoRaidCost.RefreshUI() end
end
function OctoRaidCost.Help()
    say("Commands:")
    say("/orc - Show or hide the addon window.")
    say("/orc scan - Start an AH scan using the selected mode.")
    say("/orc scan quick - Search ready consumables only.")
    say("/orc scan full - Search consumables and ingredients.")
    say("/orc stop - Stop the scan and retain incomplete prices.")
    say("/orc export - Export current prices to TXT.")
    say("/orc aux - Import supported Aux cached prices.")
    say("/orc status - Show scan status.")
    say("/orc reset - Clear saved data and price TXT files; reset window position.")
    say("/orc help - Show this command list.")
end
SLASH_OCTORAIDCOST1 = "/orc"
SlashCmdList.OCTORAIDCOST = function(msg)
    if msg == "help" then OctoRaidCost.Help()
    elseif msg == "reset" then OctoRaidCost.Reset()
    elseif msg == "scan" then start()
    elseif msg == "scan quick" then if OctoRaidCost.SetScanMode("quick") then start() end
    elseif msg == "scan full" then if OctoRaidCost.SetScanMode("full") then start() end
    elseif msg == "aux" then OctoRaidCost.ImportAux()
    elseif msg == "export" then
        if OctoRaidCost.ExportPrices then OctoRaidCost.ExportPrices(); say(OctoRaidCost.exportStatus) end
    elseif msg == "stop" then stop("incomplete"); say("Scan stopped.")
    elseif msg == "status" then local text = OctoRaidCost.Status(); say(text)
    elseif msg == "" and OctoRaidCost.ToggleUI then OctoRaidCost.ToggleUI()
    else OctoRaidCost.Help() end
end
