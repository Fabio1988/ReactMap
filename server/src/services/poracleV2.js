// @ts-check

/**
 * Translation between ReactMap's tracking-rule shape and the PoracleNG v2 API.
 *
 * ReactMap's frontend and GraphQL schema use the v1 wire format: integer
 * sentinels for "any" (9000, -1, 4096, ...), integer enums, and a packed
 * `clean` bitmask. v2 instead omits a field (or returns `null`) for "any",
 * uses string enums, and splits `clean` into `clean` / `edit` / `summary`.
 *
 * Only the server speaks v2. `fromV2Rule` reproduces the values the v1 API
 * returns for the same stored rule, so everything downstream of the service
 * is unchanged, and `toV2Rule` turns a v1-shaped rule into a strict v2 body
 * (unknown fields are rejected by v2, so only known fields are copied).
 */

const TEAMS = /** @type {const} */ ([
  'harmony',
  'mystic',
  'valor',
  'instinct',
  'any',
])
const GENDERS = /** @type {const} */ (['any', 'male', 'female', 'genderless'])
const RSVP_CHANGES = /** @type {const} */ (['none', 'rsvp', 'rsvp_only'])

/**
 * Pokestop events ReactMap tracks as invasion `grunt_type`s. v2 serves them as
 * a separate `incident` type keyed by the event's `display_type`.
 */
const EVENT_DISPLAY_TYPES = /** @type {Record<string, number>} */ ({
  'gold-stop': 7,
  kecleon: 8,
  showcase: 9,
})
const EVENT_NAMES = Object.fromEntries(
  Object.entries(EVENT_DISPLAY_TYPES).map(([name, id]) => [id, name]),
)

/**
 * v1 value for "level unused" on a specific raid boss, and for "any tier" when
 * tracking by level.
 */
const RAID_LEVEL_PLACEHOLDER = 9000
const RAID_LEVEL_ANY = 90
const ANY_ID = 9000

/**
 * @typedef {{ kind: 'int', wc?: number, required?: boolean }
 *   | { kind: 'enum', values: readonly string[], wc: number, required?: boolean }
 *   | { kind: 'bool' }
 *   | { kind: 'string', empty: string | null }
 *   | { kind: 'list' }} FieldSpec
 */

/** @type {Record<string, FieldSpec>} */
const COMMON_FIELDS = {
  distance: { kind: 'int', wc: 0 },
  template: { kind: 'string', empty: '' },
  ping: { kind: 'string', empty: '' },
  override_location_label: { kind: 'string', empty: '' },
  override_areas: { kind: 'list' },
}

/** @type {Record<string, Record<string, FieldSpec>>} */
const FIELDS = {
  pokemon: {
    pokemon_id: { kind: 'int', required: true },
    form: { kind: 'int', wc: 0 },
    costume: { kind: 'int', wc: ANY_ID },
    min_iv: { kind: 'int', wc: -1 },
    max_iv: { kind: 'int', wc: 100 },
    min_cp: { kind: 'int', wc: 0 },
    max_cp: { kind: 'int', wc: 9000 },
    min_level: { kind: 'int', wc: 0 },
    max_level: { kind: 'int', wc: 55 },
    atk: { kind: 'int', wc: 0 },
    def: { kind: 'int', wc: 0 },
    sta: { kind: 'int', wc: 0 },
    max_atk: { kind: 'int', wc: 15 },
    max_def: { kind: 'int', wc: 15 },
    max_sta: { kind: 'int', wc: 15 },
    gender: { kind: 'enum', values: GENDERS, wc: 0 },
    rarity: { kind: 'int', wc: -1 },
    max_rarity: { kind: 'int', wc: 6 },
    size: { kind: 'int', wc: -1 },
    max_size: { kind: 'int', wc: 5 },
    min_weight: { kind: 'int', wc: 0 },
    max_weight: { kind: 'int', wc: 9000000 },
    min_time: { kind: 'int', wc: 0 },
    pvp_ranking_league: { kind: 'int', wc: 0 },
    pvp_ranking_best: { kind: 'int', wc: 1 },
    pvp_ranking_worst: { kind: 'int', wc: 4096 },
    pvp_ranking_min_cp: { kind: 'int', wc: 0 },
    pvp_ranking_cap: { kind: 'int', wc: 0 },
    pvp_ranking_evolution: { kind: 'int', wc: 0 },
  },
  // raid pokemon_id and level are derived from each other; see raidToV2.
  raid: {
    form: { kind: 'int', wc: 0 },
    costume: { kind: 'int', wc: ANY_ID },
    move: { kind: 'int', wc: ANY_ID },
    evolution: { kind: 'int', wc: ANY_ID },
    team: { kind: 'enum', values: TEAMS, wc: 4 },
    exclusive: { kind: 'bool' },
    gym_id: { kind: 'string', empty: null },
    rsvp_changes: { kind: 'enum', values: RSVP_CHANGES, wc: 0 },
  },
  egg: {
    level: { kind: 'int', required: true },
    team: { kind: 'enum', values: TEAMS, wc: 4 },
    exclusive: { kind: 'bool' },
    gym_id: { kind: 'string', empty: null },
    rsvp_changes: { kind: 'enum', values: RSVP_CHANGES, wc: 0 },
  },
  gym: {
    team: { kind: 'enum', values: TEAMS, wc: 4, required: true },
    slot_changes: { kind: 'bool' },
    battle_changes: { kind: 'bool' },
    gym_id: { kind: 'string', empty: null },
  },
  quest: {
    reward_type: { kind: 'int', required: true },
    reward: { kind: 'int', wc: 0 },
    amount: { kind: 'int', wc: 0 },
    form: { kind: 'int', wc: 0 },
    shiny: { kind: 'bool' },
  },
  lure: {
    lure_id: { kind: 'int', required: true },
  },
  nest: {
    pokemon_id: { kind: 'int', wc: 0 },
    form: { kind: 'int', wc: 0 },
    min_spawn_avg: { kind: 'int', wc: 0 },
  },
  // invasion targeting is mode-based in v2; see invasionToV2.
  invasion: {
    gender: { kind: 'enum', values: GENDERS.slice(0, 3), wc: 0 },
  },
  incident: {},
}

