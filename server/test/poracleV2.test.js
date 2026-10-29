const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { test } = require('node:test')

const { PoracleAPI } = require('../src/services/Poracle')
const {
  toV2Rule,
  fromV2Rule,
  toV2ActiveHours,
  fromV2ActiveHours,
} = require('../src/services/poracleV2')

const owner = { id: '123', profile_no: 1 }

test('pokemon: v1 sentinels are omitted and only real filters are sent', () => {
  const api = new PoracleAPI({ name: 'test', host: 'http://x', port: 1 })
  const { type, rule } = toV2Rule('pokemon', {
    ...api.ui.pokemon.defaults,
    pokemon_id: 25,
    min_iv: 90,
    gender: 2,
    clean: true,
    uid: 7,
    id: '123',
    description: 'Pikachu',
    allForms: false,
  })
  assert.equal(type, 'pokemon')
  // size 1 is ReactMap's default but not v2's wildcard (-1), so it is a real
  // filter v1 would have stored too.
  assert.deepEqual(rule, {
    pokemon_id: 25,
    min_iv: 90,
    gender: 'female',
    size: 1,
    template: '0',
    clean: true,
  })
})

test('pokemon: v2 nulls read back as the v1 sentinels', () => {
  const row = fromV2Rule(
    'pokemon',
    {
      uid: 7,
      pokemon_id: 25,
      min_iv: 90,
      max_iv: null,
      gender: 'female',
      max_weight: null,
      pvp_ranking_worst: null,
      clean: true,
      edit: true,
      template: null,
      ping: null,
      description: 'Pikachu',
    },
    owner,
  )
  assert.equal(row.uid, 7)
  assert.equal(row.id, '123')
  assert.equal(row.profile_no, 1)
  assert.equal(row.description, 'Pikachu')
  assert.equal(row.min_iv, 90)
  assert.equal(row.max_iv, 100)
  assert.equal(row.rarity, -1)
  assert.equal(row.gender, 2)
  assert.equal(row.max_weight, 9000000)
  assert.equal(row.pvp_ranking_worst, 4096)
  assert.equal(row.clean, 3)
  assert.equal(row.template, '')
  assert.equal(row.ping, '')
  assert.equal(row.distance, 0)
})

test('raid: boss, by-level and everything map both ways', () => {
  assert.deepEqual(
    toV2Rule('raid', { pokemon_id: 150, level: 9000, move: 9000, team: 4 })
      .rule,
    { pokemon_id: 150 },
  )
  assert.deepEqual(
    toV2Rule('raid', { pokemon_id: 9000, level: 5, move: 9000, team: 1 }).rule,
    { level: 5, team: 'mystic' },
  )
  assert.deepEqual(toV2Rule('raid', { pokemon_id: 9000, level: 90 }).rule, {})

  const boss = fromV2Rule('raid', { uid: 1, pokemon_id: 150 }, owner)
  assert.equal(boss.pokemon_id, 150)
  assert.equal(boss.level, 9000)
  assert.equal(boss.move, 9000)
  assert.equal(boss.team, 4)
  assert.equal(boss.exclusive, 0)

  const byLevel = fromV2Rule('raid', { uid: 2, level: 5 }, owner)
  assert.equal(byLevel.pokemon_id, 9000)
  assert.equal(byLevel.level, 5)

  const everything = fromV2Rule('raid', { uid: 3 }, owner)
  assert.equal(everything.level, 90)
})

test('egg level is required and capped at the all-tiers value', () => {
  assert.deepEqual(toV2Rule('egg', { level: 9000, team: 4 }).rule, {
    level: 90,
  })
  assert.deepEqual(toV2Rule('egg', { level: 3, exclusive: 1 }).rule, {
    level: 3,
    exclusive: true,
  })
})

test('gym always sends team, and edit is dropped where v2 rejects it', () => {
  assert.deepEqual(
    toV2Rule('gym', { team: 4, slot_changes: true, clean: 3 }).rule,
    { team: 'any', slot_changes: true, clean: true },
  )
  const row = fromV2Rule(
    'gym',
    { uid: 1, team: 'valor', slot_changes: true, battle_changes: null },
    owner,
  )
  assert.equal(row.team, 2)
  assert.equal(row.slot_changes, 1)
  assert.equal(row.battle_changes, 0)
})

test('quest summary bit survives, shiny becomes a boolean', () => {
  assert.deepEqual(
    toV2Rule('quest', { reward_type: 7, reward: 0, shiny: 1, clean: 5 }).rule,
    { reward_type: 7, shiny: true, clean: true, summary: true },
  )
})

