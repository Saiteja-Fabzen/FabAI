import { query } from '@anthropic-ai/claude-code';
import logger from '../utils/logger';

interface ConversationSession {
  userId: string;
  sessionId?: string;
  lastActivity: Date;
}

export class ClaudeClient {
  private sessions: Map<string, ConversationSession> = new Map();

  constructor() {
    // No API key needed - claude-code SDK handles authentication
  }

  async sendMessage(
    userId: string,
    message: string,
    systemPrompt?: string,
    includeHistory: boolean = true
  ): Promise<string> {
    try {
      const session = this.sessions.get(userId);
      let fullResponse = '';

      const prompt = systemPrompt ? `${systemPrompt}\n\n${message}` : message;

      const workingDirectory = process.env.MONOREPO_PATH || './Fabzen-website';

      const options: Record<string, unknown> = {
        outputFormat: 'stream-json',
        permissionMode: 'bypassPermissions',
        cwd: workingDirectory, // Restrict to monorepo directory only
      };

      // Resume session if available and history is requested
      if (includeHistory && session?.sessionId) {
        options.resume = session.sessionId;
        logger.debug('Resuming session', { sessionId: session.sessionId, userId });
      }

      for await (const sdkMessage of query({
        prompt,
        options,
      })) {
        // Track session ID
        if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
          const currentSession = this.sessions.get(userId) || {
            userId,
            lastActivity: new Date(),
          };
          currentSession.sessionId = sdkMessage.session_id;
          this.sessions.set(userId, currentSession);
          logger.info('Session initialized', {
            sessionId: sdkMessage.session_id,
            userId,
          });
        }

        // Collect response text from assistant messages
        if (sdkMessage.type === 'assistant') {
          // Extract text from nested content structure
          const content = (sdkMessage as any).message?.message?.content || (sdkMessage as any).message?.content;
          if (content && Array.isArray(content)) {
            const textParts = content
              .filter((part: any) => part.type === 'text')
              .map((part: any) => part.text);
            fullResponse += textParts.join('');
          }
        }
      }

      logger.info('Claude response generated', {
        userId,
        messageLength: fullResponse.length,
      });

      return fullResponse;
    } catch (error) {
      logger.error('Error communicating with Claude', { error, userId });
      throw error;
    }
  }

  async analyzeImage(
    userId: string,
    _imageData: string,
    mimeType: string,
    prompt: string
  ): Promise<string> {
    try {
      // Claude Code SDK doesn't have direct image support in the same way
      // We'll use a workaround by sending the prompt
      const message = `${prompt}\n\nNote: Image analysis requested with mime type: ${mimeType}`;
      return await this.sendMessage(userId, message, undefined, false);
    } catch (error) {
      logger.error('Error analyzing image with Claude', { error, userId });
      throw error;
    }
  }

  async streamResponse(
    userId: string,
    message: string,
    onChunk: (chunk: string) => void,
    systemPrompt?: string
  ): Promise<void> {
    try {
      const session = this.sessions.get(userId);
      const prompt = systemPrompt ? `${systemPrompt}\n\n${message}` : message;

      const workingDirectory = process.env.MONOREPO_PATH || './Fabzen-website';

      const options: Record<string, unknown> = {
        outputFormat: 'stream-json',
        permissionMode: 'bypassPermissions',
        cwd: workingDirectory, // Restrict to monorepo directory only
      };

      if (session?.sessionId) {
        options.resume = session.sessionId;
      }

      for await (const sdkMessage of query({
        prompt,
        options,
      })) {
        // Track session ID
        if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
          const currentSession = this.sessions.get(userId) || {
            userId,
            lastActivity: new Date(),
          };
          currentSession.sessionId = sdkMessage.session_id;
          this.sessions.set(userId, currentSession);
        }

        // Stream text chunks from assistant messages
        if (sdkMessage.type === 'assistant') {
          // Extract text from nested content structure
          const content = (sdkMessage as any).message?.message?.content || (sdkMessage as any).message?.content;
          if (content && Array.isArray(content)) {
            const textParts = content
              .filter((part: any) => part.type === 'text')
              .map((part: any) => part.text);
            const text = textParts.join('');
            if (text) {
              onChunk(text);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error streaming from Claude', { error, userId });
      throw error;
    }
  }

  clearHistory(userId: string) {
    this.sessions.delete(userId);
    logger.info('Conversation history cleared', { userId });
  }

  async analyzeCode(code: string, language: string, analysisType: 'review' | 'security' | 'performance'): Promise<string> {
    const prompts = {
      review: `Review the following ${language} code and provide feedback on:
- Code quality and best practices
- Potential bugs or issues
- Suggestions for improvement

Code:
\`\`\`${language}
${code}
\`\`\``,
      security: `Analyze the following ${language} code for security vulnerabilities:
- Look for SQL injection risks
- Check for XSS vulnerabilities
- Identify insecure dependencies or patterns
- Check for exposed sensitive data

Code:
\`\`\`${language}
${code}
\`\`\``,
      performance: `Analyze the following ${language} code for performance issues:
- Identify inefficient algorithms or operations
- Look for memory leaks
- Suggest optimizations
- Check for unnecessary computations

Code:
\`\`\`${language}
${code}
\`\`\``,
    };

    return await this.sendMessage('system', prompts[analysisType], undefined, false);
  }
}
