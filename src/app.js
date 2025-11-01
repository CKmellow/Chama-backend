// src/app.js
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()
const app = express()

// ✅ Configure CORS
const allowedOrigins = [
  'http://10.0.2.2:4000',   // Android emulator loopback to host machine
  'http://127.0.0.1:4000',  // fallback local dev
]

// Allow all origins in dev mode, restrict in production
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true, // allow cookies or auth headers if you ever add them
}

app.use(cors(corsOptions))
app.use(express.json())

// Routes
// import chamaRoutes from './routes/chamaRoutes.js'
// app.use('/api/chamas', chamaRoutes)

export default app
