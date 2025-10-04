import logger from './logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileProcessor {
  async downloadFile(url: string, token: string): Promise<Buffer> {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.error('Failed to download file', { error, url });
      throw error;
    }
  }

  async saveFile(filePath: string, content: Buffer | string): Promise<string> {
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(filePath, content);

      logger.info('File saved', { filePath });
      return filePath;
    } catch (error) {
      logger.error('Failed to save file', { error, filePath });
      throw error;
    }
  }

  async processImage(buffer: Buffer): Promise<{ base64: string; mimeType: string }> {
    try {
      const base64 = buffer.toString('base64');
      const mimeType = this.detectImageMimeType(buffer);

      return { base64, mimeType };
    } catch (error) {
      logger.error('Failed to process image', { error });
      throw error;
    }
  }

  private detectImageMimeType(buffer: Buffer): string {
    const header = buffer.slice(0, 12).toString('hex');

    if (header.startsWith('89504e47')) return 'image/png';
    if (header.startsWith('ffd8ff')) return 'image/jpeg';
    if (header.startsWith('47494638')) return 'image/gif';
    if (header.startsWith('52494646') && buffer.slice(8, 12).toString() === 'WEBP') {
      return 'image/webp';
    }

    return 'image/png'; // default
  }

  async extractTextFromFile(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      // For now, handle text files
      if (mimeType.startsWith('text/')) {
        return buffer.toString('utf-8');
      }

      // For PDF and DOCX, you would integrate libraries like pdf-parse or mammoth
      // For now, return empty string for unsupported types
      logger.warn('Unsupported file type for text extraction', { mimeType });
      return '';
    } catch (error) {
      logger.error('Failed to extract text from file', { error, mimeType });
      throw error;
    }
  }

  async optimizeImage(buffer: Buffer): Promise<Buffer> {
    // In a real implementation, you would use libraries like sharp for image optimization
    // For now, return the buffer as-is
    logger.info('Image optimization requested (not implemented)');
    return buffer;
  }

  async analyzeCodeFile(content: string, filePath: string): Promise<{
    language: string;
    linesOfCode: number;
    complexity: 'low' | 'medium' | 'high';
  }> {
    const ext = path.extname(filePath);
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
    };

    const language = languageMap[ext] || 'unknown';
    const lines = content.split('\n');
    const linesOfCode = lines.filter((line) => line.trim() && !line.trim().startsWith('//')).length;

    // Simple complexity estimation based on cyclomatic complexity indicators
    const complexityIndicators = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /case\s+/g,
      /catch\s*\(/g,
      /\?\s*.*\s*:/g, // ternary
    ];

    let complexityScore = 0;
    for (const indicator of complexityIndicators) {
      const matches = content.match(indicator);
      complexityScore += matches ? matches.length : 0;
    }

    const complexity =
      complexityScore < 10 ? 'low' : complexityScore < 30 ? 'medium' : 'high';

    return { language, linesOfCode, complexity };
  }

  async validateFile(buffer: Buffer, allowedTypes: string[]): Promise<boolean> {
    const mimeType = this.detectImageMimeType(buffer);

    return allowedTypes.some((type) => {
      if (type.endsWith('/*')) {
        const category = type.split('/')[0];
        return mimeType.startsWith(category + '/');
      }
      return mimeType === type;
    });
  }

  async getTempFilePath(filename: string): Promise<string> {
    const tempDir = path.join(process.cwd(), 'tmp');
    await fs.mkdir(tempDir, { recursive: true });
    return path.join(tempDir, filename);
  }

  async cleanup(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      logger.info('File cleaned up', { filePath });
    } catch (error) {
      logger.warn('Failed to cleanup file', { error, filePath });
    }
  }
}
