require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic security middleware
app.use(helmet());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// rate limiter (basic)
const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use(limiter);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function todayFilename(date = new Date()) {
  const d = date;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}.xlsx`;
}

// Canonical field map: map various incoming names to desired column headers
const FIELD_MAP = {
  LoanAmount: 'LoanAmount',
  MonthlyIncome: 'MonthlyIncome',
  Mobile: 'Mobile',
  Email: 'Email',
  PAN1: 'PAN',
  DOB: 'DOB',
  company: 'Company',
  City: 'City',
  Pincode: 'Pincode',
  Occupation: 'Occupation'
};

function normalizeRecord(raw) {
  const out = {};
  for (const k of Object.keys(raw)) {
    const target = FIELD_MAP[k] || FIELD_MAP[k.trim()] || k;
    out[target] = raw[k];
  }
  return out;
}
 

async function appendToDailyExcel(record, date = new Date()) {
  const fname = path.join(DATA_DIR, todayFilename(date));
  const workbook = new ExcelJS.Workbook();
  let worksheet;

  if (false && fs.existsSync(fname)) {
      await workbook.xlsx.readFile(fname);
      worksheet = workbook.worksheets[0];

      // Attempt to read existing headers from first row; fallback to worksheet.columns
      const firstRowVals = (worksheet.getRow(1) && worksheet.getRow(1).values) || [];
      const existingHeaders = (firstRowVals.length > 1 && firstRowVals.slice(1).map(h => (h === null ? '' : String(h))))
        .filter(h => h !== '') || (worksheet.columns ? worksheet.columns.map(c => c.header) : []);

      const incomingKeys = Object.keys(record);
      let allHeaders = Array.from(new Set([...existingHeaders, ...incomingKeys]));
      allHeaders = allHeaders.map(h => (h === null || h === undefined ? '' : String(h).trim())).filter(h => h !== '');
      if (!allHeaders.includes('added_at')) allHeaders.push('added_at');

      // Extract existing data rows (map to existingHeaders)
      const existingData = [];
      const lastRow = worksheet.rowCount;
      for (let r = 2; r <= lastRow; r++) {
        const row = worksheet.getRow(r);
        const vals = (row && row.values) ? row.values.slice(1) : [];
        const mapped = {};
        for (let i = 0; i < existingHeaders.length; i++) {
          mapped[existingHeaders[i]] = vals[i] !== undefined ? vals[i] : '';
        }
        // include rows that have any non-empty value
        if (Object.values(mapped).some(v => v !== '' && v !== null && v !== undefined)) existingData.push(mapped);
      }

      // Remove the old worksheet and recreate a clean one with correct headers
      const oldName = worksheet.name || 'submissions';
      const oldId = worksheet.id;
      workbook.removeWorksheet(oldId);
      const newSheet = workbook.addWorksheet(oldName);
      newSheet.columns = allHeaders.map(h => ({ header: h, key: h, width: 25 }));
      for (let i = 0; i < allHeaders.length; i++) {
        newSheet.getCell(1, i + 1).value = allHeaders[i];
      }

      // Re-populate previous rows aligned to allHeaders
      for (const prev of existingData) {
        const rowVals = allHeaders.map(h => (h === 'added_at' ? (prev[h] || '') : (prev[h] || '')));
        newSheet.addRow(rowVals);
      }

      // Append the new record
      const newRowVals = allHeaders.map(h => (h === 'added_at' ? new Date().toISOString() : (record[h] || '')));
      newSheet.addRow(newRowVals);
  } else {
    worksheet = workbook.addWorksheet('submissions');
    let headers = Object.keys(record).map(h => (h === null || h === undefined ? '' : String(h).trim()));
    headers = headers.filter(h => h !== '');
    headers.push('added_at');
    worksheet.columns = headers.map(h => ({ header: h, key: h, width: 25 }));
    // write header row explicitly (assign per-cell to avoid accidental shifts)
    for (let i = 0; i < headers.length; i++) {
      worksheet.getCell(1, i + 1).value = headers[i];
    }
    const rowValues = headers.map(h => (h === 'added_at' ? new Date().toISOString() : (record[h] || '')));
    worksheet.addRow(rowValues);
  }

  await workbook.xlsx.writeFile(fname);
  return fname;
}

function makeTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) throw new Error('SMTP credentials missing in env');

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

// Simple concurrency limiter for email sends (defaults to 2 concurrent sends)
const EMAIL_CONCURRENCY = Number(process.env.EMAIL_CONCURRENCY || 2);
let emailActive = 0;
const emailQueue = [];

function acquireEmailSlot() {
  return new Promise((resolve) => {
    if (emailActive < EMAIL_CONCURRENCY) {
      emailActive += 1;
      return resolve();
    }
    emailQueue.push(resolve);
  });
}

function releaseEmailSlot() {
  emailActive = Math.max(0, emailActive - 1);
  if (emailQueue.length > 0) {
    emailActive += 1;
    const next = emailQueue.shift();
    next();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Send with retry and exponential backoff. attempts includes the first try (e.g., attempts=3 -> 3 tries)
async function sendWithRetry(transporter, mailOptions, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      return { ok: true, info };
    } catch (err) {
      lastErr = err;
      const backoff = Math.pow(2, i) * 1000; // 1s, 2s, 4s ...
      console.warn(`Email send attempt ${i + 1} failed, backing off ${backoff}ms`, err && err.message);
      await sleep(backoff);
    }
  }
  return { ok: false, error: lastErr };
}

async function sendDailyEmailForDate(date = new Date()) {
  const fname = path.join(DATA_DIR, todayFilename(date));
  if (!fs.existsSync(fname)) {
    console.log('No file for', todayFilename(date));
    return { ok: false, message: 'No file' };
  }

  const transporter = makeTransporter();
  const to = process.env.NOTIFY_TO || process.env.SMTP_USER;
  const subject = `CredBazar submissions - ${todayFilename(date).replace('.xlsx','')}`;

  const mailOptions = {
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to,
    subject,
    text: `Attached is the submissions file for ${todayFilename(date)}`,
    attachments: [{ filename: path.basename(fname), path: fname }]
  };

  // Acquire slot to respect concurrency limit
  await acquireEmailSlot();
  try {
    const result = await sendWithRetry(transporter, mailOptions, Number(process.env.EMAIL_RETRIES || 3));
    if (!result.ok) {
      console.error('Failed to send email after retries', result.error);
      return { ok: false, error: String(result.error) };
    }
    console.log('Sent daily file:', fname);
    return { ok: true, file: fname, info: result.info };
  } finally {
    releaseEmailSlot();
  }
}

// Schedule: send today's file at 23:59 server time every day
cron.schedule('59 23 * * *', async () => {
  try {
    console.log('Cron job running: sending today file');
    await sendDailyEmailForDate(new Date());
  } catch (err) {
    console.error('Cron send failed', err);
  }
});

// Store OTP attempts in memory (in production, use Redis or database)
const otpStore = new Map();
const OTP_RESEND_COOLDOWN = 2 * 60 * 1000; // 2 minutes in milliseconds

function generateOTP(length = 6) {
  return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
}

// OTP Sending endpoint - integrate with your third-party API
app.post('/send-otp', async (req, res) => {
  try {
    const { mobile } = req.body;
    
    // Validate mobile number
    if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({ ok: false, error: 'Invalid mobile number' });
    }

    // Check if OTP was recently sent for this mobile number
    const existingOTP = otpStore.get(mobile);
    if (existingOTP) {
      const timeSinceLastOTP = Date.now() - existingOTP.timestamp;
      if (timeSinceLastOTP < OTP_RESEND_COOLDOWN) {
        const remainingSeconds = Math.ceil((OTP_RESEND_COOLDOWN - timeSinceLastOTP) / 1000);
        return res.status(429).json({ 
          ok: false, 
          error: `Please wait ${remainingSeconds} seconds before requesting a new OTP`,
          remainingTime: remainingSeconds
        });
      }
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with expiry (10 minutes)
    otpStore.set(mobile, {
      otp,
      timestamp: Date.now(),
      attempts: 0,
      verified: false
    });

    // Call third-party OTP API
    const otpResult = await sendOTPViaThirdParty(mobile, otp);
    
    if (!otpResult.success) {
      return res.status(500).json({ ok: false, error: 'Failed to send OTP' });
    }

    console.log(`OTP sent to ${mobile}: ${otp}`); // Remove in production
    
    res.json({ 
      ok: true, 
      message: 'OTP sent successfully',
      mobile: mobile.slice(-4).padStart(10, '*') // Return masked mobile
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// OTP Verification endpoint
app.post('/verify-otp', async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    
    if (!mobile || !otp) {
      return res.status(400).json({ ok: false, error: 'Mobile and OTP required' });
    }

    const otpData = otpStore.get(mobile);
    
    if (!otpData) {
      return res.status(400).json({ ok: false, error: 'OTP expired or not sent' });
    }

    // Check OTP expiry (10 minutes)
    if (Date.now() - otpData.timestamp > 10 * 60 * 1000) {
      otpStore.delete(mobile);
      return res.status(400).json({ ok: false, error: 'OTP expired' });
    }

    // Check attempt limit
    if (otpData.attempts >= 3) {
      otpStore.delete(mobile);
      return res.status(400).json({ ok: false, error: 'Too many attempts. Request new OTP' });
    }

    // Verify OTP
    if (otpData.otp !== otp.trim()) {
      otpData.attempts += 1;
      return res.status(400).json({ ok: false, error: 'Invalid OTP' });
    }

    // Mark as verified
    otpData.verified = true;
    
    res.json({ ok: true, message: 'OTP verified successfully' });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Third-party OTP API integration
async function sendOTPViaThirdParty(mobile, otp) {
  try {
    // For now, just log the OTP (demo/testing mode)
    // Remove this when you're ready to integrate with actual OTP service
    console.log(`[OTP] Sending OTP ${otp} to ${mobile}`);
    return { success: true };
    
    /* Uncomment below when ready to use actual OTP service
    const axios = require('axios');
    
    const OTP_API_URL = process.env.OTP_API_URL || 'https://api.example-otp.com/send';
    const OTP_API_KEY = process.env.OTP_API_KEY;
    
    if (!OTP_API_KEY) {
      console.log(`[DEMO] Sending OTP ${otp} to ${mobile}`);
      return { success: true };
    }
    
    const response = await axios.post(OTP_API_URL, {
      mobile: mobile,
      otp: otp,
      message: `Your CredBazar OTP is: ${otp}. Valid for 10 minutes.`
    }, {
      headers: {
        'Authorization': `Bearer ${OTP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    
    return { success: response.status === 200 || response.data.success };
    */
    
  } catch (err) {
    console.error('OTP service error:', err.message);
    return { success: false, error: err.message };
  }
}

