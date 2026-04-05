// server/routes/admin.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const AdminDocument = require('../models/AdminDocument');
const axios = require('axios');
const User = require('../models/User');
const ChatHistory = require('../models/ChatHistory');
const { cacheMiddleware } = require('../middleware/cacheMiddleware');
const { redisClient } = require('../config/redisClient');
const LLMConfiguration = require('../models/LLMConfiguration');
const { encrypt } = require('../utils/crypto');
const { auditLog } = require('../utils/logger');
const LLMPerformanceLog = require('../models/LLMPerformanceLog');
const { generateSyntheticDataForSubject } = require('../services/trainingDataGenerator');
const CourseModelRegistry = require('../models/CourseModelRegistry');

const router = express.Router();


/* ====== Model feedback routes ======= */

// @route   GET /api/admin/feedback-stats
// @desc    Get aggregated feedback stats for each model
router.get('/feedback-stats', async (req, res) => {
  try {
    const stats = await LLMPerformanceLog.aggregate([
      {
        $group: {
          _id: '$chosenModelId', // Group by the model's ID
          positive: { $sum: { $cond: [{ $eq: ['$userFeedback', 'positive'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$userFeedback', 'negative'] }, 1, 0] } },
          none: { $sum: { $cond: [{ $eq: ['$userFeedback', 'none'] }, 1, 0] } },
          total: { $sum: 1 }
        }
      },
      {
        $project: { // Reshape the output
          modelId: '$_id',
          feedback: {
            positive: '$positive',
            negative: '$negative',
            none: '$none'
          },
          totalResponses: '$total',
          _id: 0
        }
      }
    ]);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    res.status(500).json({ message: 'Server error while fetching feedback stats.' });
  }
});
/* ====== END Model feedback routes ===== */

/* ====== LLM Management Routes ====== */

// GET /api/admin/llms - List all LLM configurations
router.get('/llms', async (req, res) => {
  try {
    const configs = await LLMConfiguration.find();
    res.json(configs);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch LLM configurations.' });
  }
});

// POST /api/admin/llms - Create a new LLM configuration
router.post('/llms', async (req, res) => {
  try {
    const newConfig = new LLMConfiguration(req.body);
    await newConfig.save();
    res.status(201).json(newConfig);
  } catch (error) {
    res.status(400).json({ message: 'Failed to create LLM configuration.', error: error.message });
  }
});

// PUT /api/admin/llms/:id - Update an LLM configuration
router.put('/llms/:id', async (req, res) => {
  try {
    const updatedConfig = await LLMConfiguration.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedConfig) return res.status(404).json({ message: 'LLM configuration not found.' });
    res.json(updatedConfig);
  } catch (error) {
    res.status(400).json({ message: 'Failed to update LLM configuration.', error: error.message });
  }
});

// DELETE /api/admin/llms/:id - Delete an LLM configuration
router.delete('/llms/:id', async (req, res) => {
  try {
    const deletedConfig = await LLMConfiguration.findByIdAndDelete(req.params.id);
    if (!deletedConfig) return res.status(404).json({ message: 'LLM configuration not found.' });
    res.json({ message: 'LLM configuration deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete LLM configuration.' });
  }
});


/* ====== END LLM Managemet Routes =====  */

const CACHE_DURATION_SECONDS = 30;
// --- NEW Dashboard Stats Route ---
// @route   GET /api/admin/dashboard-stats
// @desc    Get key statistics for the admin dashboard
router.get('/dashboard-stats', cacheMiddleware(CACHE_DURATION_SECONDS), async (req, res) => {
  try {
    const [totalUsers, totalAdminDocs, totalSessions, pendingApiKeys] = await Promise.all([
      User.countDocuments(),
      AdminDocument.countDocuments(),
      ChatHistory.countDocuments(),
      User.countDocuments({ apiKeyRequestStatus: 'pending' })
    ]);

    res.json({
      totalUsers,
      totalAdminDocs,
      totalSessions,
      pendingApiKeys
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Server error while fetching dashboard stats.' });
  }
});


// --- API Key Management Routes ---

// @route   GET /api/admin/key-requests
// @desc    Get all users with a pending API key request
router.get('/key-requests', cacheMiddleware(CACHE_DURATION_SECONDS), async (req, res) => {
  try {
    const requests = await User.find({ apiKeyRequestStatus: 'pending' })
      .select('email profile createdAt')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('Error fetching API key requests:', error);
    res.status(500).json({ message: 'Server error while fetching requests.' });
  }
});

// @route   POST /api/admin/key-requests/approve
router.post("/key-requests/approve", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ message: "User ID is required." });
  }

  try {
    const serverApiKey = process.env.GEMINI_API_KEY;
    if (!serverApiKey) {
      return res
        .status(500)
        .json({ message: "Server-side GEMINI_API_KEY is not configured." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.encryptedApiKey = serverApiKey; // pre-save hook handles encryption
    user.apiKeyRequestStatus = "approved";
    user.preferredLlmProvider = "gemini";

    await user.save();

    auditLog(req, 'ADMIN_API_KEY_APPROVE', {
      targetUserId: userId,
      targetUserEmail: user.email
    });
    // --- NEW: Invalidate Redis Cache for pending requests and dashboard stats ---
    if (redisClient && redisClient.isOpen) {
      await redisClient.del('__express__/api/admin/key-requests').catch(err => console.error("Redis DEL error:", err));
      await redisClient.del('__express__/api/admin/dashboard-stats').catch(err => console.error("Redis DEL error:", err));
      console.log(`Redis cache for '/api/admin/key-requests' and '/api/admin/dashboard-stats' invalidated.`);
    }
    // --- END NEW ---

    res.json({
      message: `API key request for ${user.email} has been approved.`,
    });
  } catch (error) {
    console.error(`Error approving API key for user ${userId}:`, error);
    res.status(500).json({ message: "Server error while approving request." });
  }
})
// @route   POST /api/admin/key-requests/reject
// @desc    Reject a user's API key request
router.post("/key-requests/reject", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ message: "User ID is required." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.apiKeyRequestStatus = "rejected";
    await user.save();

    auditLog(req, 'ADMIN_API_KEY_REJECT', {
      targetUserId: userId,
      targetUserEmail: user.email
    });
    // --- NEW: Invalidate Redis Cache for pending requests and dashboard stats ---
    if (redisClient && redisClient.isOpen) {
      await redisClient.del('__express__/api/admin/key-requests').catch(err => console.error("Redis DEL error:", err));
      await redisClient.del('__express__/api/admin/dashboard-stats').catch(err => console.error("Redis DEL error:", err));
      console.log(`Redis cache for '/api/admin/key-requests' and '/api/admin/dashboard-stats' invalidated.`);
    }
    // --- END NEW ---

    res.json({
      message: `API key request for ${user.email} has been rejected.`,
    });
  } catch (error) {
    console.error(`Error rejecting API key for user ${userId}:`, error);
    res.status(500).json({ message: "Server error while rejecting request." });
  }
});
// --- Document Management Routes ---

const ADMIN_UPLOAD_DIR_BASE = path.join(
  __dirname,
  "..",
  "assets",
  "_admin_uploads_"
);
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const allowedAdminMimeTypes = {
  "application/pdf": "docs",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docs",
  "text/plain": "docs",
  "text/markdown": "docs",
};
const allowedAdminExtensions = [".pdf", ".docx", ".txt", ".md"];

const adminStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fileMimeType = file.mimetype.toLowerCase();
    const fileTypeSubfolder = allowedAdminMimeTypes[fileMimeType] || "others";
    const destinationPath = path.join(ADMIN_UPLOAD_DIR_BASE, fileTypeSubfolder);
    fs.mkdir(destinationPath, { recursive: true }, (err) => {
      if (err) return cb(err);
      cb(null, destinationPath);
    });
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const fileExt = path.extname(file.originalname).toLowerCase();
    const sanitizedBaseName = path
      .basename(file.originalname, fileExt)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .substring(0, 100);
    cb(null, `${timestamp}-${sanitizedBaseName}${fileExt}`);
  },
});
const adminFileFilter = (req, file, cb) => {
  const fileExt = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();
  if (
    allowedAdminMimeTypes[mimeType] &&
    allowedAdminExtensions.includes(fileExt)
  ) {
    cb(null, true);
  } else {
    const error = new multer.MulterError("LIMIT_UNEXPECTED_FILE_TYPE_ADMIN");
    error.message = `Invalid file type. Allowed: ${allowedAdminExtensions.join(
      ", "
    )}`;
    cb(error, false);
  }
};
const adminUpload = multer({ storage: adminStorage, fileFilter: adminFileFilter, limits: { fileSize: MAX_FILE_SIZE } });
async function triggerPythonRagProcessingForAdmin(filePath, originalName) {
  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
  if (!pythonServiceUrl) {
    return { success: false, message: "Python service URL not configured.", text: null, chunksForKg: [] };
  }
  const addDocumentUrl = `${pythonServiceUrl}/add_document`;
  try {
    const response = await axios.post(addDocumentUrl, {
      user_id: "admin",
      file_path: filePath, original_name: originalName
    }, { timeout: 300000 });

    const text = response.data?.raw_text_for_analysis || null;
    const chunksForKg = response.data?.chunks_with_metadata || [];
    const isSuccess = !!(text && text.trim());
    return {
      success: isSuccess,
      message: response.data?.message || "Python RAG service call completed.",
      text: text,
      chunksForKg: chunksForKg
    };
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message || "Unknown error calling Python RAG.";
    return { success: false, message: `Python RAG call failed: ${errorMsg}`, text: null, chunksForKg: [] };
  }
}
async function callPythonDeletionEndpoint(
  method,
  endpointPath,
  userId,
  originalName
) {
  const pythonServiceUrl =
    process.env.PYTHON_RAG_SERVICE_URL || "http://localhost:5000";
  const deleteUrl = `${pythonServiceUrl.replace(/\/$/, "")}${endpointPath}`;
  try {
    await axios.delete(deleteUrl, {
      data: { user_id: userId, document_name: originalName },
      timeout: 30000,
    });
    return {
      success: true,
      message: `Successfully requested deletion from ${endpointPath}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Python service call failed for ${endpointPath}: ${error.message}`,
    };
  }
}

