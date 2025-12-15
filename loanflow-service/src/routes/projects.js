import { Router } from 'express';
import * as projectController from '../controllers/projectController.js';

const router = Router();

// GET /projects - List all projects
router.get('/', projectController.listProjects);

// POST /projects - Create a new project
router.post('/', projectController.createProject);

// GET /projects/:projectId - Get project by ID
router.get('/:projectId', projectController.getProject);

export default router;

