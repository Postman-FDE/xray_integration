import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Configure multer for file uploads
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `junit-${timestamp}${ext}`);
  },
});

/**
 * File filter - only accept XML files
 */
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['application/xml', 'text/xml'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || ext === '.xml') {
    cb(null, true);
  } else {
    cb(new Error('Only XML files are allowed'), false);
  }
};

/**
 * Multer upload middleware
 * Accepts a single file with field name 'file'
 */
export const uploadXml = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
}).single('file');

/**
 * Clean up uploaded file after processing
 */
export function cleanupFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

