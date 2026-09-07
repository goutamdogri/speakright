**Detailed Product Requirements Document (PRD)**

Desktop application for real-time spoken-English correction

| **Document status**   | Draft / implementation-ready                                |
|-----------------------|-------------------------------------------------------------|
| **Primary platforms** | Linux and Windows                                           |
| **Primary inputs**    | Microphone audio                                            |
| **Default STT**       | Local Whisper                                               |
| **Default LLM**       | Local Ollama model                                          |
| **Cloud options**     | Pluggable STT and LLM providers                             |
| **Primary UX**        | One sentence/correction visible at a time                   |
| **Persistence**       | SQLite; survives reboot                                     |
| **Audience**          | Single primary user; designed to evolve to multi-user later |

*Core principle: the product must help the user speak more naturally without interrupting the act of speaking.*

# 1. Executive Summary

The Personal English Speaking Coach is a cross-platform desktop application that listens to the user’s microphone, detects complete spoken utterances, transcribes them, evaluates them for grammar, sentence structure, and sentence formation, and presents one concise correction at a time in an always-on-top overlay. The application is intended to be used while the user is already working in another application such as Google Meet, Zoom, Microsoft Teams, Discord, a browser, or a terminal.

The product is deliberately split into two replaceable AI layers: Speech-to-Text (STT) and Language Model (LLM). Local Whisper is the default STT implementation and Ollama is the default LLM runtime. Cloud providers such as Groq, Gemini, and OpenAI are optional adapters for users who prefer lower latency, different model quality, or additional capabilities. This separation avoids vendor lock-in and makes the system straightforward to benchmark.

## Product outcome

- The user can activate listening globally without changing the currently focused application.

- After an utterance ends, the user sees the original sentence, corrected sentence, and a concise explanation.

- Only one correction is displayed at a time; each displayed correction remains for a configurable minimum duration, default 10 seconds.

- Corrections are queued so fast conversations do not cause the overlay to flash rapidly.

- Every correction is stored in SQLite and remains available after application or operating-system restart.

- The system works in a local-only configuration with no audio or transcript leaving the machine, unless a cloud provider is deliberately enabled.

# 2. Problem Statement

The user is actively trying to improve spoken English through self-practice and live conversations. Existing grammar tools are generally optimized for typed text, while voice assistants optimize for conversation or task completion rather than language learning. A useful coach for spoken English needs to operate in the background, require no copy/paste, preserve the flow of conversation, and provide actionable feedback that is specific enough to learn from.

The three explicit learning areas are:

- Grammar — tense, articles, prepositions, subject-verb agreement, pluralization, and similar errors.

- Sentence structure — word order, fragments, run-on constructions, and awkward structure.

- Better sentence formation — natural phrasing, unnecessary wording, and clearer alternatives while preserving the user’s intent.

# 3. Goals and Non-Goals

## 3.1 Goals

- Build a dependable daily-use desktop tool for spoken-English improvement.

- Make the correction workflow usable over Google Meet, Zoom, Microsoft Teams, and unrelated desktop applications.

- Keep local processing as the default path and make cloud providers optional.

- Provide low-distraction, one-correction-at-a-time feedback.

- Persist the full learning history locally.

- Create provider abstractions that allow STT and LLM implementations to be swapped independently.

- Make configuration accessible without requiring edits to source code.

## 3.2 Non-goals for V1

- Real-time interruption while the user is still speaking.

- Automatic capture or transcription of other people’s microphone/system audio.

- Deep pronunciation scoring, phoneme alignment, accent classification, or speech therapy.

- A mobile application.

- Multi-user cloud accounts or server-side synchronization.

- Automatic rewriting of every sentence into more advanced English; the system must preserve meaning and respect already-correct sentences.

# 4. Product Principles

| **Principle**             | **Meaning**                                                                                                        |
|---------------------------|--------------------------------------------------------------------------------------------------------------------|
| Learning over showing off | The system should correct genuine errors rather than rewrite correct sentences merely to sound more sophisticated. |
| Low interruption          | The user’s speech should remain primary. Feedback is asynchronous and queued.                                      |
| Local first               | Audio and transcripts remain local in the default configuration.                                                   |
| Provider neutrality       | STT and LLM are independent interfaces, so different combinations can be tested.                                   |
| Structured AI output      | LLM responses must conform to a schema so the UI and analytics never depend on prose parsing.                      |
| Trust and transparency    | Every correction should explain what changed and why, with confidence used to suppress weak suggestions.           |

