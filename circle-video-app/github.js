const axios = require('axios');
require('dotenv').config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

async function uploadToGitHub(filename, content, mimeType) {
  const encodedContent = Buffer.from(content).toString('base64');
  
  try {
    // Check if file exists to get its SHA
    let sha = null;
    try {
      const response = await axios.get(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`,
        {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );
      sha = response.data.sha;
    } catch (error) {
      // File doesn't exist, that's okay
      if (error.response?.status !== 404) {
        throw error;
      }
    }

    const payload = {
      message: `Upload file: ${filename}`,
      content: encodedContent,
    };

    if (sha) {
      payload.sha = sha;
    }

    const response = await axios.put(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`,
      payload,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.content.html_url;
  } catch (error) {
    console.error('Error uploading to GitHub:', error.response?.data || error.message);
    throw new Error('Failed to upload to GitHub');
  }
}

async function deleteFromGitHub(filename) {
  try {
    // Get the file SHA first
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    const sha = response.data.sha;

    // Delete the file
    await axios.delete(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
        data: {
          message: `Delete file: ${filename}`,
          sha: sha,
        },
      }
    );

    return true;
  } catch (error) {
    console.error('Error deleting from GitHub:', error.response?.data || error.message);
    throw new Error('Failed to delete from GitHub');
  }
}

async function getFromGitHub(filename) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    // Decode base64 content
    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return content;
  } catch (error) {
    console.error('Error getting from GitHub:', error.response?.data || error.message);
    throw error;
  }
}

async function updateGitHubFile(filename, content, mimeType = 'application/json') {
  const encodedContent = Buffer.from(content).toString('base64');
  
  try {
    // Check if file exists to get its SHA
    let sha = null;
    try {
      const response = await axios.get(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`,
        {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );
      sha = response.data.sha;
    } catch (error) {
      // File doesn't exist, that's okay
      if (error.response?.status !== 404) {
        throw error;
      }
    }

    const payload = {
      message: `Update file: ${filename}`,
      content: encodedContent,
    };

    if (sha) {
      payload.sha = sha;
    }

    await axios.put(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`,
      payload,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
      }
    );

    return true;
  } catch (error) {
    console.error('Error updating GitHub file:', error.response?.data || error.message);
    throw new Error('Failed to update GitHub file');
  }
}

async function listFilesInGitHub(path = '') {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error listing files in GitHub:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = { uploadToGitHub, deleteFromGitHub, getFromGitHub, updateGitHubFile, listFilesInGitHub };
