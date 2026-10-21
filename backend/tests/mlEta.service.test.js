/**
 * Fallback matrix for the ML bridge. Uses a stub ML server on a real port, so
 * timeouts, auth retries and status handling are exercised end to end without
 * mocking fetch.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  predictWithMl,
  buildPredictionPayload,
  normalisePrediction,
  resetTokenCache,
  RISK_LEVEL_MAP,
} = require("../src/services/mlEta.service");

const PREDICTION_BODY = {
  train_number: "12301",
  predicted_eta: "2026-01-05T18:39:25Z",
  predicted_remaining_minutes: 759.4,
  predicted_delay_minutes: 9.43,
  eta_lower: "2026-01-05T18:31:42Z",
  eta_upper: "2026-01-05T19:12:23Z",
  delay_category: "MINOR",
  risk_level: "MODERATE",
  confidence: 0.7,
  model_version: "delay-v3-test",
  delay_p10_minutes: 1.7,
  delay_p50_minutes: 9.43,
  delay_p90_minutes: 42.39,
  p_delay_gt_15: 0.59,
  data_source: "LIVE",
  train_known_to_model: true,
  unsupported_fields_ignored: ["current_delay_minutes"],
  model_quality: {
    dataset_name: "synthetic",
    dataset_rows: 552,
    data_provenance: "synthetic",
    beats_baseline: true,
    notice: "Prototype model",
  },
};

const CONTEXT = {
  train: {
    trainNumber: "12301",
    trainName: "Howrah Rajdhani",
    trainType: "EXPRESS",
    destination: "New Delhi",
    source: "Howrah",
  },
  liveState: {
    timestamp: "2026-01-05T06:00:00Z",
    speed: 80,
    delayMinutes: 12,
    currentStation: "Kanpur",
  },
  scheduledEta: new Date("2026-01-05T18:30:00Z"),
  remainingDistanceKm: 440,
};

/** Start a stub ML service; `handler` decides how /predict/eta behaves. */
const startStub = (handler) =>
  new Promise((resolve) => {
    const calls = { login: 0, predict: 0 };
    const server = http.createServer((req, res) => {
      if (req.url === "/auth/login") {
        calls.login += 1;
        res.writeHead(200, { "Content-Type": "application/json" });
        // A token whose exp is far in the future.
        const payload = Buffer.from(
          JSON.stringify({ sub: "ml-bridge", exp: 4102444800 })
        ).toString("base64url");
        res.end(JSON.stringify({ access_token: `h.${payload}.s` }));
        return;
      }
      if (req.url === "/predict/eta") {
        calls.predict += 1;
        handler(req, res, calls);
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        calls,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });

const withStub = async (handler, run) => {
  const stub = await startStub(handler);
  const previous = { ...process.env };
  process.env.ML_ENABLED = "true";
  process.env.ML_BASE_URL = stub.baseUrl;
  process.env.ML_SERVICE_USERNAME = "ml-bridge";
  process.env.ML_SERVICE_PASSWORD = "test-password";
  process.env.ML_TIMEOUT_MS = "1000";
  resetTokenCache();
  try {
    return await run(stub);
  } finally {
    await stub.close();
    process.env = previous;
    resetTokenCache();
  }
};

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

test("successful prediction is normalised for the Node layer", async () => {
  await withStub(
    (req, res) => json(res, 200, PREDICTION_BODY),
    async () => {
      const result = await predictWithMl(CONTEXT);
      assert.equal(result.ok, true);
      assert.equal(result.prediction.delayMinutes, 9);
      assert.equal(result.prediction.delayP10Minutes, 1.7);
      assert.equal(result.prediction.delayP90Minutes, 42.39);
      assert.equal(result.prediction.probabilityDelayOver15, 0.59);
      assert.equal(result.prediction.modelVersion, "delay-v3-test");
      assert.equal(result.modelStatus.source, "ml");
      assert.equal(result.modelStatus.dataProvenance, "synthetic");
    }
  );
});

test("MODERATE risk maps onto the MEDIUM enum the schema allows", async () => {
  assert.equal(RISK_LEVEL_MAP.MODERATE, "MEDIUM");
  const prediction = normalisePrediction(PREDICTION_BODY);
  assert.equal(prediction.riskLevel, "MEDIUM");
});

test("confidence is the half-width of the P10-P90 interval", async () => {
  const prediction = normalisePrediction(PREDICTION_BODY);
  assert.equal(prediction.confidenceMinutes, Math.round((42.39 - 1.7) / 2));
});

test("503 from the model service falls back", async () => {
  await withStub(
    (req, res) => json(res, 503, { detail: "no model" }),
    async () => {
      const result = await predictWithMl(CONTEXT);
      assert.deepEqual(result, { ok: false, reason: "model_unavailable" });
    }
  );
});

test("422 falls back without retrying", async () => {
  await withStub(
    (req, res) => json(res, 422, { detail: [] }),
    async (stub) => {
      const result = await predictWithMl(CONTEXT);
      assert.equal(result.reason, "ml_rejected_payload");
      assert.equal(stub.calls.predict, 1);
    }
  );
});

test("a 401 triggers exactly one re-login, then succeeds", async () => {
  await withStub(
    (req, res, calls) =>
      calls.predict === 1
        ? json(res, 401, { detail: "expired" })
        : json(res, 200, PREDICTION_BODY),
    async (stub) => {
      const result = await predictWithMl(CONTEXT);
      assert.equal(result.ok, true);
      assert.equal(stub.calls.predict, 2);
      assert.equal(stub.calls.login, 2);
    }
  );
});

test("a persistent 401 gives up and falls back", async () => {
  await withStub(
    (req, res) => json(res, 401, { detail: "nope" }),
    async (stub) => {
      const result = await predictWithMl(CONTEXT);
      assert.equal(result.reason, "ml_auth_failed");
      assert.equal(stub.calls.predict, 2);
    }
  );
});

test("a slow model service times out and falls back", async () => {
  await withStub(
    (req, res) => setTimeout(() => json(res, 200, PREDICTION_BODY), 3000).unref(),
    async () => {
      const result = await predictWithMl(CONTEXT);
      assert.equal(result.reason, "ml_timeout");
    }
  );
});

test("an unreachable model service falls back", async () => {
  const previous = { ...process.env };
  process.env.ML_ENABLED = "true";
  process.env.ML_BASE_URL = "http://127.0.0.1:1";
  process.env.ML_SERVICE_PASSWORD = "test-password";
  process.env.ML_TIMEOUT_MS = "800";
  resetTokenCache();
  try {
    const result = await predictWithMl(CONTEXT);
    assert.equal(result.ok, false);
    assert.ok(["ml_unreachable", "ml_timeout"].includes(result.reason));
  } finally {
    process.env = previous;
    resetTokenCache();
  }
});

test("ML_ENABLED=false short-circuits without any network call", async () => {
  await withStub(
    (req, res) => json(res, 200, PREDICTION_BODY),
    async (stub) => {
      process.env.ML_ENABLED = "false";
      const result = await predictWithMl(CONTEXT);
      assert.deepEqual(result, { ok: false, reason: "disabled" });
      assert.equal(stub.calls.predict, 0);
      assert.equal(stub.calls.login, 0);
    }
  );
});

test("a missing service password falls back instead of throwing", async () => {
  await withStub(
    (req, res) => json(res, 200, PREDICTION_BODY),
    async () => {
      process.env.ML_SERVICE_PASSWORD = "";
      const result = await predictWithMl(CONTEXT);
      assert.equal(result.ok, false);
      assert.equal(result.reason, "ml_unreachable");
    }
  );
});

test("the token is cached across calls", async () => {
  await withStub(
    (req, res) => json(res, 200, PREDICTION_BODY),
    async (stub) => {
      await predictWithMl(CONTEXT);
      await predictWithMl(CONTEXT);
      await predictWithMl(CONTEXT);
      assert.equal(stub.calls.predict, 3);
      assert.equal(stub.calls.login, 1, "should log in once, not per request");
    }
  );
});

test("the payload matches the FastAPI TrainStateRequest contract", () => {
  const payload = buildPredictionPayload(CONTEXT);
  assert.equal(payload.train_number, "12301");
  assert.equal(payload.destination, "New Delhi");
  assert.equal(payload.scheduled_arrival, "2026-01-05T18:30:00.000Z");
  assert.equal(payload.current_timestamp, "2026-01-05T06:00:00.000Z");
  assert.equal(payload.distance_remaining_km, 440);
  assert.equal(payload.train_type, "EXPRESS");
  for (const key of ["train_number", "current_timestamp", "destination"]) {
    assert.ok(payload[key], `${key} is required by the model and must be sent`);
  }
});

test("a cold-start train is served and flagged, not skipped", () => {
  const prediction = normalisePrediction({
    ...PREDICTION_BODY,
    train_known_to_model: false,
  });
  assert.equal(prediction.trainKnownToModel, false);
  assert.ok(Number.isFinite(prediction.delayP50Minutes));
});
