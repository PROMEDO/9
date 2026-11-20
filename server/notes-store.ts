/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

export interface StoredNote {
  id: string;
  title: string;
  content: string;
  author?: string;
  category?: string;
  priority?: string;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
  pinned?: boolean;
}

const NOTES_JSON_FILE = path.resolve(process.cwd(), 'data/notes-document.json');
const NOTES_MD_FILE = path.resolve(process.cwd(), 'data/notes-document.md');

function ensureDataDir(): void {
  const dir = path.dirname(NOTES_JSON_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFileAtomicSync(filePath: string, content: string): void {
  ensureDataDir();
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function sanitizeNote(raw: StoredNote): StoredNote {
  return {
    id: String(raw.id).slice(0, 64),
    title: String(raw.title || 'ملاحظة جديدة').slice(0, 300),
    content: String(raw.content || '').slice(0, 50000),
    author: raw.author ? String(raw.author).slice(0, 120) : undefined,
    category: raw.category ? String(raw.category).slice(0, 40) : undefined,
    priority: raw.priority ? String(raw.priority).slice(0, 40) : undefined,
    status: raw.status ? String(raw.status).slice(0, 40) : undefined,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    pinned: Boolean(raw.pinned),
  };
}

function loadNotesFile(): StoredNote[] {
  try {
    if (fs.existsSync(NOTES_JSON_FILE)) {
      const raw = fs.readFileSync(NOTES_JSON_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.warn('[NotesStore] Failed to parse notes json:', e);
  }
  return [];
}

function buildMarkdownDocument(notes: StoredNote[]): string {
  const nowArabic = new Date().toLocaleString('ar-IQ');
  let md = `# ملاحظات وأفكار منيو بلس (${notes.length} ملاحظة)\nآخر تحديث: ${nowArabic}\n\n---\n\n`;
  notes.forEach((n, idx) => {
    md += `${idx + 1}. ${n.title}\n`;
    if (n.createdAt) {
      md += `التاريخ: ${new Date(n.createdAt).toLocaleString('ar-IQ')}\n`;
    }
    if (n.content) {
      md += `${n.content}\n`;
    }
    md += `\n---\n\n`;
  });
  return md;
}

function saveNotesToFiles(notes: StoredNote[]): void {
  try {
    writeFileAtomicSync(NOTES_JSON_FILE, JSON.stringify(notes, null, 2));
    writeFileAtomicSync(NOTES_MD_FILE, buildMarkdownDocument(notes));
  } catch (e) {
    console.warn('[NotesStore] Failed to write notes files:', e);
  }
}

export function readNotesDocument(seedNotes: StoredNote[] = []): {
  notes: StoredNote[];
  jsonPath: string;
  mdPath: string;
  filePath: string;
  documentText: string;
} {
  let fileNotes = loadNotesFile();
  if (!fileNotes.length && seedNotes.length) {
    fileNotes = seedNotes.map(sanitizeNote);
    saveNotesToFiles(fileNotes);
  }
  return {
    notes: fileNotes,
    jsonPath: NOTES_JSON_FILE,
    mdPath: NOTES_MD_FILE,
    filePath: 'data/notes-document.md',
    documentText: buildMarkdownDocument(fileNotes),
  };
}

export function saveNoteToFile(
  note: StoredNote,
  seedNotes: StoredNote[] = []
): { notes: StoredNote[]; savedNote: StoredNote; filePath: string; documentText: string } {
  let notes = loadNotesFile();
  if (!notes.length && seedNotes.length) {
    notes = seedNotes.map(sanitizeNote);
  }
  const toSave = sanitizeNote(note);
  const existingIdx = notes.findIndex((n) => n.id === toSave.id);

  if (existingIdx >= 0) {
    toSave.createdAt = notes[existingIdx].createdAt || toSave.createdAt;
    notes[existingIdx] = toSave;
  } else {
    notes.unshift(toSave);
  }

  saveNotesToFiles(notes);
  return {
    notes,
    savedNote: toSave,
    filePath: 'data/notes-document.md',
    documentText: buildMarkdownDocument(notes),
  };
}

export function deleteNoteFromFile(
  id: string,
  seedNotes: StoredNote[] = []
): { notes: StoredNote[]; filePath: string; documentText: string } {
  let notes = loadNotesFile();
  if (!notes.length && seedNotes.length) {
    notes = seedNotes.map(sanitizeNote);
  }
  notes = notes.filter((n) => n.id !== id);
  saveNotesToFiles(notes);
  return {
    notes,
    filePath: 'data/notes-document.md',
    documentText: buildMarkdownDocument(notes),
  };
}

export function replaceAllNotesInFile(notes: StoredNote[]): { notes: StoredNote[]; filePath: string; documentText: string } {
  const sanitized = notes.filter((n) => n && typeof n === 'object' && n.id).map(sanitizeNote);
  saveNotesToFiles(sanitized);
  return {
    notes: sanitized,
    filePath: 'data/notes-document.md',
    documentText: buildMarkdownDocument(sanitized),
  };
}
