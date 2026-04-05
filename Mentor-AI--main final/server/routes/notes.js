const express = require('express');
const mongoose = require('mongoose');

const notesRouter = express.Router();
const todosRouter = express.Router();

const noteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, default: 'Untitled Note' },
    content: { type: String, default: '' },
    color: { type: String, default: '#ffffff' },
    isPinned: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    noteOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const todoTaskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    dueDate: { type: Date, required: true, index: true },
    completed: { type: Boolean, default: false },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    color: { type: String, default: '#86efac' },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

const Note = mongoose.models.Note || mongoose.model('Note', noteSchema);
const TodoTask = mongoose.models.TodoTask || mongoose.model('TodoTask', todoTaskSchema);

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizePriority(value) {
  if (!value) return 'medium';
  const parsed = String(value).toLowerCase();
  if (parsed === 'low' || parsed === 'medium' || parsed === 'high') return parsed;
  return 'medium';
}

function parseMonthYear(month, year) {
  const monthNum = Number.parseInt(month, 10);
  const yearNum = Number.parseInt(year, 10);

  if (!Number.isInteger(monthNum) || !Number.isInteger(yearNum)) {
    return null;
  }

  if (monthNum < 1 || monthNum > 12 || yearNum < 1970 || yearNum > 3000) {
    return null;
  }

  const start = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0, 0));
  return { start, end };
}

// Notes CRUD
notesRouter.get('/', async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.id }).sort({ isPinned: -1, noteOrder: 1, updatedAt: -1 });
    return res.json({ notes });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch notes.' });
  }
});

notesRouter.post('/', async (req, res) => {
  try {
    const lastNote = await Note.findOne({ userId: req.user.id, isPinned: Boolean(req.body.isPinned) }).sort({ noteOrder: -1 });
    const nextOrder = Number.isFinite(lastNote?.noteOrder) ? lastNote.noteOrder + 1 : 0;

    const note = await Note.create({
      userId: req.user.id,
      title: req.body.title || 'Untitled Note',
      content: req.body.content || '',
      color: req.body.color || '#ffffff',
      isPinned: Boolean(req.body.isPinned),
      tags: sanitizeTags(req.body.tags),
      noteOrder: nextOrder,
    });

    return res.status(201).json({ note });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create note.' });
  }
});

notesRouter.put('/reorder', async (req, res) => {
  try {
    const orderedIds = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];
    if (!orderedIds.length) {
      return res.status(400).json({ message: 'orderedIds is required.' });
    }

    const operations = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, userId: req.user.id },
        update: { $set: { noteOrder: index } },
      },
    }));

    await Note.bulkWrite(operations, { ordered: true });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to reorder notes.' });
  }
});

notesRouter.put('/:id', async (req, res) => {
  try {
    const updated = await Note.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      {
        $set: {
          title: req.body.title || 'Untitled Note',
          content: typeof req.body.content === 'string' ? req.body.content : '',
          color: req.body.color || '#ffffff',
          isPinned: Boolean(req.body.isPinned),
          tags: sanitizeTags(req.body.tags),
          ...(Number.isFinite(req.body.noteOrder) ? { noteOrder: req.body.noteOrder } : {}),
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Note not found.' });
    }

    return res.json({ note: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update note.' });
  }
});

notesRouter.delete('/:id', async (req, res) => {
  try {
    const deleted = await Note.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!deleted) {
      return res.status(404).json({ message: 'Note not found.' });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete note.' });
  }
});

// Todos CRUD
todosRouter.get('/', async (req, res) => {
  try {
    const query = { userId: req.user.id };

    if (req.query.month && req.query.year) {
      const range = parseMonthYear(req.query.month, req.query.year);
      if (!range) {
        return res.status(400).json({ message: 'Invalid month or year query.' });
      }
      query.dueDate = { $gte: range.start, $lt: range.end };
    }

    const todos = await TodoTask.find(query).sort({ dueDate: 1, createdAt: -1 });
    return res.json({ todos });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch tasks.' });
  }
});

todosRouter.post('/', async (req, res) => {
  try {
    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    if (!dueDate || Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({ message: 'A valid dueDate is required.' });
    }

    const todo = await TodoTask.create({
      userId: req.user.id,
      title: req.body.title,
      description: req.body.description || '',
      dueDate,
      completed: Boolean(req.body.completed),
      priority: normalizePriority(req.body.priority),
      color: req.body.color || '#86efac',
    });

    return res.status(201).json({ todo });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create task.' });
  }
});

todosRouter.put('/:id', async (req, res) => {
  try {
    const payload = {};

    if (typeof req.body.title === 'string') payload.title = req.body.title;
    if (typeof req.body.description === 'string') payload.description = req.body.description;
    if (typeof req.body.completed === 'boolean') payload.completed = req.body.completed;
    if (typeof req.body.priority === 'string') payload.priority = normalizePriority(req.body.priority);
    if (typeof req.body.color === 'string') payload.color = req.body.color;

    if (req.body.dueDate) {
      const parsed = new Date(req.body.dueDate);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: 'Invalid dueDate.' });
      }
      payload.dueDate = parsed;
    }

    const updated = await TodoTask.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: payload },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    return res.json({ todo: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update task.' });
  }
});

todosRouter.delete('/:id', async (req, res) => {
  try {
    const deleted = await TodoTask.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!deleted) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete task.' });
  }
});

module.exports = {
  notesRouter,
  todosRouter,
};
