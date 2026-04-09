import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, Download, Save, Sparkles, Link2, FileText, Type, ArrowLeft, MessageSquareText } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

import { saveNote, summarizeFile, summarizeText, summarizeUrl } from '../services/summarizerApi.js';

const FORMAT_OPTIONS = [
  { id: 'bullets', label: 'Bullet Points', icon: Type },
  { id: 'paragraph', label: 'Paragraph', icon: FileText },
  { id: 'numbered', label: 'Numbered List', icon: MessageSquareText },
  { id: 'cornell', label: 'Cornell Notes', icon: Sparkles },
  { id: 'tweet', label: 'Tweet', icon: Link2 },
];

const LENGTH_OPTIONS = [
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'detailed', label: 'Detailed' },
];

const INPUT_TABS = [
  { id: 'text', label: 'Paste Text' },
  { id: 'file', label: 'Upload File' },
  { id: 'url', label: 'From URL' },
];

const FORMAT_TITLES = {
  bullets: 'Bullet Points',
  paragraph: 'Paragraph',
  numbered: 'Numbered List',
  cornell: 'Cornell Notes',
  tweet: 'Tweet',
};

function toMarkdownSummary(result, format) {
  if (format === 'cornell' && result && typeof result === 'object') {
    const mainNotes = Array.isArray(result.mainNotes) ? result.mainNotes : [];
    const keyQuestions = Array.isArray(result.keyQuestions) ? result.keyQuestions : [];
    const summary = String(result.summary || '').trim();

    const notesBlock = mainNotes.map((item) => `- ${item}`).join('\n');
    const questionsBlock = keyQuestions.map((item) => `- ${item}`).join('\n');

    return `## Main Notes\n${notesBlock || '- No notes generated.'}\n\n## Key Questions\n${questionsBlock || '- No questions generated.'}\n\n## Summary\n${summary || 'No summary generated.'}`;
  }

  return String(result || '').trim();
}

function renderMarkdown(markdownText) {
  const html = marked.parse(markdownText || '');
  return { __html: DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) };
}

function createTweetText(result) {
  return String(result || '').trim();
}

