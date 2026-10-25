export type SupportedFileType = 'text' | 'markdown' | 'docx';

export interface ParsedChapterPreview {
  sequence_number: number;
  title: string;
  summary: string;
  content: string;
  word_count: number;
  headings_detected?: string[];
}

export interface ImportPreviewResult {
  filename: string;
  file_type: SupportedFileType;
  file_size: number;
  content_hash: string;
  is_duplicate: boolean;
  duplicate_warning: string | null;
  total_words: number;
  chapter_count: number;
  chapters: ParsedChapterPreview[];
  unsupported_elements: string[];
  warnings: string[];
}

export interface ImportCommitRequest {
  story_id: string;
  filename: string;
  file_type: SupportedFileType;
  file_size: number;
  content_hash: string;
  chapters: {
    title: string;
    summary?: string;
    content: string;
    author_notes?: string;
  }[];
}

export interface ImportCommitResponse {
  import_id: string;
  story_id: string;
  chapters_created: number;
  total_words: number;
}
