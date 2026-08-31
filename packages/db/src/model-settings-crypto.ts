import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ModelConnectionProvider } from "@pri/domain/model-settings";

const encryptionVersion = 1 as const;
const masterKeyBytes = 32;
const nonceBytes = 12;
const authenticationTagBytes = 16;

export type EncryptedModelSecret = {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
  encryptionVersion: typeof encryptionVersion;
};

type SecretIdentity = {
  profileId: string;
  provider: ModelConnectionProvider;
};

export interface ModelSettingsCipher {
  encrypt(input: SecretIdentity & { plaintext: string }): Promise<EncryptedModelSecret>;
  decrypt(input: SecretIdentity & EncryptedModelSecret): Promise<string>;
}

export type ModelSettingsSecretErrorCode =
  | "secret_key_unavailable"
  | "secret_decryption_failed";

export class ModelSettingsSecretError extends Error {
  constructor(readonly code: ModelSettingsSecretErrorCode) {
    super(code === "secret_key_unavailable"
      ? "Model settings secret is unavailable"
      : "Model settings secret could not be decrypted");
    this.name = "ModelSettingsSecretError";
  }
}

export function createModelSettingsCipher(options: {
  keyFilePath?: string;
} = {}): ModelSettingsCipher {
  const keyFilePath = options.keyFilePath ?? defaultModelSettingsKeyPath();
  return {
    async encrypt(input) {
      const masterKey = await loadOrCreateMasterKey(keyFilePath);
      const nonce = randomBytes(nonceBytes);
      const cipher = createCipheriv("aes-256-gcm", masterKey, nonce, {
        authTagLength: authenticationTagBytes,
      });
      cipher.setAAD(associatedData(input));
      const ciphertext = Buffer.concat([
        cipher.update(input.plaintext, "utf8"),
        cipher.final(),
      ]);
      return {
        ciphertext,
        nonce,
        authTag: cipher.getAuthTag(),
        encryptionVersion,
      };
    },

    async decrypt(input) {
      if (input.encryptionVersion !== encryptionVersion) {
        throw new ModelSettingsSecretError("secret_decryption_failed");
      }
      const masterKey = await readExistingMasterKey(keyFilePath);
      try {
        const decipher = createDecipheriv("aes-256-gcm", masterKey, input.nonce, {
          authTagLength: authenticationTagBytes,
        });
        decipher.setAAD(associatedData(input));
        decipher.setAuthTag(input.authTag);
        return Buffer.concat([
          decipher.update(input.ciphertext),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new ModelSettingsSecretError("secret_decryption_failed");
      }
    },
  };
}

export function defaultModelSettingsKeyPath(environment: NodeJS.ProcessEnv = process.env): string {
  if (process.platform === "win32") {
    const dataRoot = environment.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local");
    return join(dataRoot, "Physics Research Intelligence", "model-settings.key");
  }
  const dataRoot = environment.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
  return join(dataRoot, "physics-research-intelligence", "model-settings.key");
}

async function loadOrCreateMasterKey(path: string): Promise<Buffer> {
  try {
    return await readValidMasterKey(path, true);
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) {
      if (error instanceof ModelSettingsSecretError) throw error;
      throw new ModelSettingsSecretError("secret_key_unavailable");
    }
  }

  const key = randomBytes(masterKeyBytes);
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, key, { flag: "wx", mode: 0o600 });
    return key;
  } catch (error) {
    if (!isNodeError(error, "EEXIST")) {
      throw new ModelSettingsSecretError("secret_key_unavailable");
    }
    return readValidMasterKey(path, true);
  }
}

async function readExistingMasterKey(path: string): Promise<Buffer> {
  try {
    return await readValidMasterKey(path, false);
  } catch {
    throw new ModelSettingsSecretError("secret_key_unavailable");
  }
}

async function readValidMasterKey(path: string, retryIncomplete: boolean): Promise<Buffer> {
  const attempts = retryIncomplete ? 5 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const key = await readFile(path);
      if (key.byteLength === masterKeyBytes) return key;
      lastError = new Error("Invalid master key length");
    } catch (error) {
      lastError = error;
      if (isNodeError(error, "ENOENT") && attempt === 0) throw error;
    }
    if (attempt + 1 < attempts) await delay(5);
  }
  throw lastError;
}

function associatedData(input: SecretIdentity): Buffer {
  return Buffer.from(`${encryptionVersion}\0${input.profileId}\0${input.provider}`, "utf8");
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
