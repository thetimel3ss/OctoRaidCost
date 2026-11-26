-- Compact collector, kept above auction windows even when they are focused.
local panel, status, current, unavailable, exportText, auxButton, exportButton, progress, progressText, notice, timer, smartButton, fullButton
local showResults, openingMessage = false, nil
local tooltipUpdates, tooltipScanState = {}, nil
local function tooltip(b, title, description)
    local update = function()
        GameTooltip:SetOwner(b,"ANCHOR_RIGHT")
        GameTooltip:SetText(type(title) == "function" and title() or title,1,0.82,0)
        GameTooltip:AddLine(type(description) == "function" and description() or description,1,1,1,1)
        GameTooltip:Show()
    end
    tooltipUpdates[b] = update
    b:SetScript("OnEnter",update)
    b:SetScript("OnLeave",function() GameTooltip:Hide() end)
end
local function button(parent, text, x, command)
    local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
    b:SetWidth(166); b:SetHeight(24); b:SetPoint("TOPLEFT", parent, "TOPLEFT", x, -72)
    b:SetText(text); b:SetScript("OnClick", function() SlashCmdList.OCTORAIDCOST(command); OctoRaidCost.RefreshUI() end)
    return b
end
function OctoRaidCost.RefreshUI(scanActivity)
    if not panel then return end
    local p = OctoRaidCost.Progress()
    if scanActivity or p.running then showResults = true end
    local mode = p.running and p.scanMode or OctoRaidCost.GetScanMode()
    local ready = OctoRaidCost.HasNampower()
    smartButton:SetText(p.running and mode == "smart" and "Stop" or "Smart scan")
    fullButton:SetText(p.running and mode == "full" and "Stop" or "Full scan")
    if p.running then
        if mode == "smart" then smartButton:Enable(); fullButton:Disable()
        else smartButton:Disable(); fullButton:Enable() end
    elseif ready then smartButton:Enable(); fullButton:Enable()
    else smartButton:Disable(); fullButton:Disable() end
    if ready and not p.running then auxButton:Enable() else auxButton:Disable() end
    if ready then exportButton:Enable() else exportButton:Disable() end
    local tipState = (p.running and "running:" or "idle:") .. mode
    if tipState ~= tooltipScanState then
        tooltipScanState = tipState
        if GameTooltip and type(GameTooltip.IsOwned) == "function" then
            for b, update in pairs(tooltipUpdates) do if GameTooltip:IsOwned(b) then update() end end
        end
    end
    if showResults then
        local staged = p.scanMode == "smart"
        local done, total = staged and p.phaseDone or p.done, staged and p.phaseTotal or p.total
        progress:SetMinMaxValues(0, math.max(1,total)); progress:SetValue(done)
        local label = staged and (p.scanPhase == "ingredients" and "Ingredients" or "Consumables") or "Full"
        progressText:SetText(label .. ": " .. done .. " / " .. total .. " items scanned")
        local state = p.state
        if state == "complete" then state = "|cff40e080Complete|r"
        elseif state == "incomplete" then state = "|cffff5050Incomplete|r" end
        if not ready then state = "|cffff5050Nampower required|r" end
        status:SetText(state .. " | " .. p.quoted .. " quoted | |cffffb347" .. p.missing .. " unavailable|r")
        current:SetText(p.running and (p.item .. " — page " .. p.page) or
            (p.capturedAt and ("Last scan: " .. date("%Y-%m-%d %H:%M", p.capturedAt)) or ""))
        unavailable:SetText(p.names ~= "" and ("|cffffb347Unavailable: " .. string.sub(p.names, 1, 155) .. "|r") or "")
    else
        progress:SetMinMaxValues(0, 1); progress:SetValue(0)
        progressText:SetText(mode == "smart" and "Ready to scan: automatic ingredient fallback" or "Ready to scan: items + ingredients")
        status:SetText(ready and "Ready" or "|cffff5050Nampower required|r")
        current:SetText(p.capturedAt and ("Last scan: " .. date("%Y-%m-%d %H:%M", p.capturedAt)) or "Last scan: No previous scan.")
        unavailable:SetText("Open the auction house and choose Smart scan or Full scan. Keep other searches idle.")
    end
    exportText:SetText(not ready and "Nampower is required. Enable it and restart WoW." or OctoRaidCost.exportStatus or "Prices export to CustomData beside Chronicle logs.")
    local message = (showResults or OctoRaidCost.message ~= openingMessage) and OctoRaidCost.message or nil
    notice:SetText(string.sub(message or "Import Aux uses cached Aux prices. Export TXT saves prices for the analyzer.", 1, 170))
end
function OctoRaidCost.ResetUI()
    showResults = false; openingMessage = nil
    if panel then
        panel:StopMovingOrSizing(); panel:ClearAllPoints()
        panel:SetPoint("CENTER", UIParent, "CENTER", 230, 40)
    end
