# Screen Voice Capture and Summary

Screen Voice Capture and Summary is a lightweight desktop app for turning screen audio into clean, useful text.

It is designed for calls, webinars, product demos, online lessons, interviews, videos, and any situation where you want to capture what is being said on your computer screen without setting up a complicated recording workflow.

The app captures system audio from your screen, transcribes it with OpenAI Whisper, and then creates a concise summary with OpenAI. Your microphone is not required, and there are no bundled transcription accounts or hidden default API keys.

## What It Does

- Captures audio playing on your screen
- Converts spoken words into a live transcript
- Creates a summary from the transcript
- Keeps the interface simple: capture area on top, settings at the bottom
- Uses your own OpenAI API key
- Includes a 7-day local trial, then asks for a license key

## OpenAI API Key Required

This app does not include an OpenAI API key.

Each user must use their own OpenAI API key for transcription and summary generation. This keeps the app cleaner, safer, and easier to distribute because API usage is connected directly to the user's own OpenAI account.

You can create an OpenAI API key here:

[Create an OpenAI API key](https://platform.openai.com/api-keys)

After creating the key, paste it into the **OpenAI API key** field in the app settings.

## Get Access

To continue using the app after the trial period, get a license key here:

[Get access](https://kurinova.gumroad.com/l/kwytfs)

## How To Use

1. Launch the app.
2. Paste your OpenAI API key into the settings area.
3. Click **Start capture**.
4. Play the meeting, video, call, webinar, or screen audio you want to capture.
5. Click **Stop** when finished.
6. Review the transcript.
7. Click **Create summary** to generate a concise summary.

## Privacy Notes

The app sends captured audio chunks to OpenAI for transcription and sends transcript text to OpenAI for summary generation. The app itself does not include third-party transcription services, CRM integrations, or built-in shared API keys.

Your OpenAI API key is stored locally in the app on your computer.

## Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm start
```

