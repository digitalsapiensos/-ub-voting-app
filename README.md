# 🚀 MAINDS PROJECT LAB — Voting Platform

Plataforma de votación para la clase práctica del Máster Fintech, Blockchain y Mercados Financieros (UB).

## Setup

```bash
cd mainds-voting-app
npm install
npm start
```

Server runs on `http://localhost:3000`

## Deploy on a server

```bash
# Install Node.js if needed
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs

# Clone/copy files, then:
npm install
PORT=3000 node server.js

# Or with pm2 for persistence:
npm install -g pm2
PORT=3000 pm2 start server.js --name mainds-voting
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ideas` | Submit a new idea |
| GET | `/api/ideas` | Get all ideas (sorted by votes) |
| POST | `/api/vote` | Vote for an idea |
| GET | `/api/results` | Get results + winner |

## Deadline

- **Voting closes:** 2026-02-12 17:40 CET
- **Class starts:** 2026-02-12 18:00 CET
