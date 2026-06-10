import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { db } from './db.js';

const app = express();
const PORT = process.env.PORT || 7860;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory authentication state
let currentOtp = null; // { code, expiresAt }
const sessions = new Map(); // token -> { email, expiresAt }

// Helper: Parse User-Agent into simple readable OS and Browser
const parseUserAgent = (ua) => {
  if (!ua) return { os: 'Unknown OS', browser: 'Unknown Browser' };

  let os = 'Unknown OS';
  let browser = 'Unknown Browser';

  // OS Detection
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  // Browser Detection
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome') && !ua.includes('Chromium')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Opera') || ua.includes('OPR/')) browser = 'Opera';
  else if (ua.includes('MSIE') || ua.includes('Trident/')) browser = 'Internet Explorer';

  return { os, browser };
};

// Helper: Setup Nodemailer Transporter
const getMailTransporter = async () => {
  const user = process.env.SMTP_USER || 'giftcardexchange.gcx@gmail.com';
  const pass = process.env.SMTP_PASS || 'ldix efgh zdha yamt';

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // port 587 uses STARTTLS (secure: false)
    auth: {
      user,
      pass
    }
  });
};

// Middleware: Authenticate Admin Session
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Missing token.' });
  }

  const token = authHeader.split(' ')[1];
  const session = sessions.get(token);

  if (!session || Date.now() > session.expiresAt) {
    if (session) sessions.delete(token); // clean up expired session
    return res.status(401).json({ error: 'Session expired or invalid token.' });
  }

  req.adminSession = session;
  next();
};

// --- AUTHENTICATION ENDPOINTS ---

