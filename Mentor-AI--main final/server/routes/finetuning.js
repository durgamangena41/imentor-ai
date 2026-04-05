// server/routes/finetuning.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const LLMPerformanceLog = require('../models/LLMPerformanceLog');
const FineTuningEvent = require('../models/FineTuningEvent');
const { v4: uuidv4 } = require('uuid');

// Define the shared directory path. Ensure this is accessible by both Node.js and Python containers.
const SHARED_DATA_DIR = process.env.SHARED_FINETUNING_DATA_DIR || '/srv/finetuning_data';

// @route   POST /api/admin/finetuning/start
// @desc    Initiates a model fine-tuning job
// @access  Admin
router.post('/start', async (req, res) => {
    const { modelIdToUpdate, courseId } = req.body;
    if (!modelIdToUpdate) {
        return res.status(400).json({ message: 'modelIdToUpdate is required.' });
    }

    const jobId = uuidv4();
    console.log(`[Finetune Orchestrator] Starting job ${jobId} for model: ${modelIdToUpdate} (Course: ${courseId || 'Global'})`);

    try {
        // Step 1: Collect positive feedback logs (Filtered by course if provided)
        const filter = { userFeedback: 'positive' };
        if (courseId) {
            filter.topic = courseId; // Assuming 'topic' stores the course/subject
        }

        const positiveFeedbackLogs = await LLMPerformanceLog.find(filter)
            .select('query response -_id')
            .lean();

        if (positiveFeedbackLogs.length < 5) { // Lowered for development testing, usually 10+
            return res.status(400).json({
                message: `Insufficient data for fine-tuning. Need at least 5 positive feedback entries, found ${positiveFeedbackLogs.length}.`
            });
        }

        // Step 2: Format & Save Dataset
        const dataset = positiveFeedbackLogs.map(log => ({
            instruction: log.query,
            output: log.response
        }));

        await fs.mkdir(SHARED_DATA_DIR, { recursive: true });
        const datasetFilename = `dataset-${jobId}.json`;
        const datasetPath = path.join(SHARED_DATA_DIR, datasetFilename);
        await fs.writeFile(datasetPath, JSON.stringify(dataset, null, 2));

        // Step 3: Track the Event
        await FineTuningEvent.create({
            jobId,
            courseId,
            modelTagUpdated: modelIdToUpdate,
            datasetPath,
            datasetSize: dataset.length,
            status: 'started'
        });

        // Step 4: Trigger Python Service
        const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL || 'http://localhost:2001';
        const pythonEndpoint = `${pythonServiceUrl}/finetune`;

        const pythonPayload = {
            job_id: jobId,
            dataset_path: datasetPath,
            model_tag_to_update: modelIdToUpdate.replace('ollama/', ''),
            course_id: courseId || 'global'
        };

        axios.post(pythonEndpoint, pythonPayload, { timeout: 5000 }).catch(err => {
            console.error(`[Finetune Orchestrator] Background job trigger failed: ${err.message}`);
        });

        res.status(202).json({
            message: `Fine-tuning job ${jobId} accepted.`,
            jobId,
            datasetSize: dataset.length
        });

    } catch (error) {
        console.error(`[Finetune Orchestrator] Error: ${error.message}`);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// @route   POST /api/admin/finetuning/update-status
// @desc    Callback for Python service to update job status
router.post('/update-status', async (req, res) => {
    const { jobId, status, errorMessage } = req.body;
    try {
        const updateData = { status };
        if (status === 'completed') updateData.completedAt = new Date();
        if (errorMessage) updateData.errorMessage = errorMessage;

        await FineTuningEvent.findOneAndUpdate({ jobId }, updateData);
        console.log(`[Finetune Orchestrator] Job ${jobId} updated to: ${status}`);
        res.sendStatus(200);
    } catch (error) {
        console.error(`[Finetune Orchestrator] Status update failed: ${error.message}`);
        res.status(500).send(error.message);
    }
});

module.exports = router;