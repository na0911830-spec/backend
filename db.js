import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import fs from 'fs';
import path from 'path';

neonConfig.webSocketConstructor = ws;

const connectionString = "postgresql://neondb_owner:npg_UHpmhfV89sYd@ep-purple-lab-aol9tfl4.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

const LOCAL_DB_PATH = path.resolve('database.json');

const defaultLocalData = {
  cards: [
    { id: 1, name: "Amazon", img: "amazon", tag: "Shopping", glow: "rgba(255, 153, 0, 0.4)", variants: [{ id: 1, name: "arena100", inr_rate: "100 INR", usdt_rate: "0.91 USDT" }] },
    { id: 2, name: "Flipkart", img: "flipkart", tag: "Shopping", glow: "rgba(40, 116, 240, 0.4)", variants: [{ id: 3, name: "e-Gift Voucher", inr_rate: "90 INR", usdt_rate: null }] },
    { id: 3, name: "Roblox", img: "roblox", tag: "Gaming", glow: "rgba(239, 68, 68, 0.4)", variants: [{ id: 4, name: "Gift Card", inr_rate: null, usdt_rate: "88 USDT" }] },
    { id: 4, name: "League of Legends", img: "lol", tag: "Gaming", glow: "rgba(197, 168, 128, 0.35)", variants: [{ id: 5, name: "RP Gift Card", inr_rate: null, usdt_rate: "86 USDT" }] },
    { id: 5, name: "Overwatch 2", img: "overwatch", tag: "Gaming", glow: "rgba(240, 100, 20, 0.4)", variants: [{ id: 6, name: "Coins Gift Card", inr_rate: null, usdt_rate: "84 USDT" }] },
    { id: 6, name: "Sea of Thieves", img: "sot", tag: "Gaming", glow: "rgba(16, 185, 129, 0.4)", variants: [{ id: 7, name: "Ancient Coins Pack", inr_rate: null, usdt_rate: "82 USDT" }] },
  ],
  payouts: [
    { id: 1, submission_date: "2026-05-08T00:00:00.000Z", payout_date: "2026-05-15T00:00:00.000Z", amount: "N/A", card_type: "All Cards", method: "Any", status: "Submission Closed" },
    { id: 2, submission_date: "2026-05-16T00:00:00.000Z", payout_date: "2026-05-23T00:00:00.000Z", amount: "N/A", card_type: "All Cards", method: "Any", status: "Submission Closed" },
    { id: 3, submission_date: "2026-06-08T00:00:00.000Z", payout_date: "2026-06-15T00:00:00.000Z", amount: "N/A", card_type: "All Cards", method: "Any", status: "Submission Open" },
  ],
  reviews: [
    {
      id: 1,
      name: "Aarav Sharma",
      role: "Casual Gamer",
      avatar_url: "",
      quote: "Had a ₹5,000 Amazon card sitting around from my birthday. Swapped it for UPI cash easily. The transaction felt extremely transparent.",
      rating: 5,
      trade_type: "Amazon ➔ UPI",
      proof_image_url: "https://i.ibb.co/4DcNDpt/x.png",
      region: "US",
      gc_received_date: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
      payment_sent_date: new Date().toISOString(),
      created_at: new Date().toISOString()
    }
  ],
  appeals: []
};

let useLocalDb = false;
let pool = null;

