"""Pytest configuration: make the backend root importable from anywhere."""

import os
import sys
import warnings

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Tests exercise small folds on purpose; sklearn's small-sample warnings are noise here.
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
