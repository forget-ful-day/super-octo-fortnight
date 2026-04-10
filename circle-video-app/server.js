const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { uploadToGitHub, deleteFromGitHub, getFromGitHub, listFilesInGitHub, updateGitHubFile } = require('./github');

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

// Helper function to get circles data from GitHub
async function getCirclesData() {
  try {
    const content = await getFromGitHub('data/circles.json');
    return JSON.parse(content);
  } catch (error) {
    // File doesn't exist yet, return empty structure
    return { circles: [], comments: [], likes: [], complaints: [] };
  }
}

// Helper function to save circles data to GitHub
async function saveCirclesData(data) {
  const content = Buffer.from(JSON.stringify(data, null, 2));
  await updateGitHubFile('data/circles.json', content, 'application/json');
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
    const githubUrl = await uploadToGitHub(`videos/${filename}`, videoContent, req.file.mimetype);

    // Get current data
    const data = await getCirclesData();
    
    // Add new circle
    const newCircle = {
      id: uuidv4(),
      filename,
      github_url: githubUrl,
      created_at: Date.now() / 1000,
      likes: 0,
      complaints: 0,
    };
    
    data.circles.push(newCircle);
    await saveCirclesData(data);

    // Clean up local file
    fs.unlinkSync(videoPath);

    res.json({
      success: true,
      circle: newCircle,
    });
  } catch (error) {
    console.error('Error uploading circle:', error);
    res.status(500).json({ error: 'Failed to upload circle' });
  }
});

// Get a random circle (not the one specified)
app.get('/api/circles/random', async (req, res) => {
  try {
    const excludeId = req.query.exclude;
    
    const data = await getCirclesData();
    let circles = data.circles || [];
    
    if (excludeId) {
      circles = circles.filter(c => c.id !== excludeId);
    }
    
    if (circles.length === 0) {
      return res.json({ circle: null });
    }
    
    // Pick random circle
    const randomIndex = Math.floor(Math.random() * circles.length);
    const circle = circles[randomIndex];
    
    // Get comments for this circle
    const comments = (data.comments || []).filter(c => c.circle_id === circle.id);
    
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
app.get('/api/circles', async (req, res) => {
  try {
    const data = await getCirclesData();
    res.json({ circles: data.circles || [] });
  } catch (error) {
    console.error('Error getting circles:', error);
    res.status(500).json({ error: 'Failed to get circles' });
  }
});

// Like a circle
app.post('/api/circles/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const userIp = getClientIP(req);
    
    const data = await getCirclesData();
    
    // Check if already liked
    const existingLike = (data.likes || []).find(l => l.circle_id === id && l.user_ip === userIp);
    
    if (existingLike) {
      return res.status(400).json({ error: 'Already liked this circle' });
    }
    
    // Add like
    data.likes = data.likes || [];
    data.likes.push({
      id: uuidv4(),
      circle_id: id,
      user_ip: userIp,
      created_at: Date.now() / 1000,
    });
    
    // Update likes count
    const circle = data.circles.find(c => c.id === id);
    if (circle) {
      circle.likes = (circle.likes || 0) + 1;
    }
    
    await saveCirclesData(data);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error liking circle:', error);
    res.status(500).json({ error: 'Failed to like circle' });
  }
});

// Add comment to a circle
app.post('/api/circles/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { author, content } = req.body;
    
    if (!author || !content) {
      return res.status(400).json({ error: 'Author and content are required' });
    }
    
    const data = await getCirclesData();
    
    const newComment = {
      id: uuidv4(),
      circle_id: id,
      author,
      content,
      created_at: Date.now() / 1000,
    };
    
    data.comments = data.comments || [];
    data.comments.push(newComment);
    
    await saveCirclesData(data);
    
    res.json({
      success: true,
      comment: newComment,
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Report a circle
app.post('/api/circles/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userIp = getClientIP(req);
    
    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }
    
    const data = await getCirclesData();
    
    // Check if already reported
    const existingReport = (data.complaints || []).find(c => c.circle_id === id && c.user_ip === userIp);
    
    if (existingReport) {
      return res.status(400).json({ error: 'Already reported this circle' });
    }
    
    // Add complaint
    data.complaints = data.complaints || [];
    data.complaints.push({
      id: uuidv4(),
      circle_id: id,
      user_ip: userIp,
      reason,
      created_at: Date.now() / 1000,
    });
    
    // Update complaints count
    const circle = data.circles.find(c => c.id === id);
    if (circle) {
      circle.complaints = (circle.complaints || 0) + 1;
      
      // Check if complaints reached 5
      if (circle.complaints >= 5) {
        // Delete from GitHub
        if (circle.filename) {
          deleteFromGitHub(`videos/${circle.filename}`).catch(console.error);
        }
        
        // Remove circle and related data
        data.circles = data.circles.filter(c => c.id !== id);
        data.comments = (data.comments || []).filter(c => c.circle_id !== id);
        data.likes = (data.likes || []).filter(l => l.circle_id !== id);
        data.complaints = (data.complaints || []).filter(c => c.circle_id !== id);
      }
    }
    
    await saveCirclesData(data);
    
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
    
    const data = await getCirclesData();
    const circle = (data.circles || []).find(c => c.id === id);
    
    if (!circle) {
      return res.status(404).json({ error: 'Circle not found' });
    }
    
    // Delete from GitHub
    if (circle.filename) {
      await deleteFromGitHub(`videos/${circle.filename}`);
    }
    
    // Remove from data
    data.circles = data.circles.filter(c => c.id !== id);
    data.comments = (data.comments || []).filter(c => c.circle_id !== id);
    data.likes = (data.likes || []).filter(l => l.circle_id !== id);
    data.complaints = (data.complaints || []).filter(c => c.circle_id !== id);
    
    await saveCirclesData(data);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting circle:', error);
    res.status(500).json({ error: 'Failed to delete circle' });
  }
});

// Admin: Get all complaints
app.get('/api/admin/complaints', async (req, res) => {
  try {
    const data = await getCirclesData();
    const complaints = data.complaints || [];
    
    // Enrich with circle info
    const enrichedComplaints = complaints.map(c => {
      const circle = data.circles.find(ci => ci.id === c.circle_id);
      return {
        ...c,
        github_url: circle ? circle.github_url : null,
        filename: circle ? circle.filename : null,
      };
    });
    
    res.json({ complaints: enrichedComplaints });
  } catch (error) {
    console.error('Error getting complaints:', error);
    res.status(500).json({ error: 'Failed to get complaints' });
  }
});

// Admin: Get stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const data = await getCirclesData();
    
    const totalCircles = (data.circles || []).length;
    const totalComments = (data.comments || []).length;
    const totalLikes = (data.circles || []).reduce((sum, c) => sum + (c.likes || 0), 0);
    const totalComplaints = (data.complaints || []).length;
    
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
