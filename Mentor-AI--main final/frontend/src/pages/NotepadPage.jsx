import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Pin,
  PinOff,
  Trash2,
  CalendarDays,
  StickyNote,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  CheckSquare,
  Minus,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  RotateCw,
  GripVertical,
  Tag,
  X,
  Download,
  FileText,
  Pencil,
  Save,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

const FONT_FAMILIES = [
  { label: 'Serif', value: 'serif' },
  { label: 'Sans-serif', value: 'sans-serif' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'Cursive', value: 'cursive' },
];

const FONT_SIZES = [12, 14, 16, 18, 24, 32];

const TEXT_SWATCHES = ['#111827', '#1f2937', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#0f766e', '#db2777', '#4b5563', '#000000'];
const HIGHLIGHT_SWATCHES = ['#fef08a', '#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#e9d5ff', '#fbcfe8', '#e5e7eb'];
const NOTE_COLORS = ['#ffffff', '#fef3c7', '#fce7f3', '#dbeafe', '#dcfce7', '#ede9fe', '#ffedd5', '#f3f4f6'];

const PRIORITY_META = {
  low: { dot: '#22c55e', label: 'Low' },
  medium: { dot: '#f59e0b', label: 'Medium' },
  high: { dot: '#ef4444', label: 'High' },
};

function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function ymd(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthName(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function orderNotes(list) {
  return [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const orderA = Number.isFinite(a.noteOrder) ? a.noteOrder : 0;
    const orderB = Number.isFinite(b.noteOrder) ? b.noteOrder : 0;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function htmlToMarkdown(html) {
  if (!html) return '';
  return String(html)
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<u[^>]*>(.*?)<\/u>/gi, '<u>$1</u>')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function NotepadPage() {
  const [view, setView] = useState('notes');
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState('all');
  const [saveState, setSaveState] = useState('saved');
  const [dirty, setDirty] = useState(false);

  const [title, setTitle] = useState('Untitled Note');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [noteColor, setNoteColor] = useState('#ffffff');
  const [noteTags, setNoteTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [fontFamily, setFontFamily] = useState('sans-serif');
  const [fontSize, setFontSize] = useState(16);

  const [draggedNoteId, setDraggedNoteId] = useState(null);

  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [todos, setTodos] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium' });
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskDraft, setTaskDraft] = useState({ title: '', description: '', priority: 'medium' });

  const editorRef = useRef(null);
  const autosaveTimerRef = useRef(null);

  const selectedNote = useMemo(() => notes.find((n) => n._id === selectedNoteId) || null, [notes, selectedNoteId]);

  const allTags = useMemo(() => {
    const tagSet = new Set();
    notes.forEach((note) => {
      const tags = Array.isArray(note.tags) ? note.tags : [];
      tags.forEach((tag) => {
        if (tag) tagSet.add(tag);
      });
    });
    return [...tagSet].sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = notes.filter((note) => {
      const t = String(note.title || '').toLowerCase();
      const c = stripHtml(note.content || '').toLowerCase();
      const tagHit = (note.tags || []).some((tag) => String(tag).toLowerCase().includes(q));
      const queryPass = !q || t.includes(q) || c.includes(q) || tagHit;
      const filterPass = activeTagFilter === 'all' || (note.tags || []).includes(activeTagFilter);
      return queryPass && filterPass;
    });

    const pinned = base.filter((n) => n.isPinned);
    const others = base.filter((n) => !n.isPinned);
    return { pinned, others };
  }, [notes, searchQuery, activeTagFilter]);

  const dateTodosMap = useMemo(() => {
    const map = new Map();
    todos.forEach((task) => {
      const key = ymd(new Date(task.dueDate));
      const existing = map.get(key) || [];
      existing.push(task);
      map.set(key, existing);
    });
    return map;
  }, [todos]);

  const selectedDateTodos = useMemo(() => {
    const key = ymd(selectedDate);
    const list = dateTodosMap.get(key) || [];
    return [...list].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
    });
  }, [dateTodosMap, selectedDate]);

  const fetchNotes = useCallback(async () => {
    setLoadingNotes(true);
    try {
      const response = await axios.get(`${API_BASE}/notes`, { headers: getAuthHeaders() });
      const nextNotes = Array.isArray(response.data?.notes) ? orderNotes(response.data.notes) : [];
      setNotes(nextNotes);
      if (!selectedNoteId && nextNotes.length > 0) {
        setSelectedNoteId(nextNotes[0]._id);
      }
      if (nextNotes.length === 0) {
        setTitle('Untitled Note');
        setContent('');
        setIsPinned(false);
        setNoteColor('#ffffff');
        setNoteTags([]);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load notes.');
    } finally {
      setLoadingNotes(false);
    }
  }, [selectedNoteId]);

  const fetchTodos = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/todos`, {
        headers: getAuthHeaders(),
        params: {
          month: monthCursor.getMonth() + 1,
          year: monthCursor.getFullYear(),
        },
      });
      setTodos(Array.isArray(response.data?.todos) ? response.data.todos : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load calendar tasks.');
    } finally {
      setCalendarLoading(false);
    }
  }, [monthCursor]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  useEffect(() => {
    if (!selectedNote) return;
    setTitle(selectedNote.title || 'Untitled Note');
    setContent(selectedNote.content || '');
    setIsPinned(Boolean(selectedNote.isPinned));
    setNoteColor(selectedNote.color || '#ffffff');
    setNoteTags(Array.isArray(selectedNote.tags) ? selectedNote.tags : []);
    setDirty(false);
    setSaveState('saved');
  }, [selectedNote]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content || '';
    }
  }, [content]);

  const updateNoteOnServer = useCallback(async () => {
    if (!selectedNoteId) return;

    setSaveState('saving');
    try {
      const response = await axios.put(
        `${API_BASE}/notes/${selectedNoteId}`,
        {
          title: title.trim() || 'Untitled Note',
          content,
          color: noteColor,
          isPinned,
          tags: noteTags,
          noteOrder: Number.isFinite(selectedNote?.noteOrder) ? selectedNote.noteOrder : 0,
        },
        { headers: getAuthHeaders() }
      );

      const updatedNote = response.data?.note;
      if (updatedNote) {
        setNotes((prev) => orderNotes(prev.map((item) => (item._id === updatedNote._id ? updatedNote : item))));
      }
      setSaveState('saved');
      setDirty(false);
    } catch (error) {
      setSaveState('saved');
      toast.error(error.response?.data?.message || 'Failed to save note.');
    }
  }, [selectedNoteId, title, content, noteColor, isPinned, noteTags, selectedNote?.noteOrder]);

  useEffect(() => {
    if (!selectedNoteId || !dirty) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      updateNoteOnServer();
    }, 10000);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [selectedNoteId, dirty, updateNoteOnServer]);

  const createNote = async () => {
    try {
      const response = await axios.post(
        `${API_BASE}/notes`,
        {
          title: 'Untitled Note',
          content: '',
          color: '#ffffff',
          isPinned: false,
          tags: [],
        },
        { headers: getAuthHeaders() }
      );

      const note = response.data?.note;
      if (!note) return;
      setNotes((prev) => orderNotes([note, ...prev]));
      setSelectedNoteId(note._id);
      setView('notes');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create note.');
    }
  };

  const deleteCurrentNote = async () => {
    if (!selectedNoteId) return;
    try {
      await axios.delete(`${API_BASE}/notes/${selectedNoteId}`, { headers: getAuthHeaders() });
      const remaining = notes.filter((n) => n._id !== selectedNoteId);
      setNotes(remaining);
      setSelectedNoteId(remaining[0]?._id || null);
      if (!remaining.length) {
        setTitle('Untitled Note');
        setContent('');
        setIsPinned(false);
        setNoteColor('#ffffff');
        setNoteTags([]);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete note.');
    }
  };

  const runCommand = (command, value = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    const html = editorRef.current.innerHTML;
    setContent(html);
    setDirty(true);
  };

  const insertCheckboxList = () => {
    runCommand('insertHTML', '<ul><li><input type="checkbox" /> Task item</li></ul>');
  };

  const insertDivider = () => {
    runCommand('insertHTML', '<hr />');
  };

  const setTextColor = (color) => runCommand('foreColor', color);

  const setHighlightColor = (color) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const success = document.execCommand('hiliteColor', false, color);
    if (!success) {
      document.execCommand('backColor', false, color);
    }
    const html = editorRef.current.innerHTML;
    setContent(html);
    setDirty(true);
  };

  const addTagToCurrent = () => {
    const nextTag = tagInput.trim();
    if (!nextTag) return;
    if (noteTags.includes(nextTag)) {
      setTagInput('');
      return;
    }
    setNoteTags((prev) => [...prev, nextTag]);
    setTagInput('');
    setDirty(true);
  };

  const removeTagFromCurrent = (tag) => {
    setNoteTags((prev) => prev.filter((item) => item !== tag));
    setDirty(true);
  };

  const handleNoteDrop = async (targetId) => {
    if (!draggedNoteId || draggedNoteId === targetId) return;

    const source = notes.find((note) => note._id === draggedNoteId);
    const target = notes.find((note) => note._id === targetId);
    if (!source || !target || source.isPinned !== target.isPinned) {
      setDraggedNoteId(null);
      return;
    }

    const sectionNotes = notes
      .filter((note) => note.isPinned === source.isPinned)
      .sort((a, b) => (a.noteOrder ?? 0) - (b.noteOrder ?? 0));

    const draggedIndex = sectionNotes.findIndex((note) => note._id === draggedNoteId);
    const targetIndex = sectionNotes.findIndex((note) => note._id === targetId);
    if (draggedIndex < 0 || targetIndex < 0) {
      setDraggedNoteId(null);
      return;
    }

    const reorderedSection = [...sectionNotes];
    const [moved] = reorderedSection.splice(draggedIndex, 1);
    reorderedSection.splice(targetIndex, 0, moved);

    const orderMap = new Map(reorderedSection.map((note, index) => [note._id, index]));

    setNotes((prev) =>
      orderNotes(
        prev.map((note) => {
          if (note.isPinned !== source.isPinned) return note;
          if (!orderMap.has(note._id)) return note;
          return { ...note, noteOrder: orderMap.get(note._id) };
        })
      )
    );

    setDraggedNoteId(null);

    try {
      await axios.put(
        `${API_BASE}/notes/reorder`,
        { orderedIds: reorderedSection.map((note) => note._id) },
        { headers: getAuthHeaders() }
      );
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save note order.');
      fetchNotes();
    }
  };

  const calendarCells = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startOffset; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(year, month, day));
    }
    const totalCells = cells.length > 35 ? 42 : 35;
    while (cells.length < totalCells) {
      cells.push(null);
    }

    return cells;
  }, [monthCursor]);

  const isToday = (date) => {
    const now = new Date();
    return ymd(now) === ymd(date);
  };

  const toggleTaskCompleted = async (task) => {
    try {
      await axios.put(
        `${API_BASE}/todos/${task._id}`,
        { completed: !task.completed },
        { headers: getAuthHeaders() }
      );
      fetchTodos();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update task.');
    }
  };

  const addTaskForDate = async () => {
    if (!newTask.title.trim()) {
      toast.error('Task title is required.');
      return;
    }

    try {
      await axios.post(
        `${API_BASE}/todos`,
        {
          title: newTask.title.trim(),
          description: newTask.description.trim(),
          priority: newTask.priority,
          dueDate: selectedDate,
          color: PRIORITY_META[newTask.priority]?.dot || '#f59e0b',
        },
        { headers: getAuthHeaders() }
      );
      setNewTask({ title: '', description: '', priority: 'medium' });
      setIsAddingTask(false);
      fetchTodos();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add task.');
    }
  };

  const startTaskEdit = (task) => {
    setEditingTaskId(task._id);
    setTaskDraft({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
    });
  };

  const saveTaskEdit = async () => {
    if (!editingTaskId) return;
    if (!taskDraft.title.trim()) {
      toast.error('Task title is required.');
      return;
    }

    try {
      await axios.put(
        `${API_BASE}/todos/${editingTaskId}`,
        {
          title: taskDraft.title.trim(),
          description: taskDraft.description.trim(),
          priority: taskDraft.priority,
          color: PRIORITY_META[taskDraft.priority]?.dot || '#f59e0b',
        },
        { headers: getAuthHeaders() }
      );
      setEditingTaskId(null);
      fetchTodos();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save task.');
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await axios.delete(`${API_BASE}/todos/${taskId}`, { headers: getAuthHeaders() });
      if (editingTaskId === taskId) {
        setEditingTaskId(null);
      }
      fetchTodos();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete task.');
    }
  };

  const exportMarkdown = () => {
    if (!selectedNote) return;
    const markdown = htmlToMarkdown(content);
    const blob = new Blob([`# ${title}\n\n${markdown}`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(title || 'note').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'note'}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!selectedNote) return;
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);

    const frameDoc = frame.contentWindow?.document;
    if (!frameDoc) {
      frame.remove();
      toast.error('PDF export could not start. Please try again.');
      return;
    }

    frameDoc.write(`
      <!doctype html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; line-height: 1.6; }
            h1 { margin-bottom: 12px; }
            hr { border: none; border-top: 1px solid #ddd; margin: 16px 0; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <hr />
          <div>${content}</div>
        </body>
      </html>
    `);
    frameDoc.close();

    const doPrint = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        setTimeout(() => frame.remove(), 1000);
      }
    };

    if (frame.contentWindow?.document?.readyState === 'complete') {
      doPrint();
    } else {
      frame.onload = doPrint;
    }
  };

  const wordCount = useMemo(() => {
    const plain = stripHtml(content);
    if (!plain) return 0;
    return plain.split(/\s+/).filter(Boolean).length;
  }, [content]);

  const charCount = useMemo(() => stripHtml(content).length, [content]);

  const renderNoteCard = (note, pinnedSection = false) => (
    <div
      key={note._id}
      draggable
      onDragStart={() => setDraggedNoteId(note._id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => handleNoteDrop(note._id)}
      className={`w-full rounded-lg border px-3 py-2 text-slate-900 transition-colors ${selectedNoteId === note._id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
      style={{ borderLeftWidth: 4, borderLeftColor: note.color || '#ffffff' }}
    >
      <button
        type="button"
        onClick={() => {
          setView('notes');
          setSelectedNoteId(note._id);
        }}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <GripVertical size={13} className="shrink-0 text-slate-400" />
            <p className="truncate text-sm font-semibold">{note.title || 'Untitled Note'}</p>
          </div>
          {pinnedSection && <Pin size={14} className="text-amber-500" />}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{stripHtml(note.content).slice(0, 60) || 'Empty note...'}</p>
        {!!(note.tags || []).length && (
          <div className="mt-1 flex flex-wrap gap-1">
            {note.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">#{tag}</span>
            ))}
          </div>
        )}
      </button>
    </div>
  );

  return (
    <div
      className="bg-[#0f1b3d] text-slate-100"
      style={{ display: 'flex', flexDirection: 'row', height: '100vh', width: '100%', overflow: 'hidden' }}
    >
      <aside
        className="bg-[#1f2a44] p-4"
        style={{
          width: '300px',
          minWidth: '300px',
          borderRight: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-[#111a2f] px-3 py-2.5">
            <Search size={16} className="text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes"
              className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="mb-3 flex items-center gap-2">
            <Tag size={14} className="text-slate-400" />
            <select
              value={activeTagFilter}
              onChange={(e) => setActiveTagFilter(e.target.value)}
              className="w-full rounded-md border border-slate-600 bg-white px-2.5 py-2 text-sm text-slate-900"
            >
              <option value="all">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>#{tag}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={createNote}
            className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            New Note
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-1">
            {loadingNotes ? (
              <p className="text-sm text-slate-300">Loading notes...</p>
            ) : (
              <>
                {filteredNotes.pinned.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Pinned Notes</p>
                    <div className="space-y-2">
                      {filteredNotes.pinned.map((note) => renderNoteCard(note, true))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">All Notes</p>
                  <div className="space-y-2">
                    {filteredNotes.others.map((note) => renderNoteCard(note, false))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setView('notes')}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${view === 'notes' ? 'bg-blue-600 text-white' : 'border border-slate-700 bg-[#111a2f] text-slate-200'}`}
            >
              <StickyNote size={15} />
              Notes
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${view === 'calendar' ? 'bg-blue-600 text-white' : 'border border-slate-700 bg-[#111a2f] text-slate-200'}`}
            >
              <CalendarDays size={15} />
              Calendar
            </button>
          </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', backgroundColor: '#0f1b3d' }}>

        {view === 'notes' ? (
          <section className="min-w-0 bg-[#0f1b3d] p-4">
            {!selectedNote ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-600 bg-[#1f2a44] text-slate-200">
                Create or select a note to begin writing.
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="mb-3 rounded-xl border border-slate-700 bg-[#1f2a44] p-4">
                  <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
                    <input
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setDirty(true);
                      }}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500"
                      placeholder="Note title"
                    />
                    <select
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                    >
                      {FONT_FAMILIES.map((font) => (
                        <option key={font.value} value={font.value}>{font.label}</option>
                      ))}
                    </select>
                    <select
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                    >
                      {FONT_SIZES.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => runCommand('undo')} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800" title="Undo">
                      <RotateCcw size={14} />
                    </button>
                    <button type="button" onClick={() => runCommand('redo')} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800" title="Redo">
                      <RotateCw size={14} />
                    </button>
                    <button type="button" onClick={() => runCommand('bold')} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"><Bold size={14} /></button>
                    <button type="button" onClick={() => runCommand('italic')} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"><Italic size={14} /></button>
                    <button type="button" onClick={() => runCommand('underline')} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"><Underline size={14} /></button>
                    <button type="button" onClick={() => runCommand('insertUnorderedList')} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"><List size={14} /></button>
                    <button type="button" onClick={() => runCommand('insertOrderedList')} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"><ListOrdered size={14} /></button>
                    <button type="button" onClick={insertCheckboxList} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"><CheckSquare size={14} /></button>
                    <button type="button" onClick={insertDivider} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"><Minus size={14} /></button>
                  </div>

                  <div className="mb-2">
                    <p className="mb-1 text-xs font-semibold text-slate-200">Text Color</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {TEXT_SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          onClick={() => setTextColor(swatch)}
                          className="h-6 w-6 rounded-full border border-slate-300"
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                      <input type="color" onChange={(e) => setTextColor(e.target.value)} className="h-7 w-8 cursor-pointer" />
                    </div>
                  </div>

                  <div className="mb-2">
                    <p className="mb-1 text-xs font-semibold text-slate-200">Highlight</p>
                    <div className="flex flex-wrap gap-2">
                      {HIGHLIGHT_SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          onClick={() => setHighlightColor(swatch)}
                          className="h-6 w-6 rounded border border-slate-300"
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mb-2">
                    <p className="mb-1 text-xs font-semibold text-slate-200">Note Background</p>
                    <div className="flex flex-wrap gap-2">
                      {NOTE_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            setNoteColor(color);
                            setDirty(true);
                          }}
                          className={`h-6 w-6 rounded border ${noteColor === color ? 'border-slate-900' : 'border-slate-300'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-semibold text-slate-200">Tags</p>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {noteTags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          #{tag}
                          <button type="button" onClick={() => removeTagFromCurrent(tag)}><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTagToCurrent();
                          }
                        }}
                        placeholder="Add a tag"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400"
                      />
                      <button type="button" onClick={addTagToCurrent} className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700">Add</button>
                    </div>
                  </div>
                </div>

                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => {
                    setContent(e.currentTarget.innerHTML);
                    setDirty(true);
                  }}
                  className="min-h-[460px] md:min-h-[540px] lg:min-h-[600px] flex-1 overflow-y-auto rounded-xl border border-slate-200 p-6 shadow-inner outline-none"
                  style={{ backgroundColor: noteColor, fontFamily, fontSize: `${fontSize}px`, minHeight: '42vh' }}
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-[#1f2a44] px-3 py-2 text-xs text-slate-200">
                  <div className="flex items-center gap-3">
                    <span>Words: {wordCount}</span>
                    <span>Characters: {charCount}</span>
                    <span className="font-semibold">{saveState === 'saving' || dirty ? 'Saving...' : 'Saved'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={exportMarkdown} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-800">
                      <FileText size={14} />
                      MD
                    </button>
                    <button type="button" onClick={exportPdf} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-800">
                      <Download size={14} />
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPinned((prev) => !prev);
                        setDirty(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-800"
                    >
                      {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                      {isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      onClick={deleteCurrentNote}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2 py-1 text-rose-700"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="min-w-0 bg-[#0f1b3d] p-4">
            <div className="mb-4 flex items-center justify-between">
              <button type="button" onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-800">
                <ArrowLeft size={16} />
              </button>
              <h2 className="text-lg font-semibold">{monthName(monthCursor)}</h2>
              <button type="button" onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-800">
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200 md:text-xs">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2 md:gap-3">
              {calendarCells.map((date, idx) => {
                if (!date) {
                  return <div key={`blank-${idx}`} className="h-24 md:h-28 lg:h-32 rounded-lg border border-transparent" />;
                }

                const key = ymd(date);
                const dayTasks = dateTodosMap.get(key) || [];
                const selected = key === ymd(selectedDate);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDate(date);
                      setIsAddingTask(false);
                    }}
                    className={`h-24 md:h-28 lg:h-32 rounded-lg border p-2 md:p-2.5 text-left ${selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'} ${isToday(date) ? 'ring-1 ring-slate-400' : ''}`}
                  >
                    <p className="text-sm md:text-base font-semibold text-slate-700">{date.getDate()}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {dayTasks.slice(0, 4).map((task) => (
                        <span
                          key={task._id}
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: PRIORITY_META[task.priority]?.dot || '#94a3b8' }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-base font-semibold">Tasks for {selectedDate.toDateString()}</h3>
                <button
                  type="button"
                  onClick={() => setIsAddingTask((prev) => !prev)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Add Task
                </button>
              </div>

              {isAddingTask && (
                <div className="mb-3 grid gap-2 rounded-lg border border-slate-200 p-2">
                  <input
                    value={newTask.title}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Task title"
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                  />
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Description (optional)"
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    rows={2}
                  />
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, priority: e.target.value }))}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <button
                    type="button"
                    onClick={addTaskForDate}
                    className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Save Task
                  </button>
                </div>
              )}

              {calendarLoading ? (
                <p className="text-sm text-slate-500">Loading tasks...</p>
              ) : selectedDateTodos.length === 0 ? (
                <p className="text-sm text-slate-500">No tasks for this day.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDateTodos.map((task) => {
                    const isEditing = editingTaskId === task._id;
                    return (
                      <div key={task._id} className="rounded-md border border-slate-200 p-2">
                        {isEditing ? (
                          <div className="grid gap-2">
                            <input
                              value={taskDraft.title}
                              onChange={(e) => setTaskDraft((prev) => ({ ...prev, title: e.target.value }))}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                            />
                            <textarea
                              value={taskDraft.description}
                              onChange={(e) => setTaskDraft((prev) => ({ ...prev, description: e.target.value }))}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                              rows={2}
                            />
                            <div className="flex items-center gap-2">
                              <select
                                value={taskDraft.priority}
                                onChange={(e) => setTaskDraft((prev) => ({ ...prev, priority: e.target.value }))}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                              <button type="button" onClick={saveTaskEdit} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                                <Save size={13} /> Save
                              </button>
                              <button type="button" onClick={() => setEditingTaskId(null)} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs">
                                <X size={13} /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <label className="flex items-start gap-2">
                              <input type="checkbox" checked={task.completed} onChange={() => toggleTaskCompleted(task)} className="mt-1" />
                              <span>
                                <span className={`block text-sm font-semibold ${task.completed ? 'line-through text-slate-400' : ''}`}>{task.title}</span>
                                {task.description && <span className="block text-xs text-slate-500">{task.description}</span>}
                              </span>
                            </label>
                            <div className="flex items-center gap-1">
                              <span
                                className="rounded px-2 py-0.5 text-[11px] font-semibold text-white"
                                style={{ backgroundColor: PRIORITY_META[task.priority]?.dot || '#94a3b8' }}
                              >
                                {PRIORITY_META[task.priority]?.label || 'Medium'}
                              </span>
                              <button type="button" onClick={() => startTaskEdit(task)} className="rounded border border-slate-300 bg-white p-1" title="Edit task">
                                <Pencil size={12} />
                              </button>
                              <button type="button" onClick={() => deleteTask(task._id)} className="rounded border border-rose-300 bg-white p-1 text-rose-600" title="Delete task">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        <div className="px-4 pb-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
          >
            <ArrowLeft size={12} />
            Back to Tutor
          </Link>
        </div>
      </div>
    </div>
  );
}