// @route   POST /api/admin/documents/upload
router.post(
  "/documents/upload",
  adminUpload.single("file"),
  async (req, res) => {
    const { subject } = req.body;
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "No file uploaded or file type rejected." });
    }
    const {
      filename: serverFilename,
      originalname: originalName,
      path: tempServerPath,
    } = req.file;
    let adminDocRecord;
    try {
      if (await AdminDocument.exists({ originalName: originalName })) {
        await fsPromises.unlink(tempServerPath);
        return res
          .status(409)
          .json({ message: `Document '${originalName}' already exists.` });
      }

      const ragResult = await triggerPythonRagProcessingForAdmin(
        tempServerPath,
        originalName
      );
      if (!ragResult.success) {
        await fsPromises.unlink(tempServerPath);
        return res.status(422).json({ message: ragResult.message });
      }

      adminDocRecord = new AdminDocument({
        filename: serverFilename,
        originalName: originalName,
        text: ragResult.text,
        subject: subject || 'Uncategorized'
      });
      await adminDocRecord.save();
      await fsPromises.unlink(tempServerPath);

      // --- ADDED AUDIT LOG ---
      auditLog(req, 'ADMIN_DOCUMENT_UPLOAD_SUCCESS', {
        originalName: originalName,
        serverFilename: serverFilename
      });
      // --- END ---

      res.status(202).json({
        message: `Admin document '${originalName}' uploaded. Background processing initiated.`,
      });

      const { Worker } = require("worker_threads");
      const analysisWorker = new Worker(
        path.resolve(__dirname, "..", "workers", "adminAnalysisWorker.js"),
        {
          workerData: {
            adminDocumentId: adminDocRecord._id.toString(),
            originalName: originalName,
            textForAnalysis: ragResult.text,
          },
        }
      );
      analysisWorker.on("error", (err) =>
        console.error(
          `Admin Analysis Worker Error [Doc: ${originalName}]:`,
          err
        )
      );

      if (ragResult.chunksForKg && ragResult.chunksForKg.length > 0) {
        const kgWorker = new Worker(
          path.resolve(__dirname, "..", "workers", "kgWorker.js"),
          {
            workerData: {
              sourceId: adminDocRecord._id.toString(), // <-- This is the new, correct property
              userId: "admin",
              originalName: originalName,
              chunksForKg: ragResult.chunksForKg,
              llmProvider: "gemini",
            },
          }
        );
        kgWorker.on("error", (err) =>
          console.error(`Admin KG Worker Error [Doc: ${originalName}]:`, err)
        );
      } else {
        console.warn(
          `[Admin Upload] No chunks for KG processing for '${originalName}'.`
        );
        await AdminDocument.updateOne(
          { _id: adminDocRecord._id },
          { $set: { kgStatus: "skipped_no_chunks" } }
        );
      }
    } catch (error) {
      console.error(
        `Admin Upload: Overall error for '${originalName || req.file?.originalname
        }':`,
        error
      );
      if (tempServerPath && fs.existsSync(tempServerPath))
        await fsPromises.unlink(tempServerPath).catch(() => { });
      if (!res.headersSent) {
        res
          .status(500)
          .json({ message: "Server error during admin document upload." });
      }
    }
  }
);

