import ngrok from 'ngrok';
import { PreviewSession } from '../types';
import logger from '../utils/logger';
import { StaticServer } from '../utils/static-server';

export class PreviewManager {
  private sessions: Map<string, PreviewSession> = new Map();
  private staticServer: StaticServer = new StaticServer();
  private portCounter: number = parseInt(process.env.DEFAULT_DEV_PORT || '8080');
  private previewMode: 'server' | 'ngrok' = (process.env.PREVIEW_MODE as 'server' | 'ngrok') || 'server';
  private previewBaseUrl: string = process.env.PREVIEW_BASE_URL || '';

  async createPreview(
    taskId: string,
    websiteName: string,
    websitePath: string,
    devCommand: string,
    branchName?: string
  ): Promise<PreviewSession> {
    try {
      let url: string;
      let port: number = 0;

      if (this.previewMode === 'server') {
        // Server mode: Use deployed server URL
        // The URL will be based on branch name or task ID
        const previewPath = branchName ? branchName.replace(/\//g, '-') : taskId;
        url = `${this.previewBaseUrl}/${websiteName}/${previewPath}`;

        logger.info('Preview using server mode', {
          taskId,
          websiteName,
          url,
          branchName,
        });
      } else {
        // Ngrok mode: Start local server and create tunnel
        port = this.getNextPort();

        // Start static file server
        await this.staticServer.start(websitePath, port);

        // Create ngrok tunnel
        url = await ngrok.connect({
          addr: port,
          authtoken: process.env.NGROK_AUTH_TOKEN,
        });

        logger.info('Preview using ngrok mode', {
          taskId,
          websiteName,
          url,
          port,
        });
      }

      const session: PreviewSession = {
        id: taskId,
        taskId,
        websiteName,
        url,
        port,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
      };

      this.sessions.set(taskId, session);

      logger.info('Preview session created', {
        taskId,
        url,
        websiteName,
        mode: this.previewMode,
      });

      return session;
    } catch (error) {
      logger.error('Failed to create preview', { error, taskId });
      throw error;
    }
  }


  private getNextPort(): number {
    return this.portCounter++;
  }

  async closePreview(taskId: string): Promise<void> {
    const session = this.sessions.get(taskId);
    if (!session) {
      logger.warn('Preview session not found', { taskId });
      return;
    }

    try {
      if (this.previewMode === 'ngrok') {
        // Only disconnect ngrok and stop server in ngrok mode
        await ngrok.disconnect(session.url);
        await this.staticServer.stop(session.port);
      } else {
        // In server mode, just log that preview is being closed
        // The actual server deployment remains active
        logger.info('Preview session closed (server mode - deployment remains active)', { taskId });
      }

      this.sessions.delete(taskId);

      logger.info('Preview session closed', { taskId, mode: this.previewMode });
    } catch (error) {
      logger.error('Failed to close preview', { error, taskId });
      throw error;
    }
  }

  getPreview(taskId: string): PreviewSession | undefined {
    return this.sessions.get(taskId);
  }

  getAllPreviews(): PreviewSession[] {
    return Array.from(this.sessions.values());
  }

  async cleanupExpired(): Promise<void> {
    const now = new Date();

    for (const [taskId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        logger.info('Cleaning up expired preview', { taskId });
        await this.closePreview(taskId);
      }
    }
  }

  async closeAll(): Promise<void> {
    const taskIds = Array.from(this.sessions.keys());

    for (const taskId of taskIds) {
      await this.closePreview(taskId);
    }

    if (this.previewMode === 'ngrok') {
      // Stop all static servers
      await this.staticServer.stopAll();

      // Disconnect all ngrok tunnels
      await ngrok.kill();
    }

    logger.info('All preview sessions closed', { mode: this.previewMode });
  }
}