// Initialize connection
const initDb = async () => {
  pool = new Pool({ connectionString });
  pool.on('error', (err) => {
    console.error('Unexpected error on idle Neon PostgreSQL client:', err.message || err);
    useLocalDb = true;
  });
  try {
    // Try to query the database with a 3.5-second timeout limit
    console.log("Attempting connection to Neon PostgreSQL...");
    const client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Database connection timeout")), 3500))
    ]);

    // Ensure database tables exist
    console.log("Ensuring database tables exist...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        img VARCHAR(255) NOT NULL,
        tag VARCHAR(50) NOT NULL,
        glow VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS card_variants (
        id SERIAL PRIMARY KEY,
        card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        inr_rate VARCHAR(50),
        usdt_rate VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(100) DEFAULT 'Customer',
        avatar_url VARCHAR(255),
        quote TEXT NOT NULL,
        rating INTEGER DEFAULT 5,
        trade_type VARCHAR(100) NOT NULL,
        proof_image_url VARCHAR(255) NOT NULL,
        verified BOOLEAN DEFAULT TRUE,
        region VARCHAR(50),
        gc_received_date TIMESTAMP,
        payment_sent_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check and add missing columns dynamically if table already exists
    await client.query(`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS region VARCHAR(50);
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS gc_received_date TIMESTAMP;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS payment_sent_date TIMESTAMP;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id SERIAL PRIMARY KEY,
        submission_date TIMESTAMP NOT NULL,
        payout_date TIMESTAMP NOT NULL,
        amount VARCHAR(50) NOT NULL,
        card_type VARCHAR(100) NOT NULL,
        method VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'Completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS appeals (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        card_type VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        payout_address VARCHAR(255) NOT NULL,
        details TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check and add missing columns dynamically if table already exists
    await client.query(`
      ALTER TABLE appeals ADD COLUMN IF NOT EXISTS admin_notes TEXT;
    `);

    // --- AUTO-SEED DATA IF TABLES ARE EMPTY ---
    console.log("Checking if seeding is required...");
    const cardCountRes = await client.query("SELECT COUNT(*) FROM cards");
    const cardCount = parseInt(cardCountRes.rows[0].count, 10);
    if (cardCount === 0) {
      console.log("Seeding cards database...");
      
      const seedCards = [
        { name: "Amazon", img: "amazon", tag: "Shopping", glow: "rgba(255, 153, 0, 0.4)", variants: [{ name: "arena100", inr_rate: "100 INR", usdt_rate: "0.91 USDT" }] },
        { name: "Flipkart", img: "flipkart", tag: "Shopping", glow: "rgba(40, 116, 240, 0.4)", variants: [{ name: "e-Gift Voucher", inr_rate: "90 INR", usdt_rate: null }] },
        { name: "Roblox", img: "roblox", tag: "Gaming", glow: "rgba(239, 68, 68, 0.4)", variants: [{ name: "Gift Card", inr_rate: null, usdt_rate: "88 USDT" }] },
        { name: "League of Legends", img: "lol", tag: "Gaming", glow: "rgba(197, 168, 128, 0.35)", variants: [{ name: "RP Gift Card", inr_rate: null, usdt_rate: "86 USDT" }] },
        { name: "Overwatch 2", img: "overwatch", tag: "Gaming", glow: "rgba(240, 100, 20, 0.4)", variants: [{ name: "Coins Gift Card", inr_rate: null, usdt_rate: "84 USDT" }] },
        { name: "Sea of Thieves", img: "sot", tag: "Gaming", glow: "rgba(16, 185, 129, 0.4)", variants: [{ name: "Ancient Coins Pack", inr_rate: null, usdt_rate: "82 USDT" }] }
      ];

      for (const card of seedCards) {
        const cardRes = await client.query(
          "INSERT INTO cards (name, img, tag, glow) VALUES ($1, $2, $3, $4) RETURNING id",
          [card.name, card.img, card.tag, card.glow]
        );
        const cardId = cardRes.rows[0].id;
        for (const variant of card.variants) {
          await client.query(
            "INSERT INTO card_variants (card_id, name, inr_rate, usdt_rate) VALUES ($1, $2, $3, $4)",
            [cardId, variant.name, variant.inr_rate || null, variant.usdt_rate || null]
          );
        }
      }
      console.log("Seeding cards completed.");
    }

    const reviewCountRes = await client.query("SELECT COUNT(*) FROM reviews");
    const reviewCount = parseInt(reviewCountRes.rows[0].count, 10);
    if (reviewCount === 0) {
      console.log("Seeding reviews...");
      await client.query(`
        INSERT INTO reviews (name, role, quote, rating, trade_type, proof_image_url) VALUES 
        ('Aarav Sharma', 'Casual Gamer', 'Had a ₹5,000 Amazon card sitting around from my birthday. Swapped it for UPI cash easily. The transaction felt extremely transparent.', 5, 'Amazon ➔ UPI', 'https://i.ibb.co/4DcNDpt/x.png');
      `);
      console.log("Seeding reviews completed.");
    }

    const payoutCountRes = await client.query("SELECT COUNT(*) FROM payouts");
    const payoutCount = parseInt(payoutCountRes.rows[0].count, 10);
    if (payoutCount === 0) {
      console.log("Seeding payouts...");
      await client.query(`
        INSERT INTO payouts (submission_date, payout_date, amount, card_type, method, status) VALUES 
        ('2026-05-08T00:00:00.000Z', '2026-05-15T00:00:00.000Z', 'N/A', 'All Cards', 'Any', 'Submission Closed'),
        ('2026-05-16T00:00:00.000Z', '2026-05-23T00:00:00.000Z', 'N/A', 'All Cards', 'Any', 'Submission Closed'),
        ('2026-06-08T00:00:00.000Z', '2026-06-15T00:00:00.000Z', 'N/A', 'All Cards', 'Any', 'Submission Open');
      `);
      console.log("Seeding payouts completed.");
    }

    client.release();
    console.log("=================================================");
    console.log("Neon PostgreSQL Connected successfully via WebSocket!");
    console.log("=================================================");
    useLocalDb = false;
  } catch (err) {
    console.warn("=================================================");
    console.warn("WARNING: Neon PostgreSQL connection failed or timed out.");
    console.warn("Detail:", err.message);
    console.warn("GCX Backend is automatically falling back to Local JSON database.");
    console.warn("Local storage file path:", LOCAL_DB_PATH);
    console.warn("=================================================");
    useLocalDb = true;
  }
};

await initDb();

// Local DB Helpers
function readLocalDb() {
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(defaultLocalData, null, 2));
    return defaultLocalData;
  }
  try {
    const data = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return defaultLocalData;
  }
}

function writeLocalDb(data) {
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2));
}

// Database API wrapper
export const db = {
  // --- CARDS ---
  getCards: async () => {
    if (!useLocalDb) {
      try {
        const query = `
          SELECT c.id, c.name, c.img, c.tag, c.glow,
                 COALESCE(
                   json_agg(
                     json_build_object('id', v.id, 'name', v.name, 'inr_rate', v.inr_rate, 'usdt_rate', v.usdt_rate)
                   ) FILTER (WHERE v.id IS NOT NULL),
                   '[]'::json
                 ) as variants
          FROM cards c
          LEFT JOIN card_variants v ON c.id = v.card_id
          GROUP BY c.id
          ORDER BY c.id ASC;
        `;
        const res = await pool.query(query);
        return res.rows;
      } catch (err) {
        console.error("Postgres failed, switching to local DB on-the-fly", err);
        useLocalDb = true;
      }
    }
    return readLocalDb().cards;
  },

  createCard: async (name, img, tag, glow) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query(
          'INSERT INTO cards (name, img, tag, glow) VALUES ($1, $2, $3, $4) RETURNING *',
          [name, img, tag, glow]
        );
        const card = res.rows[0];
        card.variants = [];
        return card;
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    const newCard = { id: Date.now(), name, img, tag, glow, variants: [] };
    data.cards.push(newCard);
    writeLocalDb(data);
    return newCard;
  },

  deleteCard: async (id) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query('DELETE FROM cards WHERE id = $1 RETURNING *', [parseInt(id, 10)]);
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    const card = data.cards.find(c => c.id == id);
    data.cards = data.cards.filter(c => c.id != id);
    writeLocalDb(data);
    return card;
  },

  // --- VARIANTS ---
  createVariant: async (cardId, name, inrRate, usdtRate) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query(
          'INSERT INTO card_variants (card_id, name, inr_rate, usdt_rate) VALUES ($1, $2, $3, $4) RETURNING *',
          [parseInt(cardId, 10), name, inrRate || null, usdtRate || null]
        );
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    const card = data.cards.find(c => c.id == cardId);
    if (card) {
      const newVar = { id: Date.now(), name, inr_rate: inrRate || null, usdt_rate: usdtRate || null };
      card.variants = card.variants || [];
      card.variants.push(newVar);
      writeLocalDb(data);
      return newVar;
    }
    return null;
  },

  updateVariant: async (id, name, inrRate, usdtRate) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query(
          'UPDATE card_variants SET name = $1, inr_rate = $2, usdt_rate = $3 WHERE id = $4 RETURNING *',
          [name, inrRate || null, usdtRate || null, parseInt(id, 10)]
        );
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    let updated = null;
    data.cards.forEach(c => {
      if (c.variants) {
        const v = c.variants.find(varItem => varItem.id == id);
        if (v) {
          v.name = name;
          v.inr_rate = inrRate || null;
          v.usdt_rate = usdtRate || null;
          updated = v;
        }
      }
    });
    writeLocalDb(data);
    return updated;
  },

  deleteVariant: async (id) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query('DELETE FROM card_variants WHERE id = $1 RETURNING *', [parseInt(id, 10)]);
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    let deleted = null;
    data.cards.forEach(c => {
      if (c.variants) {
        const v = c.variants.find(varItem => varItem.id == id);
        if (v) {
          deleted = v;
          c.variants = c.variants.filter(varItem => varItem.id != id);
        }
      }
    });
    writeLocalDb(data);
    return deleted;
  },

  // --- REVIEWS ---
  getReviews: async () => {
    if (!useLocalDb) {
      try {
        const res = await pool.query('SELECT * FROM reviews ORDER BY created_at DESC');
        return res.rows;
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    return data.reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  createReview: async (name, role, avatar_url, quote, rating, trade_type, proof_image_url, region, gc_received_date, payment_sent_date) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query(
          'INSERT INTO reviews (name, role, avatar_url, quote, rating, trade_type, proof_image_url, region, gc_received_date, payment_sent_date, verified) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE) RETURNING *',
          [name, role, avatar_url, quote, rating, trade_type, proof_image_url, region || null, gc_received_date || null, payment_sent_date || null]
        );
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    const newReview = {
      id: Date.now(),
      name,
      role: role || 'Customer',
      avatar_url: avatar_url || '',
      quote,
      rating: rating || 5,
      trade_type,
      proof_image_url,
      region: region || null,
      gc_received_date: gc_received_date || null,
      payment_sent_date: payment_sent_date || null,
      verified: true,
      created_at: new Date().toISOString()
    };
    data.reviews.push(newReview);
    writeLocalDb(data);
    return newReview;
  },

  updateReview: async (id, name, role, avatar_url, quote, rating, trade_type, proof_image_url, region, gc_received_date, payment_sent_date) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query(
          'UPDATE reviews SET name = $1, role = $2, avatar_url = $3, quote = $4, rating = $5, trade_type = $6, proof_image_url = $7, region = $8, gc_received_date = $9, payment_sent_date = $10 WHERE id = $11 RETURNING *',
          [name, role, avatar_url, quote, rating, trade_type, proof_image_url, region || null, gc_received_date || null, payment_sent_date || null, parseInt(id, 10)]
        );
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    const review = data.reviews.find(r => r.id == id);
    if (review) {
      review.name = name;
      review.role = role || 'Customer';
      review.avatar_url = avatar_url || '';
      review.quote = quote;
      review.rating = rating || 5;
      review.trade_type = trade_type;
      review.proof_image_url = proof_image_url;
      review.region = region || null;
      review.gc_received_date = gc_received_date || null;
      review.payment_sent_date = payment_sent_date || null;
      writeLocalDb(data);
    }
    return review;
  },

  deleteReview: async (id) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query('DELETE FROM reviews WHERE id = $1 RETURNING *', [parseInt(id, 10)]);
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    const review = data.reviews.find(r => r.id == id);
    data.reviews = data.reviews.filter(r => r.id != id);
    writeLocalDb(data);
    return review;
  },

  // --- PAYOUTS ---
  getPayouts: async () => {
    if (!useLocalDb) {
      try {
        const res = await pool.query('SELECT * FROM payouts ORDER BY submission_date DESC');
        return res.rows;
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    return data.payouts.sort((a, b) => new Date(b.submission_date) - new Date(a.submission_date));
  },

  createPayout: async (submission_date, payout_date, amount, card_type, method, status) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query(
          'INSERT INTO payouts (submission_date, payout_date, amount, card_type, method, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [submission_date, payout_date, amount, card_type, method, status]
        );
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    const newPayout = { id: Date.now(), submission_date, payout_date, amount, card_type, method, status };
    data.payouts.push(newPayout);
    writeLocalDb(data);
    return newPayout;
  },

  createPayoutsBatch: async (payoutsArray) => {
    if (!useLocalDb) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const insertedRows = [];
        for (const p of payoutsArray) {
          const res = await client.query(
            'INSERT INTO payouts (submission_date, payout_date, amount, card_type, method, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [p.submission_date, p.payout_date, p.amount, p.card_type, p.method, p.status || 'Completed']
          );
          insertedRows.push(res.rows[0]);
        }
        await client.query('COMMIT');
        return insertedRows;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error("Postgres batch insertion failed, switching to local DB", err);
        useLocalDb = true;
      } finally {
        client.release();
      }
    }
    const data = readLocalDb();
    const inserted = [];
    payoutsArray.forEach((p, idx) => {
      const row = {
        id: Date.now() + idx,
        submission_date: p.submission_date,
        payout_date: p.payout_date,
        amount: p.amount,
        card_type: p.card_type,
        method: p.method,
        status: p.status || 'Completed'
      };
      data.payouts.push(row);
      inserted.push(row);
    });
    writeLocalDb(data);
    return inserted;
  },

  updatePayout: async (id, submission_date, payout_date, amount, card_type, method, status) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query(
          'UPDATE payouts SET submission_date = $1, payout_date = $2, amount = $3, card_type = $4, method = $5, status = $6 WHERE id = $7 RETURNING *',
          [submission_date, payout_date, amount, card_type, method, status, parseInt(id, 10)]
        );
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    const p = data.payouts.find(item => item.id == id);
    if (p) {
      p.submission_date = submission_date;
      p.payout_date = payout_date;
      p.amount = amount;
      p.card_type = card_type;
      p.method = method;
      p.status = status;
      writeLocalDb(data);
    }
    return p;
  },

  deletePayout: async (id) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query('DELETE FROM payouts WHERE id = $1 RETURNING *', [parseInt(id, 10)]);
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    const p = data.payouts.find(item => item.id == id);
    data.payouts = data.payouts.filter(item => item.id != id);
    writeLocalDb(data);
    return p;
  },

  // --- APPEALS ---
  getAppeals: async () => {
    if (!useLocalDb) {
      try {
        const res = await pool.query('SELECT * FROM appeals ORDER BY created_at DESC');
        return res.rows;
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    return (data.appeals || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  createAppeal: async (name, phone, card_type, email, payout_address, details) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query(
          'INSERT INTO appeals (name, phone, card_type, email, payout_address, details, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
          [name, phone, card_type, email, payout_address, details || '', 'Pending']
        );
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    data.appeals = data.appeals || [];
    const newAppeal = {
      id: Date.now(),
      name,
      phone,
      card_type,
      email,
      payout_address,
      details: details || '',
      status: 'Pending',
      created_at: new Date().toISOString()
    };
    data.appeals.push(newAppeal);
    writeLocalDb(data);
    return newAppeal;
  },

  updateAppealStatus: async (id, status, adminNotes) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query(
          'UPDATE appeals SET status = $1, admin_notes = $2 WHERE id = $3 RETURNING *',
          [status, adminNotes || null, parseInt(id, 10)]
        );
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    data.appeals = data.appeals || [];
    const appeal = data.appeals.find(item => item.id == id);
    if (appeal) {
      appeal.status = status;
      appeal.admin_notes = adminNotes || null;
      writeLocalDb(data);
    }
    return appeal;
  },

  deleteAppeal: async (id) => {
    if (!useLocalDb) {
      try {
        const res = await pool.query('DELETE FROM appeals WHERE id = $1 RETURNING *', [parseInt(id, 10)]);
        return res.rows[0];
      } catch (err) {
        console.error("Postgres failed, switching to local DB", err);
        useLocalDb = true;
      }
    }
    const data = readLocalDb();
    data.appeals = data.appeals || [];
    const appeal = data.appeals.find(item => item.id == id);
    data.appeals = data.appeals.filter(item => item.id != id);
    writeLocalDb(data);
    return appeal;
  }
};