test('invasion: pokestop events become incident rules', () => {
  assert.deepEqual(toV2Rule('invasion', { grunt_type: 'showcase' }), {
    type: 'incident',
    rule: { display_type: 9 },
  })
  assert.deepEqual(toV2Rule('invasion', { grunt_type: 'Water', gender: 1 }), {
    type: 'invasion',
    rule: { grunt_type: 'water', gender: 'male' },
  })

  const event = fromV2Rule('incident', { uid: 4, display_type: 7 }, owner)
  assert.equal(event.grunt_type, 'gold-stop')
  assert.equal(event.gender, 0)

  const grunt = fromV2Rule(
    'invasion',
    { uid: 5, grunt_type: 'water', gender: null },
    owner,
  )
  assert.equal(grunt.grunt_type, 'water')
  assert.equal(grunt.gender, 0)
})

test('nest any pokemon is omitted (v2 minimum is 1)', () => {
  assert.deepEqual(toV2Rule('nest', { pokemon_id: 0, min_spawn_avg: 5 }).rule, {
    min_spawn_avg: 5,
  })
})

test('active hours convert to v2 integers and back to padded strings', () => {
  assert.deepEqual(
    toV2ActiveHours([{ day: 1, hours: '09', mins: '05', id: '1_0' }]),
    [{ day: 1, hours: 9, mins: 5 }],
  )
  assert.deepEqual(fromV2ActiveHours([{ day: 7, hours: 9, mins: 5 }]), [
    { day: 7, hours: '09', mins: '05' },
  ])
})

/**
 * Stub PoracleNG: serves the init endpoints plus an OpenAPI spec, and records
 * every other request.
 * @param {{ spec?: object | null, routes?: Record<string, object> }} options
 */
async function stubPoracle({ spec = null, routes = {} } = {}) {
  /** @type {{ method: string, url: string, body: any }[]} */
  const requests = []
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      const send = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
      }
      const { url = '', method = 'GET' } = req
      if (url === '/openapi.json') {
        return spec ? send(200, spec) : send(404, {})
      }
      if (url === '/api/config/poracleWeb')
        return send(200, { version: '9.0.0' })
      if (url === '/api/geofence/all/geojson') {
        return send(200, { geoJSON: { features: [] } })
      }
      if (url.startsWith('/api/config/templates')) {
        return send(200, { discord: {}, telegram: {} })
      }
      requests.push({ method, url, body: raw ? JSON.parse(raw) : undefined })
      const key = `${method} ${url.split('?')[0]}`
      return send(200, routes[key] ?? {})
    })
  })
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  const address = /** @type {import('node:net').AddressInfo} */ (
    server.address()
  )
  return {
    requests,
    port: address.port,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve)
      }),
  }
}

const v2Spec = {
  paths: Object.fromEntries(
    [
      '/v2/humans/{id}',
      '/v2/humans/{id}/areas',
      '/v2/humans/{id}/enable',
      '/v2/humans/{id}/disable',
      '/v2/humans/{id}/location',
      '/v2/humans/{id}/profile',
      '/v2/humans/{id}/profiles',
      '/v2/humans/{id}/profiles/{profile_no}',
      '/v2/humans/{id}/profiles/{profile_no}/copy',
      ...[
        'pokemon',
        'raid',
        'egg',
        'quest',
        'invasion',
        'incident',
        'lure',
        'nest',
        'gym',
      ].map((type) => `/v2/humans/{id}/tracking/${type}`),
    ].map((p) => [p, {}]),
  ),
}

/** @param {number} port @param {string} name */
async function initApi(port, name, apiVersion = undefined) {
  const api = new PoracleAPI({
    name,
    host: 'http://127.0.0.1',
    port,
    enabled: true,
    apiVersion,
  })
  await api.init()
  fs.rmSync(path.join(__dirname, '../.cache', `${name}-webhook.json`), {
    force: true,
  })
  return api
}

test('auto detects v2 from the OpenAPI spec, v1 without one', async () => {
  const ng = await stubPoracle({ spec: v2Spec })
  const legacy = await stubPoracle()
  const partial = await stubPoracle({
    spec: { paths: { '/v2/humans/{id}': {} } },
  })
  try {
    assert.equal((await initApi(ng.port, 'v2-detect-ng')).v2, true)
    assert.equal((await initApi(legacy.port, 'v2-detect-legacy')).v2, false)
    assert.equal((await initApi(partial.port, 'v2-detect-partial')).v2, false)
    // An explicit version skips the probe.
    assert.equal((await initApi(ng.port, 'v2-detect-forced', 'v1')).v2, false)
  } finally {
    await Promise.all([ng.close(), legacy.close(), partial.close()])
  }
})