function SummarizerPage() {
  const navigate = useNavigate();
  const [inputTab, setInputTab] = useState('text');
  const [format, setFormat] = useState('bullets');
  const [length, setLength] = useState('medium');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [summaryResult, setSummaryResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const summaryMarkdown = useMemo(() => {
    if (!summaryResult) return '';
    if (format === 'cornell') {
      return toMarkdownSummary(summaryResult.summary, format);
    }
    return toMarkdownSummary(summaryResult.summary, format);
  }, [format, summaryResult]);

  const tweetText = useMemo(() => {
    if (!summaryResult || format !== 'tweet') return '';
    return createTweetText(summaryResult.summary);
  }, [format, summaryResult]);

  const handleSummarize = async () => {
    setIsLoading(true);
    try {
      let response;
      if (inputTab === 'file') {
        if (!file) {
          toast.error('Choose a file first.');
          return;
        }
        response = await summarizeFile(file, { format, length });
      } else if (inputTab === 'url') {
        if (!url.trim()) {
          toast.error('Paste a valid URL first.');
          return;
        }
        response = await summarizeUrl({ url: url.trim(), format, length });
      } else {
        if (!text.trim()) {
          toast.error('Paste text first.');
          return;
        }
        response = await summarizeText({ text: text.trim(), format, length });
      }

      setSummaryResult(response);
      toast.success('Summary generated.');
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to summarize content.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!summaryResult) return;
    const outputText = format === 'tweet' ? tweetText : summaryMarkdown;
    await navigator.clipboard.writeText(outputText);
    toast.success('Copied to clipboard.');
  };

  const handleDownload = () => {
    if (!summaryResult) return;
    const outputText = format === 'tweet' ? tweetText : summaryMarkdown;
    const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `summarizer-${format}-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
  };

  const handleSaveNote = async () => {
    if (!summaryResult) return;

    try {
      const content = format === 'tweet' ? tweetText : summaryMarkdown;
      const notePayload = {
        title: `Summary - ${FORMAT_TITLES[format]}`,
        content,
        color: '#0f172a',
        isPinned: false,
        tags: ['summary', format, inputTab],
      };

      await saveNote(notePayload);
      toast.success('Saved to Notepad.');
      navigate('/notepad');
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to save note.');
    }
  };

  const outputText = format === 'tweet' ? tweetText : summaryMarkdown;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_28%),linear-gradient(180deg,_#07111f_0%,_#0b1220_45%,_#050816_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">iMentor AI</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">AI Smart Summarizer</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">Turn long text, files, or web pages into structured summaries with multiple output formats.</p>
          </div>
          <Link to="/" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12">
            <ArrowLeft size={16} /> Back to Tutor
          </Link>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-5 flex gap-2 rounded-2xl bg-black/20 p-2">
              {INPUT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setInputTab(tab.id)}
                  className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${inputTab === tab.id ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {inputTab === 'text' && (
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-200">Paste text</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste lecture notes, article text, or study material here..."
                  className="min-h-[280px] w-full rounded-2xl border border-white/10 bg-slate-900/90 p-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400"
                />
              </div>
            )}

            {inputTab === 'file' && (
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-200">Upload file</label>
                <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 p-6">
                  <input
                    type="file"
                    accept=".txt,.md,.pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-cyan-400"
                  />
                  <p className="mt-3 text-xs text-slate-400">Upload a text or PDF document. The server will extract text, then summarize it.</p>
                  {file && <p className="mt-2 text-sm text-cyan-300">Selected: {file.name}</p>}
                </div>
              </div>
            )}

            {inputTab === 'url' && (
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-200">Summarize from URL</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400"
                />
                <p className="text-xs text-slate-400">The backend crawls the page and summarizes the extracted text.</p>
              </div>
            )}

            <div className="mt-6 space-y-3">
              <p className="text-sm font-semibold text-slate-200">Format</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {FORMAT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = format === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFormat(option.id)}
                      className={`rounded-2xl border p-4 text-left transition ${active ? 'border-cyan-400 bg-cyan-400/10 ring-1 ring-cyan-400/40' : 'border-white/10 bg-slate-900/70 hover:border-white/20 hover:bg-slate-900'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`rounded-xl p-2 ${active ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-cyan-300'}`}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{option.label}</p>
                          <p className="text-xs text-slate-400">Summarize in {option.label.toLowerCase()}.</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <p className="text-sm font-semibold text-slate-200">Length</p>
              <div className="grid grid-cols-3 gap-3">
                {LENGTH_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setLength(option.id)}
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${length === option.id ? 'bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-400/20' : 'border border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-900 hover:text-white'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSummarize}
              disabled={isLoading}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Sparkles size={18} /> {isLoading ? 'Summarizing...' : 'Summarize'}
            </button>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Output</p>
                <h2 className="text-2xl font-black text-white">{FORMAT_TITLES[format]}</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleCopy} disabled={!summaryResult} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50">
                  <Copy size={15} /> Copy
                </button>
                <button type="button" onClick={handleDownload} disabled={!summaryResult} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50">
                  <Download size={15} /> TXT
                </button>
                <button type="button" onClick={handleSaveNote} disabled={!summaryResult} className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
                  <Save size={15} /> Save
                </button>
              </div>
            </div>

            {!summaryResult ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-900/50 px-6 text-center">
                <div>
                  <p className="text-lg font-semibold text-white">Your summary will appear here</p>
                  <p className="mt-2 text-sm text-slate-400">Choose an input source, select a format, and click Summarize.</p>
                </div>
              </div>
            ) : format === 'cornell' ? (
              <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/70 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-cyan-300">Main Notes</p>
                    <ul className="space-y-2 text-sm text-slate-200">
                      {(summaryResult.summary?.mainNotes || []).map((item, index) => <li key={index}>- {item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">Key Questions</p>
                    <ul className="space-y-2 text-sm text-slate-200">
                      {(summaryResult.summary?.keyQuestions || []).map((item, index) => <li key={index}>- {item}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-violet-300">Summary</p>
                  <p className="text-sm leading-7 text-slate-200">{summaryResult.summary?.summary || 'No summary generated.'}</p>
                </div>
              </div>
            ) : format === 'tweet' ? (
              <div className="rounded-[2rem] border border-sky-400/20 bg-gradient-to-br from-sky-500/10 via-slate-900 to-slate-950 p-5 shadow-xl">
                <div className="mb-4 flex items-center justify-between text-sm text-slate-400">
                  <span>@imentor_summary</span>
                  <span>{tweetText.length}/280</span>
                </div>
                <p className="text-[1.05rem] leading-8 text-white">{tweetText}</p>
              </div>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
                <div className="prose prose-invert max-w-none prose-headings:text-white prose-p:text-slate-200 prose-li:text-slate-200" dangerouslySetInnerHTML={renderMarkdown(outputText)} />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default SummarizerPage;