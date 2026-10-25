import crypto from 'crypto';
import { query } from '@/lib/db';
import {
  SupportedFileType,
  ParsedChapterPreview,
  ImportPreviewResult,
} from './types';

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export class ManuscriptValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ManuscriptValidationError';
  }
}

/**
 * Validates and identifies the file format from filename and MIME type.
 */
export function detectSupportedFileType(
  filename: string,
  mimeType?: string
): SupportedFileType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (ext === 'txt' || mimeType === 'text/plain') {
    return 'text';
  }
  if (
    ext === 'md' ||
    ext === 'markdown' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/x-markdown'
  ) {
    return 'markdown';
  }
  if (
    ext === 'docx' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }

  throw new ManuscriptValidationError(
    `Unsupported file format ".${ext}". WORLDBUILD supports TXT (.txt), Markdown (.md), and Microsoft Word (.docx) files.`
  );
}

/**
 * Calculates SHA-256 content hash for duplicate detection.
 */
export function computeContentHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Counts words accurately by splitting on whitespace and filtering non-word tokens.
 */
export function calculateWordCount(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Extracts raw text from DOCX using mammoth.
 */
async function extractTextFromDocx(
  buffer: Buffer
): Promise<{ text: string; unsupported: string[] }> {
  const unsupported: string[] = [];

  try {
    // Check for macro-enabled docm or corrupted header
    if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
      throw new ManuscriptValidationError(
        'Invalid DOCX file structure: not a valid OpenXML archive.'
      );
    }

    // Dynamic import mammoth to support both ES and CommonJS
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });

    if (result.messages && result.messages.length > 0) {
      for (const msg of result.messages) {
        if (msg.type === 'warning') {
          unsupported.push(msg.message);
        }
      }
    }

    return {
      text: result.value || '',
      unsupported,
    };
  } catch (err: unknown) {
    if (err instanceof ManuscriptValidationError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ManuscriptValidationError(`Failed to parse DOCX file: ${msg}`);
  }
}

/**
 * Common regex patterns that demarcate chapters in literature.
 */
