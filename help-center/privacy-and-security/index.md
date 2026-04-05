# Privacy and Security

## Our Commitment

Bleumr is built with a local-first architecture. We believe your data should stay under your control. This document explains what data Bleumr collects, how it is stored, how it is transmitted, and what measures we take to protect it.

## Data Storage

### Local-First Architecture
Bleumr stores the majority of your data locally on your device:

- **Conversations**: All chat threads and messages are stored in your browser's local storage or the Electron app's local data directory.
- **User Profile**: Your name, email, and other profile information is stored locally.
- **Settings and Preferences**: All configuration, including model preferences and UI settings, is stored locally.
- **Calendar Events**: Stored locally on your device.
- **Code Lab Projects**: Stored locally on your device.
- **Web Designer Projects**: Stored locally on your device.
- **Orbit Findings**: Stored locally on your device.
- **Memory and Brain Data**: AI memory (facts JUMARI remembers about you) is stored locally.

### What Is NOT Stored Locally
- **AI Model Weights**: Bleumr does not download or store large AI model files on your device (unless you configure a local LLM in Settings).

## Data Transmission

### AI Processing
When you send a message to JUMARI, the following data is transmitted to the Groq API for processing:

- Your message text.
- Recent conversation context (previous messages in the current thread) to maintain coherent responses.
- Uploaded images (when using image analysis).

This data is transmitted over HTTPS (encrypted in transit) to Groq's servers. Groq's data retention and privacy policies govern how this data is handled on their servers. Bleumr does not control Groq's data handling practices.

> **Groq API Privacy**: Per Groq's current policies, API inputs and outputs are not used to train models. However, policies may change. We encourage you to review Groq's privacy policy directly at groq.com.

### Web Search
When JUMARI performs a web search, the search query is transmitted to DuckDuckGo's servers. DuckDuckGo is a privacy-focused search engine that does not track users. Search queries do not contain your personal information unless you explicitly include it in the query.

### Voice Chat
If you use Voice Chat, audio is streamed to Deepgram's servers for speech-to-text processing. Deepgram's privacy policy governs how audio data is handled.

### Image Generation (BLEU BASE GG)
When using BLEU BASE GG, text prompts (not personal data) are sent to the Pollinations.ai image generation service to produce frames. These prompts describe scene elements and do not contain personal information.

### Analytics
Bleumr collects minimal, anonymized analytics to understand usage patterns and improve the product:

- Session counts (number of times the app is opened).
- Feature usage counts (which features are used, not what content is created).
- Error reports (technical error information, not message content).

Analytics data does not include message content, personal information, or any data that could identify you individually.

### Cloud Sync (Optional)
If you enable cloud sync:
- Conversation data and settings are encrypted and transmitted to Bleumr's Supabase backend.
- Sync tokens are used to authenticate your device.
- You can delete synced data at any time by contacting support@bleumr.com.

Cloud sync is entirely optional. Bleumr functions fully without it.

## Security Measures

### API Key Storage
- API keys (Groq, Deepgram, exchange keys) are stored using Electron's safeStorage API when available, which uses the operating system's keychain for encryption.
- In the web version, API keys are stored in the browser's local storage. While less secure than OS-level encryption, they are never transmitted to Bleumr's servers.

### Script Sanitization
- All scripts executed in the browser automation feature are sanitized to prevent injection attacks and unauthorized access.
- A safety middleware layer reviews browser actions before execution.

### Content Security
- Bleumr does not store or log your conversation content on our servers (unless cloud sync is enabled).
- Image uploads are processed in-session and not permanently stored on AI provider servers (subject to provider policies).

### Network Security
- All API communications use HTTPS (TLS 1.2+).
- API keys are transmitted only in authorization headers, never in URLs or query parameters.

## Your Rights

### Data Access
Since your data is stored locally, you have direct access to all your data through the Bleumr application. You can view, export, or delete any data at any time.

### Data Deletion
- **Local Data**: Uninstalling Bleumr removes all local data. You can also clear specific data (conversations, memory, projects) from within the app.
- **Synced Data**: If you have used cloud sync, contact support@bleumr.com to request deletion of synced data.
- **Third-Party Services**: Data transmitted to Groq, Deepgram, or other third-party services is subject to those services' data deletion policies. Contact the respective service to exercise your data rights.

### Data Portability
- You can export conversations from **Settings**.
- Web Designer projects can be exported as ZIP files.
- Code Lab files can be copied or saved to your local file system.

## Children's Privacy

Bleumr is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information through Bleumr, please contact us at support@bleumr.com.

## Third-Party Services

Bleumr integrates with the following third-party services. Each service has its own privacy policy and terms of service:

| Service | Purpose | Data Shared |
|---------|---------|-------------|
| Groq API | AI model inference | Message text, conversation context |
| DuckDuckGo | Web search | Search queries |
| Deepgram | Speech-to-text | Audio stream (Voice Chat only) |
| Pollinations.ai | Image generation | Text prompts (BLEU BASE GG only) |
| Supabase | Cloud sync, licensing | Encrypted sync data (optional), license validation |
| Binance/Coinbase/Kraken | Market data | API keys (Trading Dashboard only, user-provided) |

Bleumr is not affiliated with, endorsed by, or sponsored by any of these third-party services.

## Changes to This Policy

We may update this privacy and security documentation from time to time. Material changes will be communicated through the app or via email (if you have provided one). Continued use of Bleumr after changes constitutes acceptance of the updated policy.

## Contact

For privacy-related inquiries, data deletion requests, or security concerns:
- Email: support@bleumr.com

---

*Last updated: April 2026. This document describes the current state of Bleumr's data practices. As the product evolves, we will update this documentation accordingly.*