# 5. Primary Use Cases

| **ID** | **Scenario**          | **Expected behavior**                                                                                                       |
|--------|-----------------------|-----------------------------------------------------------------------------------------------------------------------------|
| UC-01  | Self practice         | User turns on listening and speaks to themself for 10–30 minutes. Corrections accumulate in history.                        |
| UC-02  | Live meeting practice | User joins Google Meet/Zoom/Teams and speaks normally. Coach runs over the top without taking focus.                        |
| UC-03  | Rapid speech          | User speaks multiple sentences quickly. AI processing can finish faster than display time; the queue controls presentation. |
| UC-04  | Review mistakes       | User opens history later and studies recurring errors by type and date.                                                     |
| UC-05  | Local-only practice   | User selects local Whisper + Ollama. No external API calls are made.                                                        |
| UC-06  | Cloud quality mode    | User selects a cloud STT or LLM provider for better speed/quality while understanding the privacy implications.             |

# 6. User Experience Requirements

## 6.1 Activation

The application runs as a background/tray application. A global hotkey toggles listening without requiring focus to move away from the current application. Electron provides OS-level global shortcut APIs; Linux Wayland environments use the desktop portal path and must be validated during platform testing. \[R1\]

| **Requirement**     | **Specification**                                            |
|---------------------|--------------------------------------------------------------|
| Startup             | Optional launch at OS login; default configurable.           |
| Listening toggle    | Default suggested shortcut: Ctrl+Alt+E; fully configurable.  |
| Pause/resume        | Separate global shortcut suggested: Ctrl+Alt+P.              |
| Overlay toggle      | Separate shortcut suggested: Ctrl+Alt+S.                     |
| Tray status         | Tray icon indicates Disabled / Listening / Paused / Error.   |
| Permission handling | Show microphone permission status and recovery instructions. |

## 6.2 Spoken utterance lifecycle

Microphone  
-\> Audio frames  
-\> Voice Activity Detection (VAD)  
-\> Speech start  
-\> Buffer audio  
-\> Silence/end-of-utterance detected  
-\> STT  
-\> Transcript  
-\> LLM correction  
-\> Validate structured result  
-\> Persist  
-\> Enqueue  
-\> DisplayScheduler  
-\> Overlay

The unit of display is an utterance, not an arbitrary streaming token. A sentence can be slightly longer than one grammatical sentence if the user speaks continuously; V1 should favor complete utterances over overly aggressive segmentation.

## 6.3 Overlay

The overlay is a borderless, always-on-top desktop window. Electron supports always-on-top windows through BrowserWindow. Wayland does not support Electron’s standard setAlwaysOnTop path, so the product must either document an X11 requirement for V1 Linux builds or ship a separate platform strategy later. \[R2\]

| **Element**        | **Behavior**                                                                                |
|--------------------|---------------------------------------------------------------------------------------------|
| Original sentence  | Shown first; neutral/red-accent text.                                                       |
| Corrected sentence | Shown below original; visually distinct positive/green accent.                              |
| Explanation        | Shown below correction; concise, structured, typically one to three bullets.                |
| Display count      | Exactly one correction item visible at any given time.                                      |
| Default position   | Top-right of the active/primary display.                                                    |
| Custom position    | User can drag to a custom screen location and save it.                                      |
| Multi-monitor      | Position stored per display when possible; fall back to primary display.                    |
| Interactivity      | Overlay may support skip, pause queue, and close. A future click-through mode is desirable. |

Illustrative UI:

+------------------------------------------------------+  
\| ORIGINAL \|  
\| I have went to Kolkata yesterday. \|  
\| \|  
\| CORRECTION \|  
\| I went to Kolkata yesterday. \|  
\| \|  
\| WHY \|  
\| • "yesterday" calls for simple past here. \|  
\| • "have went" -\> "went". \|  
+------------------------------------------------------+

# 7. Correction Queue and Display Scheduling

The queue is a first-class component. AI processing and display are decoupled: the pipeline may produce several results while the overlay is still showing the current result.

| **Requirement**       | **Specification**                                                                                                                                     |
|-----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| One-at-a-time display | Only the queue head can be visible.                                                                                                                   |
| Minimum display time  | Default 10 seconds per item; user-configurable.                                                                                                       |
| Skip                  | User can skip the current item without deleting it from history.                                                                                      |
| Pause                 | Pausing freezes display progression and optionally stops accepting new corrections.                                                                   |
| Maximum queue         | Recommended V1 default: 20 pending items.                                                                                                             |
| Overflow              | When max size is reached, new low-confidence items may be dropped; high-confidence items should be retained. Policy must be deterministic and logged. |
| Ordering              | FIFO based on completion order or utterance start time; V1 should preserve utterance chronology by assigning sequence numbers at capture time.        |
| Display timing        | A timer begins when the item becomes visible, not when it enters the queue.                                                                           |