/** Types v2 rejects `edit: true` for. */
const NO_EDIT = new Set(['gym', 'invasion', 'nest', 'quest'])

/**
 * Bits of v1's packed `clean` field: 1 = clean, 2 = edit, 4 = summary.
 * @param {number} value
 * @param {1 | 2 | 4} bit
 */
const hasBit = (value, bit) => Math.floor(value / bit) % 2 === 1

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
 * Copies the fields in `specs` from a v1-shaped row into a v2 body, leaving
 * out any field at its "any" value so v2 stores its own wildcard.
 * @param {Record<string, any>} row
 * @param {Record<string, FieldSpec>} specs
 * @param {Record<string, any>} out
 */
function copyToV2(row, specs, out) {
  Object.entries(specs).forEach(([field, spec]) => {
    const value = row[field]
    switch (spec.kind) {
      case 'int': {
        const n = toInt(value)
        if (n === undefined) {
          if (spec.required) out[field] = spec.wc ?? 0
        } else if (spec.required || n !== spec.wc) {
          out[field] = n
        }
        break
      }
      case 'enum': {
        const n = toInt(value) ?? spec.wc
        if (spec.required || n !== spec.wc) {
          out[field] = spec.values[n] ?? spec.values[spec.wc]
        }
        break
      }
      case 'bool':
        if (value && value !== '0') out[field] = true
        break
      case 'string':
        if (value !== null && value !== undefined && value !== '') {
          out[field] = String(value)
        }
        break
      case 'list':
        if (Array.isArray(value) && value.length) out[field] = value.map(String)
        break
      default:
    }
  })
  return out
}

/**
 * Copies the fields in `specs` from a v2 rule into a v1-shaped row, turning a
 * `null` (unconstrained) back into the v1 sentinel.
 * @param {Record<string, any>} rule
 * @param {Record<string, FieldSpec>} specs
 * @param {Record<string, any>} out
 */
function copyFromV2(rule, specs, out) {
  Object.entries(specs).forEach(([field, spec]) => {
    const value = rule[field]
    switch (spec.kind) {
      case 'int':
        out[field] = value ?? spec.wc ?? 0
        break
      case 'enum': {
        const index = spec.values.indexOf(value)
        out[field] = index === -1 ? spec.wc : index
        break
      }
      case 'bool':
        out[field] = value ? 1 : 0
        break
      case 'string':
        out[field] = value ?? spec.empty
        break
      case 'list':
        out[field] = value ?? null
        break
      default:
    }
  })
  return out
}

/**
 * @param {Record<string, any>} row
 * @param {Record<string, any>} out
 */
function raidToV2(row, out) {
  const pokemonId = toInt(row.pokemon_id)
  if (pokemonId !== undefined && pokemonId !== ANY_ID && pokemonId > 0) {
    out.pokemon_id = pokemonId
    return
  }
  const level = toInt(row.level)
  if (
    level !== undefined &&
    level > 0 &&
    level !== RAID_LEVEL_ANY &&
    level !== RAID_LEVEL_PLACEHOLDER
  ) {
    out.level = level
  }
}

/**
 * @param {Record<string, any>} row
 * @returns {{ type: 'invasion' | 'incident', rule: Record<string, any> }}
 */
function invasionToV2(row) {
  const gruntType =
    typeof row.grunt_type === 'string' ? row.grunt_type.toLowerCase() : ''
  if (gruntType in EVENT_DISPLAY_TYPES) {
    return {
      type: 'incident',
      rule: { display_type: EVENT_DISPLAY_TYPES[gruntType] },
    }
  }
  const rule = copyToV2(row, FIELDS.invasion, {})
  if (gruntType) rule.grunt_type = gruntType
  return { type: 'invasion', rule }
}

