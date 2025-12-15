import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/loans.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS loans (
    loanId TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    amount REAL NOT NULL,
    borrowerName TEXT NOT NULL,
    loanType TEXT,
    interestRate REAL,
    createdAt TEXT NOT NULL,
    lastChangeOrderAt TEXT,
    changeOrders TEXT DEFAULT '[]',
    cancelReason TEXT,
    cancelledAt TEXT,
    contractReview TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    projectId TEXT PRIMARY KEY,
    loanId TEXT NOT NULL,
    name TEXT NOT NULL,
    tpoInfo TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (loanId) REFERENCES loans(loanId)
  );
`);

export default db;

