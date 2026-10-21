"""Phase 3 experiment runner: writes reports/model_comparison.md from a real run."""

from __future__ import annotations

import logging
import os
import warnings

import numpy as np
import pandas as pd
from sklearn.base import clone

from training.feature_contract import JourneyFeatureBuilder
from training.config import QUANTILES, REPORTS_DIR
from training.evaluation import (
    ClassificationEvaluator, ConformalCalibrator, RegressionEvaluator, SegmentEvaluator,
)
from training.models import ModelZoo
from training.probabilistic import CalibratedDelayClassifier, QuantileRegressorSet, merge_bands
from training.selection import ModelSelector
from training.splitter import ChronologicalDateSplitter

logger = logging.getLogger(__name__)


class ExperimentRunner:
    """Runs selection + held-out evaluation and renders the comparison report."""

    def __init__(self, data: pd.DataFrame, quick: bool = False) -> None:
        self.data = data
        self.quick = quick
        self.builder = JourneyFeatureBuilder()
        self.zoo = ModelZoo()
        self.splitter = ChronologicalDateSplitter()

    def run(self) -> dict:
        """Execute the full comparison and return a result dictionary."""
        warnings.simplefilter("ignore")
        train, validation, test = self.splitter.split(self.data)
        development = pd.concat([train, validation], ignore_index=True)

        selector = ModelSelector(quick=self.quick)
        cv_table, results = selector.comparison_table(development)
        best = selector.best(results)

        Xdev, ydev = self._xy(development)
        Xte, yte = self._xy(test)

        test_rows = []
        estimator = clone(best.estimator)
        estimator.fit(Xdev, ydev)
        selected_prediction = estimator.predict(Xte)
        test_rows.append({"model": f"SELECTED {best.name}+{best.encoder}",
                          **RegressionEvaluator.metrics(yte, selected_prediction)})
        for name, baseline in self.zoo.baselines().items():
            fitted = clone(baseline).fit(Xdev, ydev)
            test_rows.append({"model": name, **RegressionEvaluator.metrics(yte, fitted.predict(Xte))})
        test_table = pd.DataFrame(test_rows).round(3)

        quantiles = QuantileRegressorSet().fit(Xdev, ydev)
        quantile_prediction = quantiles.predict(Xte)
        Xtr, ytr = self._xy(train)
        Xva, yva = self._xy(validation)
        point_on_train = clone(best.estimator).fit(Xtr, ytr)
        conformal = ConformalCalibrator(coverage=0.8).fit(yva, point_on_train.predict(Xva))
        lower, upper = conformal.interval(selected_prediction)

        interval_rows = [
            {"method": "quantile P10-P90", "nominal": 0.80,
             **RegressionEvaluator.interval_coverage(yte, quantile_prediction[0.1], quantile_prediction[0.9])},
            {"method": "split conformal", "nominal": 0.80,
             **RegressionEvaluator.interval_coverage(yte, lower, upper)},
        ]
        pinball = {f"q{q}": RegressionEvaluator.pinball_loss(yte, quantile_prediction[q], q) for q in QUANTILES}

        binary = CalibratedDelayClassifier("binary").fit(Xdev, development["is_significant_delay"].to_numpy())
        probability = binary.predict_proba(Xte)[:, list(binary.classes_).index("1")]
        binary_metrics = ClassificationEvaluator.binary_metrics(test["is_significant_delay"].to_numpy(), probability)
        bands = CalibratedDelayClassifier("multiclass").fit(Xdev, merge_bands(development["delay_band"]))
        band_metrics = ClassificationEvaluator.multiclass_metrics(
            merge_bands(test["delay_band"]), bands.predict(Xte), bands.predict_proba(Xte), bands.classes_
        )

        segment = test.copy()
        segment["prediction"] = selected_prediction
        segments = {
            name: SegmentEvaluator.by_segment(segment, "delay_minutes", "prediction", name)
            for name in ("train_number", "run_frequency")
        }

        result = {
            "cv_table": cv_table, "test_table": test_table, "best": best,
            "interval_rows": pd.DataFrame(interval_rows).round(3), "pinball": pinball,
            "binary_metrics": binary_metrics, "band_metrics": band_metrics,
            "segments": segments, "quantile_p50": RegressionEvaluator.metrics(yte, quantile_prediction[0.5]),
            "sizes": {"train": len(train), "validation": len(validation), "test": len(test)},
        }
        self.write_report(result)
        return result

    def _xy(self, frame: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray]:
        return self.builder.frame_from_training(frame), frame["delay_minutes"].to_numpy(dtype=float)

    def write_report(self, result: dict, directory: str = REPORTS_DIR) -> str:
        """Render reports/model_comparison.md."""
        os.makedirs(directory, exist_ok=True)
        best = result["best"]
        test_table = result["test_table"]
        selected = test_table.iloc[0]
        baselines = test_table[test_table["model"].str.startswith("baseline")]
        champion = baselines.loc[baselines["mae_minutes"].idxmin()]

        lines = ["# Model comparison — delay regression\n"]
        lines.append(f"Split sizes: {result['sizes']}  (chronological, dates never shared)\n")
        lines.append("## 1. Cross-validated selection (development window only)\n")
        lines.append(result["cv_table"].to_markdown(index=False)); lines.append("")
        lines.append(f"Selected by CV: **{best.name} + {best.encoder} encoder** "
                     f"(CV MAE {best.cv_mae_mean:.2f} ± {best.cv_mae_std:.2f} min)\n")
        lines.append("## 2. Held-out test set (scored once)\n")
        lines.append(test_table.to_markdown(index=False)); lines.append("")
        verdict = ("**the selected model does NOT beat the best baseline**"
                   if selected["mae_minutes"] >= champion["mae_minutes"]
                   else "the selected model beats the best baseline")
        lines.append(f"On the held-out test set {verdict}: "
                     f"{selected['mae_minutes']:.2f} min MAE versus {champion['mae_minutes']:.2f} min for "
                     f"`{champion['model']}` (difference {selected['mae_minutes'] - champion['mae_minutes']:+.2f} min). "
                     f"Every r2 is negative, i.e. no model explains variance better than the test mean.\n")
        lines.append("## 3. Prediction intervals\n")
        lines.append(result["interval_rows"].to_markdown(index=False)); lines.append("")
        lines.append(f"Test pinball loss: {({k: round(v, 3) for k, v in result['pinball'].items()})}\n")
        lines.append(f"P50 quantile model as a point estimate: "
                     f"{({k: round(v, 3) for k, v in result['quantile_p50'].items()})}\n")
        lines.append("## 4. Classifiers\n")
        lines.append(f"- Binary P(delay > 15 min): {({k: round(v, 3) for k, v in result['binary_metrics'].items()})}")
        lines.append(f"- Four-class band: {({k: round(v, 3) for k, v in result['band_metrics'].items()})}\n")
        lines.append("## 5. Error by segment (selected model, test)\n")
        for name, table in result["segments"].items():
            lines.append(f"### By {name}\n"); lines.append(table.to_markdown()); lines.append("")

        path = os.path.join(directory, "model_comparison.md")
        with open(path, "w") as handle:
            handle.write("\n".join(lines))
        logger.info("wrote model comparison path=%s", path)
        return path
