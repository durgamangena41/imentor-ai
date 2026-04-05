// server/routes/feedback.js
const express = require('express');
const router = express.Router();
const LLMPerformanceLog = require('../models/LLMPerformanceLog');

// @route   POST /api/feedback/:logId
// @desc    Submit user feedback for a specific AI response
// @access  Private (authMiddleware is applied in server.js)
router.post('/:logId', async (req, res) => {
    const { logId } = req.params;
    const { feedback, granular } = req.body; // 'positive' or 'negative' and optional granular object
    const userId = req.user._id;

    try {
        const logEntry = await LLMPerformanceLog.findById(logId);

        // Security check
        if (!logEntry || logEntry.userId.toString() !== userId.toString()) {
            return res.status(404).json({ message: 'Log entry not found or access denied.' });
        }

        if (feedback) logEntry.userFeedback = feedback;

        if (granular) {
            logEntry.granularFeedback = granular;
            // Quality Score Calculation: Weighted average
            // Accuracy is weighted slightly higher (40%) than clarity and completeness (30% each)
            const score = (granular.accuracy * 0.4) + (granular.clarity * 0.3) + (granular.completeness * 0.3);
            logEntry.qualityScore = score;
        }

        await logEntry.save();

        res.status(200).json({ message: 'Thank you for your feedback!' });
    } catch (error) {
        console.error(`Error saving feedback for log ${logId}:`, error);
        res.status(500).json({ message: 'Server error while saving feedback.' });
    }
});

module.exports = router;