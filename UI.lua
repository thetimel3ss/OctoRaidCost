-- Compact collector, kept above auction windows even when they are focused.
local panel, status, current, unavailable, exportText, scanButton, auxButton, exportButton, progress, progressText, notice, timer
local showResults, openingMessage = false, nil
local function button(parent, text, x, command)
    local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
    b:SetWidth(108); b:SetHeight(24); b:SetPoint("TOPLEFT", parent, "TOPLEFT", x, -43)
    b:SetText(text); b:SetScript("OnClick", function() SlashCmdList.OCTORAIDCOST(command); OctoRaidCost.RefreshUI() end)
    return b
end
function OctoRaidCost.RefreshUI(scanActivity)
    if not panel then return end
    local p = OctoRaidCost.Progress()
    if scanActivity or p.running then showResults = true end
    scanButton:SetText(p.running and "Stop" or "Scan")
    local ready = OctoRaidCost.HasNampower()
    if ready or p.running then scanButton:Enable() else scanButton:Disable() end
    if ready then auxButton:Enable(); exportButton:Enable()
    else auxButton:Disable(); exportButton:Disable() end
    if showResults then
        progress:SetMinMaxValues(0, math.max(1, p.total)); progress:SetValue(p.done)
        progressText:SetText(p.done .. " / " .. p.total .. " items scanned")
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
        progressText:SetText("Ready to scan")
        status:SetText(ready and "Ready" or "|cffff5050Nampower required|r")
        current:SetText(p.capturedAt and ("Last scan: " .. date("%Y-%m-%d %H:%M", p.capturedAt)) or "Last scan: No previous scan.")
        unavailable:SetText("Open the auction house and click Scan. Keep other auction searches idle.")
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
    scanButton = button(panel,"Scan",20,"scan")
    scanButton:SetScript("OnClick", function()
        SlashCmdList.OCTORAIDCOST(OctoRaidCost.Progress().running and "stop" or "scan")
        OctoRaidCost.RefreshUI()
    end)
    auxButton = button(panel,"Import Aux",136,"aux"); exportButton = button(panel,"Export TXT",252,"export")
    progress = CreateFrame("StatusBar",nil,panel)
    progress:SetPoint("TOPLEFT",panel,"TOPLEFT",20,-78);progress:SetWidth(340);progress:SetHeight(18)
    progress:SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar");progress:SetStatusBarColor(0.15,0.7,0.6)
    local bg = progress:CreateTexture(nil,"BACKGROUND");bg:SetAllPoints(progress);bg:SetTexture(0.08,0.08,0.08,1)
    progressText = progress:CreateFontString(nil,"OVERLAY","GameFontHighlightSmall");progressText:SetPoint("CENTER",progress,"CENTER")
    local function line(y, height, font)
        local f=panel:CreateFontString(nil,"OVERLAY",font or "GameFontHighlightSmall")
        f:SetPoint("TOPLEFT",panel,"TOPLEFT",20,y);f:SetWidth(340);f:SetHeight(height);f:SetJustifyH("LEFT");f:SetJustifyV("TOP")
        return f
    end
    status=line(-106,16,"GameFontHighlight");current=line(-126,28);unavailable=line(-156,30)
    exportText=line(-190,36);notice=line(-232,32,"GameFontNormalSmall")
    timer=0
    panel:SetScript("OnUpdate",function() timer=timer+arg1;if timer>=0.2 then timer=0;OctoRaidCost.RefreshUI() end end)
    panel:Show(); panel:Raise(); OctoRaidCost.RefreshUI()
end
