from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class PredictionResponse(BaseModel):
    """ETA and delay prediction for one journey.

    Fields added in model v3 are additive: every field present in v2 is still
    returned with the same meaning, so existing clients keep working.
    """

    train_number: str
    predicted_eta: datetime
    predicted_remaining_minutes: float
    predicted_delay_minutes: float = Field(description="P50 (median) predicted delay in minutes")
    eta_lower: datetime = Field(description="ETA at the P10 delay quantile")
    eta_upper: datetime = Field(description="ETA at the P90 delay quantile")
    delay_category: str
    risk_level: str
    confidence: float = Field(
        description="Measured P10-P90 interval coverage on the held-out test set, "
                    "not a per-prediction confidence score"
    )
    model_version: str

    # Added in v3.
    delay_p10_minutes: float = Field(default=0.0, description="10th percentile predicted delay")
    delay_p50_minutes: float = Field(default=0.0, description="50th percentile predicted delay")
    delay_p90_minutes: float = Field(default=0.0, description="90th percentile predicted delay")
    p_delay_gt_15: float = Field(
        default=0.0, description="Calibrated probability that the delay exceeds 15 minutes"
    )
    data_source: str = Field(default="LIVE", description="Origin of the input state: LIVE, DEMO or SIMULATION")
    train_known_to_model: bool = Field(
        default=False, description="Whether this train number appeared in the training data"
    )
    unsupported_fields_ignored: List[str] = Field(
        default_factory=list,
        description="Request fields accepted for forward compatibility but not used by the model",
    )
    model_quality: Optional["ModelQuality"] = Field(
        default=None, description="Honest summary of what this model was trained on"
    )
    explanation: Optional[str] = Field(
        default=None, description="Plain-language restatement of the numbers above (optional LLM layer)"
    )


class ModelQuality(BaseModel):
    """Provenance and measured quality of the serving model."""

    dataset_name: str
    dataset_rows: int
    data_provenance: str = Field(
        default="unknown",
        description="How the training data was obtained; 'synthetic' means generated, "
                    "so metrics demonstrate the pipeline and not real-world accuracy",
    )
    beats_baseline: bool = Field(
        description="Whether the shipped model beat its baseline on the held-out test set"
    )
    test_mae_minutes: Optional[float] = None
    baseline_mae_minutes: Optional[float] = None
    interval_coverage: Optional[float] = None
    notice: str = Field(default="", description="Short plain-language caveat for display")


class StationETA(BaseModel):
    station_name: str
    predicted_eta: datetime


class StationsPredictionResponse(BaseModel):
    train_number: str
    upcoming_stations: List[StationETA]
    model_version: str


PredictionResponse.model_rebuild()
