// Save file parser for Data Center (.save files)
// Format: .NET BinaryFormatter serialization (Unity/C#)
//
// Editable fields:
//   PlayerData  { coins: float, xp: float, reputation: float }
//   SaveData    { wallPrice: float, isWallOpened: int[306], saveComplete: bool }
//   shopItemUnlockStates: Dictionary<string, bool> (GUID keys)

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g

function textView(buf) {
  const chars = []
  for (let i = 0; i < buf.length; i++) chars.push(String.fromCharCode(buf[i]))
  return chars.join('')
}

function findPlayerDataFloatOffset(buf) {
  const text = textView(buf)
  let idx = text.indexOf('PlayerData')
  if (idx < 0) return -1
  idx = text.indexOf('PlayerData', idx + 1)
  if (idx < 0) return -1
  const marker = 'e089]]'
  const eIdx = text.indexOf(marker, idx)
  if (eIdx < 0) return -1
  return eIdx + marker.length + 4 + 4 + 5
}

function findShopUnlockEntries(buf) {
  const text = textView(buf)
  const entries = []
  UUID_REGEX.lastIndex = 0
  let match
  while ((match = UUID_REGEX.exec(text)) !== null) {
    const guidStart = match.index
    const guidEnd = guidStart + 36
    if (buf[guidStart - 1] !== 0x24) continue
    entries.push({
      guid: match[0],
      boolOffset: guidEnd,
      unlocked: buf[guidEnd] === 1,
    })
  }
  return entries
}

// Find the end of the nameOfSave field by anchoring on the
// loadedScenes ref + version pattern: 09 06 00 00 00 07 00 00 00
// Then read the name record (ObjectString 0x06, or ObjectNull 0x0a).
function findNameEnd(buf, view) {
  for (let i = 0x680; i < 0x6a0; i++) {
    if (buf[i] === 0x09 && view.getInt32(i + 1, true) === 6 && view.getInt32(i + 5, true) === 7) {
      const nameRecordStart = i + 9
      const recordType = buf[nameRecordStart]
      if (recordType === 0x06) {
        // ObjectString: 06 [4-byte id] [1-byte length] [chars]
        const strLen = buf[nameRecordStart + 5]
        return nameRecordStart + 6 + strLen
      }
      if (recordType === 0x0a) {
        // ObjectNull: single byte, name is null
        return nameRecordStart + 1
      }
      // Unknown record type — try treating as ObjectString anyway
      if (nameRecordStart + 6 < buf.length) {
        const strLen = buf[nameRecordStart + 5]
        return nameRecordStart + 6 + strLen
      }
    }
  }
  return -1
}

// Find the isWallOpened int[] array in the binary.
// It's a PrimitiveArray record (type 0x0F) referenced from SaveData.
// Format: 0F [4-byte objId] [4-byte length] [1-byte primType=0x08] [data: length*4 bytes]
function findWallArray(buf, view) {
  const nameEnd = findNameEnd(buf, view)
  if (nameEnd < 0) return null

  // After nameOfSave: networkData ref (5) + rackMountObjectData ref (5) = 10 bytes
  // Then isWallOpened ref (5 bytes: 09 [4-byte objId])
  const wallRefPos = nameEnd + 10
  if (buf[wallRefPos] !== 0x09) return null
  const wallRefId = view.getInt32(wallRefPos + 1, true)

  // Find the PrimitiveArray record with this object ID
  for (let i = 0; i < buf.length - 10; i++) {
    if (buf[i] === 0x0F) {
      const objId = view.getInt32(i + 1, true)
      if (objId === wallRefId) {
        const arrLen = view.getInt32(i + 5, true)
        const primType = buf[i + 9]
        if (primType !== 0x08) continue // must be Int32
        return { offset: i + 10, length: arrLen }
      }
    }
  }
  return null
}

// Find wallPrice and saveComplete offsets.
// wallPrice is a float in SaveData, located after:
//   nameOfSave + networkData ref(5) + rackMountObjectData ref(5) +
//   isWallOpened ref(5) + interactObjectData ref(5) + lastUsedRackPositionGlobalUID int(4)
// saveComplete is a bool, located after:
//   wallPrice(4) + shopItemUnlockStates ref(5) + isIPHintHidden bool(1)
function findSaveDataFields(buf, view) {
  const nameEnd = findNameEnd(buf, view)
  if (nameEnd < 0) return null

  // networkData(5) + rackMountObjectData(5) + isWallOpened(5) + interactObjectData(5) = 20
  // + lastUsedRackPositionGlobalUID(4) = 24
  const wallPriceOffset = nameEnd + 24
  // wallPrice(4) + shopItemUnlockStates(5) + isIPHintHidden(1)
  const saveCompleteOffset = wallPriceOffset + 4 + 5 + 1

  return {
    wallPriceOffset,
    saveCompleteOffset,
    wallPrice: view.getFloat32(wallPriceOffset, true),
    saveComplete: buf[saveCompleteOffset] === 1,
  }
}

