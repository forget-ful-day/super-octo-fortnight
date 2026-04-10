const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const db = require('./database');
const { uploadToGitHub, deleteFromGitHub } = require('./github');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|webm|ogg|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed (mp4, webm, ogg, mov)'));
    }
  },
});

// Helper function to get client IP
function getClientIP(req) {
  return req.ip || req.connection.remoteAddress || 'unknown';
}

// API Routes

// Upload a circle video
app.post('/api/circles', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const videoPath = req.file.path;
    const videoContent = fs.readFileSync(videoPath);
    const filename = `circle_${uuidv4()}${path.extname(req.file.originalname)}`;

    // Upload to GitHub
    const githubUrl = await uploadToGitHub(filename, videoContent, req.file.mimetype);

    // Save to database
    const id = uuidv4();
    db.prepare(`
      INSERT INTO circles (id, filename, github_url)
      VALUES (?, ?, ?)
    `).run(id, filename, githubUrl);

    // Clean up local file
    fs.unlinkSync(videoPath);

    res.json({
      success: true,
      circle: {
        id,
        filename,
        github_url: githubUrl,
        created_at: Date.now() / 1000,
        likes: 0,
        complaints: 0,
      },
    });
  } catch (error) {
    console.error('Error uploading circle:', error);
    res.status(500).json({ error: 'Failed to upload circle' });
  }
});

// Get a random circle (not the one specified)
app.get('/api/circles/random', (req, res) => {
  try {
    const excludeId = req.query.exclude;
    
    let query;
    let params;
    
    if (excludeId) {
      query = 'SELECT * FROM circles WHERE id != ? ORDER BY RANDOM() LIMIT 1';
      params = [excludeId];
    } else {
      query = 'SELECT * FROM circles ORDER BY RANDOM() LIMIT 1';
      params = [];
    }

    const circle = db.prepare(query).get(...params);

    if (!circle) {
      return res.json({ circle: null });
    }

    // Get comments for this circle
    const comments = db.prepare(`
      SELECT * FROM comments WHERE circle_id = ? ORDER BY created_at DESC
    `).all(circle.id);

    res.json({
      circle: {
        ...circle,
        comments,
      },
    });
  } catch (error) {
    console.error('Error getting random circle:', error);
    res.status(500).json({ error: 'Failed to get random circle' });
  }
});

// Get all circles (for admin)
app.get('/api/circles', (req, res) => {
  try {
    const circles = db.prepare('SELECT * FROM circles ORDER BY created_at DESC').all();
    res.json({ circles });
  } catch (error) {
    console.error('Error getting circles:', error);
    res.status(500).json({ error: 'Failed to get circles' });
  }
});

// Like a circle
app.post('/api/circles/:id/like', (req, res) => {
  try {
    const { id } = req.params;
    const userIp = getClientIP(req);

    // Check if already liked
    const existingLike = db.prepare(`
      SELECT * FROM likes WHERE circle_id = ? AND user_ip = ?
    `).get(id, userIp);

    if (existingLike) {
      return res.status(400).json({ error: 'Already liked this circle' });
    }

    // Add like
    db.prepare(`
      INSERT INTO likes (id, circle_id, user_ip)
      VALUES (?, ?, ?)
    `).run(uuidv4(), id, userIp);

    // Update likes count
    db.prepare(`
      UPDATE circles SET likes = likes + 1 WHERE id = ?
    `).run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error liking circle:', error);
    res.status(500).json({ error: 'Failed to like circle' });
  }
});

// Add comment to a circle
app.post('/api/circles/:id/comments', (req, res) => {
  try {
    const { id } = req.params;
    const { author, content } = req.body;

    if (!author || !content) {
      return res.status(400).json({ error: 'Author and content are required' });
    }

    const commentId = uuidv4();
    db.prepare(`
      INSERT INTO comments (id, circle_id, author, content)
      VALUES (?, ?, ?, ?)
    `).run(commentId, id, author, content);

    res.json({
      success: true,
      comment: {
        id: commentId,
        circle_id: id,
        author,
        content,
        created_at: Date.now() / 1000,
      },
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Report a circle
app.post('/api/circles/:id/report', (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userIp = getClientIP(req);

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    // Check if already reported
    const existingReport = db.prepare(`
      SELECT * FROM complaints WHERE circle_id = ? AND user_ip = ?
    `).get(id, userIp);

    if (existingReport) {
      return res.status(400).json({ error: 'Already reported this circle' });
    }

    // Add complaint
    db.prepare(`
      INSERT INTO complaints (id, circle_id, user_ip, reason)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), id, userIp, reason);

    // Update complaints count
    db.prepare(`
      UPDATE circles SET complaints = complaints + 1 WHERE id = ?
    `).run(id);

    // Check if complaints exceed 5
    const circle = db.prepare('SELECT * FROM circles WHERE id = ?').get(id);
    if (circle && circle.complaints + 1 >= 5) {
      // Delete from GitHub
      deleteFromGitHub(circle.filename).catch(console.error);
      
      // Delete from database
      db.prepare('DELETE FROM circles WHERE id = ?').run(id);
      db.prepare('DELETE FROM comments WHERE circle_id = ?').run(id);
      db.prepare('DELETE FROM likes WHERE circle_id = ?').run(id);
      db.prepare('DELETE FROM complaints WHERE circle_id = ?').run(id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error reporting circle:', error);
    res.status(500).json({ error: 'Failed to report circle' });
  }
});

// Admin: Delete a circle
app.delete('/api/admin/circles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const circle = db.prepare('SELECT * FROM circles WHERE id = ?').get(id);
    
    if (!circle) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    // Delete from GitHub
    await deleteFromGitHub(circle.filename);

    // Delete from database
    db.prepare('DELETE FROM circles WHERE id = ?').run(id);
    db.prepare('DELETE FROM comments WHERE circle_id = ?').run(id);
    db.prepare('DELETE FROM likes WHERE circle_id = ?').run(id);
    db.prepare('DELETE FROM complaints WHERE circle_id = ?').run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting circle:', error);
    res.status(500).json({ error: 'Failed to delete circle' });
  }
});

// Admin: Get all complaints
app.get('/api/admin/complaints', (req, res) => {
  try {
    const complaints = db.prepare(`
      SELECT c.*, ci.github_url, ci.filename
      FROM complaints c
      JOIN circles ci ON c.circle_id = ci.id
      ORDER BY c.created_at DESC
    `).all();

    res.json({ complaints });
  } catch (error) {
    console.error('Error getting complaints:', error);
    res.status(500).json({ error: 'Failed to get complaints' });
  }
});

// Admin: Get stats
app.get('/api/admin/stats', (req, res) => {
  try {
    const totalCircles = db.prepare('SELECT COUNT(*) as count FROM circles').get().count;
    const totalComments = db.prepare('SELECT COUNT(*) as count FROM comments').get().count;
    const totalLikes = db.prepare('SELECT SUM(likes) as total FROM circles').get().total || 0;
    const totalComplaints = db.prepare('SELECT COUNT(*) as count FROM complaints').get().count;

    res.json({
      stats: {
        totalCircles,
        totalComments,
        totalLikes,
        totalComplaints,
      },
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