## 7.1 Queue state machine

EMPTY -\> SHOWING -\> WAITING -\> SHOWING  
^ \| \|  
\| +-\> SKIPPED+  
+--------------------  
  
Optional global states:  
RUNNING / PAUSED / STOPPED

# 8. AI / Model Architecture

## 8.1 Independent STT and LLM providers

The system must not bind one STT vendor to one LLM vendor. A configuration such as Local Whisper + Ollama is the default. Other valid combinations include Local Whisper + Gemini, Groq STT + Ollama, or OpenAI STT + OpenAI LLM.

interface SpeechToTextProvider {  
transcribe(audio: AudioChunk, options: TranscriptionOptions): Promise\<Transcript\>  
}  
  
interface CorrectionProvider {  
correct(input: CorrectionInput): Promise\<CorrectionResult\>  
}  
  
interface ProviderHealth {  
check(): Promise\<HealthStatus\>  
}

## 8.2 Default providers

| **Layer** | **V1 default**                                               | **Alternatives**                                |
|-----------|--------------------------------------------------------------|-------------------------------------------------|
| STT       | Local Whisper via whisper.cpp or an equivalent local runtime | Groq Whisper; OpenAI; Gemini/Google STT adapter |
| LLM       | Ollama local model                                           | Groq; Gemini; OpenAI; future providers          |
| Database  | SQLite                                                       | Not replaceable in V1                           |

whisper.cpp provides microphone-streaming examples and VAD-oriented sliding-window behavior, making it a practical local baseline for V1. \[R3\]

Groq currently exposes Whisper-based speech-to-text through OpenAI-compatible endpoints, including whisper-large-v3-turbo, which makes it a straightforward cloud STT adapter. \[R4\]

Ollama’s current API supports structured JSON output and JSON Schema via the format field, which is especially useful for deterministic parsing of correction results. \[R5\]

Gemini currently supports audio understanding/transcription and structured outputs; dedicated real-time speech-to-text is also available through Google Cloud Speech-to-Text, so a Gemini adapter should be treated as a provider rather than hard-coded into the core pipeline. \[R6\]

OpenAI’s current API documentation includes structured JSON Schema output support for supported models, making it suitable for the same correction contract. \[R7\]

# 9. Correction Engine Requirements

## 9.1 Correction objectives

- Preserve the user’s intended meaning.

- Identify grammar problems first.

- Fix sentence structure when it materially affects clarity or correctness.

- Offer a better/natural formation only where it improves the sentence without unnecessarily changing vocabulary or tone.

- Do not invent errors. If the sentence is already acceptable, return has_correction=false.

- Keep the explanation concise enough to read while continuing a conversation.

- Use recent conversational context only when needed to judge sentence completeness or meaning.

## 9.2 Structured result contract

{  
"original": "I have went there yesterday.",  
"corrected": "I went there yesterday.",  
"has_correction": true,  
"confidence": 0.97,  
"issues": \[  
{  
"type": "grammar",  
"subtype": "tense",  
"original": "have went",  
"correction": "went",  
"explanation": "'Yesterday' refers to a finished past time, so simple past is appropriate."  
}  
\],  
"better_formation": "I went there yesterday.",  
"severity": "medium"  
}

## 9.3 Confidence handling

| **Confidence** | **Behavior**                                                                     |
|----------------|----------------------------------------------------------------------------------|
| High           | Eligible for display and history.                                                |
| Medium         | Eligible for display depending on user threshold.                                |
| Low            | Persist optionally for diagnostics/history but suppress from overlay by default. |

# 10. Audio Capture and Speech Segmentation

V1 should capture the user’s selected microphone only. System audio and other participants’ audio should not be captured unless explicitly added as a future feature.

| **Area**          | **Requirement**                                                                            |
|-------------------|--------------------------------------------------------------------------------------------|
| Audio input       | Selectable microphone with default system device.                                          |
| Sample pipeline   | Normalize to a Whisper-friendly mono speech format internally.                             |
| VAD               | Detect speech start/end to form utterances rather than relying on fixed recording windows. |
| Silence end       | Initial target 700–1000 ms; configurable.                                                  |
| Max utterance     | Initial target 10–12 seconds; configurable.                                                |
| Minimum speech    | Ignore extremely short/noise-only captures.                                                |
| Raw audio storage | OFF by default; only transient buffers should exist during processing.                     |

