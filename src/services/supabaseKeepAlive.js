import cron from 'node-cron'
import { supabase } from '../config/SupabaseClient.js'

const DEFAULT_CRON = '0 3 * * *' // daily at 03:00
const DEFAULT_TIMEZONE = 'UTC'

async function pingSupabaseDb() {
  const startedAt = Date.now()

  const { error } = await supabase
    .from('users')
    .select('id')
    .limit(1)

  if (error) {
    console.error('[keep-alive] Supabase ping failed:', error.message)
    return
  }

  const elapsedMs = Date.now() - startedAt
  console.log(`[keep-alive] Supabase ping successful (${elapsedMs}ms)`)
}

export function startSupabaseKeepAlive() {
  const schedule = process.env.SUPABASE_KEEP_ALIVE_CRON || DEFAULT_CRON
  const timezone = process.env.SUPABASE_KEEP_ALIVE_TZ || DEFAULT_TIMEZONE

  if (!cron.validate(schedule)) {
    console.error(
      `[keep-alive] Invalid cron expression: ${schedule}. Keep-alive job was not started.`
    )
    return null
  }

  const job = cron.schedule(
    schedule,
    async () => {
      await pingSupabaseDb()
    },
    { timezone }
  )

  console.log(
    `[keep-alive] Daily Supabase keep-alive scheduled (${schedule}, timezone: ${timezone})`
  )

  // Run one ping on startup so there is immediate activity.
  pingSupabaseDb().catch((err) => {
    console.error('[keep-alive] Startup ping failed:', err.message)
  })

  return job
}