// @route   GET /api/admin/documents
router.get('/documents', cacheMiddleware(CACHE_DURATION_SECONDS), async (req, res) => {
  try {
    const adminDocs = await AdminDocument.find().sort({ uploadedAt: -1 })
      .select('originalName filename uploadedAt analysisUpdatedAt analysis.faq analysis.topics analysis.mindmap');
    const documentsList = adminDocs.map(doc => ({
      originalName: doc.originalName, serverFilename: doc.filename, uploadedAt: doc.uploadedAt,
      analysisUpdatedAt: doc.analysisUpdatedAt,
      hasFaq: !!(doc.analysis?.faq?.trim()),
      hasTopics: !!(doc.analysis?.topics?.trim()),
      hasMindmap: !!(doc.analysis?.mindmap?.trim()),
    }));
    res.json({ documents: documentsList });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching admin documents.' });
  }
});

// @route   DELETE /api/admin/documents/:serverFilename
router.delete("/documents/:serverFilename", async (req, res) => {
  const { serverFilename } = req.params;
  if (!serverFilename) {
    return res.status(400).json({ message: "Server filename is required." });
  }
  try {
    const docToDelete = await AdminDocument.findOne({
      filename: serverFilename,
    });
    if (!docToDelete) {
      return res
        .status(404)
        .json({ message: `Admin document '${serverFilename}' not found.` });
    }

    const originalName = docToDelete.originalName;
    const userId = "admin";

    await callPythonDeletionEndpoint(
      "DELETE",
      `/delete_qdrant_document_data`,
      userId,
      originalName
    );
    await callPythonDeletionEndpoint(
      "DELETE",
      `/kg/${userId}/${encodeURIComponent(originalName)}`,
      userId,
      originalName
    );
    await AdminDocument.deleteOne({ _id: docToDelete._id });

    auditLog(req, 'ADMIN_DOCUMENT_DELETE_SUCCESS', {
      originalName: originalName,
      serverFilename: serverFilename
    });

    res
      .status(200)
      .json({
        message: `Admin document '${originalName}' and all associated data deleted.`,
      });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error during admin document deletion." });
  }
});

