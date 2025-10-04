import simpleGit, { SimpleGit } from 'simple-git';
import { WebsiteConfig, MonorepoConfig } from '../types';
import logger from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs/promises';

export class MonorepoManager {
  private git: SimpleGit;
  private config: MonorepoConfig;
  private basePath: string;

  constructor(config: MonorepoConfig) {
    this.config = config;
    this.basePath = config.submodulePath;
    this.git = simpleGit(this.basePath);
  }

  async initialize(): Promise<void> {
    try {
      // Ensure submodule is initialized and updated
      const mainGit = simpleGit(process.cwd());
      await mainGit.submoduleUpdate(['--init', '--recursive']);

      logger.info('Monorepo initialized', { path: this.basePath });
    } catch (error) {
      logger.error('Failed to initialize monorepo', { error });
      throw error;
    }
  }

  async createBranch(branchName: string, baseBranch: string = 'main'): Promise<void> {
    try {
      await this.git.checkout(baseBranch);
      await this.git.pull('origin', baseBranch);
      await this.git.checkoutBranch(branchName, `origin/${baseBranch}`);

      logger.info('Branch created', { branchName, baseBranch });
    } catch (error) {
      logger.error('Failed to create branch', { error, branchName });
      throw error;
    }
  }

  async switchBranch(branchName: string): Promise<void> {
    try {
      await this.git.checkout(branchName);
      logger.info('Switched to branch', { branchName });
    } catch (error) {
      logger.error('Failed to switch branch', { error, branchName });
      throw error;
    }
  }

  async commitChanges(files: string[], message: string): Promise<void> {
    try {
      await this.git.add(files);
      await this.git.commit(message);

      logger.info('Changes committed', { files: files.length, message });
    } catch (error) {
      logger.error('Failed to commit changes', { error });
      throw error;
    }
  }

  async pushBranch(branchName: string): Promise<void> {
    try {
      await this.git.push('origin', branchName, ['--set-upstream']);
      logger.info('Branch pushed', { branchName });
    } catch (error) {
      logger.error('Failed to push branch', { error, branchName });
      throw error;
    }
  }

  async getWebsiteConfig(websiteName: string): Promise<WebsiteConfig | undefined> {
    return this.config.websites.find((w) => w.name === websiteName);
  }

  async getWebsitePath(websiteName: string): Promise<string> {
    const config = await this.getWebsiteConfig(websiteName);
    if (!config) {
      throw new Error(`Website ${websiteName} not found in configuration`);
    }
    return path.join(this.basePath, config.path);
  }

  async readFile(websiteName: string, filePath: string): Promise<string> {
    const websitePath = await this.getWebsitePath(websiteName);
    const fullPath = path.join(websitePath, filePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      logger.error('Failed to read file', { error, filePath: fullPath });
      throw error;
    }
  }

  async writeFile(websiteName: string, filePath: string, content: string): Promise<void> {
    const websitePath = await this.getWebsitePath(websiteName);
    const fullPath = path.join(websitePath, filePath);

    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(fullPath, content, 'utf-8');
      logger.info('File written', { filePath: fullPath });
    } catch (error) {
      logger.error('Failed to write file', { error, filePath: fullPath });
      throw error;
    }
  }

  async deleteFile(websiteName: string, filePath: string): Promise<void> {
    const websitePath = await this.getWebsitePath(websiteName);
    const fullPath = path.join(websitePath, filePath);

    try {
      await fs.unlink(fullPath);
      logger.info('File deleted', { filePath: fullPath });
    } catch (error) {
      logger.error('Failed to delete file', { error, filePath: fullPath });
      throw error;
    }
  }

  async listFiles(websiteName: string, directory: string = ''): Promise<string[]> {
    const websitePath = await this.getWebsitePath(websiteName);
    const fullPath = path.join(websitePath, directory);

    try {
      const files = await fs.readdir(fullPath, { recursive: true });
      return files.filter((file) => typeof file === 'string') as string[];
    } catch (error) {
      logger.error('Failed to list files', { error, directory: fullPath });
      throw error;
    }
  }

  async getDiff(fromBranch?: string): Promise<string> {
    try {
      if (fromBranch) {
        const diff = await this.git.diff([fromBranch]);
        return diff;
      } else {
        const diff = await this.git.diff();
        return diff;
      }
    } catch (error) {
      logger.error('Failed to get diff', { error, fromBranch });
      throw error;
    }
  }

  async getChangedFiles(): Promise<string[]> {
    try {
      const status = await this.git.status();
      return [
        ...status.modified,
        ...status.created,
        ...status.deleted,
        ...status.renamed.map((r) => r.to),
      ];
    } catch (error) {
      logger.error('Failed to get changed files', { error });
      throw error;
    }
  }

  async getCurrentBranch(): Promise<string> {
    try {
      const status = await this.git.status();
      return status.current || 'unknown';
    } catch (error) {
      logger.error('Failed to get current branch', { error });
      throw error;
    }
  }

  async cleanup(branchName: string): Promise<void> {
    try {
      await this.git.checkout('main');
      await this.git.deleteLocalBranch(branchName, true);
      logger.info('Branch cleaned up', { branchName });
    } catch (error) {
      logger.error('Failed to cleanup branch', { error, branchName });
      // Don't throw - cleanup is best effort
    }
  }

  getWebsites(): WebsiteConfig[] {
    return this.config.websites;
  }

  getConfig(): MonorepoConfig {
    return this.config;
  }
}
