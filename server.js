const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 9090;
const DEADLINE = new Date('2026-02-12T16:40:00Z'); // 17:40 CET = 16:40 UTC

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ideas (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        email VARCHAR(200) NOT NULL UNIQUE,
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        functionalities TEXT,
        agent_role TEXT,
        tools TEXT,
        votes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS votes (
        email VARCHAR(200) PRIMARY KEY,
        idea_id VARCHAR(20) NOT NULL REFERENCES ideas(id)
      )
    `);
    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  } finally {
    client.release();
  }
}

function isPastDeadline() {
  return new Date() >= DEADLINE;
}

function generateId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex').slice(0, 5);
}

// Submit idea
app.post('/api/ideas', async (req, res) => {
  if (isPastDeadline()) return res.status(403).json({ error: 'El plazo ha terminado' });

  const { name, email, title, description, functionalities, agentRole, tools } = req.body;
  if (!name || !email || !title || !description) {
    return res.status(400).json({ error: 'Campos obligatorios incompletos' });
  }

  try {
    const id = generateId();
    await pool.query(
      `INSERT INTO ideas (id, name, email, title, description, functionalities, agent_role, tools)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name.trim(), email.trim().toLowerCase(), title.trim(), description.trim(),
       functionalities?.trim() || null, agentRole?.trim() || null, tools?.trim() || null]
    );
    res.json({ success: true, idea: { id, name, title } });
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(409).json({ error: 'Ya has enviado una idea con este email' });
    }
    console.error('Submit error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get all ideas
app.get('/api/ideas', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, title, description, functionalities, agent_role as "agentRole", tools, votes, created_at as "createdAt"
       FROM ideas ORDER BY votes DESC, created_at ASC`
    );
    res.json({
      ideas: result.rows,
      deadline: DEADLINE.toISOString(),
      isPastDeadline: isPastDeadline()
    });
  } catch (err) {
    console.error('Get ideas error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Vote
app.post('/api/vote', async (req, res) => {
  if (isPastDeadline()) return res.status(403).json({ error: 'El plazo de votación ha terminado' });

  const { ideaId, email } = req.body;
  if (!ideaId || !email) return res.status(400).json({ error: 'Faltan datos' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if already voted
    const existing = await client.query('SELECT idea_id FROM votes WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ya has votado' });
    }

    // Check idea exists
    const idea = await client.query('SELECT id FROM ideas WHERE id = $1', [ideaId]);
    if (idea.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Idea no encontrada' });
    }

    // Register vote
    await client.query('INSERT INTO votes (email, idea_id) VALUES ($1, $2)', [email.toLowerCase(), ideaId]);
    await client.query('UPDATE ideas SET votes = votes + 1 WHERE id = $1', [ideaId]);

    await client.query('COMMIT');

    const updated = await pool.query('SELECT votes FROM ideas WHERE id = $1', [ideaId]);
    res.json({ success: true, votes: updated.rows[0].votes });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Vote error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// Results
app.get('/api/results', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, title, description, functionalities, agent_role as "agentRole", tools, votes
       FROM ideas ORDER BY votes DESC, created_at ASC`
    );
    const totalVotes = await pool.query('SELECT COUNT(*) as count FROM votes');

    res.json({
      ideas: result.rows,
      winner: result.rows[0] || null,
      isPastDeadline: isPastDeadline(),
      totalVotes: parseInt(totalVotes.rows[0].count)
    });
  } catch (err) {
    console.error('Results error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', deadline: DEADLINE.toISOString(), isPastDeadline: isPastDeadline() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Start server
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`🚀 Voting App running on http://localhost:${PORT}`);
    console.log(`📅 Deadline: ${DEADLINE.toISOString()}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'PostgreSQL (Railway)' : 'NOT CONFIGURED'}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
