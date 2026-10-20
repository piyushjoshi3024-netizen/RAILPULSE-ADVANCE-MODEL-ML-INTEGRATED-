"""Read-only access to the held-out evaluation export.

The export itself is written by the training pipeline
(:meth:`training.trainer.DelayModelTrainer._write_evaluation_export`). Nothing
here computes, scores or caches anything: it reads the file and returns it.

The route is ADMIN-only. Hiding a button is not authorisation, so the role is
enforced here by ``require_roles`` rather than by whichever page happens to call
it, and an anonymous caller gets 401 while a PASSENGER or STAFF caller gets 403.
"""

import json
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import require_roles
from training.config import REPORTS_DIR

logger = logging.getLogger(__name__)

router = APIRouter()

EVALUATION_PATH = os.path.join(REPORTS_DIR, "evaluation.json")


@router.get(
    "/evaluation",
    summary="Held-out evaluation export for the registered model",
    description=(
        "Per-row predictions on the held-out test split, the candidate comparison "
        "table and the aggregate metrics, exactly as the last training run wrote "
        "them. Returns 404 when no export is present."
    ),
)
async def get_model_evaluation(
    current_user: dict = Depends(require_roles("ADMIN")),
):
    """Return the evaluation export, or 404 when the trainer has not written one."""
    if not os.path.exists(EVALUATION_PATH):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="evaluation_unavailable",
        )
    try:
        with open(EVALUATION_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        # A corrupt or unreadable export is indistinguishable from none at all
        # as far as a caller is concerned, so it gets the same answer.
        logger.warning("Evaluation export unreadable at %s: %s", EVALUATION_PATH, exc)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="evaluation_unavailable",
        ) from exc
