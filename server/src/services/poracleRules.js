// @ts-check

/**
 * Editing a tracked rule in ReactMap sends back only the fields its UI knows.
 * Poracle replaces a rule wholesale on update, so any setting made elsewhere
 * (a bot command, PoracleWeb) would be reset to its default. These helpers
 * copy those settings over from the stored rule before the update is sent.
 */

/** Settings ReactMap has no input for, per category. */
const HIDDEN_FIELDS = /** @type {Record<string, string[]>} */ ({
  pokemon: ['costume', 'pvp_ranking_evolution'],
  raid: ['costume', 'evolution'],
  gym: ['battle_changes'],
})

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function toInt(value) {
  if (value === null || value === undefined || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

/**
 * ReactMap's checkbox is only the clean bit (1) of Poracle's packed `clean`;
 * the edit (2) and summary (4) bits are kept from the stored rule.
 * @param {unknown} stored
 * @param {unknown} incoming
 */
function mergeClean(stored, incoming) {
  const storedClean = toInt(stored) ?? 0
  const otherBits = storedClean - (storedClean % 2)
  if (typeof incoming === 'boolean') return otherBits + +incoming
  const n = toInt(incoming)
  if (n === undefined) return storedClean
  return n > 1 ? n : otherBits + n
}

/**
 * Whether a hidden field still applies to the edited rule.
 * @param {string} field
 * @param {Record<string, any>} stored
 * @param {Record<string, any>} row
 */
function stillApplies(field, stored, row) {
  const same = (/** @type {string} */ key) =>
    row[key] === undefined || toInt(row[key]) === toInt(stored[key])
  switch (field) {
    case 'costume':
    case 'evolution':
      return same('pokemon_id')
    case 'pvp_ranking_evolution':
      return toInt(row.pvp_ranking_league) > 0 && same('pvp_ranking_league')
    default:
      return true
  }
}

/**
 * Fills in the settings ReactMap cannot see from the stored rule.
 * @param {string} category
 * @param {Record<string, any>} stored the rule as Poracle returns it (v1 shape)
 * @param {Record<string, any>} row the edited rule from the client
 * @returns {Record<string, any>}
 */
function keepHiddenFields(category, stored, row) {
  const merged = { ...row }
  ;(HIDDEN_FIELDS[category] || []).forEach((field) => {
    if (
      merged[field] === undefined &&
      stored[field] != null &&
      stillApplies(field, stored, row)
    ) {
      merged[field] = stored[field]
    }
  })

  // An area override needs distance 0, a location override a distance; the
  // stored one is dropped when the edit switched between the two.
  const distance = toInt(merged.distance ?? stored.distance) ?? 0
  if (
    merged.override_areas === undefined &&
    distance === 0 &&
    Array.isArray(stored.override_areas) &&
    stored.override_areas.length
  ) {
    merged.override_areas = stored.override_areas
  }
  if (
    merged.override_location_label === undefined &&
    distance > 0 &&
    stored.override_location_label
  ) {
    merged.override_location_label = stored.override_location_label
  }

  if (stored.clean !== undefined) {
    merged.clean = mergeClean(stored.clean, row.clean)
  }
  return merged
}

/**
 * Applies keepHiddenFields to every row that edits a stored rule (has a uid).
 * @param {string} category
 * @param {Record<string, any>[]} stored
 * @param {Record<string, any>[]} rows
 */
function keepHiddenFieldsAll(category, stored, rows) {
  const byUid = new Map(stored.map((rule) => [String(rule.uid), rule]))
  return rows.map((row) => {
    const match = row?.uid ? byUid.get(String(row.uid)) : undefined
    return match ? keepHiddenFields(category, match, row) : row
  })
}

/**
 * GraphQL resolver for a rule's `clean` checkbox: only the clean bit, so a
 * rule with just edit or summary set does not show as clean.
 * @param {{ clean?: unknown }} rule
 */
function cleanBit(rule) {
  if (typeof rule.clean === 'boolean') return rule.clean
  return (toInt(rule.clean) ?? 0) % 2 === 1
}

module.exports = { keepHiddenFields, keepHiddenFieldsAll, mergeClean, cleanBit }