// POST: Request Login OTP
app.post('/api/auth/send-otp', async (req, res) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  currentOtp = { code: otp, expiresAt: Date.now() + 3600000 }; // Valid for 1 hour

  console.log("-----------------------------------------");
  console.log(`[AUTH] Generated OTP: ${otp} (Expires: ${new Date(currentOtp.expiresAt).toLocaleTimeString()})`);
  console.log("-----------------------------------------");

  // Extract client metadata for audit and security table
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
  const clientIp = typeof ip === 'string' ? ip.split(',')[0].trim() : ip;
  const uaString = req.headers['user-agent'] || '';
  const userAgentInfo = parseUserAgent(uaString);
  const timestamp = new Date().toUTCString();

  try {
    const transporter = await getMailTransporter();
    if (!transporter) {
      // Safe fallback: send success but OTP is logged to console
      return res.json({ success: true, message: 'OTP logged to terminal console (SMTP/Ethereal Offline).' });
    }

    const mailOptions = {
      from: '"GCX Security Operations" <giftcardexchange.gcx@gmail.com>',
      to: 'veltrix620@gmail.com',
      subject: '🔑 GCX Staff Verification Access Code',
      text: `Your verification passcode is: ${otp}. It was requested on ${timestamp} from IP ${clientIp} using ${userAgentInfo.browser} on ${userAgentInfo.os}.`,
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GCX Staff Verification Access Code</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Unbounded:wght@700;900&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; background-image: radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.02) 1px, transparent 1px); background-size: 20px 20px; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; color: #334155;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Floating Navbar Pill -->
        <table border="0" cellspacing="0" cellpadding="0" style="background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 9999px; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.02); margin-bottom: 25px;">
          <tr>
            <td style="padding: 10px 24px; text-align: center; vertical-align: middle;">
              <span style="display: inline-block; vertical-align: middle; width: 10px; height: 10px; background: linear-gradient(135deg, #00d2ff 0%, #0ea5e9 100%); border-radius: 50%; margin-right: 8px;"></span>
              <span style="font-family: 'Unbounded', 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 15px; font-weight: 800; color: #0f172a; letter-spacing: 1.5px; text-transform: uppercase; vertical-align: middle;">GCX</span>
            </td>
          </tr>
        </table>

        <!-- Main Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; width: 100%; background: #ffffff; border-radius: 24px; border: 1px solid rgba(15, 23, 42, 0.08); box-shadow: 0 20px 40px rgba(15, 23, 42, 0.03); overflow: hidden;">
          
          <!-- Colored Accent Line (matches website gradient brand) -->
          <tr>
            <td height="6" style="background: linear-gradient(90deg, #00d2ff 0%, #00f2fe 30%, #0ea5e9 70%, #6366f1 100%); line-height: 6px; font-size: 0px;">&nbsp;</td>
          </tr>

          <!-- Content Wrapper -->
          <tr>
            <td style="padding: 40px 40px 30px 40px;">
              
              <!-- Greeting & Header -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="left" style="font-family: 'Unbounded', 'Plus Jakarta Sans', -apple-system, sans-serif; color: #0f172a; font-size: 20px; font-weight: 700; padding-bottom: 12px;">
                    Staff Authorization
                  </td>
                </tr>
                <tr>
                  <td align="left" style="color: #64748b; font-size: 14px; line-height: 1.6; font-weight: 400;">
                    A secure authentication request was detected for the <strong style="color: #0f172a;">GCX Administrative Console</strong>. Please verify your identity by entering the one-time passcode (OTP) displayed below:
                  </td>
                </tr>
              </table>

              <!-- OTP Code Display Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f8fafc; border: 1.5px dashed rgba(14, 165, 233, 0.3); border-radius: 16px; margin-bottom: 28px;">
                <tr>
                  <td align="center" style="padding: 24px 20px;">
                    <div style="font-family: 'Space Mono', 'Courier New', Courier, monospace; font-size: 44px; font-weight: 700; letter-spacing: 12px; color: #0ea5e9; margin-left: 12px; line-height: 1;">
                      ${otp}
                    </div>
                    <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; margin-top: 10px;">
                      One-Time Passcode
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button (styled like GCX home page secondary pill - light blue background, clean border, text) -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td align="center">
                    <a href="http://localhost:5173/internal/staff/admin" target="_blank" style="display: inline-block; padding: 12px 32px; background-color: rgba(14, 165, 233, 0.06); border: 1.5px solid rgba(14, 165, 233, 0.25); border-radius: 9999px; color: #0ea5e9; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; transition: all 0.3s ease;">
                      Launch Administrative Console
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Metadata Log Details -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="left" style="color: #475569; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding-bottom: 10px;">
                    🔒 Security Log Info
                  </td>
                </tr>
                <tr>
                  <td>
                    <table width="100%" border="0" cellspacing="0" cellpadding="8" style="background-color: #f8fafc; border: 1px solid rgba(15, 23, 42, 0.06); border-radius: 12px; font-size: 13px; color: #64748b;">
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); font-weight: 600; width: 140px;">IP Address</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); color: #0f172a; font-family: 'Space Mono', monospace; font-weight: bold;">${clientIp}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); font-weight: 600;">Operating System</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); color: #0f172a;">${userAgentInfo.os}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); font-weight: 600;">Browser</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); color: #0f172a;">${userAgentInfo.browser}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 12px; font-weight: 600;">Timestamp</td>
                        <td style="padding: 8px 12px; color: #0f172a; font-family: 'Space Mono', monospace; font-size: 12px;">${timestamp}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Security Alert Notice -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td>
                    <table width="100%" border="0" cellspacing="0" cellpadding="12" style="background-color: rgba(220, 38, 38, 0.04); border: 1px solid rgba(220, 38, 38, 0.15); border-radius: 12px;">
                      <tr>
                        <td align="left" style="color: #dc2626; font-size: 12px; line-height: 1.6; font-weight: 400;">
                          <strong style="font-weight: 700;">Important Security Notice:</strong> This passcode is valid for a single session and expires in 1 hour. Do not share this passcode with anyone. GCX will never ask for your authentication codes.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Signature -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px solid rgba(15, 23, 42, 0.08); padding-top: 20px;">
                <tr>
                  <td align="left" style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
                    Best regards,<br>
                    <strong style="color: #64748b;">GCX Security</strong>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer Block matching main website footer in light mode -->
          <tr>
            <td align="center" style="background: #f8fafc; padding: 30px 40px; border-top: 1px solid rgba(15, 23, 42, 0.08);">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <span style="font-family: 'Unbounded', 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 13px; font-weight: 700; color: #0f172a; letter-spacing: 0.5px;">GCX</span>
                    <span style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 12px; color: #64748b; margin-left: 4px;">· Gift Card Exchange</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <a href="http://localhost:5173/privacy" style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none; margin: 0 10px;">Privacy</a>
                    <a href="http://localhost:5173/terms" style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none; margin: 0 10px;">Terms</a>
                    <a href="http://localhost:5173/support" style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none; margin: 0 10px;">Support</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
                    This is an automated operational transmission. Replies to this mailbox are unmonitored.<br>
                    &copy; 2026 GCX. All rights reserved.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
    };

    const info = await transporter.sendMail(mailOptions);

    if (transporter.options.host === 'smtp.ethereal.email') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[AUTH] Ethereal Email Sent! Preview URL: ${previewUrl}`);
      return res.json({
        success: true,
        message: 'OTP sent via Ethereal sandbox.',
        previewUrl
      });
    }

    res.json({ success: true, message: 'OTP sent successfully to veltrix620@gmail.com.' });
  } catch (err) {
    console.error("Failed to deliver OTP email:", err);
    res.json({
      success: true,
      message: 'OTP email delivery failed, code printed to terminal console.'
    });
  }
});

// POST: Verify Login OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const { otp } = req.body;

  if (!otp) {
    return res.status(400).json({ error: 'OTP code is required.' });
  }

  if (!currentOtp || currentOtp.code !== otp.trim() || Date.now() > currentOtp.expiresAt) {
    return res.status(401).json({ error: 'Invalid or expired OTP.' });
  }

  // Clear verified OTP
  currentOtp = null;

  // Generate 128-bit hex token
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 3600000; // 1 hour session

  sessions.set(token, {
    email: 'veltrix620@gmail.com',
    expiresAt
  });

  res.json({
    success: true,
    token,
    expiresAt
  });
});

// GET: Verify Active Session
app.get('/api/auth/verify-session', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false, error: 'Missing token' });
  }

  const token = authHeader.split(' ')[1];
  const session = sessions.get(token);

  if (!session || Date.now() > session.expiresAt) {
    if (session) sessions.delete(token);
    return res.status(401).json({ valid: false, error: 'Session invalid or expired' });
  }

  res.json({ valid: true, expiresAt: session.expiresAt });
});


// --- CARDS & VARIANTS ENDPOINTS ---

// GET: All cards with nested variants (PUBLIC)
app.get('/api/cards', async (req, res) => {
  try {
    const cards = await db.getCards();
    res.json(cards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// POST: Create a new card (AUTHENTICATED)
app.post('/api/cards', authenticateAdmin, async (req, res) => {
  const { name, img, tag, glow } = req.body;
  if (!name || !img || !tag || !glow) {
    return res.status(400).json({ error: 'Missing required card fields' });
  }
  try {
    const card = await db.createCard(name, img, tag, glow);
    res.status(211).json(card);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create card' });
  }
});

// PUT: Update a card (AUTHENTICATED)
app.put('/api/cards/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, img, tag, glow } = req.body;
  if (!name || !img || !tag || !glow) {
    return res.status(400).json({ error: 'Missing required card fields' });
  }
  res.status(501).json({ error: 'Update card not implemented' });
});

// DELETE: Delete a card (AUTHENTICATED)
app.delete('/api/cards/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const card = await db.deleteCard(id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    res.json({ message: 'Card deleted successfully', card });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

// POST: Add variant to card (AUTHENTICATED)
app.post('/api/cards/:card_id/variants', authenticateAdmin, async (req, res) => {
  const { card_id } = req.params;
  const { name, inr_rate, usdt_rate } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Missing required variant name' });
  }
  try {
    const variant = await db.createVariant(card_id, name, inr_rate, usdt_rate);
    if (!variant) {
      return res.status(404).json({ error: 'Associated card not found' });
    }
    res.status(211).json(variant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add variant' });
  }
});

// PUT: Update a variant (AUTHENTICATED)
app.put('/api/variants/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, inr_rate, usdt_rate } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Missing required variant name' });
  }
  try {
    const variant = await db.updateVariant(id, name, inr_rate, usdt_rate);
    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }
    res.json(variant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update variant' });
  }
});

// DELETE: Delete a variant (AUTHENTICATED)
app.delete('/api/variants/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const variant = await db.deleteVariant(id);
    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }
    res.json({ message: 'Variant deleted successfully', variant });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete variant' });
  }
});


// --- REVIEWS ENDPOINTS ---

// GET: All reviews (PUBLIC)
app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await db.getReviews();
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve reviews' });
  }
});

// POST: Submit a new review (PUBLIC FOR CUSTOMER TESTIMONIALS)
app.post('/api/reviews', async (req, res) => {
  const { name, role, avatar_url, quote, rating, trade_type, proof_image_url, region, gc_received_date, payment_sent_date } = req.body;

  if (!name || !quote || !trade_type || !proof_image_url) {
    return res.status(400).json({ error: 'Missing required fields. Note: Name, Review, Trade Type, and Proof Image are mandatory.' });
  }

  try {
    const review = await db.createReview(name, role, avatar_url, quote, rating, trade_type, proof_image_url, region, gc_received_date, payment_sent_date);
    res.status(211).json(review);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// DELETE: Delete a review (AUTHENTICATED)
app.delete('/api/reviews/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const review = await db.deleteReview(id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    res.json({ message: 'Review deleted successfully', review });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// PUT: Update a review (AUTHENTICATED)
app.put('/api/reviews/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, role, avatar_url, quote, rating, trade_type, proof_image_url, region, gc_received_date, payment_sent_date } = req.body;
  if (!name || !quote || !trade_type || !proof_image_url) {
    return res.status(400).json({ error: 'Missing required fields for update' });
  }
  try {
    const review = await db.updateReview(id, name, role, avatar_url, quote, rating, trade_type, proof_image_url, region, gc_received_date, payment_sent_date);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    res.json(review);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update review' });
  }
});


// --- PAYOUTS ENDPOINTS ---

// GET: All payouts (PUBLIC)
app.get('/api/payouts', async (req, res) => {
  try {
    const payouts = await db.getPayouts();
    res.json(payouts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve payouts' });
  }
});

// POST: Insert a single payout (AUTHENTICATED)
app.post('/api/payouts', authenticateAdmin, async (req, res) => {
  const { submission_date, payout_date, amount, card_type, method, status } = req.body;
  if (!submission_date || !payout_date || !amount || !card_type || !method) {
    return res.status(400).json({ error: 'Missing required payout fields' });
  }
  try {
    const payout = await db.createPayout(submission_date, payout_date, amount, card_type, method, status || 'Completed');
    res.status(211).json(payout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save payout record' });
  }
});

// POST: Batch insert multiple payouts (AUTHENTICATED)
app.post('/api/payouts/batch', authenticateAdmin, async (req, res) => {
  const { payouts } = req.body;
  if (!payouts || !Array.isArray(payouts) || payouts.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty batch payouts payload' });
  }
  try {
    const inserted = await db.createPayoutsBatch(payouts);
    res.status(211).json({ message: 'Batch payouts inserted successfully', count: inserted.length, payouts: inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to batch insert payouts', details: err.message });
  }
});

// PUT: Update a payout (AUTHENTICATED)
app.put('/api/payouts/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { submission_date, payout_date, amount, card_type, method, status } = req.body;
  if (!submission_date || !payout_date || !amount || !card_type || !method) {
    return res.status(400).json({ error: 'Missing required payout fields' });
  }
  try {
    const payout = await db.updatePayout(id, submission_date, payout_date, amount, card_type, method, status || 'Completed');
    if (!payout) {
      return res.status(404).json({ error: 'Payout record not found' });
    }
    res.json(payout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update payout' });
  }
});

// DELETE: Delete a payout (AUTHENTICATED)
app.delete('/api/payouts/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const payout = await db.deletePayout(id);
    if (!payout) {
      return res.status(404).json({ error: 'Payout record not found' });
    }
    res.json({ message: 'Payout record deleted successfully', payout });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete payout' });
  }
});


// --- APPEALS ENDPOINTS ---

// GET: All appeals (AUTHENTICATED - SENSITIVE PII)
app.get('/api/appeals', authenticateAdmin, async (req, res) => {
  try {
    const appeals = await db.getAppeals();
    res.json(appeals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve appeals' });
  }
});

// POST: Submit a new appeal (PUBLIC FOR DELAYED PAYOUT FILING)
app.post('/api/appeals', async (req, res) => {
  const { name, phone, card_type, email, payout_address, details } = req.body;
  if (!name || !phone || !card_type || !email || !payout_address) {
    return res.status(400).json({ error: 'Missing required appeal fields' });
  }
  try {
    const appeal = await db.createAppeal(name, phone, card_type, email, payout_address, details);
    res.status(211).json(appeal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit appeal' });
  }
});

// PUT: Update an appeal status (AUTHENTICATED)
app.put('/api/appeals/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, adminNotes } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Missing status' });
  }
  try {
    const appeal = await db.updateAppealStatus(id, status, adminNotes);
    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found' });
    }

    // Dispatch Email Notification to Appeal Owner
    try {
      const transporter = await getMailTransporter();
      if (transporter && appeal.email) {
        // Choose colors and theme based on         let themeColor = '#0ea5e9'; // Blue for Under Investigation, etc.
        let statusBadgeBg = 'rgba(14, 165, 233, 0.06)';
        let statusBadgeBorder = 'rgba(14, 165, 233, 0.2)';
        let statusEmoji = 'ℹ️';
        let statusTextColor = '#0ea5e9';

        if (status === 'Resolved') {
          themeColor = '#059669'; // Emerald Green
          statusBadgeBg = 'rgba(5, 150, 105, 0.06)';
          statusBadgeBorder = 'rgba(5, 150, 105, 0.2)';
          statusEmoji = '✅';
          statusTextColor = '#059669';
        } else if (status === 'Rejected') {
          themeColor = '#dc2626'; // Rose Red
          statusBadgeBg = 'rgba(220, 38, 38, 0.06)';
          statusBadgeBorder = 'rgba(220, 38, 38, 0.2)';
          statusEmoji = '🚫';
          statusTextColor = '#dc2626';
        }

        // Build HTML template
        let detailsHtml = '';
        if (status === 'Resolved') {
          detailsHtml = `
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 15px; margin-bottom: 24px;">
              <tr>
                <td style="color: #475569; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding-bottom: 10px; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;">
                  🔍 Findings & Explanations
                </td>
              </tr>
              <tr>
                <td style="background-color: #f8fafc; border: 1px solid rgba(15, 23, 42, 0.06); border-left: 4px solid #059669; border-radius: 12px; padding: 16px; color: #334155; font-size: 13.5px; line-height: 1.6; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;">
                  \${adminNotes || 'We identified a processing mistake on your ticket and it has been corrected.'}
                </td>
              </tr>
            </table>
          `;
        } else if (status === 'Rejected') {
          detailsHtml = `
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 15px; margin-bottom: 24px;">
              <tr>
                <td style="color: #475569; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding-bottom: 10px; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;">
                  📝 Reason for Rejection
                </td>
              </tr>
              <tr>
                <td style="background-color: #f8fafc; border: 1px solid rgba(15, 23, 42, 0.06); border-left: 4px solid #dc2626; border-radius: 12px; padding: 16px; color: #334155; font-size: 13.5px; line-height: 1.6; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;">
                  \${adminNotes || 'The details provided could not be verified or did not meet the requirements.'}
                </td>
              </tr>
            </table>
          `;
        }

        const userMailOptions = {
          from: '"GCX Support Operations" <giftcardexchange.gcx@gmail.com>',
          to: appeal.email,
          subject: `${statusEmoji} GCX Appeal Status Update: ${status}`,
          text: `Dear ${appeal.name},\n\nYour appeal (ID: ${appeal.id}) regarding ${appeal.card_type} has been updated to: ${status}.\n\n${adminNotes ? 'Admin notes: ' + adminNotes + '\n\n' : ''}We will inform you further in case of any updates.\n\nBest regards,\nGCX Support Team`,
          html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GCX Appeal Status Update</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Unbounded:wght@700;900&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; background-image: radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.02) 1px, transparent 1px); background-size: 20px 20px; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; color: #334155;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Floating Navbar Pill -->
        <table border="0" cellspacing="0" cellpadding="0" style="background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 9999px; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.02); margin-bottom: 25px;">
          <tr>
            <td style="padding: 10px 24px; text-align: center; vertical-align: middle;">
              <span style="display: inline-block; vertical-align: middle; width: 10px; height: 10px; background: linear-gradient(135deg, #00d2ff 0%, #0ea5e9 100%); border-radius: 50%; margin-right: 8px;"></span>
              <span style="font-family: 'Unbounded', 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 15px; font-weight: 800; color: #0f172a; letter-spacing: 1.5px; text-transform: uppercase; vertical-align: middle;">GCX</span>
            </td>
          </tr>
        </table>

        <!-- Main Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; width: 100%; background: #ffffff; border-radius: 24px; border: 1px solid rgba(15, 23, 42, 0.08); box-shadow: 0 20px 40px rgba(15, 23, 42, 0.03); overflow: hidden;">
          
          <!-- Colored Accent Line (matches status color dynamically) -->
          <tr>
            <td height="6" style="background: ${themeColor}; line-height: 6px; font-size: 0px;">&nbsp;</td>
          </tr>

          <!-- Content Wrapper -->
          <tr>
            <td style="padding: 40px 40px 30px 40px;">
              
              <!-- Greeting & Header -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="left" style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 14px; font-weight: 600; color: #64748b; padding-bottom: 4px;">
                    Dear ${appeal.name},
                  </td>
                </tr>
                <tr>
                  <td align="left" style="font-family: 'Unbounded', 'Plus Jakarta Sans', -apple-system, sans-serif; color: #0f172a; font-size: 20px; font-weight: 700; padding-bottom: 12px;">
                    Appeal Update
                  </td>
                </tr>
                <tr>
                  <td align="left" style="color: #64748b; font-size: 14px; line-height: 1.6; font-weight: 400;">
                    We are writing to inform you that the status of your payout appeal has been updated by our staff security operations.
                  </td>
                </tr>
              </table>

              <!-- Status Display Badge (pill styled, matching homepage branding) -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${statusBadgeBg}; border: 1.5px solid ${statusBadgeBorder}; border-radius: 16px; margin-bottom: 24px;">
                <tr>
                  <td align="center" style="padding: 20px 20px;">
                    <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px;">
                      Current Appeal Status
                    </div>
                    <div style="font-family: 'Unbounded', 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 18px; font-weight: 800; color: ${statusTextColor}; letter-spacing: 0.5px; text-transform: uppercase;">
                      ${statusEmoji} ${status}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Dynamic Details (Reason / Findings Quote Card) -->
              ${detailsHtml}

              <!-- Ticket Details Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 15px; margin-bottom: 24px;">
                <tr>
                  <td align="left" style="color: #475569; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding-bottom: 10px;">
                    📋 Ticket Details
                  </td>
                </tr>
                <tr>
                  <td>
                    <table width="100%" border="0" cellspacing="0" cellpadding="8" style="background-color: #f8fafc; border: 1px solid rgba(15, 23, 42, 0.06); border-radius: 12px; font-size: 13px; color: #64748b;">
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); font-weight: 600; width: 140px;">Appeal Ticket ID</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); color: #0f172a; font-family: 'Space Mono', monospace; font-weight: bold;">#${appeal.id}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); font-weight: 600;">Gift Card Brand</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); color: #0f172a;">${appeal.card_type}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); font-weight: 600;">Payout Address</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(15, 23, 42, 0.04); color: #0f172a; font-family: 'Space Mono', monospace; font-size: 11px;">${appeal.payout_address}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 12px; font-weight: 600;">Submission Date</td>
                        <td style="padding: 8px 12px; color: #0f172a; font-family: 'Space Mono', monospace; font-size: 12px;">${new Date(appeal.created_at).toUTCString()}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Next Steps Notice -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <table width="100%" border="0" cellspacing="0" cellpadding="12" style="background-color: rgba(14, 165, 233, 0.04); border: 1px solid rgba(14, 165, 233, 0.15); border-radius: 12px;">
                      <tr>
                        <td align="left" style="color: #0284c7; font-size: 12px; line-height: 1.6; font-weight: 400;">
                          <strong style="color: #0369a1; font-weight: 700;">What happens next:</strong> Our support department monitors resolving transactions closely. <strong style="color: #0f172a;">We will inform you further</strong> of any additional developments or bank transfers concerning this ticket. No further action is required from you at this time.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Signature -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px solid rgba(15, 23, 42, 0.08); padding-top: 20px;">
                <tr>
                  <td align="left" style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
                    Best regards,<br>
                    <strong style="color: #64748b;">GCX Support</strong>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer Block matching main website footer in light mode -->
          <tr>
            <td align="center" style="background: #f8fafc; padding: 30px 40px; border-top: 1px solid rgba(15, 23, 42, 0.08);">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <span style="font-family: 'Unbounded', 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 13px; font-weight: 700; color: #0f172a; letter-spacing: 0.5px;">GCX</span>
                    <span style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 12px; color: #64748b; margin-left: 4px;">· Gift Card Exchange</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <a href="http://localhost:5173/privacy" style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none; margin: 0 10px;">Privacy</a>
                    <a href="http://localhost:5173/terms" style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none; margin: 0 10px;">Terms</a>
                    <a href="http://localhost:5173/support" style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none; margin: 0 10px;">Support</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
                    This is an automated operational transmission regarding appeal ticket #${appeal.id}.<br>
                    &copy; 2026 GCX. All rights reserved.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
        };

        const info = await transporter.sendMail(userMailOptions);
        console.log(`[APPEAL UPDATE] Status update email sent to ${appeal.email}. MessageId: ${info.messageId}`);
      }
    } catch (mailErr) {
      console.error("[APPEAL UPDATE] Failed to send status update email to user:", mailErr);
    }

    res.json(appeal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update appeal status' });
  }
});

// DELETE: Delete an appeal (AUTHENTICATED)
app.delete('/api/appeals/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const appeal = await db.deleteAppeal(id);
    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found' });
    }
    res.json({ message: 'Appeal deleted successfully', appeal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete appeal' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`GCX Backend is running on port ${PORT}`);
});
