export type UploadReasonCode =
  | "ADOBE_CONNECTION_MISSING"
  | "ADOBE_AUTH_REJECTED"
  | "ADOBE_FTP_UNREACHABLE"
  | "ADOBE_IMAGE_UPLOAD_FAILED"
  | "ADOBE_CSV_UPLOAD_FAILED"
  | "ADOBE_UNKNOWN_ERROR";

interface NormalizedReason {
  reasonCode: UploadReasonCode;
  reasonMessage: string;
}

function includesAny(value: string, list: string[]): boolean {
  return list.some((item) => value.includes(item));
}

export function normalizeUploadReason(error: unknown): NormalizedReason {
  const raw = error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : String(error).toLowerCase();

  if (includesAny(raw, ["credentials", "login", "password", "missing"])) {
    return {
      reasonCode: "ADOBE_CONNECTION_MISSING",
      reasonMessage: "Adobe FTP connection settings are missing or incomplete."
    };
  }

  if (includesAny(raw, ["auth", "invalid", "denied", "530"])) {
    return {
      reasonCode: "ADOBE_AUTH_REJECTED",
      reasonMessage: "Adobe FTP rejected the provided credentials."
    };
  }

  if (includesAny(raw, ["econnrefused", "timeout", "network", "unreachable"])) {
    return {
      reasonCode: "ADOBE_FTP_UNREACHABLE",
      reasonMessage: "Adobe FTP is unreachable, retry later."
    };
  }

  if (includesAny(raw, ["image", "binary", "file upload"])) {
    return {
      reasonCode: "ADOBE_IMAGE_UPLOAD_FAILED",
      reasonMessage: "Image upload to Adobe FTP failed."
    };
  }

  if (includesAny(raw, ["csv", "metadata"])) {
    return {
      reasonCode: "ADOBE_CSV_UPLOAD_FAILED",
      reasonMessage: "Metadata CSV upload to Adobe FTP failed."
    };
  }

  return {
    reasonCode: "ADOBE_UNKNOWN_ERROR",
    reasonMessage: "Unexpected Adobe upload failure."
  };
}
