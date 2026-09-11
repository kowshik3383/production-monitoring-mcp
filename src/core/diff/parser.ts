/**
 * Git Unified Diff Hunk Parser
 * Accurately decomposes patch hunks to track exact added, removed, and context line numbers.
 */

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  addedLines: number[];
  removedLines: number[];
  contextLines: number[];
  header: string;
}

export class ParsedFileDiff {
  public filename: string;
  public hunks: DiffHunk[] = [];
  public addedLinesSet: Set<number> = new Set();
  public contextLinesSet: Set<number> = new Set();

  constructor(filename: string, patch?: string) {
    this.filename = filename;
    if (patch) {
      this.parsePatch(patch);
    }
  }

  private parsePatch(patch: string): void {
    const lines = patch.split("\n");
    let currentHunk: DiffHunk | null = null;
    let currentOldLine = 0;
    let currentNewLine = 0;

    const HUNK_REGEX = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/;

    for (const line of lines) {
      const match = line.match(HUNK_REGEX);
      if (match) {
        if (currentHunk) {
          this.hunks.push(currentHunk);
        }

        const oldStart = parseInt(match[1], 10);
        const oldCount = match[2] !== undefined ? parseInt(match[2], 10) : 1;
        const newStart = parseInt(match[3], 10);
        const newCount = match[4] !== undefined ? parseInt(match[4], 10) : 1;

        currentHunk = {
          oldStart,
          oldCount,
          newStart,
          newCount,
          addedLines: [],
          removedLines: [],
          contextLines: [],
          header: line,
        };

        currentOldLine = oldStart;
        currentNewLine = newStart;
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith("+") && !line.startsWith("+++")) {
        currentHunk.addedLines.push(currentNewLine);
        this.addedLinesSet.add(currentNewLine);
        currentNewLine++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        currentHunk.removedLines.push(currentOldLine);
        currentOldLine++;
      } else {
        // Context line or newline
        currentHunk.contextLines.push(currentNewLine);
        this.contextLinesSet.add(currentNewLine);
        currentOldLine++;
        currentNewLine++;
      }
    }

    if (currentHunk) {
      this.hunks.push(currentHunk);
    }
  }

  /**
   * Returns true if the specific line number in the target/new file
   * was newly added or modified in this commit.
   */
  public isLineModified(lineno: number): boolean {
    return this.addedLinesSet.has(lineno);
  }

  /**
   * Returns true if the line number is within the surrounding context of changes in this commit.
   */
  public isLineInContext(lineno: number): boolean {
    return this.contextLinesSet.has(lineno);
  }
}

/**
 * Parses a collection of git diff files into queryable ParsedFileDiff instances.
 */
export function parseGitDiff(files: Array<{ filename: string; patch?: string }>): Map<string, ParsedFileDiff> {
  const result = new Map<string, ParsedFileDiff>();
  for (const f of files) {
    result.set(f.filename.toLowerCase(), new ParsedFileDiff(f.filename, f.patch));
  }
  return result;
}
