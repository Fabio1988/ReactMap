import express from 'express'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import logger from "morgan"
import '../knexfile.js'
import rootRouter from './routes/rootRouter.js'
import addMiddlewares from './middlewares/addMiddlewares.js'
import hbsMiddleware from "express-handlebars"

import { graphqlHTTP } from 'express-graphql'
import schema from './schema/schema.js' 
import cors from 'cors' 

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const port = 3000

app.use(cors())
app.use('/graphql', graphqlHTTP({
  schema,
  graphiql: true
}))

app.set("views", path.join(__dirname, "../views"))
app.engine(
  "hbs",
  hbsMiddleware({
    defaultLayout: "default",
    extname: ".hbs",
  })
)
app.set("view engine", "hbs")

app.use(logger("dev"))

app.use(express.json())

app.use(express.static(path.join(__dirname, "../../client/public")))

addMiddlewares(app)

app.use(rootRouter)

app.listen(port, () => {
  console.log(`Server is now listening at http://localhost:${port}`)
})

export default app