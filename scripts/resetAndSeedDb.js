import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import { Client } from 'pg'
import { randomUUID } from 'crypto'

dotenv.config()

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_DB_PASSWORD']
const missing = requiredEnv.filter((key) => !process.env[key])

if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

function getProjectRef(supabaseUrl) {
  try {
    const hostname = new URL(supabaseUrl).hostname
    return hostname.split('.')[0]
  } catch (error) {
    throw new Error('SUPABASE_URL must be a valid URL')
  }
}

const projectRef = getProjectRef(process.env.SUPABASE_URL)
const defaultHost = `db.${projectRef}.supabase.co`
const host = process.env.SUPABASE_DB_HOST || defaultHost
const port = Number(process.env.SUPABASE_DB_PORT || 5432)
const dbUser = process.env.SUPABASE_DB_USER || 'postgres'

const client = new Client({
  host,
  port,
  database: 'postgres',
  user: dbUser,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

const schemaSql = `
create extension if not exists "pgcrypto";

drop table if exists contributions cascade;
drop table if exists mpesa_callbacks cascade;
drop table if exists mpesa_stk_temp cascade;
drop table if exists chama_members cascade;
drop table if exists chamas cascade;
drop table if exists users cascade;

create table users (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone_number text not null unique,
  password text not null,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table chamas (
  chama_id uuid primary key default gen_random_uuid(),
  chama_name text not null,
  description text,
  chama_type text,
  invitation_code text not null unique,
  is_invitation_code_active boolean not null default true,
  monthly_contribution_amount numeric(12, 2) not null default 0,
  contribution_frequency text,
  contribution_due_day int,
  loan_interest_rate numeric(6, 2),
  max_loan_multiplier numeric(6, 2),
  loan_max_term_months int,
  meeting_frequency text,
  meeting_day text,
  created_by uuid not null references users(id) on delete cascade,
  is_active boolean not null default true,
  total_balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table chama_members (
  id uuid primary key default gen_random_uuid(),
  chama_id uuid not null references chamas(chama_id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'user',
  joined_at timestamptz not null default now(),
  status text not null default 'active',
  contribution_amount numeric(12, 2) not null default 0,
  unique (chama_id, user_id)
);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  chama_id uuid not null references chamas(chama_id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  amount numeric(12, 2) not null,
  contributed_at timestamptz not null default now(),
  mpesa_receipt_number text unique,
  checkout_request_id text,
  status text not null default 'success',
  created_at timestamptz not null default now()
);

create table mpesa_stk_temp (
  id uuid primary key default gen_random_uuid(),
  checkout_request_id text not null unique,
  chama_id uuid not null references chamas(chama_id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create table mpesa_callbacks (
  id uuid primary key default gen_random_uuid(),
  merchant_request_id text,
  checkout_request_id text,
  result_code int,
  result_desc text,
  amount numeric(12, 2),
  mpesa_receipt_number text,
  transaction_date timestamptz,
  phone_number text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
before update on users
for each row
execute function set_updated_at();

drop trigger if exists trg_chamas_updated_at on chamas;
create trigger trg_chamas_updated_at
before update on chamas
for each row
execute function set_updated_at();

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

async function seedUsers() {
  const users = [
    {
      id: randomUUID(),
      first_name: 'Cyprian',
      last_name: 'Otieno',
      email: 'cyp@gmail.com',
      phone_number: '0708960842',
      password: '123',
      role: 'user',
    },
    {
      id: randomUUID(),
      first_name: 'Mary',
      last_name: 'Akinyi',
      email: 'mary@example.com',
      phone_number: '0722000111',
      password: 'mary123',
      role: 'user',
    },
    {
      id: randomUUID(),
      first_name: 'John',
      last_name: 'Kamau',
      email: 'john@example.com',
      phone_number: '0722000222',
      password: 'john123',
      role: 'user',
    },
    {
      id: randomUUID(),
      first_name: 'Aisha',
      last_name: 'Ali',
      email: 'aisha@example.com',
      phone_number: '0722000333',
      password: 'aisha123',
      role: 'user',
    },
  ]

  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10)
    await client.query(
      `insert into users (id, first_name, last_name, email, phone_number, password, role)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, user.first_name, user.last_name, user.email, user.phone_number, hash, user.role]
    )
  }

  return users
}

