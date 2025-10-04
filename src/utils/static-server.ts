import express from 'express';
import * as path from 'path';
import logger from './logger';
import { Server } from 'http';

export class StaticServer {
  private servers: Map<number, Server> = new Map();

  async start(websitePath: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const app = express();

        // Serve static files
        app.use(express.static(websitePath));

        // Handle SPA routing - serve index.html for all routes
        app.get('*', (req, res) => {
          res.sendFile(path.join(websitePath, 'index.html'), (err) => {
            if (err) {
              res.status(404).send('File not found');
            }
          });
        });

        const server = app.listen(port, () => {
          this.servers.set(port, server);
          logger.info('Static server started', { path: websitePath, port });
          resolve();
        });

        server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            logger.error('Port already in use', { port });
            reject(new Error(`Port ${port} is already in use`));
          } else {
            logger.error('Server error', { error, port });
            reject(error);
          }
        });
      } catch (error) {
        logger.error('Failed to start static server', { error, websitePath, port });
        reject(error);
      }
    });
  }

  async stop(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.servers.get(port);

      if (!server) {
        logger.warn('No server found on port', { port });
        resolve();
        return;
      }

      server.close((err) => {
        if (err) {
          logger.error('Error stopping server', { error: err, port });
          reject(err);
        } else {
          this.servers.delete(port);
          logger.info('Static server stopped', { port });
          resolve();
        }
      });
    });
  }

  async stopAll(): Promise<void> {
    const ports = Array.from(this.servers.keys());

    for (const port of ports) {
      await this.stop(port);
    }

    logger.info('All static servers stopped');
  }

  isRunning(port: number): boolean {
    return this.servers.has(port);
  }

  getRunningServers(): number[] {
    return Array.from(this.servers.keys());
  }
}
