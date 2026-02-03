import type {
  ArtifactManifest,
  EpisodeRequest,
  EpisodeResult,
  EventEnvelope,
} from '@swarm/schemas';

export interface ClientConfig {
  workerUrl: string;
  telemetryUrl: string;
}

export class SwarmClient {
  private workerUrl: string;
  private telemetryUrl: string;

  constructor(config: ClientConfig) {
    this.workerUrl = config.workerUrl;
    this.telemetryUrl = config.telemetryUrl;
  }

  async runEpisode(request: EpisodeRequest): Promise<EpisodeResult> {
    const response = await fetch(`${this.workerUrl}/episode/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Worker error: ${response.status}`);
    }

    return (await response.json()) as EpisodeResult;
  }

  async postEvents(payload: {
    run_id: string;
    level_id: string;
    episode_id: string;
    events: EventEnvelope[];
  }): Promise<void> {
    const response = await fetch(`${this.telemetryUrl}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Telemetry error: ${response.status}`);
    }
  }

  async postArtifacts(payload: {
    run_id: string;
    level_id: string;
    episode_id: string;
    manifest: ArtifactManifest;
  }): Promise<void> {
    const response = await fetch(`${this.telemetryUrl}/artifacts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Telemetry error: ${response.status}`);
    }
  }
}