async function seedChamas(usersByEmail) {
  const chamas = [
    {
      chama_id: randomUUID(),
      chama_name: 'Hustlers Savings Circle',
      description: 'Monthly savings for emergencies and school fees.',
      chama_type: 'savings',
      invitation_code: 'HST123',
      monthly_contribution_amount: 3000,
      contribution_frequency: 'monthly',
      contribution_due_day: 5,
      loan_interest_rate: 8,
      max_loan_multiplier: 3,
      loan_max_term_months: 6,
      meeting_frequency: 'monthly',
      meeting_day: 'Saturday',
      created_by: usersByEmail['cyp@gmail.com'].id,
      is_active: true,
    },
    {
      chama_id: randomUUID(),
      chama_name: 'Green Harvest Farmers',
      description: 'Agribusiness pooling fund and input financing.',
      chama_type: 'investment',
      invitation_code: 'GRN456',
      monthly_contribution_amount: 1200,
      contribution_frequency: 'weekly',
      contribution_due_day: 3,
      loan_interest_rate: 6,
      max_loan_multiplier: 2,
      loan_max_term_months: 4,
      meeting_frequency: 'weekly',
      meeting_day: 'Wednesday',
      created_by: usersByEmail['cyp@gmail.com'].id,
      is_active: true,
    },
    {
      chama_id: randomUUID(),
      chama_name: 'Techies Investment Club',
      description: 'Quarterly investments into stocks and SACCO products.',
      chama_type: 'investment',
      invitation_code: 'TEC789',
      monthly_contribution_amount: 5000,
      contribution_frequency: 'monthly',
      contribution_due_day: 10,
      loan_interest_rate: 10,
      max_loan_multiplier: 4,
      loan_max_term_months: 12,
      meeting_frequency: 'biweekly',
      meeting_day: 'Sunday',
      created_by: usersByEmail['cyp@gmail.com'].id,
      is_active: true,
    },
  ]

  for (const chama of chamas) {
    await client.query(
      `insert into chamas (
        chama_id, chama_name, description, chama_type, invitation_code, is_invitation_code_active,
        monthly_contribution_amount, contribution_frequency, contribution_due_day,
        loan_interest_rate, max_loan_multiplier, loan_max_term_months,
        meeting_frequency, meeting_day, created_by, is_active
      ) values (
        $1, $2, $3, $4, $5, true,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, $15
      )`,
      [
        chama.chama_id,
        chama.chama_name,
        chama.description,
        chama.chama_type,
        chama.invitation_code,
        chama.monthly_contribution_amount,
        chama.contribution_frequency,
        chama.contribution_due_day,
        chama.loan_interest_rate,
        chama.max_loan_multiplier,
        chama.loan_max_term_months,
        chama.meeting_frequency,
        chama.meeting_day,
        chama.created_by,
        chama.is_active,
      ]
    )
  }

  return chamas
}

async function seedMembers(usersByEmail, chamas) {
  const members = [
    {
      chama_id: chamas[0].chama_id,
      user_id: usersByEmail['cyp@gmail.com'].id,
      role: 'secretary',
      status: 'active',
    },
    {
      chama_id: chamas[0].chama_id,
      user_id: usersByEmail['mary@example.com'].id,
      role: 'chairperson',
      status: 'active',
    },
    {
      chama_id: chamas[0].chama_id,
      user_id: usersByEmail['john@example.com'].id,
      role: 'user',
      status: 'active',
    },
    {
      chama_id: chamas[1].chama_id,
      user_id: usersByEmail['cyp@gmail.com'].id,
      role: 'secretary',
      status: 'active',
    },
    {
      chama_id: chamas[1].chama_id,
      user_id: usersByEmail['aisha@example.com'].id,
      role: 'user',
      status: 'active',
    },
    {
      chama_id: chamas[1].chama_id,
      user_id: usersByEmail['mary@example.com'].id,
      role: 'user',
      status: 'active',
    },
    {
      chama_id: chamas[2].chama_id,
      user_id: usersByEmail['cyp@gmail.com'].id,
      role: 'secretary',
      status: 'active',
    },
    {
      chama_id: chamas[2].chama_id,
      user_id: usersByEmail['john@example.com'].id,
      role: 'chairperson',
      status: 'active',
    },
    {
      chama_id: chamas[2].chama_id,
      user_id: usersByEmail['aisha@example.com'].id,
      role: 'user',
      status: 'active',
    },
  ]

  for (const member of members) {
    await client.query(
      `insert into chama_members (id, chama_id, user_id, role, status, joined_at)
       values ($1, $2, $3, $4, $5, now() - (($6::int) || ' days')::interval)`,
      [randomUUID(), member.chama_id, member.user_id, member.role, member.status, Math.floor(Math.random() * 60)]
    )
  }

  return members
}