end
function OctoRaidCost.ToggleUI()
    if panel then
        if panel:IsShown() then panel:Hide() else showResults = false; openingMessage = OctoRaidCost.message; panel:Show(); panel:Raise(); OctoRaidCost.RefreshUI() end
        return
    end
    showResults = false; openingMessage = OctoRaidCost.message
    panel = CreateFrame("Frame", "OctoRaidCostPanel", UIParent)
    panel:SetWidth(380); panel:SetHeight(284); panel:SetPoint("CENTER", UIParent, "CENTER", 230, 40)
    panel:SetFrameStrata("DIALOG"); panel:SetFrameLevel(100); panel:SetToplevel(true)
    panel:SetBackdrop({bgFile="Interface\\DialogFrame\\UI-DialogBox-Background",edgeFile="Interface\\DialogFrame\\UI-DialogBox-Border",tile=true,tileSize=32,edgeSize=32,insets={left=8,right=8,top=8,bottom=8}})
    panel:SetMovable(true); panel:EnableMouse(true); panel:RegisterForDrag("LeftButton")
    panel:SetScript("OnDragStart", function() panel:Raise(); panel:StartMoving() end)
    panel:SetScript("OnDragStop", function()
        panel:StopMovingOrSizing()
        local point, relativeTo, relativePoint, x, y = panel:GetPoint(1)
        OctoRaidCostDB = OctoRaidCostDB or {}
        OctoRaidCostDB.ui = OctoRaidCostDB.ui or {}
        OctoRaidCostDB.ui.position = { point = point, relativePoint = relativePoint, x = x, y = y }
    end)
    local position = OctoRaidCostDB and OctoRaidCostDB.ui and OctoRaidCostDB.ui.position
    local anchors = {TOPLEFT=true,TOP=true,TOPRIGHT=true,LEFT=true,CENTER=true,RIGHT=true,BOTTOMLEFT=true,BOTTOM=true,BOTTOMRIGHT=true}
    if type(position) == "table" and anchors[position.point] and anchors[position.relativePoint] and
        type(position.x) == "number" and type(position.y) == "number" then
        panel:ClearAllPoints()
        panel:SetPoint(position.point, UIParent, position.relativePoint, position.x, position.y)
    end
    panel:SetClampedToScreen(true)
    local title = panel:CreateFontString(nil,"OVERLAY","GameFontNormalLarge")
    title:SetPoint("TOPLEFT",panel,"TOPLEFT",20,-18);title:SetText("OctoRaidCost")
    local close = CreateFrame("Button",nil,panel,"UIPanelCloseButton"); close:SetPoint("TOPRIGHT",panel,"TOPRIGHT",-5,-5)
    auxButton = button(panel,"Import Aux",20,"aux"); exportButton = button(panel,"Export TXT",194,"export")
    local function modeButton(text, x, mode)
        local b = CreateFrame("Button",nil,panel,"UIPanelButtonTemplate")
        b:SetWidth(166); b:SetHeight(24); b:SetPoint("TOPLEFT",panel,"TOPLEFT",x,-43); b:SetText(text)
        b:SetScript("OnClick",function()
            local p = OctoRaidCost.Progress()
            if p.running then
                if p.scanMode == mode then SlashCmdList.OCTORAIDCOST("stop") end
            elseif OctoRaidCost.SetScanMode(mode) then
                showResults = false; SlashCmdList.OCTORAIDCOST("scan")
            end
            OctoRaidCost.RefreshUI()
        end)
        return b
    end
    smartButton = modeButton("Smart scan",20,"smart")
    fullButton = modeButton("Full scan",194,"full")
    local function scanTooltip(b, mode, name, details)
        tooltip(b,function()
            local p = OctoRaidCost.Progress()
            return p.running and p.scanMode == mode and ("Stop " .. name) or name
        end,function()
            local p = OctoRaidCost.Progress()
            if p.running then
                if p.scanMode == mode then return "Stop this scan and export the results collected so far as incomplete. The previous completed scan remains separate." end
                return "Another scan is running. Stop it or wait for completion before starting this mode."
            end
            return details .. " Open the auction house first and keep other auction searches idle. Prices export automatically."
        end)
    end
    scanTooltip(smartButton,"smart","Smart scan","Search ready consumables first, then only the recipe ingredients needed for items without quotations. Shared ingredients are searched once.")
    scanTooltip(fullButton,"full","Full scan","Start a scan of ready consumables and recipe ingredients. Ingredient prices can estimate costs when the finished item has no quotation.")
    tooltip(auxButton,"Import Aux","Import supported prices already cached by aux-addon for the selected mode. This does not run an AH scan or import a TXT file. Nampower is required to export the result.")
    tooltip(exportButton,"Export TXT","Write the current prices to CustomData/OctoRaidCost_<realm>.txt for the web analyzer. Replaces the realm TXT, including incomplete results and any retained previous complete scan.")
    progress = CreateFrame("StatusBar",nil,panel)
    progress:SetPoint("TOPLEFT",panel,"TOPLEFT",20,-99);progress:SetWidth(340);progress:SetHeight(16)
    progress:SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar");progress:SetStatusBarColor(0.15,0.7,0.6)
    local bg = progress:CreateTexture(nil,"BACKGROUND");bg:SetAllPoints(progress);bg:SetTexture(0.08,0.08,0.08,1)
    progressText = progress:CreateFontString(nil,"OVERLAY","GameFontHighlightSmall");progressText:SetPoint("CENTER",progress,"CENTER")
    local function line(y, height, font)
        local f=panel:CreateFontString(nil,"OVERLAY",font or "GameFontHighlightSmall")
        f:SetPoint("TOPLEFT",panel,"TOPLEFT",20,y);f:SetWidth(340);f:SetHeight(height);f:SetJustifyH("LEFT");f:SetJustifyV("TOP")
        return f
    end
    status=line(-122,16,"GameFontHighlight");current=line(-142,24);unavailable=line(-169,27)
    exportText=line(-201,28);notice=line(-237,30,"GameFontNormalSmall")
    timer=0
    panel:SetScript("OnUpdate",function() timer=timer+arg1;if timer>=0.2 then timer=0;OctoRaidCost.RefreshUI() end end)
    panel:Show(); panel:Raise(); OctoRaidCost.RefreshUI()
end
