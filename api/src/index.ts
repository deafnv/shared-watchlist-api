import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'

import update from './routes/update.js'
import updatestatus from './routes/updatestatus.js'
import seasonal from './routes/seasonal.js'
import changedetails from './routes/changedetails.js'
import completed from './routes/completed.js'
import ptw from './routes/ptw.js'
import addtocompleted from './routes/addtocompleted.js'

import authorize from './lib/authorize.js'

import registerRollHandlers from './routes/socket/roll.js'
import registerPingHandlers from './routes/socket/ping.js'

dotenv.config()
const app = express()

app.use(
  cors({origin: ['http://localhost:3000', 'http://192.168.0.102:3000', 'http://127.0.0.1:3000'].concat(process.env.CORS_URL.split(',')), credentials: true})
)

app.use(cookieParser(process.env.COOKIE_SECRET))

app.use(express.json())

const limiter = rateLimit({
	windowMs: 1 * 1000, // 1 second
	max: 10, // Limit each IP to 15 requests per `window`
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

app.use(limiter)

app.use('/update', authorize, update)
app.use('/updatestatus', authorize, updatestatus)
app.use('/seasonal', authorize, seasonal)
app.use('/changedetails', authorize, changedetails)
app.use('/completed', authorize, completed)
app.use('/ptw', authorize, ptw)
app.use('/addtocompleted', authorize, addtocompleted)

app.get('/', (req, res) => {
  res.send('API functional')
})

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
	cors: {
		origin: ['http://localhost:3000', 'http://192.168.0.102:3000'].concat(process.env.CORS_URL.split(',')),
	}
})

io.on("connection", (socket) => {
  console.log('Someone connected')

	registerRollHandlers(io, socket)
	registerPingHandlers(io, socket)
})

httpServer.listen(3006, () => {
  console.log('HTTP Server running on port 3006');
});
