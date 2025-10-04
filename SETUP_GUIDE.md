# FabAI Setup Guide

This guide will walk you through setting up the FabAI Slack chatbot from scratch.

## Prerequisites

1. **Slack Workspace** with admin access
2. **Anthropic API Key** (Claude)
3. **GitHub Personal Access Token**
4. **Ngrok Account** and auth token
5. **Node.js 18+** installed

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Slack App

### Create Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name it "FabAI" and select your workspace

### Configure OAuth & Permissions

Add these **Bot Token Scopes**:
- `app_mentions:read` - Read messages that mention the bot
- `chat:write` - Send messages
- `files:read` - Read uploaded files
- `reactions:read` - Read reactions for approvals
- `users:read` - Get user information
- `channels:history` - Read channel messages
- `groups:history` - Read private channel messages
- `im:history` - Read DMs
- `mpim:history` - Read group DMs

### Enable Socket Mode

1. Go to "Socket Mode" in sidebar
2. Enable Socket Mode
3. Give it a name and save the token (starts with `xapp-`)
4. This is your `SLACK_APP_TOKEN`

### Enable Event Subscriptions

1. Go to "Event Subscriptions"
2. Toggle "Enable Events" to ON
3. Add these bot events:
   - `app_mention`
   - `message.channels`
   - `message.im`
   - `file_shared`
   - `reaction_added`

### Install App to Workspace

1. Go to "Install App" in sidebar
2. Click "Install to Workspace"
3. Authorize the app
4. Save the "Bot User OAuth Token" (starts with `xoxb-`)
5. This is your `SLACK_BOT_TOKEN`

### Get Signing Secret

1. Go to "Basic Information"
2. Find "Signing Secret"
3. Click "Show" and copy
4. This is your `SLACK_SIGNING_SECRET`

## Step 3: Set Up Anthropic API

1. Go to https://console.anthropic.com/
2. Create an account or sign in
3. Go to "API Keys"
4. Create a new API key
5. This is your `ANTHROPIC_API_KEY`

## Step 4: Set Up GitHub

### Create Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Give it a name like "FabAI Bot"
4. Select these scopes:
   - `repo` (full repository access)
   - `workflow` (update GitHub Actions workflows)
5. Generate and save the token
6. This is your `GITHUB_TOKEN`

### Get Repository Info

- Your GitHub username/org is `GITHUB_REPO_OWNER`
- Your repository name is `GITHUB_REPO_NAME`

## Step 5: Set Up Ngrok

1. Go to https://ngrok.com/
2. Sign up for a free account
3. Go to "Your Authtoken" in dashboard
4. Copy your authtoken
5. This is your `NGROK_AUTH_TOKEN`

## Step 6: Configure Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-actual-bot-token
SLACK_APP_TOKEN=xapp-your-actual-app-token
SLACK_SIGNING_SECRET=your-actual-signing-secret

# Claude Configuration
ANTHROPIC_API_KEY=your-actual-anthropic-key

# GitHub Configuration
GITHUB_TOKEN=your-actual-github-token
GITHUB_REPO_OWNER=your-github-username
GITHUB_REPO_NAME=Fabzen-website

# Monorepo Configuration
MONOREPO_PATH=./Fabzen-website
WEBSITES_CONFIG_PATH=./config/websites.json

# Queue Configuration
MAX_CONCURRENT_TASKS=3
TASK_TIMEOUT_MINUTES=60
QUEUE_CLEANUP_INTERVAL=300

# Ngrok Configuration
NGROK_AUTH_TOKEN=your-actual-ngrok-token
DEFAULT_DEV_PORT=8080

# Server Configuration
PORT=3000
NODE_ENV=development
```

## Step 7: Configure Users

Get your Slack User ID:
1. Click your profile in Slack
2. Click "Copy member ID"

Edit `config/users.json`:

```json
[
  {
    "userId": "U123456789",  // Your actual Slack user ID
    "name": "Your Name",
    "role": "superadmin",
    "permissions": ["all"]
  }
]
```

## Step 8: Test the Setup

Build and run:

```bash
npm run build
npm start
```

Or for development:

```bash
npm run dev
```

You should see:
```
✅ FabAI Slack Chatbot is running!
⚡️ Slack bot is running!
```

## Step 9: Test in Slack

1. Go to your Slack workspace
2. Find the FabAI bot in Apps
3. Send a message: `@FabAI status`
4. You should get a response with queue status

## Step 10: Invite Bot to Channels

1. Go to the channel where you want to use the bot
2. Type `/invite @FabAI`
3. The bot can now respond to messages in that channel

## Common Issues

### Bot not responding

- Check bot is running (`npm run dev`)
- Check Socket Mode is enabled
- Check bot has correct permissions
- Check `.env` tokens are correct

### Preview not working

- Check ngrok token is correct
- Check ngrok is installed: `npm list ngrok`
- Check firewall allows ngrok connections

### Git operations failing

- Check GitHub token has correct permissions
- Check repository exists and bot has access
- Check submodule is initialized: `git submodule status`

### TypeScript errors

Run type check:
```bash
npx tsc --noEmit
```

Install missing types:
```bash
npm install --save-dev @types/node @types/uuid
```

## Next Steps

1. **Add more users** to `config/users.json`
2. **Configure websites** in `config/websites.json`
3. **Customize approval workflows** in `src/workflow/approval-engine.ts`
4. **Add custom commands** in `src/orchestrator.ts`
5. **Set up monitoring** and logging

## Security Checklist

- [ ] `.env` file is in `.gitignore`
- [ ] All API keys are kept secret
- [ ] GitHub token has minimal required permissions
- [ ] User roles are properly configured
- [ ] Approval workflows are enabled
- [ ] Logs don't contain sensitive data

## Support

If you encounter issues:
1. Check the logs in `logs/` directory
2. Enable debug logging: `LOG_LEVEL=debug npm run dev`
3. Review the main README.md
4. Check the specification in SLACK_AI_CHATBOT_SPEC.md

---

**You're all set! Start managing your websites with AI! 🚀**