const CHAPTER_BREAK_PATTERNS = [
  /^(?:#+\s+)?(?:Chapter|CHAPTER)\s+(?:[0-9]+|[IVXLCDM]+|[A-Za-z]+)(?:\s*[:.\-–—]\s*(.*))?$/im,
  /^(?:#+\s+)?(?:Prologue|PROLOGUE|Epilogue|EPILOGUE|Interlude|INTERLUDE|Act\s+[0-9IVXLCDM]+)(?:\s*[:.\-–—]\s*(.*))?$/im,
  /^#\s+(.+)$/m, // Top-level Markdown heading
  /^[=\-]{4,}\s*(?:Chapter\s+.*|Prologue|Epilogue)\s*[=\-]{4,}$/im,
];

/**
 * Splits raw manuscript text into structured chapters.
 */
export function splitManuscriptIntoChapters(
  rawText: string,
  filename: string
): ParsedChapterPreview[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split('\n');
  const chapterIndices: { lineIndex: number; title: string }[] = [];

  // Scan lines for chapter break demarcations
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    for (const pattern of CHAPTER_BREAK_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        // Clean markdown symbols from title
        let cleanTitle = line.replace(/^#+\s*/, '').trim();
        // Remove decorative border lines
        cleanTitle = cleanTitle.replace(/^[=\-]{3,}\s*/, '').replace(/\s*[=\-]{3,}$/, '').trim();
        if (cleanTitle.length > 100) {
          cleanTitle = cleanTitle.substring(0, 97) + '...';
        }
        chapterIndices.push({ lineIndex: i, title: cleanTitle });
        break;
      }
    }
  }

  // If no chapter headers were identified, treat entire manuscript as a single initial chapter
  if (chapterIndices.length === 0) {
    const baseName = filename.replace(/\.[^/.]+$/, '').replace(/[_\-]+/g, ' ');
    const fallbackTitle = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    const words = calculateWordCount(normalized);
    const summary = generateInitialSummary(normalized);

    return [
      {
        sequence_number: 1,
        title: fallbackTitle || 'Chapter 1: The Beginning',
        summary,
        content: normalized,
        word_count: words,
      },
    ];
  }

  // If there is preface / prologue content before the first matched chapter
  const parsedChapters: ParsedChapterPreview[] = [];
  let seq = 1;

  if (chapterIndices[0].lineIndex > 0) {
    const prefaceLines = lines.slice(0, chapterIndices[0].lineIndex);
    const prefaceContent = prefaceLines.join('\n').trim();
    if (prefaceContent && calculateWordCount(prefaceContent) > 20) {
      parsedChapters.push({
        sequence_number: seq++,
        title: 'Prologue / Preface',
        summary: generateInitialSummary(prefaceContent),
        content: prefaceContent,
        word_count: calculateWordCount(prefaceContent),
      });
    }
  }

  // Slice each chapter from index to next index
  for (let c = 0; c < chapterIndices.length; c++) {
    const startLine = chapterIndices[c].lineIndex;
    const endLine =
      c + 1 < chapterIndices.length
        ? chapterIndices[c + 1].lineIndex
        : lines.length;

    // Content excludes the header line itself to keep manuscript prose clean
    const chapterLines = lines.slice(startLine + 1, endLine);
    const chapterContent = chapterLines.join('\n').trim();

    parsedChapters.push({
      sequence_number: seq++,
      title: chapterIndices[c].title,
      summary: generateInitialSummary(chapterContent),
      content: chapterContent,
      word_count: calculateWordCount(chapterContent),
    });
  }

  return parsedChapters;
}

/**
 * Extracts the first significant sentence or 150 characters to form an initial chapter summary.
 */
function generateInitialSummary(content: string): string {
  if (!content) return 'Initial imported draft chapter.';
  const firstParagraph = content.split(/\n\s*\n/)[0].trim();
  const firstSentence = firstParagraph.split(/[.!?]\s+/)[0].trim();
  if (firstSentence.length > 200) {
    return firstSentence.substring(0, 197) + '...';
  }
  return firstSentence ? `${firstSentence}.` : 'Initial draft manuscript chapter.';
}

/**
 * Parses and previews a manuscript file without saving anything to the database.
 */
export async function previewManuscriptFile(
  userId: string,
  filename: string,
  buffer: Buffer,
  mimeType?: string
): Promise<ImportPreviewResult> {
  // 1. File size validation
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new ManuscriptValidationError(
      `File size exceeds limit (${(buffer.length / (1024 * 1024)).toFixed(1)}MB > 15MB). Please split your manuscript or upload a smaller file.`
    );
  }

  if (buffer.length === 0) {
    throw new ManuscriptValidationError('The uploaded file is empty.');
  }

  // 2. Format detection
  const fileType = detectSupportedFileType(filename, mimeType);
  const contentHash = computeContentHash(buffer);
  const unsupportedElements: string[] = [];
  const warnings: string[] = [];

  let rawText = '';

  if (fileType === 'docx') {
    const docxResult = await extractTextFromDocx(buffer);
    rawText = docxResult.text;
    unsupportedElements.push(...docxResult.unsupported);
  } else {
    // TXT or Markdown
    rawText = buffer.toString('utf8');
  }

  if (!rawText.trim()) {
    throw new ManuscriptValidationError(
      'Could not extract any readable text from the uploaded document.'
    );
  }

  // 3. Chapter breakdown
  const chapters = splitManuscriptIntoChapters(rawText, filename);
  const totalWords = chapters.reduce((sum, ch) => sum + ch.word_count, 0);

  if (chapters.length === 0) {
    throw new ManuscriptValidationError('No chapter content could be parsed from file.');
  }

  // 4. Duplicate detection
  let isDuplicate = false;
  let duplicateWarning: string | null = null;

  const existingImport = await query<{ id: string; filename: string; created_at: string }>(
    `SELECT id, filename, created_at FROM manuscript_imports
     WHERE user_id = $1 AND content_hash = $2
     LIMIT 1`,
    [userId, contentHash]
  );

  if (existingImport.rows.length > 0) {
    isDuplicate = true;
    const prev = existingImport.rows[0];
    duplicateWarning = `Likely duplicate import: A file with identical content ("${prev.filename}") was previously imported into your studio on ${new Date(prev.created_at).toLocaleDateString()}.`;
  }

  return {
    filename,
    file_type: fileType,
    file_size: buffer.length,
    content_hash: contentHash,
    is_duplicate: isDuplicate,
    duplicate_warning: duplicateWarning,
    total_words: totalWords,
    chapter_count: chapters.length,
    chapters,
    unsupported_elements: unsupportedElements,
    warnings,
  };
}