test('v2 tracking POST splits invasion and incident, then lists both', async () => {
  const stub = await stubPoracle({
    spec: v2Spec,
    routes: {
      'GET /api/v2/humans/123': { human: { current_profile_no: 2 } },
      'GET /api/v2/humans/123/tracking/invasion': {
        rules: [{ uid: 1, grunt_type: 'water', gender: 'female' }],
      },
      'GET /api/v2/humans/123/tracking/incident': {
        rules: [{ uid: 2, display_type: 9, description: 'Showcase' }],
      },
    },
  })
  try {
    const api = await initApi(stub.port, 'v2-invasion')
    const result = await api.api('123', 'invasion', 'POST', [
      { grunt_type: 'water', gender: 2, clean: false, uid: 1 },
      { grunt_type: 'showcase', gender: 0, clean: true },
    ])

    const posts = stub.requests.filter((r) => r.method === 'POST')
    assert.deepEqual(posts.map((r) => [r.url, r.body]).sort(), [
      [
        '/api/v2/humans/123/tracking/incident',
        [{ display_type: 9, clean: true }],
      ],
      [
        '/api/v2/humans/123/tracking/invasion',
        [{ grunt_type: 'water', gender: 'female' }],
      ],
    ])
    assert.deepEqual(
      result.invasion.map((r) => [r.uid, r.grunt_type, r.gender, r.profile_no]),
      [
        [1, 'water', 2, 2],
        [2, 'showcase', 0, 2],
      ],
    )
  } finally {
    await stub.close()
  }
})

test('v2 bulk delete hits both invasion endpoints without a body', async () => {
  const stub = await stubPoracle({ spec: v2Spec })
  try {
    const api = await initApi(stub.port, 'v2-delete')
    await api.api('123', 'invasion-delete', 'POST', ['4', '5'])
    const deletes = stub.requests.filter((r) => r.method === 'DELETE')
    assert.deepEqual(deletes.map((r) => r.url).sort(), [
      '/api/v2/humans/123/tracking/incident?uid=4,5',
      '/api/v2/humans/123/tracking/invasion?uid=4,5',
    ])
    assert.ok(deletes.every((r) => r.body === undefined))
  } finally {
    await stub.close()
  }
})

test('v2 profile update sends only typed active hours', async () => {
  const stub = await stubPoracle({
    spec: v2Spec,
    routes: {
      'GET /api/v2/humans/123/profiles': {
        profiles: [
          {
            uid: 9,
            profile_no: 1,
            name: 'home',
            area: ['town'],
            active_hours: [{ day: 2, hours: 8, mins: 0 }],
          },
        ],
      },
    },
  })
  try {
    const api = await initApi(stub.port, 'v2-profile')
    const { profile } = await api.api('123', 'profiles-update', 'POST', {
      uid: 9,
      profile_no: 1,
      name: 'home',
      area: ['town'],
      active_hours: [{ day: 2, hours: '08', mins: '00', id: '9_0' }],
    })
    const patch = stub.requests.find((r) => r.method === 'PATCH')
    assert.equal(patch.url, '/api/v2/humans/123/profiles/1')
    assert.deepEqual(patch.body, {
      active_hours: [{ day: 2, hours: 8, mins: 0 }],
    })
    assert.deepEqual(profile[0].area, ['town'])
    assert.deepEqual(profile[0].active_hours, [
      { day: 2, hours: '08', mins: '00', id: '9_0' },
    ])
  } finally {
    await stub.close()
  }
})

test('a cached v2 result does not override a configured apiVersion', () => {
  const name = 'v2-cache-override'
  const file = path.join(__dirname, '../.cache', `${name}-webhook.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ apiVersion: 'auto', v2: true }))
  try {
    const forced = new PoracleAPI({
      name,
      host: 'http://x',
      port: 1,
      apiVersion: 'v1',
    })
    forced.initFromCache()
    assert.equal(forced.apiVersion, 'v1')
    assert.equal(forced.v2, false)

    const auto = new PoracleAPI({ name, host: 'http://x', port: 1 })
    auto.initFromCache()
    assert.equal(auto.v2, true)
  } finally {
    fs.rmSync(file, { force: true })
  }
})
