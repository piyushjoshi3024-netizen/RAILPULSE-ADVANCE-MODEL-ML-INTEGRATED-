"""Thin wrapper kept so `python training/train.py` keeps working.

The real entry point is `python3 -m training.pipeline`; this module forwards to
it with the same flags.
"""

from __future__ import annotations

import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from training.pipeline import TrainingPipeline, main  # noqa: E402

__all__ = ["TrainingPipeline", "main"]


if __name__ == "__main__":
    raise SystemExit(main())
