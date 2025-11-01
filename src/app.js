// src/app.js
// src/app.js
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/authRoutes.js' // make sure this path exists

dotenv.config()

const app = express()

// ✅ Configure CORS
const allowedOrigins = [
  'http://10.0.2.2:4000',   // Android emulator loopback
  'http://127.0.0.1:4000',  // fallback local dev
  'http://localhost:4000',
]

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true, // allow cookies or auth headers
}

app.use(cors(corsOptions))
app.use(express.json())

// ✅ Auth routes (connect to Supabase later)
app.use('/api/auth', authRoutes)

export default app
