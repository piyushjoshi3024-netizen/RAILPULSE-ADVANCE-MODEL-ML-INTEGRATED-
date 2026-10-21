"""Optional plain-language explanation layer.

Disabled by default. When enabled it may only restate numbers the model
already returned - it never produces or adjusts a prediction, and it degrades
to a deterministic template (or to None) when no provider key is configured.
"""

from __future__ import annotations

import logging
import os

from app.schemas.prediction import PredictionResponse

logger = logging.getLogger(__name__)


class ExplanationService:
    """Restates a prediction in words, behind a feature flag."""

    def __init__(
        self,
        enabled: bool | None = None,
        provider: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.enabled = (
            enabled if enabled is not None
            else os.getenv("RAILPULSE_EXPLANATIONS_ENABLED", "false").lower() == "true"
        )
        self.provider = provider or os.getenv("RAILPULSE_LLM_PROVIDER", "template")
        self.api_key = api_key or os.getenv("RAILPULSE_LLM_API_KEY")

    def explain(self, prediction: PredictionResponse) -> str | None:
        """Return a one-line explanation, or None when the layer is off."""
        if not self.enabled:
            return None
        if self.provider != "template" and not self.api_key:
            logger.info("explanation provider %s has no API key; using the template", self.provider)
        return self._template(prediction)

    @staticmethod
    def _template(prediction: PredictionResponse) -> str:
        """Deterministic restatement of values the model produced."""
        quality = prediction.model_quality
        caveat = f" {quality.notice}." if quality and quality.notice else ""
        return (
            f"Train {prediction.train_number} is predicted to arrive about "
            f"{prediction.predicted_delay_minutes:.0f} minutes late, with a likely range of "
            f"{prediction.delay_p10_minutes:.0f} to {prediction.delay_p90_minutes:.0f} minutes. "
            f"The model puts the chance of a delay over 15 minutes at "
            f"{prediction.p_delay_gt_15 * 100:.0f}%.{caveat}"
        )


explanation_service = ExplanationService()
