import { SlackClient } from './bot/slack-client';
import { ClaudeClient } from './ai/claude-client';
import { TaskQueue } from './queue/task-queue';
import { MonorepoManager } from './monorepo/monorepo-manager';
import { ApprovalEngine } from './workflow/approval-engine';
import { GitHubClient } from './github/github-client';
import { PreviewManager } from './preview/preview-manager';
import { FileProcessor } from './utils/file-processor';
import { Task, TaskType, TaskPriority, User, MonorepoConfig, PRContext, FileChange } from './types';
import logger from './utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class Orchestrator {
  private slack: SlackClient;
  private claude: ClaudeClient;
  private taskQueue: TaskQueue;
  private monorepo: MonorepoManager;
  private approvalEngine: ApprovalEngine;
  private github: GitHubClient;
  private previewManager: PreviewManager;
  private fileProcessor: FileProcessor;
  private users: Map<string, User>;

  constructor(config: MonorepoConfig, users: User[]) {
    this.slack = new SlackClient();
    this.claude = new ClaudeClient();
    this.taskQueue = new TaskQueue(parseInt(process.env.MAX_CONCURRENT_TASKS || '3'));
    this.monorepo = new MonorepoManager(config);
    this.approvalEngine = new ApprovalEngine(users);
    this.github = new GitHubClient();
    this.previewManager = new PreviewManager();
    this.fileProcessor = new FileProcessor();
    this.users = new Map(users.map((u) => [u.userId, u]));

    this.setupEventHandlers();
  }

  private activeThreads: Set<string> = new Set(); // Track threads where bot is active

  private setupEventHandlers() {
    const app = this.slack.getApp();

    // Handle app mentions ONLY - bot only responds when tagged
    app.event('app_mention', async ({ event }) => {
      if (!event.user || !event.text || !event.channel) return;
      const threadKey = event.thread_ts || event.ts;
      this.activeThreads.add(threadKey); // Mark thread as active
      await this.handleMessage(event.user, event.text, event.channel, event.ts, event.thread_ts);
    });

    // Handle all messages (for thread conversations)
    app.message(async ({ message }) => {
      if ('user' in message && 'text' in message && 'channel' in message && 'ts' in message) {
        // Ignore bot's own messages
        if (message.subtype === 'bot_message' || (message as any).bot_id) {
          return;
        }

        // Respond if it's a DM
        if (message.channel_type === 'im') {
          if (!message.user || !message.text || !message.channel) return;
          await this.handleMessage(message.user, message.text, message.channel, message.ts);
          return;
        }

        // Respond if it's in an active thread (where bot was mentioned before)
        const threadTs = 'thread_ts' in message ? message.thread_ts : undefined;
        if (threadTs && this.activeThreads.has(threadTs)) {
          if (!message.user || !message.text || !message.channel) return;
          await this.handleMessage(message.user, message.text, message.channel, message.ts, threadTs);
          return;
        }
      }
    });

    // Handle file uploads
    app.event('file_shared', async ({ event }) => {
      await this.handleFileUpload(event.user_id, event.file_id, event.channel_id);
    });

    // Handle approval reactions
    app.event('reaction_added', async ({ event }) => {
      if (event.reaction === 'white_check_mark' || event.reaction === 'heavy_check_mark') {
        await this.handleApproval(event.user, event.item.ts);
      } else if (event.reaction === 'x' || event.reaction === 'no_entry') {
        await this.handleRejection(event.user, event.item.ts);
      }
    });

    // Task queue events
    this.taskQueue.on('task_started', async (task: Task) => {
      await this.processTask(task);
    });

    this.taskQueue.on('task_completed', async (task: Task) => {
      logger.info('Task completed successfully', { taskId: task.id });
    });

    this.taskQueue.on('task_failed', async (task: Task, error: Error) => {
      await this.handleTaskFailure(task, error);
    });

    // Approval workflow events
    this.approvalEngine.on('workflow_approved', async (workflow) => {
      await this.handleWorkflowApproved(workflow);
    });

    this.approvalEngine.on('workflow_rejected', async (workflow, user, reason) => {
      await this.handleWorkflowRejected(workflow, user, reason);
    });
  }

  async start() {
    await this.monorepo.initialize();
    await this.slack.start();
    logger.info('Orchestrator started successfully');
  }

  private async handleMessage(userId: string, text: string, channel: string, messageTs: string, threadTs?: string | undefined) {
    try {
      // Use thread timestamp if available, otherwise use message timestamp
      const actualThreadTs = threadTs || messageTs;

      // Remove bot mention from text
      const cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();

      // Get user info (but don't block if not found - allow all users to chat)
      const user = this.users.get(userId);

      // Check for privileged commands (require admin/superadmin)
      if (cleanText.toLowerCase().startsWith('approve')) {
        if (!user) {
          await this.slack.sendThreadReply(channel, actualThreadTs, '⛔ You are not authorized to approve tasks. Please contact an administrator.');
          return;
        }
        const taskId = cleanText.split(' ')[1];
        await this.handleApprovalCommand(userId, taskId, channel, actualThreadTs);
        return;
      }

      if (cleanText.toLowerCase().startsWith('deploy')) {
        if (!user) {
          await this.slack.sendThreadReply(channel, actualThreadTs, '⛔ You are not authorized to deploy. Please contact an administrator.');
          return;
        }
        // Add deployment logic here
        await this.slack.sendThreadReply(channel, actualThreadTs, '🚀 Deployment command received. Feature coming soon!');
        return;
      }

      // Non-privileged commands (available to all users)
      if (cleanText.toLowerCase().startsWith('status')) {
        await this.handleStatusCommand(channel, actualThreadTs);
        return;
      }

      // Process as AI request (available to all users)
      await this.handleAIRequest(userId, cleanText, channel, actualThreadTs);
    } catch (error) {
      logger.error('Error handling message', { error, userId, text });
      await this.slack.sendMessage(
        channel,
        `Sorry, an error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleAIRequest(userId: string, text: string, channel: string, threadTs: string) {
    // Check for restricted requests
    const lowerText = text.toLowerCase();

    // Reject requests to create new websites
    if (lowerText.includes('new website') || lowerText.includes('create website') ||
        lowerText.includes('build website') || lowerText.includes('setup website')) {
      await this.slack.sendThreadReply(
        channel,
        threadTs,
        '⛔ I can only work on existing websites in the monorepo. Creating new websites is not allowed.\n\nI can help you with:\n• Editing existing pages\n• Creating new pages for existing websites\n• Updating content and features\n• Code review and bug fixes'
      );
      return;
    }

    // Reject requests about internal code/implementation
    if (lowerText.includes('how do you work') || lowerText.includes('show me your code') ||
        lowerText.includes('your implementation') || lowerText.includes('how are you built')) {
      await this.slack.sendThreadReply(
        channel,
        threadTs,
        'I\'m a website development assistant. I can help you with tasks related to our websites, but I can\'t share details about my internal implementation.'
      );
      return;
    }

    // First, determine if this is an actionable request or just a conversation
    const classificationResponse = await this.claude.sendMessage(
      userId,
      `Analyze this message and determine if it requires creating a task or is just a conversational message.

Message: "${text}"

Actionable requests include:
- Updating/modifying a website
- Analyzing files or code
- Creating/deploying features
- Fixing bugs
- Reviewing code
- Processing assets

Conversational messages include:
- Greetings (hello, hi, hey)
- Questions about the bot's capabilities
- General questions
- Status inquiries
- Small talk

Respond with ONLY one word: "TASK" if it requires action, or "CHAT" if it's conversational.`,
      undefined,
      false
    );

    const isTask = classificationResponse.trim().toUpperCase().includes('TASK');

    if (!isTask) {
      // Just have a conversation, don't create a task
      const availableWebsites = this.monorepo.getConfig().websites.map(w => w.name);

      const conversationResponse = await this.claude.sendMessage(
        userId,
        text,
        `You are FabAI, an AI assistant for the Fabzen website development team. Be friendly and concise.

YOUR IDENTITY:
- Your name is FabAI (not Claude)
- You are a specialized assistant for managing Fabzen websites

CRITICAL RESTRICTIONS:
- You can ONLY access and discuss files in the Fabzen-website
- NEVER reveal information about the chatbot's implementation or your own codebase
- If asked about technologies, ONLY discuss what's used in the Fabzen-website(HTML, CSS, JavaScript)
- DO NOT discuss TypeScript, Node.js, Express, Slack SDK, or any chatbot infrastructure
- Focus ONLY on the websites themselves, not the chatbot managing them

AVAILABLE WEBSITES:
${availableWebsites.join(', ')}
Total: ${availableWebsites.length} websites

These are static HTML websites. When asked about technologies, mention:
- HTML, CSS, JavaScript (the actual website code)
- Static site hosting

You can help with:
- Editing existing website pages
- Creating new pages for existing websites
- Updating website content and features
- Code review and bug fixes
- File processing

Answer their question naturally, but NEVER reveal chatbot implementation details.
When asked your name, always say "FabAI".`,
        true
      );

      await this.slack.sendThreadReply(
        channel,
        threadTs,
        conversationResponse
      );
      return;
    }

    // It's an actionable request - create a task
    // Simple heuristic to determine task type (saves tokens by not using AI)
    let taskType: TaskType = 'website_update';
    let websiteTarget = 'main-site';

    // Extract website name if mentioned
    const websiteMatch = text.match(/(?:in|for|on)\s+(?:the\s+)?(\w+)\s+website/i);
    if (websiteMatch) {
      websiteTarget = websiteMatch[1].toLowerCase();
    }

    // Validate that the website exists in the monorepo
    const availableWebsites = this.monorepo.getConfig().websites.map(w => w.name.toLowerCase());

    if (!availableWebsites.includes(websiteTarget)) {
      await this.slack.sendThreadReply(
        channel,
        threadTs,
        `⛔ Website "${websiteTarget}" not found.\n\n*Available websites:*\n${availableWebsites.map(w => `• ${w}`).join('\n')}\n\nPlease specify one of these websites.`
      );
      return;
    }

    // Determine task type from keywords
    if (lowerText.includes('review') || lowerText.includes('check')) {
      taskType = 'code_review';
    } else if (lowerText.includes('analyze') || lowerText.includes('analysis')) {
      taskType = 'file_analysis';
    } else if (lowerText.includes('image') || lowerText.includes('asset') || lowerText.includes('optimize')) {
      taskType = 'asset_process';
    }

    // Create task
    const task: Task = {
      id: uuidv4(),
      type: taskType,
      priority: 'medium',
      requesterId: userId,
      websiteTarget: websiteTarget,
      dependencies: [],
      resources: [websiteTarget],
      status: 'queued',
      estimatedTime: 15 * 60 * 1000, // 15 minutes
      createdAt: new Date(),
      description: text,
      context: {
        originalMessage: text,
        channel: channel,
        threadTs: threadTs
      },
    };

    // Add to queue
    this.taskQueue.addTask(task);

    await this.slack.sendThreadReply(
      channel,
      threadTs,
      `✅ Task queued! I'll start working on it shortly...`
    );
  }

  private async processTask(task: Task) {
    try {
      logger.info('Processing task', { taskId: task.id, type: task.type });

      // Get channel and thread from context
      const channel = task.context.channel;
      const threadTs = task.context.threadTs;

      if (!channel || !threadTs) {
        logger.error('Missing channel or threadTs in task context');
        this.taskQueue.failTask(task.id, new Error('Missing channel context'));
        return;
      }

      // Notify user that we're starting
      await this.slack.sendThreadReply(
        channel,
        threadTs,
        `🚀 Starting work on task \`${task.id.substring(0, 8)}\`...\n\n*Task:* ${task.description}\n*Website:* ${task.websiteTarget || 'N/A'}`
      );

      // Get website config
      const websiteConfig = await this.monorepo.getWebsiteConfig(task.websiteTarget!);
      if (!websiteConfig) {
        throw new Error(`Website config not found for ${task.websiteTarget}`);
      }

      const websitePath = await this.monorepo.getWebsitePath(task.websiteTarget!);
      const fullPath = `${process.env.MONOREPO_PATH}/${websiteConfig.path}`;

      const prompt = `You are working on a website development task.

Task Description: ${task.description}
Website: ${task.websiteTarget}
Website Path: ${fullPath}

Please complete this task by:
1. Creating or modifying the necessary files in the correct directory
2. Following web development best practices
3. Using proper HTML/CSS/JavaScript structure
4. Ensuring the code is clean and well-structured

When you're done, provide a brief summary of what you've created/changed.`;

      let responseText = '';

      // Stream Claude's response to Slack
      await this.claude.streamResponse(
        task.requesterId,
        prompt,
        async (chunk) => {
          responseText += chunk;
        },
        undefined
      );

      // Start preview server
      let previewUrl = '';
      try {
        const preview = await this.previewManager.createPreview(
          task.id,
          task.websiteTarget!,
          fullPath,
          websiteConfig.devCommand,
          undefined // Don't use branch name - just website name
        );
        previewUrl = preview.url;
        task.context.previewUrl = previewUrl;
      } catch (previewError) {
        logger.error('Failed to create preview', { error: previewError });
        previewUrl = `http://localhost:${websiteConfig.port}`;
      }

      // Send completion message with preview link
      await this.slack.sendThreadReply(
        channel,
        threadTs,
        `✅ Task \`${task.id.substring(0, 8)}\` completed!\n\n${responseText}\n\n🔗 *Test Link:* ${previewUrl}\n\n_Please review the changes and provide feedback._`
      );

      // Mark as completed
      this.taskQueue.completeTask(task.id, 'completed');
    } catch (error) {
      logger.error('Error processing task', { error, taskId: task.id });

      const channel = task.context?.channel;
      const threadTs = task.context?.threadTs;

      if (channel && threadTs) {
        await this.slack.sendThreadReply(
          channel,
          threadTs,
          `❌ Task \`${task.id.substring(0, 8)}\` failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      this.taskQueue.failTask(task.id, error as Error);
    }
  }

  private async processWebsiteUpdate(task: Task) {
    // Use Claude to generate the code changes
    const response = await this.claude.sendMessage(
      task.requesterId,
      `Generate the code changes needed for this website update:

${task.description}

Website: ${task.websiteTarget}

Provide the changes as a list of files to modify with their new content.`,
      undefined,
      false
    );

    // Parse response and apply changes
    // This is a simplified version - real implementation would be more sophisticated
    task.context.aiResponse = response;
  }

  private async processFileAnalysis(task: Task) {
    // Analyze files using Claude
    const response = await this.claude.sendMessage(
      task.requesterId,
      `Analyze these files and provide insights:

${task.description}`,
      undefined,
      false
    );

    task.context.analysis = response;
  }

  private async processCodeReview(task: Task) {
    // Review code using Claude
    const files = await this.monorepo.getChangedFiles();

    for (const file of files) {
      const content = await this.monorepo.readFile(task.websiteTarget!, file);
      const review = await this.claude.analyzeCode(content, file.split('.').pop()!, 'review');
      task.context.reviews = task.context.reviews || {};
      task.context.reviews[file] = review;
    }
  }

  private async processAsset(task: Task) {
    // Process and optimize assets
    task.context.processed = true;
  }

  private async handleFileUpload(userId: string, fileId: string, channelId: string) {
    // Download and process file
    // This would integrate with the FileProcessor
  }

  private async handleApproval(userId: string, messageTs: string) {
    // Extract task ID from message and approve
  }

  private async handleRejection(userId: string, messageTs: string) {
    // Extract task ID from message and reject
  }

  private async handleApprovalCommand(userId: string, taskId: string, channel: string, threadTs: string) {
    try {
      await this.approvalEngine.approve(taskId, userId);
      await this.slack.sendMessage(channel, `✅ Task ${taskId} approved!`);
    } catch (error) {
      await this.slack.sendMessage(
        channel,
        `Failed to approve: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleStatusCommand(channel: string, threadTs: string) {
    const status = this.taskQueue.getQueueStatus();
    const previews = this.previewManager.getAllPreviews();

    let message = `📊 *System Status*

*Queue Summary:*
• Queued tasks: ${status.queued}
• Processing: ${status.processing}

*Active Previews:* ${previews.length}
${previews.map((p) => `• ${p.websiteName}: ${p.url}`).join('\n') || '• None'}

`;

    // Show currently processing tasks
    if (status.processingTasks.length > 0) {
      message += `*🔄 Currently Processing:*\n`;
      for (const task of status.processingTasks) {
        const startedAt = task.startedAt ? new Date(task.startedAt).toLocaleTimeString() : 'Unknown';
        message += `• \`${task.id.substring(0, 8)}\` - ${task.type} (${task.priority}) - Started: ${startedAt}\n`;
      }
      message += '\n';
    }

    // Show queued tasks
    if (status.queue.length > 0) {
      message += `*⏳ Queued Tasks:*\n`;
      for (let i = 0; i < Math.min(5, status.queue.length); i++) {
        const task = status.queue[i];
        message += `${i + 1}. \`${task.id.substring(0, 8)}\` - ${task.type} (${task.priority})\n`;
      }
      if (status.queue.length > 5) {
        message += `_... and ${status.queue.length - 5} more_\n`;
      }
    } else {
      message += `*⏳ Queue is empty*\n`;
    }

    await this.slack.sendThreadReply(channel, threadTs, message);
  }

  private async handleTaskFailure(task: Task, error: Error) {
    // Notify user about failure
    logger.error('Task failed', { taskId: task.id, error });
  }

  private async handleWorkflowApproved(workflow: any) {
    // Create PR
    const task = Array.from(this.taskQueue['processing'].values()).find(
      (t) => t.id === workflow.taskId
    );

    if (!task) return;

    const changedFiles = await this.monorepo.getChangedFiles();
    const fileChanges: FileChange[] = changedFiles.map((file) => ({
      path: file,
      type: 'modified', // Simplified
    }));

    const prContext: PRContext = {
      changes: fileChanges,
      impactAnalysis: task.context.analysis,
    };

    const prBody = await this.github.generatePRDescription(prContext, task.description);
    const prNumber = await this.github.createPullRequest(
      task.context.branchName,
      'main',
      `${task.type}: ${task.description}`,
      prBody
    );

    // Close preview
    await this.previewManager.closePreview(task.id);

    logger.info('PR created', { taskId: task.id, prNumber });
  }

  private async handleWorkflowRejected(workflow: any, user: User, reason: string) {
    // Cleanup and notify
    const task = Array.from(this.taskQueue['processing'].values()).find(
      (t) => t.id === workflow.taskId
    );

    if (!task) return;

    await this.previewManager.closePreview(task.id);
    await this.monorepo.cleanup(task.context.branchName);

    logger.info('Workflow rejected', { taskId: task.id, reason });
  }

  async stop() {
    await this.previewManager.closeAll();
    logger.info('Orchestrator stopped');
  }
}
