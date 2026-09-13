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

export type FileDiffStatus = "added" | "modified" | "removed" | "renamed";

export class ParsedFileDiff {
  public filename: string;
  public status: FileDiffStatus;
  public hunks: DiffHunk[] = [];
  public addedLinesSet: Set<number> = new Set();
  public removedLinesSet: Set<number> = new Set();
  public contextLinesSet: Set<number> = new Set();

  constructor(filename: string, patch?: string, status: FileDiffStatus = "modified") {
    this.filename = filename;
    this.status = status;
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

      // Skip git diff metadata markers like "\ No newline at end of file"
      if (line.startsWith("\\")) {
        continue;
      }

      if (line.startsWith("+") && !line.startsWith("+++")) {
        currentHunk.addedLines.push(currentNewLine);
        this.addedLinesSet.add(currentNewLine);
        currentNewLine++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        currentHunk.removedLines.push(currentOldLine);
        this.removedLinesSet.add(currentOldLine);
        currentOldLine++;
      } else {
        // Context line or unchanged line
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
   * Returns true if the specific line number in the previous file was removed in this commit.
   */
  public isLineRemoved(oldLineno: number): boolean {
    return this.removedLinesSet.has(oldLineno);
  }

  /**
   * Returns true if the line number is within the surrounding context of changes in this commit.
   */
  public isLineInContext(lineno: number): boolean {
    return this.contextLinesSet.has(lineno);
  }

  /**
   * Returns true if the line number is within threshold lines of any added/modified line.
   */
  public isLineNearModification(lineno: number, threshold = 3): boolean {
    if (this.addedLinesSet.has(lineno)) return true;
    for (let offset = 1; offset <= threshold; offset++) {
      if (this.addedLinesSet.has(lineno - offset) || this.addedLinesSet.has(lineno + offset)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Parses a collection of git diff files into queryable ParsedFileDiff instances.
 */
export function parseGitDiff(
  files: Array<{ filename: string; patch?: string; status?: string }>
): Map<string, ParsedFileDiff> {
  const result = new Map<string, ParsedFileDiff>();
  for (const f of files) {
    const status = (f.status as FileDiffStatus) || "modified";
    result.set(f.filename.toLowerCase(), new ParsedFileDiff(f.filename, f.patch, status));
  }
  return result;
}