// @route   GET /api/admin/documents/:serverFilename/analysis
router.get("/documents/:serverFilename/analysis", async (req, res) => {
  const { serverFilename } = req.params;
  if (!serverFilename)
    return res
      .status(400)
      .json({ message: "Server filename parameter is required." });
  try {
    const adminDoc = await AdminDocument.findOne({
      filename: serverFilename,
    }).select("originalName analysis analysisUpdatedAt");
    if (!adminDoc)
      return res
        .status(404)
        .json({ message: `Admin document '${serverFilename}' not found.` });
    res.status(200).json({
      originalName: adminDoc.originalName,
      analysis: adminDoc.analysis || { faq: "", topics: "", mindmap: "" },
      analysisUpdatedAt: adminDoc.analysisUpdatedAt,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error retrieving admin document analysis." });
  }
});

// @route   GET /api/admin/documents/by-original-name/:originalName/analysis
router.get(
  "/documents/by-original-name/:originalName/analysis",
  async (req, res) => {
    const { originalName } = req.params;
    if (!originalName)
      return res
        .status(400)
        .json({ message: "Original name parameter is required." });
    try {
      const decodedOriginalName = decodeURIComponent(originalName);
      const adminDoc = await AdminDocument.findOne({
        originalName: decodedOriginalName,
      }).select("originalName filename analysis analysisUpdatedAt");
      if (!adminDoc) {
        return res
          .status(404)
          .json({
            message: `Admin document '${decodedOriginalName}' not found.`,
          });
      }
      res.status(200).json({
        originalName: adminDoc.originalName,
        serverFilename: adminDoc.filename,
        analysis: adminDoc.analysis || { faq: "", topics: "", mindmap: "" },
        analysisUpdatedAt: adminDoc.analysisUpdatedAt,
      });
    } catch (error) {
      res
        .status(500)
        .json({
          message: "Server error while retrieving analysis by original name.",
        });
    }
  }
);
// @route   POST /api/admin/documents/update-subjects
// @desc    Batch update subjects for multiple documents
router.post('/documents/update-subjects', async (req, res) => {
  const { updates } = req.body; // Expecting [{ filename: '...', subject: '...' }]
  if (!Array.isArray(updates)) return res.status(400).json({ message: "Updates should be an array." });

  try {
    const promises = updates.map(u =>
      AdminDocument.findOneAndUpdate({ filename: u.filename }, { subject: u.subject })
    );
    await Promise.all(promises);
    res.json({ message: "Subjects updated successfully." });
  } catch (err) {
    res.status(500).json({ message: "Failed to update subjects." });
  }
});

// @route   POST /api/admin/training-data/generate-synthetic
// @desc    Trigger synthetic Q&A generation for a subject
router.post('/training-data/generate-synthetic', async (req, res) => {
  const { subject } = req.body;
  if (!subject) return res.status(400).json({ message: "Subject is required." });

  try {
    const result = await generateSyntheticDataForSubject(subject);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || "Generation failed." });
  }
});