function findSaveName(buf, floatOffset) {
  const text = textView(buf)
  const searchStart = Math.max(0, floatOffset - 0x200)
  for (let i = searchStart; i < floatOffset; i++) {
    if (buf[i] === 0x06 && i + 6 < buf.length) {
      const strLen = buf[i + 5]
      if (strLen > 0 && strLen < 64 && i + 6 + strLen <= buf.length) {
        const candidate = text.substring(i + 6, i + 6 + strLen)
        if (/^[a-zA-Z0-9_ -]+$/.test(candidate) && candidate.length >= 2) {
          return candidate
        }
      }
    }
  }
  return ''
}

export function parseSave(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer)
  const view = new DataView(arrayBuffer)

  const floatOffset = findPlayerDataFloatOffset(buf)
  if (floatOffset < 0) throw new Error('Could not find PlayerData in save file')

  const coins = view.getFloat32(floatOffset, true)
  const xp = view.getFloat32(floatOffset + 4, true)
  const reputation = view.getFloat32(floatOffset + 8, true)

  const shopItems = findShopUnlockEntries(buf)
  const saveName = findSaveName(buf, floatOffset)

  // Wall data
  const wallArray = findWallArray(buf, view)
  let wallsOpened = 0, wallsTotal = 0
  if (wallArray) {
    wallsTotal = wallArray.length
    for (let i = 0; i < wallArray.length; i++) {
      if (view.getInt32(wallArray.offset + i * 4, true) === 1) wallsOpened++
    }
  }

  // SaveData fields
  const saveFields = findSaveDataFields(buf, view)

  return {
    coins,
    xp,
    reputation,
    shopItems,
    saveName,
    wallsOpened,
    wallsTotal,
    wallPrice: saveFields?.wallPrice ?? 0,
    saveComplete: saveFields?.saveComplete ?? false,
    _floatOffset: floatOffset,
    _wallArray: wallArray,
    _saveFields: saveFields,
    _raw: arrayBuffer,
  }
}

export function modifySave(parsed, changes) {
  const buf = new Uint8Array(parsed._raw.slice(0))
  const view = new DataView(buf.buffer)
  const offset = parsed._floatOffset

  if (changes.coins != null) view.setFloat32(offset, changes.coins, true)
  if (changes.xp != null) view.setFloat32(offset + 4, changes.xp, true)
  if (changes.reputation != null) view.setFloat32(offset + 8, changes.reputation, true)

  // Shop unlocks
  if (changes.unlockAll || changes.lockAll) {
    const entries = findShopUnlockEntries(buf)
    const val = changes.unlockAll ? 1 : 0
    for (const entry of entries) buf[entry.boolOffset] = val
  }

  // Walls
  if (changes.openAllWalls || changes.closeAllWalls) {
    const wallArray = findWallArray(buf, view)
    if (wallArray) {
      const val = changes.openAllWalls ? 1 : 0
      for (let i = 0; i < wallArray.length; i++) {
        view.setInt32(wallArray.offset + i * 4, val, true)
      }
    }
  }

  // wallPrice
  if (changes.wallPrice != null && parsed._saveFields) {
    view.setFloat32(parsed._saveFields.wallPriceOffset, changes.wallPrice, true)
  }

  // saveComplete
  if (changes.saveComplete != null && parsed._saveFields) {
    buf[parsed._saveFields.saveCompleteOffset] = changes.saveComplete ? 1 : 0
  }

  return buf.buffer
}

export function parseMeta(jsonString) {
  try { return JSON.parse(jsonString) } catch { return null }
}

export function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return Math.round(n).toLocaleString()
}

export const PRESETS = {
  starterBoost: {
    label: 'Starter Boost',
    description: '30K money, all items unlocked',
    coins: 30_000, xp: null, reputation: null,
    unlockAll: true,
  },
  fullUnlock: {
    label: 'Full Unlock',
    description: 'All items unlocked, all walls opened',
    coins: null, xp: null, reputation: null,
    unlockAll: true, openAllWalls: true,
  },
  richStart: {
    label: 'Rich Start',
    description: '1M money, 100K XP, 10K rep, all unlocked',
    coins: 1_000_000, xp: 100_000, reputation: 10_000,
    unlockAll: true,
  },
  endgame: {
    label: 'Endgame',
    description: '10M money, 5M XP, 500K rep, everything open',
    coins: 10_000_000, xp: 5_000_000, reputation: 500_000,
    unlockAll: true, openAllWalls: true,
  },
  openWalls: {
    label: 'Open All Walls',
    description: 'Open every wall (keep everything else)',
    coins: null, xp: null, reputation: null,
    openAllWalls: true,
  },
  closeWalls: {
    label: 'Close All Walls',
    description: 'Close every wall',
    coins: null, xp: null, reputation: null,
    closeAllWalls: true,
  },
  lockAll: {
    label: 'Lock All Items',
    description: 'Lock all shop items',
    coins: null, xp: null, reputation: null,
    lockAll: true,
  },
}
