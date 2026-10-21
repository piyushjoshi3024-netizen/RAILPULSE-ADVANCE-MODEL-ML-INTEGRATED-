/**
 * Bridge from the Node API to the FastAPI delay model.
 *
 * The browser never talks to the ML service: Node authenticates to it with a
 * dedicated service account and forwards the result. Every failure path is
 * swallowed here and reported as { ok: false, reason }, so the caller can fall
 * back to the rule-based ETA instead of surfacing an error to the user.
 */

const DEFAULTS = {
  baseUrl: "http://localhost:8000/api/v1",
  timeoutMs: 2500,
  username: "ml-bridge",
};

// Delay categories the model can return, mapped onto the ETAPrediction enum,
// which only knows LOW / MEDIUM / HIGH.
const RISK_LEVEL_MAP = {
  LOW: "LOW",
  MODERATE: "MEDIUM",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
};

const config = () => ({
  enabled: String(process.env.ML_ENABLED ?? "true").toLowerCase() !== "false",
  baseUrl: (process.env.ML_BASE_URL || DEFAULTS.baseUrl).replace(/\/$/, ""),
  username: process.env.ML_SERVICE_USERNAME || DEFAULTS.username,
  password: process.env.ML_SERVICE_PASSWORD || "",
  timeoutMs: Number(process.env.ML_TIMEOUT_MS || DEFAULTS.timeoutMs),
});

// Cached service token. The ML service issues its own JWT against its own user
// store, so a Node-issued token would not validate there.
let tokenCache = { token: null, expiresAt: 0 };

const resetTokenCache = () => {
  tokenCache = { token: null, expiresAt: 0 };
};

/** Read the exp claim without verifying: the ML service does the verifying. */
const readExpiry = (token) => {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString("utf8")
    );
    return payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
};

const request = async (path, options = {}) => {
  const { baseUrl, timeoutMs } = config();
  return fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
};

const login = async () => {
  const { username, password } = config();

  if (!password) {
    throw new Error("ML_SERVICE_PASSWORD is not configured");
  }

  const response = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`ML login failed with status ${response.status}`);
  }

  const body = await response.json();
  const token = body.access_token;
  // Refresh a minute early so a request never carries a just-expired token.
  tokenCache = { token, expiresAt: readExpiry(token) - 60_000 };
  return token;
};

const getServiceToken = async () => {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  return login();
};

/** Map the Node domain objects onto the FastAPI TrainStateRequest. */
const buildPredictionPayload = ({
  train,
  liveState,
  scheduledEta,
  remainingDistanceKm,
}) => ({
  train_number: String(train.trainNumber),
  train_name: train.trainName || null,
  train_type: train.trainType || null,
  current_timestamp: new Date(liveState?.timestamp || Date.now()).toISOString(),
  scheduled_arrival: scheduledEta ? new Date(scheduledEta).toISOString() : null,
  destination: train.destination,
  source: train.source || null,
  current_station: liveState?.currentStation || null,
  distance_remaining_km:
    typeof remainingDistanceKm === "number" ? remainingDistanceKm : null,
  current_speed_kmph: liveState?.speed ?? null,
  // Accepted by the model's contract but not used by it; the response echoes
  // them back in unsupported_fields_ignored.
  current_delay_minutes: liveState?.delayMinutes ?? 0,
});

/** Shape the model response into the fields the Node layer stores and renders. */
const normalisePrediction = (body) => {
  const quality = body.model_quality || {};
  const p10 = Number(body.delay_p10_minutes);
  const p90 = Number(body.delay_p90_minutes);
  const halfWidth =
    Number.isFinite(p10) && Number.isFinite(p90)
      ? Math.max(0, Math.round((p90 - p10) / 2))
      : null;

  return {
    predictedEta: new Date(body.predicted_eta),
    delayMinutes: Math.round(Number(body.predicted_delay_minutes)),
    confidenceMinutes: halfWidth,
    riskLevel: RISK_LEVEL_MAP[body.risk_level] || "LOW",
    delayCategory: body.delay_category,
    delayP10Minutes: p10,
    delayP50Minutes: Number(body.delay_p50_minutes),
    delayP90Minutes: p90,
    probabilityDelayOver15: Number(body.p_delay_gt_15),
    modelVersion: body.model_version,
    trainKnownToModel: Boolean(body.train_known_to_model),
    unsupportedFieldsIgnored: body.unsupported_fields_ignored || [],
    dataProvenance: quality.data_provenance || "unknown",
    datasetRows: quality.dataset_rows ?? null,
    beatsBaseline: quality.beats_baseline ?? null,
    modelNotice: quality.notice || "",
  };
};

/**
 * Ask the model for a prediction.
 *
 * Resolves to { ok: true, prediction, modelStatus } or { ok: false, reason }.
 * It never rejects: an unavailable model is an expected condition, not an error.
 */
const predictWithMl = async (context) => {
  const settings = config();

  if (!settings.enabled) {
    return { ok: false, reason: "disabled" };
  }

  const payload = buildPredictionPayload(context);

  const attempt = async (token) =>
    request("/predict/eta", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

  try {
    let token = await getServiceToken();
    let response = await attempt(token);

    if (response.status === 401) {
      // The cached token was rejected; log in once more before giving up.
      resetTokenCache();
      token = await getServiceToken();
      response = await attempt(token);
    }

    if (response.status === 503) {
      return { ok: false, reason: "model_unavailable" };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "ml_auth_failed" };
    }

    if (response.status === 422) {
      return { ok: false, reason: "ml_rejected_payload" };
    }

    if (!response.ok) {
      return { ok: false, reason: `ml_http_${response.status}` };
    }

    const prediction = normalisePrediction(await response.json());

    return {
      ok: true,
      prediction,
      modelStatus: {
        source: "ml",
        modelVersion: prediction.modelVersion,
        dataProvenance: prediction.dataProvenance,
        datasetRows: prediction.datasetRows,
        beatsBaseline: prediction.beatsBaseline,
        trainKnownToModel: prediction.trainKnownToModel,
        notice: prediction.modelNotice,
      },
    };
  } catch (error) {
    const reason =
      error.name === "TimeoutError" || error.name === "AbortError"
        ? "ml_timeout"
        : "ml_unreachable";
    return { ok: false, reason, detail: error.message };
  }
};

/** Report whether the ML service is reachable and has a model loaded. */
const getMlHealth = async () => {
  if (!config().enabled) {
    return { reachable: false, reason: "disabled" };
  }

  try {
    const response = await request("/health/", { method: "GET" });

    if (!response.ok) {
      return { reachable: false, reason: `ml_http_${response.status}` };
    }

    const body = await response.json();

    return {
      reachable: true,
      status: body.status,
      modelReady: body.model === "ok",
      modelVersion: body.model_version,
      dataProvenance: body.dataset?.data_provenance || "unknown",
      datasetRows: body.dataset?.rows ?? null,
      beatsBaseline: body.model_quality?.beats_baseline ?? null,
      notice: body.model_quality?.notice || "",
    };
  } catch (error) {
    return { reachable: false, reason: "ml_unreachable", detail: error.message };
  }
};

module.exports = {
  predictWithMl,
  getMlHealth,
  buildPredictionPayload,
  normalisePrediction,
  resetTokenCache,
  RISK_LEVEL_MAP,
};
