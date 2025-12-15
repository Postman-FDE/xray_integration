import * as projectService from '../services/projectService.js';
import * as loanService from '../services/loanService.js';
import { createProjectSchema, validate } from '../validators/projectValidators.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

/**
 * GET /projects
 * List all projects
 * Optional query param: ?loanId=XXX to filter by loan
 */
export function listProjects(req, res, next) {
  try {
    const { loanId } = req.query;

    if (loanId) {
      const projects = projectService.getProjectsByLoanId(loanId);
      return res.json({ projects, count: projects.length, loanId });
    }

    const projects = projectService.getAllProjects();
    res.json({ projects, count: projects.length });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /projects
 * Create a new project (Submit Project Info API Test)
 */
export function createProject(req, res, next) {
  try {
    const validation = validate(createProjectSchema, req.body);
    if (!validation.success) {
      throw new ValidationError(validation.errors);
    }

    const { loanId, name, tpoInfo } = validation.data;

    // Verify the loan exists
    const loan = loanService.getLoanById(loanId);
    if (!loan) {
      throw new NotFoundError('Loan', loanId);
    }

    const project = projectService.createProject({ loanId, name, tpoInfo });
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /projects/:projectId
 * Get a single project by ID (Verify Project Info - TPO)
 */
export function getProject(req, res, next) {
  try {
    const { projectId } = req.params;
    const project = projectService.getProjectById(projectId);

    if (!project) {
      throw new NotFoundError('Project', projectId);
    }

    res.json(project);
  } catch (error) {
    next(error);
  }
}