async function seedContributions(usersByEmail, chamas) {
  const contributions = [
    {
      chama_id: chamas[0].chama_id,
      user_id: usersByEmail['cyp@gmail.com'].id,
      amount: 3000,
      mpesa_receipt_number: 'RCPHSL001',
      checkout_request_id: 'ws_CO_2001',
      status: 'success',
      daysAgo: 30,
    },
    {
      chama_id: chamas[0].chama_id,
      user_id: usersByEmail['mary@example.com'].id,
      amount: 3000,
      mpesa_receipt_number: 'RCPHSL002',
      checkout_request_id: 'ws_CO_2002',
      status: 'success',
      daysAgo: 28,
    },
    {
      chama_id: chamas[0].chama_id,
      user_id: usersByEmail['john@example.com'].id,
      amount: 3000,
      mpesa_receipt_number: 'RCPHSL003',
      checkout_request_id: 'ws_CO_2003',
      status: 'success',
      daysAgo: 27,
    },
    {
      chama_id: chamas[1].chama_id,
      user_id: usersByEmail['cyp@gmail.com'].id,
      amount: 1200,
      mpesa_receipt_number: 'RCPGRN001',
      checkout_request_id: 'ws_CO_2010',
      status: 'success',
      daysAgo: 12,
    },
    {
      chama_id: chamas[1].chama_id,
      user_id: usersByEmail['aisha@example.com'].id,
      amount: 1200,
      mpesa_receipt_number: 'RCPGRN002',
      checkout_request_id: 'ws_CO_2011',
      status: 'success',
      daysAgo: 10,
    },
    {
      chama_id: chamas[2].chama_id,
      user_id: usersByEmail['john@example.com'].id,
      amount: 5000,
      mpesa_receipt_number: 'RCPTEC001',
      checkout_request_id: 'ws_CO_2020',
      status: 'success',
      daysAgo: 7,
    },
    {
      chama_id: chamas[2].chama_id,
      user_id: usersByEmail['cyp@gmail.com'].id,
      amount: 5000,
      mpesa_receipt_number: null,
      checkout_request_id: 'ws_CO_2021',
      status: 'pending',
      daysAgo: 1,
    },
  ]

  for (const row of contributions) {
    await client.query(
      `insert into contributions (
        id, chama_id, user_id, amount, contributed_at, mpesa_receipt_number, checkout_request_id, status
      ) values (
        $1, $2, $3, $4, now() - (($5::int) || ' days')::interval, $6, $7, $8
      )`,
      [
        randomUUID(),
        row.chama_id,
        row.user_id,
        row.amount,
        row.daysAgo,
        row.mpesa_receipt_number,
        row.checkout_request_id,
        row.status,
      ]
    )
  }
}

async function seedMpesaMeta(usersByEmail, chamas) {
  await client.query(
    `insert into mpesa_stk_temp (id, checkout_request_id, chama_id, user_id, amount)
     values ($1, $2, $3, $4, $5)`,
    [
      randomUUID(),
      'ws_CO_9999',
      chamas[1].chama_id,
      usersByEmail['mary@example.com'].id,
      1200,
    ]
  )

  await client.query(
    `insert into mpesa_callbacks (
      id,
      merchant_request_id,
      checkout_request_id,
      result_code,
      result_desc,
      amount,
      mpesa_receipt_number,
      transaction_date,
      phone_number,
      raw_payload
    ) values (
      $1, $2, $3, $4, $5, $6, $7, now() - interval '10 days', $8, $9::jsonb
    )`,
    [
      randomUUID(),
      '29115-34620561-1',
      'ws_CO_2011',
      0,
      'The service request is processed successfully.',
      1200,
      'RCPGRN002',
      '254722000333',
      JSON.stringify({
        Body: {
          stkCallback: {
            CheckoutRequestID: 'ws_CO_2011',
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
          },
        },
      }),
    ]
  )
}

async function recalculateAggregates() {
  await client.query(`update chamas set total_balance = 0`)
  await client.query(`
    update chamas c
    set total_balance = totals.total
    from (
      select chama_id, coalesce(sum(amount), 0) as total
      from contributions
      where status = 'success'
      group by chama_id
    ) totals
    where totals.chama_id = c.chama_id
  `)

  await client.query(`update chama_members set contribution_amount = 0`)
  await client.query(`
    update chama_members cm
    set contribution_amount = totals.total
    from (
      select chama_id, user_id, coalesce(sum(amount), 0) as total
      from contributions
      where status = 'success'
      group by chama_id, user_id
    ) totals
    where totals.chama_id = cm.chama_id
      and totals.user_id = cm.user_id
  `)
}

async function printSummary() {
  const tables = ['users', 'chamas', 'chama_members', 'contributions', 'mpesa_stk_temp', 'mpesa_callbacks']
  console.log('\nSeed summary:')
  for (const table of tables) {
    const result = await client.query(`select count(*)::int as count from ${table}`)
    console.log(`- ${table}: ${result.rows[0].count}`)
  }

  const chamas = await client.query(
    `select chama_name, invitation_code, total_balance from chamas order by created_at asc`
  )
  console.log('\nChamas created:')
  for (const row of chamas.rows) {
    console.log(`- ${row.chama_name} | code=${row.invitation_code} | total_balance=${row.total_balance}`)
  }

  console.log('\nPrimary login:')
  console.log('- email: cyp@gmail.com')
  console.log('- password: 123')
}

async function main() {
  try {
    await client.connect()
    console.log(`Connected to ${host}:${port} as ${dbUser}`)

    await client.query('begin')
    await client.query(schemaSql)

    const users = await seedUsers()
    const usersByEmail = Object.fromEntries(users.map((u) => [u.email, u]))

    const chamas = await seedChamas(usersByEmail)
    await seedMembers(usersByEmail, chamas)
    await seedContributions(usersByEmail, chamas)
    await seedMpesaMeta(usersByEmail, chamas)
    await recalculateAggregates()

    await client.query('commit')
    await printSummary()
    console.log('\nDatabase reset and seed completed successfully.')
  } catch (error) {
    try {
      await client.query('rollback')
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError.message)
    }
    console.error('Reset/seed failed:', error.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main()
