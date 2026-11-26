-- Nampower writes into the same CustomData directory used by ChronicleCompanion.
-- This is a separate JSON text file: Chronicle logs are never modified.
local function quote(text)
    text = tostring(text)
    text = string.gsub(text, '[%z\1-\31\\"]', function(char)
        if char == '"' then return '\\"' end
        if char == '\\' then return '\\\\' end
        return string.format('\\u%04x', string.byte(char))
    end)
    return '"' .. text .. '"'
end
local function json(value, depth)
    depth = depth or 0
    local kind = type(value)
    if kind == "string" then return quote(value) end
    if kind == "number" then
        if value ~= value or value == math.huge or value == -math.huge then return "null" end
        return tostring(value)
    end
    if kind == "boolean" then return value and "true" or "false" end
    if kind ~= "table" then return "null" end
    local parts, keys, flat = {}, {}, true
    for key, entry in pairs(value) do table.insert(keys, key); if type(entry) == "table" then flat = false end end
    table.sort(keys, function(a,b) return tostring(a) < tostring(b) end)
    for _, key in ipairs(keys) do
        table.insert(parts, (flat and "" or string.rep("  ", depth + 1)) .. quote(key) .. (flat and ":" or ": ") .. json(value[key], depth + 1))
    end
    if table.getn(parts) == 0 then return "{}" end
    if flat then return "{" .. table.concat(parts, ",") .. "}" end
    return "{\n" .. table.concat(parts, ",\n") .. "\n" .. string.rep("  ", depth) .. "}"
end
local function compactSnapshot(snapshot)
    if not snapshot then return nil end
    local result = { realm = snapshot.realm, status = snapshot.status, source = snapshot.source,
        startedAt = snapshot.startedAt, finishedAt = snapshot.finishedAt, scanMode = snapshot.scanMode, scanPhase = snapshot.scanPhase, prices = {} }
    local fields = { "copper", "medianCopper", "historicalCopper", "scannedAt", "listings", "sampleCount", "sampled" }
    for id, price in pairs(snapshot.prices or {}) do
        local entry = {}
        for _, field in ipairs(fields) do if price[field] ~= nil then entry[field] = price[field] end end
        result.prices[id] = entry
    end
    return result
end
function OctoRaidCost.PricePayload()
    local db, realm = OctoRaidCostDB or {}, GetRealmName()
    local payload = { realms = {}, lastComplete = {}, auxPrices = {} }
    local current = db.realms and db.realms[realm]
    local previous = db.lastComplete and db.lastComplete[realm]
    if current then payload.realms[realm] = compactSnapshot(current) end
    if previous and previous ~= current then
        payload.lastComplete[realm] = compactSnapshot(previous)
    end
    if db.auxPrices and db.auxPrices[realm] then payload.auxPrices[realm] = compactSnapshot(db.auxPrices[realm]) end
    return payload
end
local function safeName(value)
    return string.gsub(value or "Unknown", "[^%w_-]", "_")
end
function OctoRaidCost.WritePriceFile(realm, payload, cleared)
    if not OctoRaidCost.HasNampower() then return false end
    local filename = "OctoRaidCost_" .. safeName(realm) .. ".txt"
    local now = time()
    local header = "{\n  \"format\": \"OctoRaidCostPrices\",\n  \"version\": 1,\n" ..
        "  \"realm\": " .. quote(realm) .. ",\n" ..
        "  \"date\": " .. quote(date("%Y-%m-%d", now)) .. ",\n" ..
        "  \"time\": " .. quote(date("%H:%M:%S", now)) .. ",\n" ..
        "  \"timeBasis\": \"Game computer local time\",\n" ..
        "  \"exportedAt\": " .. now .. ",\n" ..
        "  \"character\": " .. quote(type(UnitName) == "function" and UnitName("player") or "Player") .. ",\n" ..
        (cleared and "  \"reset\": true,\n" or "") ..
        "  \"realms\": " .. json(payload.realms, 1) .. ",\n" ..
        "  \"lastComplete\": " .. json(payload.lastComplete, 1) .. ",\n" ..
        "  \"auxPrices\": " .. json(payload.auxPrices, 1) .. "\n}\n"
    local ok, result = pcall(WriteCustomFile, filename, header, "w")
    return ok and result ~= false, filename
end
function OctoRaidCost.ClearPriceFiles()
    local db, realms, written = OctoRaidCostDB or {}, {}, {}
    realms[GetRealmName()] = true
    for _, key in ipairs({"realms", "lastComplete", "auxPrices"}) do
        for realm in pairs(db[key] or {}) do realms[realm] = true end
    end
    for realm in pairs(realms) do
        local filename = "OctoRaidCost_" .. safeName(realm) .. ".txt"
        if not written[filename] then
            local ok = OctoRaidCost.WritePriceFile(realm, {realms={},lastComplete={},auxPrices={}}, true)
            if not ok then return false, filename end
            written[filename] = true
        end
    end
    return true
end
function OctoRaidCost.ExportPrices()
    if not OctoRaidCost.HasNampower() then
        OctoRaidCost.exportStatus = "Nampower is required. Enable it and restart WoW to export TXT prices."
        return false
    end
    local db = OctoRaidCostDB or {}
    if (not db.realms or not next(db.realms)) and (not db.auxPrices or not next(db.auxPrices)) then
        OctoRaidCost.exportStatus = "No prices to export yet. Scan the AH or import Aux first."
        return false
    end
    local ok, filename = OctoRaidCost.WritePriceFile(GetRealmName(), OctoRaidCost.PricePayload())
    if not ok then
        OctoRaidCost.exportStatus = "TXT export failed. Prices are retained. Check Nampower and file permissions, then retry Export TXT."
        return false
    end
    OctoRaidCost.exportFile = filename
    OctoRaidCost.exportStatus = "Saved: CustomData/" .. filename
    return true
end
