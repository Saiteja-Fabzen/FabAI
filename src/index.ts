import dotenv from 'dotenv';
import { Orchestrator } from './orchestrator';
import { MonorepoConfig, User } from './types';
import logger from './utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

// Load environment variables
dotenv.config();

async function loadConfig(): Promise<MonorepoConfig> {
  const configPath = process.env.WEBSITES_CONFIG_PATH || './config/websites.json';

  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);

    return {
      repoUrl: config.repoUrl || process.env.GITHUB_REPO_URL || '',
      submodulePath: process.env.MONOREPO_PATH || './Fabzen-website',
      websites: config.websites || [],
      buildCommands: config.buildCommands || {},
      deploymentBranches: config.deploymentBranches || { production: 'main' },
    };
  } catch (error) {
    logger.error('Failed to load website config', { error, configPath });
    throw error;
  }
}

async function loadUsers(): Promise<User[]> {
  const usersPath = './config/users.json';

  try {
    const usersData = await fs.readFile(usersPath, 'utf-8');
    const users = JSON.parse(usersData);
    return users;
  } catch (error) {
    logger.warn('Failed to load users config, using defaults', { error });

    // Return default users from environment variables
    const superadminId = process.env.SUPERADMIN_USER_ID;
    if (!superadminId) {
      throw new Error('SUPERADMIN_USER_ID environment variable is required');
    }

    return [
      {
        userId: superadminId,
        name: 'Super Admin',
        role: 'superadmin',
        permissions: ['all'],
      },
    ];
  }
}

async function main() {
  try {
    logger.info('Starting FabAI Slack Chatbot...');

    // Validate required environment variables
    // Note: ANTHROPIC_API_KEY is not required anymore as we use @anthropic-ai/claude-code SDK
    const requiredEnvVars = [
      'SLACK_BOT_TOKEN',
      'SLACK_APP_TOKEN',
      'GITHUB_TOKEN',
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    // Load configuration
    const config = await loadConfig();
    const users = await loadUsers();

    logger.info('Configuration loaded', {
      websites: config.websites.length,
      users: users.length,
    });

    // Create and start orchestrator
    const orchestrator = new Orchestrator(config, users);
    await orchestrator.start();

    logger.info('✅ FabAI Slack Chatbot is running!');

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await orchestrator.stop();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start application', { error });
    process.exit(1);
  }
}

main();