# 11. Data Model and Persistence

SQLite is the persistent source of truth for sessions, utterances, corrections, issues, and settings that are not better stored in secure OS credential storage.

sessions  
- id (uuid/text)  
- started_at  
- ended_at  
- stt_provider  
- stt_model  
- llm_provider  
- llm_model  
  
utterances  
- id  
- session_id  
- sequence_no  
- started_at  
- ended_at  
- transcript  
- stt_latency_ms  
  
corrections  
- id  
- utterance_id  
- created_at  
- original_text  
- corrected_text  
- better_formation  
- has_correction  
- confidence  
- severity  
- llm_latency_ms  
- raw_provider_response (optional, off by default)  
  
issues  
- id  
- correction_id  
- type  
- subtype  
- original  
- correction  
- explanation  
  
settings  
- key  
- value  
- updated_at

## 11.1 Persistence requirements

- Data must survive application restart and OS reboot.

- Database migrations must be versioned from V1.

- History search should work by text, date, and issue type.

- User must be able to delete individual history items and clear all history.

- Raw audio must not be persisted unless the user explicitly enables an audio-retention feature in a future release.

# 12. Settings Requirements

| **Section** | **Controls**                                                                                     |
|-------------|--------------------------------------------------------------------------------------------------|
| General     | Launch at startup; default hotkeys; language; correction mode.                                   |
| Audio       | Microphone; VAD sensitivity; silence duration; maximum utterance duration.                       |
| STT         | Provider; model; local model path/runtime status; cloud API configuration.                       |
| LLM         | Provider; model; temperature/strictness if exposed; context window size.                         |
| Overlay     | Position; width; opacity; font size; display duration; queue limit.                              |
| Correction  | Grammar / structure / formation toggles; confidence threshold; show only meaningful corrections. |
| Privacy     | Local-only mode; cloud provider warning; raw-audio retention (future/experimental).              |

# 13. Privacy and Security

- Local-first mode must be fully functional without API keys or an internet connection.

- Cloud provider API keys must be stored in the platform’s secure credential store rather than plain-text application configuration.

- The application should make it obvious when a cloud STT or cloud LLM provider is active.

- When cloud mode is enabled, the UI should state that audio/transcript data may leave the device.

- No background audio recording should occur when listening is disabled.

- Database files should be placed in the standard per-user application data directory.

- Diagnostics must avoid logging raw speech by default.

# 14. Technical Architecture

Electron Desktop  
├── Main process  
│ ├── App lifecycle / tray  
│ ├── Global shortcuts  
│ ├── Overlay window management  
│ ├── Secure credential access  
│ └── IPC boundary  
│  
├── Renderer (React + TypeScript)  
│ ├── Settings UI  
│ ├── History UI  
│ └── Overlay UI  
│  
└── Core services  
├── AudioCapture  
├── VAD  
├── SpeechToTextRouter  
├── CorrectionRouter  
├── ContextManager  
├── CorrectionQueue  
├── DisplayScheduler  
├── HistoryRepository  
└── Metrics/Diagnostics

## 14.1 Proposed repository layout

speakright/  
apps/  
desktop/  
main/  
preload/  
renderer/  
overlay/  
packages/  
audio/  
vad/  
transcription/  
correction/  
queue/  
database/  
settings/  
shared/  
migrations/  
models/  
tests/  
scripts/

## 14.2 IPC principles

- Renderer must not receive unrestricted Node.js or filesystem access.

- Expose narrow preload APIs for settings, history, queue controls, and status.

- AI provider calls should remain outside the UI renderer.

- Overlay receives display-ready, validated correction objects rather than raw model responses.

# 15. Conversational Context

Some spoken utterances are incomplete in isolation. The correction engine should optionally receive a rolling context of the previous few utterances so it can distinguish fragments that are acceptable in context from genuine sentence errors.

| **Setting**        | **V1 recommendation**                                                                                          |
|--------------------|----------------------------------------------------------------------------------------------------------------|
| Context window     | Last 3–5 utterances.                                                                                           |
| Context retention  | Stored in session history; not sent to cloud providers unless cloud mode is enabled.                           |
| Prompt instruction | Use context only to interpret meaning/completeness; correct the current utterance, not the whole conversation. |

# 16. Failure and Degraded Modes

