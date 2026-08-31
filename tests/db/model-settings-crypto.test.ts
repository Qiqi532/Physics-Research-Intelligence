import { mkdtemp, readFile, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createModelSettingsCipher,
  ModelSettingsSecretError,
} from "../../packages/db/src/model-settings-crypto";

const profileId = "11111111-1111-4111-8111-111111111111";
const testOnlyValue = ["test", "only", "value"].join("-");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("model settings secret cipher", () => {
  it("encrypts with AES-GCM without serializing plaintext", async () => {
    const { keyFilePath } = await temporaryKeyPath();
    const cipher = createModelSettingsCipher({ keyFilePath });

    const encrypted = await cipher.encrypt({
      profileId,
      provider: "kimi",
      plaintext: testOnlyValue,
    });

    expect(encrypted.encryptionVersion).toBe(1);
    expect(encrypted.nonce).toHaveLength(12);
    expect(encrypted.authTag).toHaveLength(16);
    expect(Buffer.concat([
      Buffer.from(encrypted.ciphertext),
      Buffer.from(encrypted.nonce),
      Buffer.from(encrypted.authTag),
    ]).includes(Buffer.from(testOnlyValue))).toBe(false);
    await expect(cipher.decrypt({
      ...encrypted,
      profileId,
      provider: "kimi",
    })).resolves.toBe(testOnlyValue);
    expect((await readFile(keyFilePath))).toHaveLength(32);
  });

  it("uses a new nonce for every encryption", async () => {
    const { keyFilePath } = await temporaryKeyPath();
    const cipher = createModelSettingsCipher({ keyFilePath });
    const input = { profileId, provider: "kimi" as const, plaintext: testOnlyValue };

    const [first, second] = await Promise.all([cipher.encrypt(input), cipher.encrypt(input)]);

    expect(Buffer.from(first.nonce).equals(Buffer.from(second.nonce))).toBe(false);
  });

  it("binds ciphertext to the profile and provider", async () => {
    const { keyFilePath } = await temporaryKeyPath();
    const cipher = createModelSettingsCipher({ keyFilePath });
    const encrypted = await cipher.encrypt({
      profileId,
      provider: "kimi",
      plaintext: testOnlyValue,
    });

    await expect(cipher.decrypt({
      ...encrypted,
      profileId: "22222222-2222-4222-8222-222222222222",
      provider: "kimi",
    })).rejects.toMatchObject({ code: "secret_decryption_failed" });
    await expect(cipher.decrypt({
      ...encrypted,
      profileId,
      provider: "glm",
    })).rejects.toMatchObject({ code: "secret_decryption_failed" });
  });

  it("maps a damaged authentication tag to a stable safe error", async () => {
    const { keyFilePath } = await temporaryKeyPath();
    const cipher = createModelSettingsCipher({ keyFilePath });
    const encrypted = await cipher.encrypt({
      profileId,
      provider: "kimi",
      plaintext: testOnlyValue,
    });
    const authTag = Buffer.from(encrypted.authTag);
    authTag[0] ^= 0xff;

    await expect(cipher.decrypt({
      ...encrypted,
      authTag,
      profileId,
      provider: "kimi",
    })).rejects.toEqual(expect.objectContaining({
      name: "ModelSettingsSecretError",
      code: "secret_decryption_failed",
    }));
  });

  it("does not generate a replacement key while decrypting a missing key", async () => {
    const first = await temporaryKeyPath();
    const encrypted = await createModelSettingsCipher({ keyFilePath: first.keyFilePath }).encrypt({
      profileId,
      provider: "kimi",
      plaintext: testOnlyValue,
    });
    await unlink(first.keyFilePath);

    await expect(createModelSettingsCipher({ keyFilePath: first.keyFilePath }).decrypt({
      ...encrypted,
      profileId,
      provider: "kimi",
    })).rejects.toEqual(expect.objectContaining({
      name: "ModelSettingsSecretError",
      code: "secret_key_unavailable",
    }));
  });

  it("converges concurrent first writers on one master key", async () => {
    const { keyFilePath } = await temporaryKeyPath();
    const firstCipher = createModelSettingsCipher({ keyFilePath });
    const secondCipher = createModelSettingsCipher({ keyFilePath });
    const [first, second] = await Promise.all([
      firstCipher.encrypt({ profileId, provider: "kimi", plaintext: "first-value" }),
      secondCipher.encrypt({ profileId, provider: "kimi", plaintext: "second-value" }),
    ]);

    await expect(firstCipher.decrypt({ ...first, profileId, provider: "kimi" }))
      .resolves.toBe("first-value");
    await expect(firstCipher.decrypt({ ...second, profileId, provider: "kimi" }))
      .resolves.toBe("second-value");
    if (process.platform !== "win32") {
      expect((await stat(keyFilePath)).mode & 0o777).toBe(0o600);
    }
  });

  it("exposes no cause or path through the stable error", () => {
    const error = new ModelSettingsSecretError("secret_key_unavailable");
    expect(JSON.stringify(error)).not.toContain("path");
    expect(error.message).toBe("Model settings secret is unavailable");
  });
});

async function temporaryKeyPath() {
  const directory = await mkdtemp(join(tmpdir(), "pri-model-settings-"));
  temporaryDirectories.push(directory);
  return { directory, keyFilePath: join(directory, "nested", "master.key") };
}