// @route   GET /api/admin/course-model-registries
// @desc    Get all course model registries
router.get('/course-model-registries', async (req, res) => {
  try {
    // 1. Get unique subjects from AdminDocuments to ensure they have a registry
    const subjects = await AdminDocument.distinct('subject');

    // 2. Ensure each subject has a registry entry
    const ensurePromises = subjects.filter(s => s && s !== 'Uncategorized').map(async s => {
      const exists = await CourseModelRegistry.findOne({ subject: s });
      if (!exists) {
        return CourseModelRegistry.create({
          subject: s,
          activeModelTag: 'ollama/qwen2.5-1.5b-instruct:latest', // Default
          versions: [{ tag: 'ollama/qwen2.5-1.5b-instruct:latest', status: 'production' }]
        });
      }
    });
    await Promise.all(ensurePromises);

    // 3. Return all registries
    const registries = await CourseModelRegistry.find().sort({ subject: 1 });
    res.json(registries);
  } catch (err) {
    console.error(`[Admin] Registry Error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch model registries." });
  }
});

// --- User & Chat Management Routes ---

// @route   GET /api/admin/users-with-chats
// @desc    Get all users and their chat session summaries
router.get('/users-with-chats', cacheMiddleware(CACHE_DURATION_SECONDS), async (req, res) => {
  try {
    const allHistories = await ChatHistory.find({})
      .populate('userId', 'email profile.name')
      .sort({ updatedAt: -1 })
      .lean();

    const usersMap = new Map();

    for (const session of allHistories) {
      if (!session.userId) continue;

      const userId = session.userId._id.toString();

      if (!usersMap.has(userId)) {
        usersMap.set(userId, {
          user: {
            _id: userId,
            email: session.userId.email,
            name: session.userId.profile?.name || 'N/A'
          },
          sessions: []
        });
      }

      const userEntry = usersMap.get(userId);
      userEntry.sessions.push({
        sessionId: session.sessionId,
        updatedAt: session.updatedAt,
        summary: session.summary || 'No summary available.',
        messageCount: session.messages?.length || 0
      });
    }

    res.json(Array.from(usersMap.values()));

  } catch (error) {
    console.error('Error fetching users with chat summaries:', error);
    res.status(500).json({ message: 'Server error while fetching user chat data.' });
  }
});


// @route   GET /api/admin/negative-feedback
// @desc    Get all log entries with negative feedback
router.get('/negative-feedback', async (req, res) => {
  try {
    const negativeFeedback = await LLMPerformanceLog.find({ userFeedback: 'negative' })
      .populate('userId', 'email') // Optionally get user email
      .sort({ createdAt: -1 })
      .limit(100); // Limit to the last 100 to prevent performance issues

    res.json(negativeFeedback);
  } catch (error) {
    console.error('Error fetching negative feedback logs:', error);
    res.status(500).json({ message: 'Server error while fetching negative feedback.' });
  }
});


// --- Course Materials Upload Routes ---

// Configure storage for course materials (PDFs) - saved to Cpurses/<courseName>/
const CPURSES_DIR = path.join(__dirname, '..', 'Cpurses');
const materialsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const courseName = req.params.courseName || 'default';
    const sanitizedCourse = courseName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const destinationPath = path.join(CPURSES_DIR, sanitizedCourse);
    fs.mkdir(destinationPath, { recursive: true }, (err) => {
      if (err) return cb(err);
      cb(null, destinationPath);
    });
  },
  filename: (req, file, cb) => {
    // Keep original filename for Resource matching (R1.pdf, R2.pdf, etc.)
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, sanitizedName);
  }
});

const materialsUpload = multer({
  storage: materialsStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit per file
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.docx', '.pptx', '.txt'];
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedExts.join(', ')}`), false);
    }
  }
});

