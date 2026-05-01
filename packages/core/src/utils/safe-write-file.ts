import * as fs from 'fs';
import * as path from 'path';

/**
 * 原子写入文件：先写临时文件，再 rename 到目标路径。
 * 崩溃时不会留下半写文件。
 */
export function safeWriteFile(filePath: string, data: string | Buffer): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, data, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    // 清理临时文件，不泄露
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // 清理失败不阻断主异常抛出
    }
    throw error;
  }
}
