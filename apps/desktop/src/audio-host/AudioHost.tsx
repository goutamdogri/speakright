import { useEffect, useRef } from 'react';
import { SileroVadAudioPipeline } from '@speakright/audio';
import type { UtteranceSegment } from '@speakright/audio';
import { IPC } from '@speakright/shared';

declare global {
  interface Window {
    speakright: any;
  }
}

/**
 * Hidden renderer window owning the microphone + VAD pipeline.
 *
 * Audio capture requires getUserMedia, which is only available in a
 * Chromium renderer. This window runs continuously (hidden) and forwards
 * VAD-detected complete utterances to the main process via IPC.
 */
export function AudioHost() {
  const pipelineRef = useRef<SileroVadAudioPipeline | null>(null);

  useEffect(() => {
    // Pass an absolute base so onnxruntime-web fetches its wasm files from the
    // app's static root (dev server origin / renderer output folder) instead of
    // resolving relative to its own bundled module URL (which 404s).
    const assetPrefix = new URL('.', window.location.href).toString();
    const basePath = assetPrefix.slice(0, -1);

    const callbacks: any = {
      onUtterance: (segment: UtteranceSegment) => {
        // Convert Float32Array → regular array for IPC serialization
        window.speakright
          .submitUtterance({
            samples: Array.from(segment.samples),
            sampleRate: segment.sampleRate,
            startTime: segment.startTime,
            endTime: segment.endTime,
          })
          .catch((err: Error) => {
            console.error('[AudioHost] Failed to submit utterance:', err);
          });
      },
      onListeningStateChange: (speaking: boolean) => {
        // VAD reports when speech starts/stops; forward the "speaking" flag
        // to the main process so the settings UI can show live feedback.
        window.speakright.reportSpeechState(speaking).catch(() => {});
      },
      onError: (err: Error) => {
        console.error('[AudioHost] Pipeline error:', err);
      },
    };

    const pipeline = new SileroVadAudioPipeline({ modelPathPrefix: basePath }, callbacks);
    pipelineRef.current = pipeline;

    // Snapshot the configured mic so VAD opens the right device.
    void window.speakright.getSettings()
      .then((s: any) => pipeline.setDevice(s?.audio?.deviceId ?? null))
      .catch(() => {});

    // Keep main informed of available microphones (labels require mic
    // permission, granted on first start; re-check as they may change).
    const reportDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        window.speakright.reportAudioDevices(
          devices
            .filter(d => d.kind === 'audioinput')
            .map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone' })),
        );
      } catch {
        // Ignore enumeration errors (no permission yet).
      }
    };
    void reportDevices();

    // Listen for start/stop/device commands from the main process
    const startListener = () => {
      void pipeline.start().then(() => {
        // Mic permission is granted on first start; re-list so labels appear.
        void reportDevices();
      });
    };
    const stopListener = () => {
      pipeline.stop();
    };
    const deviceListener = (deviceId: string | null) => {
      void pipeline.setDevice(deviceId);
    };

    const removeStart = window.speakright.onAudioHostCommand?.(
      IPC.AUDIO_HOST_START,
      startListener,
    );
    const removeStop = window.speakright.onAudioHostCommand?.(
      IPC.AUDIO_HOST_STOP,
      stopListener,
    );
    const removeDevice = window.speakright.onAudioHostCommand?.(
      IPC.AUDIO_HOST_SET_DEVICE,
      deviceListener,
    );

    return () => {
      removeStart?.();
      removeStop?.();
      removeDevice?.();
      pipeline.stop();
    };
  }, []);

  return null;
}