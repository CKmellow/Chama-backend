// src/services/darajaService.js
import axios from 'axios'

const consumerKey = process.env.DARAJA_CONSUMER_KEY
const consumerSecret = process.env.DARAJA_CONSUMER_SECRET
const shortcode = process.env.DARAJA_SHORTCODE // e.g. 174379
const passkey = process.env.DARAJA_PASSKEY // get from Safaricom portal
const callbackUrl = process.env.DARAJA_CALLBACK_URL // your webhook endpoint

// Get Daraja access token
export async function getDarajaToken() {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
  const { data } = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  )
  return data.access_token
}

// Initiate STK Push
export async function sendStkPush({ phone, amount, accountRef, transactionDesc }) {
  const token = await getDarajaToken()
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)
  const password = Buffer.from(shortcode + passkey + timestamp).toString('base64')
  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: accountRef,
    TransactionDesc: transactionDesc,
  }
  console.log('STK Push payload:', payload)
  try {
    const { data } = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return data
  } catch (err) {
    if (err.response) {
      console.error('Daraja API error:', err.response.data)
      throw new Error(JSON.stringify(err.response.data))
    } else {
      console.error('Daraja API error:', err.message)
      throw err
    }
  }
}