// POST handler: normalize, append, and email the day's file on every submission
app.post('/submit-loan', async (req, res) => {
  try {
    const { mobile } = req.body;
    
    // Check if mobile OTP is verified
    const otpData = otpStore.get(mobile);
    if (!otpData || !otpData.verified) {
      return res.status(400).json({ ok: false, error: 'Mobile number not verified. Please verify OTP first.' });
    }
    
    const normalized = normalizeRecord(req.body || {});
    const filePath = await appendToDailyExcel(normalized);

    // Clear OTP after successful submission
    otpStore.delete(mobile);

    // Send today's file as attachment on every submission
    try {
      await sendDailyEmailForDate(new Date());
    } catch (emailErr) {
      console.error('Failed to send email after append:', emailErr);
      // continue — still return success for the append
      return res.status(200).json({ ok: true, file: path.basename(filePath), email: false, emailError: String(emailErr) });
    }

    res.json({ ok: true, file: path.basename(filePath), email: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Manual trigger to send today's file (protected by simple token in env)
app.post('/send-today', async (req, res) => {
  try {
    const key = process.env.SEND_TRIGGER_KEY;
    if (key && req.headers['x-send-key'] !== key) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const result = await sendDailyEmailForDate(new Date());
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Repair XLSX files: fixes sheets where header row has a leading empty column
async function repairXlsxFile(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  let changed = false;

  workbook.worksheets.forEach(ws => {
    const firstRowVals = (ws.getRow(1) && ws.getRow(1).values) || [];
    // if first column empty and second column has text => likely shifted headers
    if ((firstRowVals[1] === null || firstRowVals[1] === '' || firstRowVals[1] === undefined) && firstRowVals[2]) {
      const oldHeaders = firstRowVals.slice(1).map(h => (h === null || h === undefined) ? '' : String(h));
      // new headers remove leading empty
      const newHeaders = oldHeaders.map(h => (h === null || h === undefined ? '' : String(h).trim())).filter(h => h !== '');

      // collect existing data rows
      const rows = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const vals = (row && row.values) ? row.values.slice(1) : [];
        rows.push(vals.map(v => v === undefined ? '' : v));
      }

      // recreate sheet
      const name = ws.name || 'submissions';
      const id = ws.id;
      workbook.removeWorksheet(id);
      const newWs = workbook.addWorksheet(name);
      newWs.columns = newHeaders.map(h => ({ header: h, key: h, width: 25 }));
      for (let i = 0; i < newHeaders.length; i++) {
        newWs.getCell(1, i + 1).value = newHeaders[i];
      }

      const shift = oldHeaders.length === newHeaders.length + 1 ? 1 : 0;
      rows.forEach(vals => {
        const shifted = vals.slice(shift);
        // pad to length
        while (shifted.length < newHeaders.length) shifted.push('');
        newWs.addRow(shifted);
      });

      changed = true;
    }
  });

  if (changed) await workbook.xlsx.writeFile(filePath);
  return changed;
}

// Protected endpoint to repair all XLSX files in data folder
app.post('/repair-xlsx', async (req, res) => {
  try {
    const key = process.env.SEND_TRIGGER_KEY;
    if (key && req.headers['x-send-key'] !== key) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.xlsx'));
    const results = [];
    for (const f of files) {
      const full = path.join(DATA_DIR, f);
      try {
        const changed = await repairXlsxFile(full);
        results.push({ file: f, repaired: changed });
      } catch (err) {
        results.push({ file: f, error: String(err) });
      }
    }
    res.json({ ok: true, results });
  } catch (err) {
    console.error('Repair endpoint failed', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/', (req, res) => res.send('CredBazar form collector running'));

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
