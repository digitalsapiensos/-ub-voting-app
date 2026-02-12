const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9090;
const DATA_FILE = path.join(__dirname, 'ideas.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize data file
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) { console.error('Error loading data:', e); }
  return { ideas: [], votes: {} };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(DATA_FILE)) saveData({ ideas: [], votes: {} });

const DEADLINE = new Date('2026-02-12T16:40:00Z'); // 17:40 CET = 16:40 UTC

function isPastDeadline() {
  return new Date() >= DEADLINE;
}

// Submit idea
app.post('/api/ideas', (req, res) => {
  if (isPastDeadline()) return res.status(403).json({ error: 'El plazo ha terminado' });
  
  const { name, email, title, description, functionalities, agentRole, tools } = req.body;
  if (!name || !email || !title || !description) {
    return res.status(400).json({ error: 'Campos obligatorios incompletos' });
  }

  const data = loadData();
  
  // Check duplicate email
  if (data.ideas.some(i => i.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Ya has enviado una idea con este email' });
  }

  const idea = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name, email, title, description, functionalities, agentRole, tools,
    votes: 0,
    createdAt: new Date().toISOString()
  };

  data.ideas.push(idea);
  saveData(data);
  res.json({ success: true, idea });
});

// Get all ideas
app.get('/api/ideas', (req, res) => {
  const data = loadData();
  const ideas = data.ideas.map(i => ({
    id: i.id, name: i.name, title: i.title, description: i.description,
    functionalities: i.functionalities, agentRole: i.agentRole, tools: i.tools,
    votes: i.votes, createdAt: i.createdAt
  })).sort((a, b) => b.votes - a.votes);
  res.json({ ideas, deadline: DEADLINE.toISOString(), isPastDeadline: isPastDeadline() });
});

// Vote
app.post('/api/vote', (req, res) => {
  if (isPastDeadline()) return res.status(403).json({ error: 'El plazo de votación ha terminado' });
  
  const { ideaId, email } = req.body;
  if (!ideaId || !email) return res.status(400).json({ error: 'Faltan datos' });

  const data = loadData();
  const emailKey = email.toLowerCase();

  if (data.votes[emailKey]) {
    return res.status(409).json({ error: 'Ya has votado' });
  }

  const idea = data.ideas.find(i => i.id === ideaId);
  if (!idea) return res.status(404).json({ error: 'Idea no encontrada' });

  idea.votes++;
  data.votes[emailKey] = ideaId;
  saveData(data);
  res.json({ success: true, votes: idea.votes });
});

// Results
app.get('/api/results', (req, res) => {
  const data = loadData();
  const sorted = [...data.ideas].sort((a, b) => b.votes - a.votes);
  res.json({
    ideas: sorted.map(i => ({ id: i.id, name: i.name, title: i.title, description: i.description, functionalities: i.functionalities, agentRole: i.agentRole, tools: i.tools, votes: i.votes })),
    winner: sorted[0] || null,
    isPastDeadline: isPastDeadline(),
    totalVotes: Object.keys(data.votes).length
  });
});

app.listen(PORT, () => {
  console.log(`🚀 MAINDS Project Lab running on http://localhost:${PORT}`);
  console.log(`📅 Deadline: ${DEADLINE.toISOString()}`);
});