| **Failure**               | **Expected behavior**                                                                                     |
|---------------------------|-----------------------------------------------------------------------------------------------------------|
| Microphone unavailable    | Show tray/overlay error; keep app alive; do not crash.                                                    |
| Local Whisper unavailable | Display actionable status and offer a configured cloud STT fallback if enabled.                           |
| Ollama unavailable        | Show model/runtime error and offer configured cloud LLM fallback if enabled.                              |
| Cloud timeout             | Retry once with bounded backoff; then mark item failed and continue queue.                                |
| Malformed LLM output      | Validate against schema; retry with stricter prompt once; otherwise suppress display and log diagnostics. |
| Queue overload            | Apply deterministic overflow policy; preserve history even when display is dropped.                       |
| Database locked/corrupt   | Use transactions; surface a clear recovery path; never silently discard history.                          |

# 17. Performance and Quality Targets

Exact latency will vary substantially by CPU/GPU, model size, network, and provider. These are engineering targets for a good first user experience, not promises.

| **Metric**                   | **Target**                                                                       |
|------------------------------|----------------------------------------------------------------------------------|
| Speech-to-correction latency | ~1–3 seconds after the user finishes an utterance in a healthy configuration.    |
| Overlay render               | \<100 ms after a validated correction reaches the display scheduler.             |
| Display timing               | No item shown for less than configured minimum duration.                         |
| Background idle CPU          | Low enough to run continuously without noticeably affecting normal desktop work. |
| Audio retention              | Zero persisted raw audio in default mode.                                        |

# 18. Learning Analytics (V1.5/V2)

The schema should support analytics from day one, even if the UI is initially minimal.

- Corrections per session / day / week.

- Issue frequency by category and subtype.

- Repeated mistake detection (same or semantically similar pattern).

- Most common grammar errors.

- Trend over time.

- Practice recommendations based on repeated errors.

- Optional future “practice this mistake” mode.

# 19. Testing Strategy

## 19.1 Unit tests

- VAD event handling and utterance segmentation.

- Queue ordering, max size, skip, pause/resume, and timing logic.

- Schema validation for every provider adapter.

- Database CRUD and migration behavior.

- Settings validation and defaults.

- Context window construction.

## 19.2 Integration tests

- Audio fixture → STT mock → LLM mock → queue → overlay event.

- Cloud provider timeout and retry behavior.

- Ollama unavailable / malformed JSON behavior.

- Application restart with persisted history and settings.

- Multiple monitors and saved overlay position.

## 19.3 Manual acceptance tests

- Google Meet call while overlay stays visible and does not steal focus.

- Zoom and Teams usage with the same behavior.

- Rapid 10-sentence speaking burst creates a stable queue instead of flickering.

- 10-second display duration is honored; configurable duration changes take effect without restart.

- Local-only mode works with network disconnected.

- Windows and Linux packaging/install/startup behavior.

# 20. V1 Acceptance Criteria

1.  A global shortcut can start/stop listening while another desktop application has focus.

2.  The microphone is captured only while listening is active.

3.  A local Whisper-based STT path successfully produces transcripts from natural speech.

4.  An Ollama-based LLM path returns a validated structured correction result.

5.  The UI displays original text first, corrected text second, and a concise explanation third.

6.  Corrected text is visually distinct from the original text.

7.  Exactly one correction is visible at a time.

8.  Each item remains visible for at least the configured display duration.

9.  Multiple completed corrections are queued and displayed FIFO by utterance sequence.

10. History is stored in SQLite and survives a complete application/OS restart.

11. The user can change STT and LLM provider settings independently.

12. At least one cloud STT adapter and at least two cloud LLM adapters are possible without changing core pipeline code.

13. The app has safe failure behavior when a provider is unavailable.

14. No raw audio is stored by default.

15. The Windows and Linux builds pass the core manual acceptance suite.

# 21. Delivery Roadmap

| **Milestone** | **Focus**           | **Exit condition**                                                                    |
|---------------|---------------------|---------------------------------------------------------------------------------------|
| Milestone 1   | Core capture        | Electron shell, tray, global hotkey, microphone capture, local Whisper transcription. |
| Milestone 2   | Correction loop     | Ollama adapter, structured correction schema, overlay, one-item display.              |
| Milestone 3   | Queue + persistence | SQLite, queue scheduler, history page, restart persistence.                           |
| Milestone 4   | Configuration       | Provider selection, model selection, overlay customization, timing/queue settings.    |
| Milestone 5   | Cloud adapters      | Groq STT; OpenAI/Gemini/Groq LLM adapters; secure API-key storage.                    |
| Milestone 6   | Hardening           | Windows/Linux packaging, crash recovery, integration tests, performance profiling.    |
| Milestone 7   | Learning layer      | Repeated mistakes, statistics, practice mode, daily/weekly review.                    |

