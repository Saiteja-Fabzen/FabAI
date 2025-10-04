# FabAI - Claude-Powered Slack Chatbot for Website Management

An intelligent Slack chatbot powered by Claude AI that automates website development tasks for your 11 static HTML/CSS/JavaScript websites in the Fabzen-website monorepo.

## 🌟 Features

- **AI-Powered**: Claude 3.5 Sonnet understands natural language requests
- **11 Websites Ready**: Pre-configured for all your websites
- **Smart Previews**: Server-based URLs (recommended) or ngrok tunnels
- **Approval Workflow**: Multi-stage approval before deployment
- **Auto PR Creation**: GitHub pull requests with detailed descriptions
- **Queue Management**: Handle multiple requests with priority
- **Static Site Optimized**: No build process needed

## 📋 Your Websites

All 11 websites from Fabzen-website monorepo are configured:

1. Apperstudio
2. CallBreak Empire
3. Empire Games Brazil
4. Empire Games
5. Fabzen
6. Gamezenia
7. GrowZenia
8. Ludo Empire
9. SkillPatti Empire
10. Snake and Ladders
11. Spindhan

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Slack (get from https://api.slack.com/apps)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret

# Claude (get from https://console.anthropic.com/)
ANTHROPIC_API_KEY=your-anthropic-key

# GitHub
GITHUB_TOKEN=your-github-token
GITHUB_REPO_OWNER=Fabzentech-GitHub
GITHUB_REPO_NAME=Fabzen-website

# Preview Mode
PREVIEW_MODE=server  # or 'ngrok' for development
PREVIEW_BASE_URL=https://preview.fabzen.com  # your server URL
```

### 3. Configure Users

Edit `config/users.json` with your Slack user IDs:

```json
[
  {
    "userId": "U123456789",
    "name": "Your Name",
    "role": "superadmin",
    "permissions": ["all"]
  }
]
```

To get your Slack user ID: Click your profile → Copy member ID

### 4. Run the Bot

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 💬 Usage Examples

### Update Content
```
@FabAI Update the contact email on fabzen homepage to contact@fabzen.com
```

### Change Styles
```
@FabAI Change the primary button color to #FF6B6B on callbreak-empire
```

### Add Features
```
@FabAI Add a newsletter signup form to the footer on apperstudio
```

### Fix Bugs
```
@FabAI URGENT: Fix the broken navigation menu on ludo-empire
```

### Check Status
```
@FabAI status
```

## 🔧 Preview Modes

### Server Mode (Recommended for Production)

Use your own server for previews:

```env
PREVIEW_MODE=server
PREVIEW_BASE_URL=https://preview.fabzen.com
```

Preview URLs: `https://preview.fabzen.com/apperstudio/branch-name`

**Advantages:**
- ✅ Permanent URLs (don't expire)
- ✅ Custom domain
- ✅ No additional costs
- ✅ Professional

### Ngrok Mode (For Development)

Use ngrok tunnels for local testing:

```env
PREVIEW_MODE=ngrok
NGROK_AUTH_TOKEN=your-ngrok-token
```

Preview URLs: `https://abc123.ngrok.io`

**Advantages:**
- ✅ Easy setup
- ✅ No server needed
- ✅ Good for testing

## 🔐 User Roles

- **Superadmin**: Full access, emergency approval
- **Admin**: Approve changes, manage deployments
- **Developer**: Request changes, view previews

## 📝 Workflow

1. **Request** → Send message to bot
2. **Analysis** → Claude analyzes and creates task
3. **Queue** → Task added to priority queue
4. **Processing** → Bot creates branch and makes changes
5. **Preview** → Preview URL generated
6. **Approval** → React with ✅ or ❌
7. **PR** → GitHub pull request created
8. **Deploy** → Team reviews and merges

## 🛠️ Development Commands

```bash
npm run dev      # Development mode with watch
npm run build    # Build TypeScript
npm start        # Production mode
npm run lint     # Check code quality
npm run format   # Format code
```

## 📁 Project Structure

```
FabAI/
├── src/
│   ├── ai/              # Claude AI integration
│   ├── bot/             # Slack bot client
│   ├── github/          # GitHub API
│   ├── monorepo/        # Git operations
│   ├── preview/         # Preview management
│   ├── queue/           # Task queue
│   ├── utils/           # Utilities
│   ├── workflow/        # Approvals
│   └── orchestrator.ts  # Main coordinator
├── config/
│   ├── users.json       # User permissions
│   └── websites.json    # Website config
├── Fabzen-website/      # Git submodule
└── logs/                # Application logs
```

## 🔍 Troubleshooting

### Bot Not Responding
- Check bot is running: `npm run dev`
- Verify Slack tokens in `.env`
- Check bot is invited to channel

### Preview Not Working
- Verify `PREVIEW_MODE` in `.env`
- Check `PREVIEW_BASE_URL` is correct
- Review logs: `logs/combined.log`

### Changes Not Showing
- Hard refresh: Ctrl+Shift+R
- Check correct branch
- Verify files were modified

## 📚 Configuration Files

### `.env` - Environment Variables
All sensitive credentials and settings

### `config/users.json` - User Permissions
```json
{
  "userId": "U123456789",
  "name": "User Name",
  "role": "superadmin|admin|developer",
  "permissions": ["..."]
}
```

### `config/websites.json` - Website Settings
All 11 websites pre-configured with paths and ports

## 🎯 Best Practices

1. **Be Specific** - Detailed requests get better results
2. **One Website** - Focus on one site per request
3. **Test Previews** - Always review before approving
4. **Use URGENT** - Only for critical fixes
5. **Provide Context** - Explain what you want clearly

## 🔒 Security

- ✅ Role-based access control
- ✅ Multi-stage approval workflows
- ✅ Audit logging
- ✅ Resource locking
- ✅ API key protection

## 📖 Documentation

- **README.md** (this file) - Overview and quick start
- **SETUP_GUIDE.md** - Detailed setup instructions
- **SLACK_AI_CHATBOT_SPEC.md** - Original specification

## 🆘 Getting Help

1. Check logs in `logs/` directory
2. Enable debug: `LOG_LEVEL=debug npm run dev`
3. Review SETUP_GUIDE.md
4. Check Slack app configuration

## 🚢 Deployment

### Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start npm --name "fabai" -- start

# Save configuration
pm2 save

# Enable startup
pm2 startup
```

### Using Docker

```bash
# Build image
docker build -t fabai .

# Run container
docker run -d --env-file .env --name fabai fabai
```

## 📊 Monitoring

```bash
# View PM2 logs
pm2 logs fabai

# Check status
pm2 status

# Restart
pm2 restart fabai
```

## 🎊 What's Included

✅ Complete TypeScript codebase
✅ All 11 websites configured
✅ Dual preview mode (server/ngrok)
✅ Multi-stage approval system
✅ GitHub PR automation
✅ Task queue with priorities
✅ File processing
✅ Comprehensive error handling
✅ Full documentation

## 🔄 Next Steps

1. Follow SETUP_GUIDE.md for detailed Slack/Claude/GitHub setup
2. Configure your server for preview URLs (if using server mode)
3. Add team members to `config/users.json`
4. Test with a simple request
5. Train team on usage

## 📞 Support

For issues:
- Check `logs/combined.log` and `logs/error.log`
- Review environment variables
- Verify all tokens are correct
- Check Slack app has correct permissions

## 🎉 You're Ready!

Your FabAI bot is configured for all 11 websites and ready to use. Start by sending a test message:

```
@FabAI status
```

---

**Built with:**
- Claude 3.5 Sonnet (Anthropic)
- Slack Bolt SDK
- TypeScript
- Express.js
- GitHub API

**License:** MIT
