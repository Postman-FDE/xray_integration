import db from './database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Parse JSON fields from a project row
 */
function parseProjectRow(row) {
  if (!row) return null;
  return {
    ...row,
    tpoInfo: JSON.parse(row.tpoInfo || '{}'),
  };
}

/**
 * Create a new project
 */
export function createProject({ loanId, name, tpoInfo }) {
  const projectId = `PROJ-${uuidv4().slice(0, 8).toUpperCase()}`;
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO projects (projectId, loanId, name, tpoInfo, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(projectId, loanId, name, JSON.stringify(tpoInfo), createdAt);

  return {
    projectId,
    loanId,
    name,
    tpoInfo,
    createdAt,
  };
}

/**
 * Get a project by ID
 */
export function getProjectById(projectId) {
  const stmt = db.prepare('SELECT * FROM projects WHERE projectId = ?');
  const row = stmt.get(projectId);
  return parseProjectRow(row);
}

/**
 * Get all projects for a loan
 */
export function getProjectsByLoanId(loanId) {
  const stmt = db.prepare('SELECT * FROM projects WHERE loanId = ? ORDER BY createdAt DESC');
  return stmt.all(loanId).map(parseProjectRow);
}

/**
 * Get all projects
 */
export function getAllProjects() {
  const stmt = db.prepare('SELECT * FROM projects ORDER BY createdAt DESC');
  return stmt.all().map(parseProjectRow);
}

