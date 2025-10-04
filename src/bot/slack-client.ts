import { App, LogLevel } from '@slack/bolt';
import logger from '../utils/logger';

export class SlackClient {
  private app: App;

  constructor() {
    this.app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      appToken: process.env.SLACK_APP_TOKEN,
      socketMode: true,
      logLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Handle app mentions
    this.app.event('app_mention', async ({ event, say }) => {
      logger.info('App mentioned', { user: event.user, text: event.text });
      // Will be handled by the main orchestrator
    });

    // Handle direct messages
    this.app.message(async ({ message, say }) => {
      logger.info('Message received', {
        user: 'user' in message ? message.user : 'unknown',
        text: 'text' in message ? message.text : ''
      });
      // Will be handled by the main orchestrator
    });

    // Handle file uploads
    this.app.event('file_shared', async ({ event }) => {
      logger.info('File shared', { fileId: event.file_id });
      // Will be handled by the file processor
    });

    // Handle reactions (for approvals)
    this.app.event('reaction_added', async ({ event }) => {
      logger.info('Reaction added', {
        user: event.user,
        reaction: event.reaction,
        item: event.item
      });
      // Will be handled by the approval workflow
    });
  }

  async start() {
    await this.app.start();
    logger.info('⚡️ Slack bot is running!');
  }

  getApp() {
    return this.app;
  }

  async sendMessage(channel: string, text: string, blocks?: any[]) {
    return await this.app.client.chat.postMessage({
      channel,
      text,
      blocks,
    });
  }

  async sendThreadReply(channel: string, threadTs: string, text: string, blocks?: any[]) {
    return await this.app.client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
      blocks,
    });
  }

  async updateMessage(channel: string, ts: string, text: string, blocks?: any[]) {
    return await this.app.client.chat.update({
      channel,
      ts,
      text,
      blocks,
    });
  }

  async addReaction(channel: string, timestamp: string, reaction: string) {
    return await this.app.client.reactions.add({
      channel,
      timestamp,
      name: reaction,
    });
  }

  async getFileInfo(fileId: string) {
    return await this.app.client.files.info({
      file: fileId,
    });
  }

  async getUserInfo(userId: string) {
    return await this.app.client.users.info({
      user: userId,
    });
  }
}
