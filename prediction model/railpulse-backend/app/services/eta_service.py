"""Builds the API prediction response from the model bundle."""

from __future__ import annotations

import logging

from app.ml.model_registry import ModelRegistry, model_registry
from app.ml.predictor import DelayPredictor, ModelNotReadyError
from app.schemas.prediction import ModelQuality, PredictionResponse
from app.schemas.train import TrainStateRequest
from app.services.explanation_service import ExplanationService, explanation_service

logger = logging.getLogger(__name__)


class ETAService:
    """Produces an ETA, a delay interval and delay probabilities for a train."""

    def __init__(
        self,
        predictor: DelayPredictor | None = None,
        registry: ModelRegistry | None = None,
        explanations: ExplanationService | None = None,
    ) -> None:
        self._registry = registry if registry is not None else model_registry
        # The predictor must read the same registry as the service, otherwise an
        # injected (or degraded) registry would be reported in model_quality
        # while predictions still came from the global one.
        self._predictor = predictor if predictor is not None else DelayPredictor(self._registry)
        self._explanations = explanations if explanations is not None else explanation_service

    async def calculate(self, request: TrainStateRequest) -> PredictionResponse:
        """Return the prediction response for the supplied train state."""
        try:
            prediction = self._predictor.predict(request)
        except ModelNotReadyError:
            raise
        except Exception as exc:
            logger.error("Prediction failed: %s", exc)
            raise ValueError("Failed to predict ETA due to model error.") from exc

        quality = self.model_quality()
        response = PredictionResponse(
            train_number=prediction.train_number,
            predicted_eta=prediction.predicted_eta,
            predicted_remaining_minutes=prediction.predicted_remaining_minutes,
            predicted_delay_minutes=prediction.predicted_delay_minutes,
            eta_lower=prediction.eta_lower,
            eta_upper=prediction.eta_upper,
            delay_category=prediction.delay_category,
            risk_level=prediction.risk_level,
            confidence=prediction.confidence,
            model_version=prediction.model_version,
            delay_p10_minutes=prediction.delay_p10_minutes,
            delay_p50_minutes=prediction.delay_p50_minutes,
            delay_p90_minutes=prediction.delay_p90_minutes,
            p_delay_gt_15=prediction.p_delay_gt_15,
            data_source=prediction.data_source,
            train_known_to_model=prediction.train_known_to_model,
            unsupported_fields_ignored=prediction.unsupported_fields_ignored,
            model_quality=quality,
        )
        response.explanation = self._explanations.explain(response)
        return response

    def model_quality(self) -> ModelQuality:
        """Return the provenance and measured quality of the serving model."""
        metadata = self._registry.metadata()
        dataset = self._registry.dataset_info()
        metrics = metadata.get("metrics", {})
        rows = int(dataset.get("rows", 0))
        provenance = self._registry.data_provenance()
        return ModelQuality(
            dataset_name=str(dataset.get("name", "unknown")),
            dataset_rows=rows,
            data_provenance=provenance,
            beats_baseline=bool(metadata.get("beats_baseline", False)),
            test_mae_minutes=metrics.get("test_point_p50", {}).get("mae_minutes"),
            baseline_mae_minutes=metrics.get("test_baseline_global_mean", {}).get("mae_minutes"),
            interval_coverage=metrics.get("test_intervals", {}).get("coverage"),
            notice=self._notice(rows, provenance),
        )

    @staticmethod
    def _notice(rows: int, provenance: str) -> str:
        """One short, honest line about what the model was trained on."""
        if not rows:
            return "No model registered"
        if provenance.lower() == "synthetic":
            return (f"Prototype model, trained on {rows} rows of SYNTHETIC data - "
                    "metrics demonstrate the pipeline, not real-world accuracy")
        return f"Prototype model, trained on a {rows}-row dataset"


default_eta_service = ETAService()


async def calculate_eta(request: TrainStateRequest) -> PredictionResponse:
    return await default_eta_service.calculate(request)