// @route   POST /api/admin/course/:courseName/materials
// @desc    Upload course materials (PDFs) to Cpurses folder
router.post('/course/:courseName/materials', materialsUpload.array('files', 20), async (req, res) => {
  const { courseName } = req.params;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'No files uploaded.' });
  }

  const uploadedFiles = req.files.map(f => ({
    originalName: f.originalname,
    savedAs: f.filename,
    path: f.path,
    size: f.size
  }));

  auditLog(req, 'COURSE_MATERIALS_UPLOAD', {
    courseName,
    fileCount: uploadedFiles.length,
    files: uploadedFiles.map(f => f.originalName)
  });

  res.status(201).json({
    success: true,
    message: `${uploadedFiles.length} file(s) uploaded to course '${courseName}'`,
    courseName,
    folder: path.join(CPURSES_DIR, courseName.replace(/[^a-zA-Z0-9_-]/g, '_')),
    files: uploadedFiles
  });
});

// @route   GET /api/admin/course/:courseName/materials
// @desc    List materials in a course folder
router.get('/course/:courseName/materials', async (req, res) => {
  const { courseName } = req.params;
  const sanitizedCourse = courseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const courseFolder = path.join(CPURSES_DIR, sanitizedCourse);

  try {
    if (!fs.existsSync(courseFolder)) {
      return res.json({ courseName, materials: [] });
    }

    const files = await fsPromises.readdir(courseFolder);
    const materials = [];

    for (const filename of files) {
      const filePath = path.join(courseFolder, filename);
      const stats = await fsPromises.stat(filePath);
      if (stats.isFile()) {
        materials.push({
          filename,
          size: stats.size,
          modifiedAt: stats.mtime
        });
      }
    }

    res.json({ courseName, folder: courseFolder, materials });
  } catch (error) {
    console.error('Error listing course materials:', error);
    res.status(500).json({ message: 'Failed to list course materials.' });
  }
});

