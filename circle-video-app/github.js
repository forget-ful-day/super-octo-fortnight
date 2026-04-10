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
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/videos/${filename}`,
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
      message: `Upload video circle: ${filename}`,
      content: encodedContent,
    };

    if (sha) {
      payload.sha = sha;
    }

    const response = await axios.put(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/videos/${filename}`,
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
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/videos/${filename}`,
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
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/videos/${filename}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
        data: {
          message: `Delete video circle: ${filename}`,
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

module.exports = { uploadToGitHub, deleteFromGitHub };
