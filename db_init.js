import { Client, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const connectionString = "postgresql://neondb_owner:npg_UHpmhfV89sYd@ep-purple-lab-aol9tfl4.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

async function init() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("Connected to PostgreSQL database successfully.");

    // Create tables
    console.log("Creating tables...");
    
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

    console.log("Tables verified/created successfully.");

    // Seed default cards if empty
    const cardsCheck = await client.query("SELECT COUNT(*) FROM cards");
    if (parseInt(cardsCheck.rows[0].count) === 0) {
      console.log("Seeding default cards...");
      const defaultCards = [
        { name: "Amazon", img: "amazon", tag: "Shopping", glow: "rgba(255, 153, 0, 0.4)" },
        { name: "Flipkart", img: "flipkart", tag: "Shopping", glow: "rgba(40, 116, 240, 0.4)" },
        { name: "Roblox", img: "roblox", tag: "Gaming", glow: "rgba(239, 68, 68, 0.4)" },
        { name: "League of Legends", img: "lol", tag: "Gaming", glow: "rgba(197, 168, 128, 0.35)" },
        { name: "Overwatch 2", img: "overwatch", tag: "Gaming", glow: "rgba(240, 100, 20, 0.4)" },
        { name: "Sea of Thieves", img: "sot", tag: "Gaming", glow: "rgba(16, 185, 129, 0.4)" },
      ];

      for (const card of defaultCards) {
        const res = await client.query(
          "INSERT INTO cards (name, img, tag, glow) VALUES ($1, $2, $3, $4) RETURNING id",
          [card.name, card.img, card.tag, card.glow]
        );
        const cardId = res.rows[0].id;

        // Seed variants for each card
        if (card.name === "Amazon") {
          await client.query("INSERT INTO card_variants (card_id, name, inr_rate, usdt_rate) VALUES ($1, $2, $3, $4)", [
            cardId, "arena100", "100 INR", "0.91 USDT"
          ]);
        } else if (card.name === "Flipkart") {
          await client.query("INSERT INTO card_variants (card_id, name, inr_rate, usdt_rate) VALUES ($1, $2, $3, NULL)", [
            cardId, "e-Gift Voucher", "90 INR"
          ]);
        } else if (card.name === "Roblox") {
          await client.query("INSERT INTO card_variants (card_id, name, inr_rate, usdt_rate) VALUES ($1, $2, NULL, $3)", [
            cardId, "Gift Card", "88 USDT"
          ]);
        } else if (card.name === "League of Legends") {
          await client.query("INSERT INTO card_variants (card_id, name, inr_rate, usdt_rate) VALUES ($1, $2, NULL, $3)", [
            cardId, "RP Gift Card", "86 USDT"
          ]);
        } else if (card.name === "Overwatch 2") {
          await client.query("INSERT INTO card_variants (card_id, name, inr_rate, usdt_rate) VALUES ($1, $2, NULL, $3)", [
            cardId, "Coins Gift Card", "84 USDT"
          ]);
        } else if (card.name === "Sea of Thieves") {
          await client.query("INSERT INTO card_variants (card_id, name, inr_rate, usdt_rate) VALUES ($1, $2, NULL, $3)", [
            cardId, "Ancient Coins Pack", "82 USDT"
          ]);
        }
      }
      console.log("Seeded default cards and variants successfully.");
    }

    // Seed default payouts if empty
    const payoutsCheck = await client.query("SELECT COUNT(*) FROM payouts");
    if (parseInt(payoutsCheck.rows[0].count) === 0) {
      console.log("Seeding default payouts...");
      const defaultPayouts = [
        { submission_date: new Date("2026-05-08T00:00:00.000Z"), payout_date: new Date("2026-05-15T00:00:00.000Z"), amount: "N/A", card_type: "All Cards", method: "Any", status: "Submission Closed" },
        { submission_date: new Date("2026-05-16T00:00:00.000Z"), payout_date: new Date("2026-05-23T00:00:00.000Z"), amount: "N/A", card_type: "All Cards", method: "Any", status: "Submission Closed" },
        { submission_date: new Date("2026-06-08T00:00:00.000Z"), payout_date: new Date("2026-06-15T00:00:00.000Z"), amount: "N/A", card_type: "All Cards", method: "Any", status: "Submission Open" }
      ];


      for (const p of defaultPayouts) {
        await client.query(
          "INSERT INTO payouts (submission_date, payout_date, amount, card_type, method, status) VALUES ($1, $2, $3, $4, $5, $6)",
          [p.submission_date, p.payout_date, p.amount, p.card_type, p.method, p.status]
        );
      }
      console.log("Seeded default payouts successfully.");
    }

    // Seed default reviews if empty
    const reviewsCheck = await client.query("SELECT COUNT(*) FROM reviews");
    if (parseInt(reviewsCheck.rows[0].count) === 0) {
      console.log("Seeding default reviews...");
      const defaultReviews = [
        {
          name: "Aarav Sharma",
          role: "Casual Gamer",
          avatar_url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&h=120&q=80",
          quote: "Had a ₹5,000 Amazon card sitting around from my birthday. Swapped it for UPI cash easily. The transaction felt extremely transparent.",
          rating: 5,
          trade_type: "Amazon ➔ UPI",
          proof_image_url: "https://i.ibb.co/4DcNDpt/x.png",
          region: "US",
          gc_received_date: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
          payment_sent_date: new Date().toISOString()
        },
        {
          name: "Karan Mehta",
          role: "Crypto Trader",
          avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&h=120&q=80",
          quote: "Converted my League of Legends RP cards directly into USDT. Payout was routed securely and the rate was easily the best I found online.",
          rating: 5,
          trade_type: "LoL Card ➔ USDT",
          proof_image_url: "https://i.ibb.co/4DcNDpt/x.png",
          region: null,
          gc_received_date: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
          payment_sent_date: new Date().toISOString()
        },
        {
          name: "Priya Rao",
          role: "Freelance Designer",
          avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&h=120&q=80",
          quote: "Received a Flipkart voucher from a client but needed liquid cash. GCX processed the exchange seamlessly. The glassmorphism UI is beautiful.",
          rating: 5,
          trade_type: "Flipkart ➔ UPI",
          proof_image_url: "https://i.ibb.co/4DcNDpt/x.png",
          region: null,
          gc_received_date: new Date(Date.now() - 3600000 * 24 * 4).toISOString(),
          payment_sent_date: new Date().toISOString()
        }
      ];
 
      for (const r of defaultReviews) {
        await client.query(
          "INSERT INTO reviews (name, role, avatar_url, quote, rating, trade_type, proof_image_url, region, gc_received_date, payment_sent_date, verified) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)",
          [r.name, r.role, r.avatar_url, r.quote, r.rating, r.trade_type, r.proof_image_url, r.region, r.gc_received_date, r.payment_sent_date]
        );
      }
      console.log("Seeded default reviews successfully.");
    }

    console.log("Database initialized successfully!");
  } catch (err) {
    console.error("Database initialization failed:", err);
  } finally {
    await client.end();
  }
}

init();