# 22. Key Risks and Mitigations

| **Risk**                         | **Mitigation**                                                                                    |
|----------------------------------|---------------------------------------------------------------------------------------------------|
| False corrections                | Use schema, confidence thresholds, conservative prompting, and “no correction” as a valid result. |
| Latency from local models        | Benchmark models on the target machine; allow cloud fallback; keep utterances bounded.            |
| Linux window-manager differences | Test X11 first for V1; explicitly document Wayland limitations; isolate overlay/window code.      |
| Queue becomes too large          | Cap queue, surface backlog state, and preserve history even when display items are dropped.       |
| User distraction                 | One item at a time, configurable duration, pause/skip, and high-confidence default.               |
| Provider API changes             | Keep adapters isolated and versioned; core pipeline depends only on internal interfaces.          |
| Privacy mistakes                 | Local-by-default, no raw audio persistence, explicit cloud indicator, secure secret storage.      |

# 23. Open Design Decisions for Implementation

- Which local Whisper runtime/model size provides the best latency-quality tradeoff on the target Linux and Windows hardware?

- Which Ollama model gives sufficiently good grammar correction at acceptable local latency and memory usage?

- Should V1 officially support Wayland overlay behavior, or should Linux V1 target X11 first?

- Should queue overflow discard lowest-confidence items, oldest items, or newest items? Recommended: lowest confidence first, then oldest.

- Should already-correct sentences ever be shown? Recommended: no, unless the user explicitly enables “show confirmations.”

- Should the display unit be strict sentences or speech utterances? Recommended: utterance-based segmentation with sentence-aware post-processing later.

# 24. Future Features

- Pronunciation feedback and phoneme-level coaching.

- Vocabulary suggestions based on repeated simple-word usage.

- “Try saying it again” practice button.

- Automatic repeated-mistake cards and spaced repetition.

- Daily speaking score and streaks.

- Conversation mode that uses context to identify communication patterns, not just isolated grammar errors.

- Screen-aware overlay placement and per-application profiles.

- Optional system-audio capture for a clearly consented conversation-coach mode.

- Export history to CSV/JSON/Markdown.

# 25. Technical References

| **Ref** | **Source**                                  | **Use in this PRD**                                                                               |
|---------|---------------------------------------------|---------------------------------------------------------------------------------------------------|
| R1      | Electron globalShortcut documentation       | Global shortcuts work without app focus; Linux Wayland uses desktop portal behavior.              |
| R2      | Electron BrowserWindow documentation        | Always-on-top windows are supported, but setAlwaysOnTop is not supported on Wayland.              |
| R3      | whisper.cpp stream documentation            | Local microphone streaming and VAD-oriented streaming examples.                                   |
| R4      | Groq Speech-to-Text documentation           | OpenAI-compatible STT endpoints and Whisper model options.                                        |
| R5      | Ollama structured outputs documentation     | JSON and JSON Schema constrained outputs from Ollama.                                             |
| R6      | Google Gemini Audio documentation           | Audio understanding, transcription, structured outputs, and guidance for dedicated real-time STT. |
| R7      | OpenAI API structured outputs documentation | JSON Schema structured output support for supported APIs/models.                                  |

Reference links:

- R1 — https://www.electronjs.org/docs/latest/api/global-shortcut

- R2 — https://www.electronjs.org/docs/latest/api/browser-window

- R3 — https://github.com/ggml-org/whisper.cpp/tree/master/examples/stream

- R4 — https://console.groq.com/docs/speech-to-text

- R5 — https://docs.ollama.com/capabilities/structured-outputs

- R6 — https://ai.google.dev/gemini-api/docs/audio

- R7 — https://platform.openai.com/docs/api-reference/responses

# 26. Recommended V1 Scope

The strongest V1 is intentionally narrow: local Whisper + Ollama, global activation, microphone-only capture, VAD-based utterances, structured correction JSON, one-correction overlay, configurable 10-second-or-more display duration, FIFO queue, SQLite history, and Windows/Linux packaging. Cloud STT/LLM adapters should be implemented behind the same provider interfaces after the local path is stable. This sequence keeps the project useful early while preserving the architecture needed for future experimentation.