// @route   POST /api/admin/course/:courseName/ingest
// @desc    Trigger unified ingestion: CSV → Neo4j + Materials → Qdrant
router.post('/course/:courseName/ingest', async (req, res) => {
  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
  const { courseName } = req.params;

  if (!pythonServiceUrl) {
    return res.status(503).json({ message: 'Python RAG service URL not configured.' });
  }

  // Determine paths
  const sanitizedCourse = courseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const materialsFolder = path.join(CPURSES_DIR, sanitizedCourse);

  // Get syllabus path from request body or use default
  let syllabusPath = req.body.syllabus_csv_path;
  if (!syllabusPath) {
    // Default: look for syllabus in the data folder
    syllabusPath = path.join(__dirname, '..', 'rag_service', 'data', 'machine_learning_syllabus.csv');
  }

  // Validate materials folder exists
  if (!fs.existsSync(materialsFolder)) {
    return res.status(400).json({
      message: `Materials folder not found. Please upload materials first.`,
      expectedFolder: materialsFolder
    });
  }

  try {
    // Call Python unified ingestion endpoint
    const response = await axios.post(
      `${pythonServiceUrl}/course/ingest`,
      {
        course_name: courseName,
        syllabus_csv_path: syllabusPath,
        materials_folder: materialsFolder,
        user_id: 'admin'
      },
      { timeout: 300000 } // 5 minute timeout for large ingestions
    );

    auditLog(req, 'COURSE_INGEST', {
      courseName,
      syllabusPath,
      materialsFolder,
      neo4j: response.data.neo4j,
      qdrantDocsProcessed: response.data.qdrant?.documents_processed?.length || 0
    });

    res.status(201).json(response.data);

  } catch (error) {
    console.error('Error during course ingestion:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.error || error.message || 'Course ingestion failed.';
    res.status(error.response?.status || 500).json({ message: errorMessage });
  }
});







// @route   GET /api/admin/course/:courseName/visualization
// @desc    Get curriculum visualization data for admin
router.get('/course/:courseName/visualization', async (req, res) => {
  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;

  if (!pythonServiceUrl) {
    return res.status(503).json({ message: 'Python RAG service URL not configured.' });
  }

  try {
    const response = await axios.get(
      `${pythonServiceUrl}/course/${encodeURIComponent(req.params.courseName)}/visualization`,
      { timeout: 30000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching visualization:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: error.response?.data?.error || 'Failed to get visualization.'
    });
  }
});

// --- End Course Materials Routes ---


// --- Curriculum Graph Routes (Module/Topic/Subtopic Schema) ---

// Configure multer for syllabus CSV uploads
const syllabusStorage = multer.memoryStorage();
const syllabusUpload = multer({
  storage: syllabusStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});


// @route   POST /api/admin/syllabus/upload
// @desc    Upload a syllabus CSV and build curriculum graph in Neo4j (NEW normalized schema)
router.post('/syllabus/upload', syllabusUpload.single('file'), async (req, res) => {
  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;

  if (!pythonServiceUrl) {
    return res.status(503).json({ message: 'Python RAG service URL not configured.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No CSV file uploaded.' });
  }

  const courseName = req.body.courseName;
  if (!courseName || !courseName.trim()) {
    return res.status(400).json({ message: 'Course name is required.' });
  }

  try {
    const FormData = require('form-data');
    const formData = new FormData();

    // Append the file buffer as a file
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    formData.append('courseName', courseName.trim());

    // Forward to Python service - using NEW /curriculum/upload endpoint
    const response = await axios.post(
      `${pythonServiceUrl}/curriculum/upload`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 60000 // 60 second timeout
      }
    );

    auditLog(req, 'CURRICULUM_GRAPH_UPLOAD', {
      courseName: courseName.trim(),
      filename: req.file.originalname,
      modulesCreated: response.data.modules_created,
      topicsCreated: response.data.topics_created,
      subtopicsCreated: response.data.subtopics_created
    });

    res.status(201).json(response.data);

  } catch (error) {
    console.error('Error uploading curriculum to Python service:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.error || error.message || 'Failed to process curriculum.';
    res.status(error.response?.status || 500).json({ message: errorMessage });
  }
});

// @route   GET /api/admin/syllabus/courses/:courseName
// @desc    Get curriculum structure for a course
router.get('/syllabus/courses/:courseName', async (req, res) => {
  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;

  if (!pythonServiceUrl) {
    return res.status(503).json({ message: 'Python RAG service URL not configured.' });
  }

  try {
    // Use NEW /curriculum/<course>/structure endpoint
    const response = await axios.get(
      `${pythonServiceUrl}/curriculum/${encodeURIComponent(req.params.courseName)}/structure`,
      { timeout: 30000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching curriculum structure:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: error.response?.data?.error || 'Failed to fetch curriculum structure.'
    });
  }
});

// @route   DELETE /api/admin/syllabus/courses/:courseName
// @desc    Delete all curriculum data for a course
router.delete('/syllabus/courses/:courseName', async (req, res) => {
  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;

  if (!pythonServiceUrl) {
    return res.status(503).json({ message: 'Python RAG service URL not configured.' });
  }

  try {
    // Use NEW /curriculum/<course> DELETE endpoint
    const response = await axios.delete(
      `${pythonServiceUrl}/curriculum/${encodeURIComponent(req.params.courseName)}`,
      { timeout: 30000 }
    );

    auditLog(req, 'CURRICULUM_GRAPH_DELETE', {
      courseName: req.params.courseName,
      deletedCount: response.data.deleted_count
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error deleting curriculum graph:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: error.response?.data?.error || 'Failed to delete curriculum graph.'
    });
  }
});

// --- End Curriculum Graph Routes ---


module.exports = router;