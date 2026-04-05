# Voice Chat

> **Availability:** Pro and Stellur tiers only. Requires a Deepgram API key.

## Overview

Voice Chat allows you to have a spoken conversation with JUMARI. Speak naturally, and JUMARI listens, processes your words, and responds with both text and synthesized speech. It is designed for hands-free interaction when typing is inconvenient.

## How It Works

1. Click the **Voice Chat** button in the sidebar or chat interface.
2. A voice interface opens with a visual indicator showing the current state.
3. Speak your message. JUMARI uses Deepgram's speech recognition to convert your speech to text.
4. JUMARI processes your message and responds with text and synthesized speech.
5. The conversation continues in a natural back-and-forth flow.

## States

The voice interface shows its current state through visual indicators:

- **Idle**: Ready and waiting for you to speak.
- **Listening**: Actively capturing your speech.
- **Processing**: Converting speech to text and generating a response.
- **Speaking**: Playing JUMARI's spoken response.

## Setup

Voice Chat requires a Deepgram API key for speech recognition:

1. Sign up for a free account at deepgram.com.
2. Create an API key in your Deepgram dashboard.
3. Open **Settings** in Bleumr.
4. Enter your Deepgram API key in the API Keys section.
5. Voice Chat is now ready to use.

## Features

- **Natural speech input**: Speak in full sentences; no wake word required.
- **Text-to-speech output**: JUMARI responds with a clear synthesized voice.
- **Conversation history**: Voice exchanges are displayed as text in the conversation view for reference.
- **Session reset**: Clear the voice conversation and start fresh at any time.

## Limitations

- Voice Chat requires a microphone and a stable internet connection.
- Speech recognition accuracy depends on audio quality, background noise, accent, and speaking clarity.
- Voice Chat does not currently support multiple languages. English is the primary supported language.
- Text-to-speech quality depends on the browser's built-in speech synthesis capabilities and may vary by platform.
- Voice Chat sessions do not persist when the app is closed.
- Voice Chat uses your Deepgram API key and is subject to Deepgram's usage limits, pricing, and terms of service.

## Privacy

- Audio is streamed to Deepgram's servers for speech-to-text processing. Deepgram's privacy policy governs how audio data is handled.
- Bleumr does not store audio recordings. Only the transcribed text is retained as part of the conversation.
- See our [Privacy and Security](/privacy-and-security) documentation for more details.

## Disclaimer

Voice Chat uses third-party speech recognition services. Bleumr does not guarantee the accuracy of speech transcription. Misrecognized words may lead to unexpected AI responses. Always verify important information communicated through Voice Chat.

---

*Voice Chat is designed for conversational interactions. For complex or precise tasks, we recommend using the text chat interface where you can review and edit your input before sending.*
