// @ts-check
const { resolve } = require('path')
const fs = require('fs')

const { log, HELPERS } = require('@rm/logger')

/**
 * @param {boolean} isDevelopment
 * @returns {import('vite').Plugin}
 */
const faviconPlugin = (isDevelopment) => {
  try {
    const favicon = fs.existsSync(
      resolve(__dirname, '../../../public/favicon/favicon.ico'),
    )
      ? resolve(__dirname, '../../../public/favicon/favicon.ico')
      : resolve(__dirname, '../../../public/favicon/fallback.ico')
    return {
      name: 'vite-plugin-favicon',
      generateBundle() {
        if (isDevelopment) return
        this.emitFile({
          type: 'asset',
          fileName: 'favicon.ico',
          source: fs.readFileSync(favicon),
        })
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/favicon.ico') {
            res.writeHead(200, { 'Content-Type': 'image/x-icon' })
            res.end(fs.readFileSync(favicon))
            return
          }
          next()
        })
      },
    }
  } catch (e) {
    log.error(HELPERS.build, 'Error loading favicon', e)
    return { name: 'vite-plugin-favicon' }
  }
}

module.exports = {
  faviconPlugin,
}
