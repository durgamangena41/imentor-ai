const mongoose = require('mongoose');

const FocusSessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
        plannedMinutes: {
            type: Number,
            required: true,
            min: 1,
        },
        actualMinutes: {
            type: Number,
            required: true,
            min: 0,
        },
        completed: {
            type: Boolean,
            default: false,
            index: true,
        },
        xpEarned: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
    }
);

FocusSessionSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('FocusSession', FocusSessionSchema);