/**
 * Converts a v1-shaped tracking row, as ReactMap's frontend builds it, into a
 * strict v2 rule body.
 *
 * Pokestop events tracked under `invasion` become `incident` rules, so the
 * result names the v2 type to post the rule to.
 * @param {string} category ReactMap category (pokemon, raid, egg, ...)
 * @param {Record<string, any>} row
 * @returns {{ type: string, rule: Record<string, any> }}
 */
function toV2Rule(category, row) {
  let type = category
  /** @type {Record<string, any>} */
  let rule = {}
  if (category === 'invasion') {
    ;({ type, rule } = invasionToV2(row))
  } else {
    copyToV2(row, FIELDS[category] || {}, rule)
    if (category === 'raid') raidToV2(row, rule)
    if (category === 'egg' && rule.level > RAID_LEVEL_ANY) {
      rule.level = RAID_LEVEL_ANY
    }
  }
  copyToV2(row, COMMON_FIELDS, rule)

  const clean = typeof row.clean === 'boolean' ? +row.clean : toInt(row.clean)
  if (clean) {
    if (hasBit(clean, 1)) rule.clean = true
    if (hasBit(clean, 2) && !NO_EDIT.has(type)) rule.edit = true
    if (hasBit(clean, 4) && type === 'quest') rule.summary = true
  }
  return { type, rule }
}

/**
 * Converts a v2 rule into the v1 row shape ReactMap's frontend expects.
 * @param {string} type v2 tracking type the rule was read from
 * @param {Record<string, any>} rule
 * @param {{ id: string | number, profile_no?: number }} owner
 * @returns {Record<string, any>}
 */
function fromV2Rule(type, rule, owner) {
  /** @type {Record<string, any>} */
  const row = {
    // Incident rules share ReactMap's invasion list but have their own uid
    // sequence, so they are told apart by sign; see toV2Uid.
    uid: type === 'incident' ? -rule.uid : rule.uid,
    id: owner.id,
    profile_no: owner.profile_no,
  }
  if (rule.description !== undefined) row.description = rule.description

  if (type === 'incident') {
    row.grunt_type =
      EVENT_NAMES[rule.display_type] ?? `event_${rule.display_type}`
    row.gender = 0
  } else {
    copyFromV2(rule, FIELDS[type] || {}, row)
  }
  if (type === 'invasion') row.grunt_type = rule.grunt_type ?? 'everything'
  if (type === 'raid') {
    row.pokemon_id = rule.pokemon_id ?? ANY_ID
    row.level =
      rule.pokemon_id == null
        ? (rule.level ?? RAID_LEVEL_ANY)
        : RAID_LEVEL_PLACEHOLDER
  }
  copyFromV2(rule, COMMON_FIELDS, row)
  row.clean =
    (rule.clean ? 1 : 0) + (rule.edit ? 2 : 0) + (rule.summary ? 4 : 0)
  return row
}

/**
 * Resolves a ReactMap uid to the v2 type and uid it names. Under `invasion`,
 * negative uids are incident rules (see fromV2Rule).
 * @param {string} category
 * @param {string | number} uid
 * @returns {{ type: string, uid: number }}
 */
function toV2Uid(category, uid) {
  const n = Number(uid)
  return category === 'invasion' && n < 0
    ? { type: 'incident', uid: -n }
    : { type: category, uid: n }
}

/** @param {unknown} value */
const pad2 = (value) => String(value ?? 0).padStart(2, '0')

/**
 * Converts ReactMap's active hours (string hours/mins plus a client-side id)
 * into v2's strict integer schedule entries.
 * @param {Array<Record<string, any>> | undefined} entries
 */
function toV2ActiveHours(entries) {
  return (entries || []).map(
    ({ day, hours, mins, step, end_hours: endHours, end_mins: endMins }) => {
      /** @type {Record<string, number>} */
      const entry = { day: +day, hours: +hours, mins: +mins }
      if (+step > 0) {
        entry.step = +step
        entry.end_hours = +endHours
        entry.end_mins = +endMins
      }
      return entry
    },
  )
}

/**
 * Converts v2 schedule entries into ReactMap's shape, with zero-padded string
 * hours and minutes as v1 stores them.
 * @param {Array<Record<string, any>> | null | undefined} entries
 */
function fromV2ActiveHours(entries) {
  return (entries || []).map((entry) => ({
    ...entry,
    hours: pad2(entry.hours),
    mins: pad2(entry.mins),
  }))
}

module.exports = {
  EVENT_DISPLAY_TYPES,
  toV2Rule,
  fromV2Rule,
  toV2Uid,
  toV2ActiveHours,
  fromV2ActiveHours,
}
