import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { service, withConfiguredModelSettingsApi } = vi.hoisted(() => {
  const service = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    getRouting: vi.fn(),
    updateRouting: vi.fn(),
    health: vi.fn(),
    sample: vi.fn(),
  };
  return {
    service,
    withConfiguredModelSettingsApi: vi.fn(async (
      operation: (api: typeof service) => Promise<unknown>,
    ) => operation(service)),
  };
});

vi.mock("@/server/model-settings", () => ({ withConfiguredModelSettingsApi }));

import {
  GET as getConnections,
  POST as createConnection,
} from "../../apps/web/src/app/api/model-connections/route";
import {
  DELETE as deleteConnection,
  PATCH as updateConnection,
} from "../../apps/web/src/app/api/model-connections/[id]/route";
import { POST as healthConnection } from "../../apps/web/src/app/api/model-connections/[id]/health/route";
import { POST as sampleConnection } from "../../apps/web/src/app/api/model-connections/[id]/sample/route";
import {
  GET as getRouting,
  PUT as updateRouting,
} from "../../apps/web/src/app/api/model-routing/route";

const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id }) };

describe("model settings route handlers", () => {
  beforeEach(() => {
    process.env.PRI_LAN_MODE = "false";
    vi.clearAllMocks();
    for (const method of Object.values(service)) {
      method.mockResolvedValue({ status: 200, body: { ok: true } });
    }
  });

  afterEach(() => {
    delete process.env.PRI_LAN_MODE;
  });

  it("delegates safe metadata reads", async () => {
    expect((await getConnections()).status).toBe(200);
    expect((await getRouting()).status).toBe(200);
    expect(service.list).toHaveBeenCalledOnce();
    expect(service.getRouting).toHaveBeenCalledOnce();
  });

  it("reads bounded JSON once for create, update, and routing", async () => {
    const createBody = { name: "Kimi 日常" };
    const updateBody = { name: "Kimi 新名" };
    const routingBody = {
      classifyPrimaryId: id,
      classifyFallbackId: null,
      interpretPrimaryId: id,
      interpretFallbackId: null,
    };

    expect((await createConnection(jsonRequest("/api/model-connections", "POST", createBody))).status)
      .toBe(200);
    expect((await updateConnection(
      jsonRequest(`/api/model-connections/${id}`, "PATCH", updateBody),
      context,
    )).status).toBe(200);
    expect((await updateRouting(jsonRequest("/api/model-routing", "PUT", routingBody))).status)
      .toBe(200);
    expect(service.create).toHaveBeenCalledWith(createBody);
    expect(service.update).toHaveBeenCalledWith(id, updateBody);
    expect(service.updateRouting).toHaveBeenCalledWith(routingBody);
  });

  it("allows bodyless same-origin delete, health, and sample actions", async () => {
    const deleteResponse = await deleteConnection(actionRequest(`/api/model-connections/${id}`, "DELETE"), context);
    const healthResponse = await healthConnection(actionRequest(`/api/model-connections/${id}/health`, "POST"), context);
    const sampleResponse = await sampleConnection(actionRequest(`/api/model-connections/${id}/sample`, "POST"), context);

    expect([deleteResponse.status, healthResponse.status, sampleResponse.status]).toEqual([200, 200, 200]);
    expect(service.remove).toHaveBeenCalledWith(id);
    expect(service.health).toHaveBeenCalledWith(id);
    expect(service.sample).toHaveBeenCalledWith(id);
  });

  it("rejects cross-origin and LAN mutations before service initialization", async () => {
    const crossOrigin = jsonRequest("/api/model-connections", "POST", {});
    crossOrigin.headers.set("origin", "https://attacker.example.test");
    expect(await (await createConnection(crossOrigin)).json()).toEqual({
      errorCode: "settings_origin_rejected",
    });
    process.env.PRI_LAN_MODE = "true";
    expect(await (await deleteConnection(
      actionRequest(`/api/model-connections/${id}`, "DELETE"),
      context,
    )).json()).toEqual({ errorCode: "settings_local_only" });
    expect(withConfiguredModelSettingsApi).not.toHaveBeenCalled();
  });

  it("maps malformed JSON without invoking the service", async () => {
    const response = await createConnection(new Request(
      "http://127.0.0.1:3000/api/model-connections",
      {
        method: "POST",
        headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
        body: "{",
      },
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errorCode: "settings_invalid" });
    expect(withConfiguredModelSettingsApi).not.toHaveBeenCalled();
  });
});

function jsonRequest(path: string, method: string, body: unknown): Request {
  return new Request(`http://127.0.0.1:3000${path}`, {
    method,
    headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function actionRequest(path: string, method: string): Request {
  return new Request(`http://127.0.0.1:3000${path}`, {
    method,
    headers: { origin: "http://127.0.0.1:3000" },
  });
}
