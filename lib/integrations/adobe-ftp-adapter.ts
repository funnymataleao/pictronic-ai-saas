import { normalizeUploadReason } from "@/lib/integrations/reason-codes";
import { AdobeUploadAttempt, AdobeUploadInput, AdobeUploadResult } from "@/lib/integrations/types";

export interface AdobeFtpAdapter {
  upload(input: AdobeUploadInput): Promise<AdobeUploadResult>;
}

interface AdobeAdapterConfig {
  maxAttempts: number;
  shouldFailAttempt?: (attempt: number) => boolean;
}

function defaultShouldFailAttempt(attempt: number): boolean {
  const failAttempts = Number(process.env.PICTRONIC_ADOBE_FAIL_ATTEMPTS ?? "0");
  return Number.isFinite(failAttempts) && failAttempts > 0 && attempt <= failAttempts;
}

export class SimulatedAdobeFtpAdapter implements AdobeFtpAdapter {
  private readonly maxAttempts: number;

  private readonly shouldFailAttempt: (attempt: number) => boolean;

  constructor(config: AdobeAdapterConfig) {
    this.maxAttempts = config.maxAttempts;
    this.shouldFailAttempt = config.shouldFailAttempt ?? defaultShouldFailAttempt;
  }

  async upload(input: AdobeUploadInput): Promise<AdobeUploadResult> {
    const attempts: AdobeUploadAttempt[] = [];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (this.shouldFailAttempt(attempt)) {
        const normalized = normalizeUploadReason(new Error("network timeout"));
        attempts.push({
          attempt,
          traceId: input.traceId,
          ok: false,
          reasonCode: normalized.reasonCode,
          reasonMessage: normalized.reasonMessage,
        });
        continue;
      }

      attempts.push({
        attempt,
        traceId: input.traceId,
        ok: true,
      });

      return {
        attempts,
        remoteImagePath: `/incoming/${input.assetId}.jpg`,
        remoteCsvPath: `/incoming/${input.assetId}.csv`,
      };
    }

    return {
      attempts,
      remoteImagePath: `/incoming/${input.assetId}.jpg`,
      remoteCsvPath: `/incoming/${input.assetId}.csv`,
    };
  }
}
