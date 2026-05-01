import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { Manifest, ChapterSummaryRecord } from '../models/state';
import { renderCurrentState } from './projection-renderers/render-current-state';
import { renderHooks } from './projection-renderers/render-hooks';
import { renderChapterSummaries } from './projection-renderers/render-chapter-summaries';
import { renderSubplotBoard } from './projection-renderers/render-subplot-board';
import { renderEmotionalArcs } from './projection-renderers/render-emotional-arcs';
import { renderCharacterMatrix } from './projection-renderers/render-character-matrix';

export interface ProjectionFile {
  name: string;
  content: string;
}

export class ProjectionRenderer {
  static renderCurrentState(manifest: Manifest): string {
    return renderCurrentState(manifest);
  }

  static renderHooks(manifest: Manifest): string {
    return renderHooks(manifest);
  }

  static renderChapterSummaries(summaries: ChapterSummaryRecord[]): string {
    return renderChapterSummaries(summaries);
  }

  static renderSubplotBoard(manifest: Manifest): string {
    return renderSubplotBoard(manifest);
  }

  static renderEmotionalArcs(manifest: Manifest): string {
    return renderEmotionalArcs(manifest);
  }

  static renderCharacterMatrix(manifest: Manifest): string {
    return renderCharacterMatrix(manifest);
  }

  static computeStateHash(manifest: Manifest): string {
    const content = JSON.stringify(manifest);
    return createHash('sha256').update(content).digest('hex');
  }

  static writeProjectionFiles(
    manifest: Manifest,
    stateDir: string,
    summaries: ChapterSummaryRecord[],
  ): ProjectionFile[] {
    fs.mkdirSync(stateDir, { recursive: true });

    const files: ProjectionFile[] = [
      { name: 'current_state.md', content: this.renderCurrentState(manifest) },
      { name: 'hooks.md', content: this.renderHooks(manifest) },
      { name: 'chapter_summaries.md', content: this.renderChapterSummaries(summaries) },
      { name: 'subplot_board.md', content: this.renderSubplotBoard(manifest) },
      { name: 'emotional_arcs.md', content: this.renderEmotionalArcs(manifest) },
      { name: 'character_matrix.md', content: this.renderCharacterMatrix(manifest) },
    ];

    for (const file of files) {
      fs.writeFileSync(path.join(stateDir, file.name), file.content, 'utf-8');
    }

    const hash = this.computeStateHash(manifest);
    fs.writeFileSync(path.join(stateDir, '.state-hash'), hash, 'utf-8');
    files.push({ name: '.state-hash', content: hash });

    return files;
  }

  static detectManualEdit(manifest: Manifest, stateDir: string): boolean {
    const hashPath = path.join(stateDir, '.state-hash');
    if (!fs.existsSync(hashPath)) return false;

    const storedHash = fs.readFileSync(hashPath, 'utf-8').trim();
    const currentHash = this.computeStateHash(manifest);

    return storedHash !== currentHash;
  }
}
