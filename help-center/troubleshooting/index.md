# Troubleshooting

## Common Issues

### "Daily limit reached" or "Quota exceeded"
**Cause:** You have used all of your daily AI calls for your subscription tier.

**Solutions:**
- Wait until midnight UTC for your daily limit to reset.
- Upgrade to a higher tier for more daily calls (Pro: 150, Stellur: unlimited).
- Use your own Groq API key in Settings > Engine to bypass Bleumr's usage limits.

### "No API key available"
**Cause:** Bleumr cannot find a valid API key for the requested service.

**Solutions:**
- Verify your license key is activated in Settings > Plan.
- If using your own Groq API key, verify it is entered correctly in Settings > Engine.
- Check your internet connection — license validation requires connectivity.

### JUMARI responds with errors or generic messages
**Cause:** The AI service may be temporarily unavailable or overloaded.

**Solutions:**
- Wait a few moments and try again.
- Check the Groq API status page for outages.
- If using a shared API key (no personal key configured), high demand from other users may cause temporary slowdowns.
- Try switching to a smaller model (Llama 3.1-8B) in Settings > Engine, which is often faster and more available.

### Chat is slow or responses take a long time
**Cause:** Network latency, API server load, or large conversation context.

**Solutions:**
- Check your internet connection speed.
- Start a new thread — long conversations with many messages increase processing time because more context is sent with each request.
- Try a smaller model for faster responses.

### Browser automation is not working
**Cause:** Browser automation is only available in the desktop (Electron) app.

**Solutions:**
- Verify you are using the desktop app, not the web version.
- Check that you have a Pro or Stellur subscription.
- Some websites block automated interactions. Try a different approach or website.
- If the browser appears frozen, close and reopen the browser automation panel.

### BLEU BASE GG stuck on "Rendering first frame"
**Cause:** The image generation service (Pollinations.ai) may be slow or temporarily unavailable.

**Solutions:**
- Wait up to 30 seconds — first-time frame generation can be slow.
- If it fails, close BLEU BASE GG and try again with a different world preset.
- Check your internet connection.
- Try a simpler world description — shorter prompts generate faster.

### BLEU BASE GG frames not advancing
**Cause:** Frame generation may be failing silently due to API issues.

**Solutions:**
- Click the direction buttons manually to trigger frame generation.
- Check that auto-play is enabled (the play/pause button).
- Close and reopen BLEU BASE GG to reset the state.

### Voice Chat not recognizing speech
**Cause:** Microphone permissions, Deepgram API key, or audio quality issues.

**Solutions:**
- Verify your microphone is working and Bleumr has microphone permission (check your OS settings).
- Verify your Deepgram API key is entered correctly in Settings.
- Speak clearly and reduce background noise.
- Check that your Deepgram account has available credits.

### Web Designer preview not updating
**Cause:** The preview iframe may have cached the previous version.

**Solutions:**
- Click the refresh button on the preview panel.
- Try making a small additional change to trigger a re-render.
- Clear the browser cache if using the web version.

### Trading Dashboard shows no data
**Cause:** Exchange APIs may be unavailable or your network may be blocking API requests.

**Solutions:**
- Check your internet connection.
- Verify that the exchange APIs are operational (check exchange status pages).
- If using exchange API keys, verify they are valid and have the necessary permissions.

### App is slow or unresponsive
**Cause:** Long conversation histories, many open features, or limited device resources.

**Solutions:**
- Close unused features and panels.
- Start new conversation threads instead of continuing very long ones.
- Restart the app.
- Ensure your device meets the minimum system requirements (8 GB RAM recommended).

### Data missing after update
**Cause:** In rare cases, app updates may affect local storage format.

**Solutions:**
- If you have cloud sync enabled, your data should be recoverable.
- Export important conversations before major updates.
- Contact support@bleumr.com if you experience data loss after an update.

## Error Messages

| Error | Meaning | Action |
|-------|---------|--------|
| CIRCUIT_OPEN | Too many API errors in a short period; requests temporarily paused | Wait 15-30 seconds, then try again |
| Rate limited (429) | API rate limit exceeded | Wait a moment; Bleumr automatically retries |
| World generation failed | Groq API returned an error during world creation | Check API key; try a simpler prompt |
| Image generation failed | Pollinations.ai could not generate the image | Try again; use a shorter prompt |
| fetch failed / timeout | Network request timed out | Check internet connection; try again |

## Reporting Issues

If you encounter a problem not covered here:

1. Note the exact error message (if any).
2. Note what you were doing when the issue occurred.
3. Check the browser console (if technically comfortable) for additional error details.
4. Contact support@bleumr.com with the above information.

## System Requirements Reminder

- **macOS**: 11.0 (Big Sur) or later
- **RAM**: 8 GB minimum, 16 GB recommended
- **Storage**: 500 MB free disk space
- **Internet**: Broadband connection required
- **Browser** (web version): Chrome 90+, Edge 90+, or Safari 16+

---

*If you continue to experience issues after trying the above solutions, please contact support@bleumr.com. Include as much detail as possible so we can help efficiently.*
