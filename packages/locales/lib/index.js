// @ts-check

const { create } = require('./create')
const { missing } = require('./missing')
const {
  readLocaleDirectory,
  writeAll,
  getStatus,
  readAndParseJson,
} = require('./utils')

const locales = readLocaleDirectory(true).map((x) => x.replace('.json', ''))
const status = getStatus()

module.exports.locales = locales
module.exports.status = status
module.exports.create = create
module.exports.missing = missing
module.exports.writeAll = writeAll
module.exports.readAndParseJson = readAndParseJson
