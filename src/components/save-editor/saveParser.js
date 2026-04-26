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

// .NET BinaryFormatter strings are prefixed with a 7-bit encoded varint length.
function readVarInt(buf, offset) {
  let val = 0, shift = 0
  for (let i = 0; i < 5; i++) {
    const b = buf[offset + i]
    val |= (b & 0x7f) << shift
    if ((b & 0x80) === 0) return { value: val, bytesUsed: i + 1 }
    shift += 7
  }
  return { value: val, bytesUsed: 5 }
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

// activeObjectives is a List<int> on PlayerData containing the IDs of
// in-progress tutorial steps. Setting _size to 0 marks the list as empty
// without resizing the file — the game iterates only the first _size items
// of the backing array, so the rest is ignored.
//
// The list reference is the 5 bytes immediately preceding the coins float in
// PlayerData. It points to a SystemClassWithMembersAndTypes (0x04) record
// whose members are [_items: int[], _size: int, _version: int].
function findActiveObjectivesSize(buf, view, floatOffset) {
  if (floatOffset < 5 || buf[floatOffset - 5] !== 0x09) return null
  const listObjId = view.getInt32(floatOffset - 4, true)
  for (let i = 0; i < buf.length - 100; i++) {
    if (buf[i] !== 0x04) continue
    if (view.getInt32(i + 1, true) !== listObjId) continue
    let p = i + 5
    const nameLen = readVarInt(buf, p)
    p += nameLen.bytesUsed + nameLen.value
    if (p + 4 > buf.length) continue
    const memberCount = view.getInt32(p, true)
    p += 4
    if (memberCount !== 3) continue
    for (let m = 0; m < 3; m++) {
      const len = readVarInt(buf, p)
      p += len.bytesUsed + len.value
    }
    // BinaryTypeEnums (3 bytes) + AdditionalInfo (3 bytes for List<Int32>:
    // PrimitiveArray + Primitive + Primitive, each Int32) + _items ref (5 bytes)
    p += 3 + 3 + 5
    if (p + 4 > buf.length) return null
    return { sizeOffset: p, size: view.getInt32(p, true) }
  }
  return null
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

// Find the isWallOpened int[] array. It's serialized as a PrimitiveArray
// record (type 0x0F) of Int32 (primType 0x08). The game stores walls as a
// bool array of fixed grid size — every value is 0 or 1.
// Format: 0F [4-byte objId] [4-byte length] [1-byte primType=0x08] [data: length*4 bytes]
//
// Strategy: scan for the first Int32 PrimitiveArray with length >= 100 where
// every element is 0 or 1. This avoids relying on file-offset heuristics that
// shift when the save name changes length.
function findWallArray(buf, view) {
  for (let i = 0; i < buf.length - 14; i++) {
    if (buf[i] !== 0x0F) continue
    const arrLen = view.getInt32(i + 5, true)
    const primType = buf[i + 9]
    if (primType !== 0x08) continue
    if (arrLen < 100 || arrLen > 10000) continue
    const dataStart = i + 10
    if (dataStart + arrLen * 4 > buf.length) continue
    let allBool = true
    for (let j = 0; j < arrLen; j++) {
      const v = view.getInt32(dataStart + j * 4, true)
      if (v !== 0 && v !== 1) { allBool = false; break }
    }
    if (allBool) {
      const objId = view.getInt32(i + 1, true)
      return { offset: dataStart, length: arrLen, objId }
    }
  }
  return null
}

// Find wallPrice and saveComplete offsets by anchoring on the isWallOpened
// reference (`09 + wallObjId LE`) inside the SaveData record. Layout from
// the wall ref:
//   [0]  09 + 4 byte objId   isWallOpened ref            (5)
//   [5]  09 + 4 byte objId   interactObjectData ref      (5)
//   [10] 4 byte int          lastUsedRackPositionGlobalUID
//   [14] 4 byte float        wallPrice
//   [18] 09 + 4 byte objId   shopItemUnlockStates ref    (5)
//   [23] 1 byte bool         isIPHintHidden
//   [24] 1 byte bool         saveComplete
function findSaveDataFields(buf, view, wallArray) {
  if (!wallArray) return null
  const id = wallArray.objId
  const b1 = id & 0xff, b2 = (id >> 8) & 0xff, b3 = (id >> 16) & 0xff, b4 = (id >> 24) & 0xff
  let refPos = -1
  for (let i = 0; i < wallArray.offset - 5; i++) {
    if (buf[i] === 0x09 && buf[i + 1] === b1 && buf[i + 2] === b2 && buf[i + 3] === b3 && buf[i + 4] === b4) {
      // Sanity: next 5 bytes should be another reference (interactObjectData)
      if (buf[i + 5] === 0x09) {
        refPos = i
        break
      }
    }
  }
  if (refPos < 0) return null
  const wallPriceOffset = refPos + 14
  const saveCompleteOffset = refPos + 24
  if (saveCompleteOffset >= buf.length) return null
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
  const saveFields = findSaveDataFields(buf, view, wallArray)

  // Active tutorial objectives
  const objectives = findActiveObjectivesSize(buf, view, floatOffset)

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
    activeObjectives: objectives?.size ?? 0,
    _floatOffset: floatOffset,
    _wallArray: wallArray,
    _saveFields: saveFields,
    _objectives: objectives,
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

  // Tutorial objectives
  if (changes.completeTutorials && parsed._objectives) {
    view.setInt32(parsed._objectives.sizeOffset, 0, true)
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
    unlockAll: true, openAllWalls: true, completeTutorials: true,
  },
  skipTutorials: {
    label: 'Skip Tutorials',
    description: 'Mark all tutorial objectives as complete',
    coins: null, xp: null, reputation: null,
    completeTutorials: true,
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
