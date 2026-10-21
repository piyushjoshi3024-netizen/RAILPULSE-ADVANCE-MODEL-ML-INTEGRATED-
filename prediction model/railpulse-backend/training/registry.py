"""Versioned model registry with a `latest` pointer.

A run writes ``models/registry/<version>/{model.joblib,metadata.json}`` and
then repoints ``models/latest.json``. Writing the pointer last means a failed
run never leaves the API pointing at a half-written artifact.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
from datetime import datetime, timezone
from typing import Any

import joblib

from training.config import LATEST_POINTER, MODELS_DIR, REGISTRY_DIR

logger = logging.getLogger(__name__)

MODEL_FILENAME = "model.joblib"
METADATA_FILENAME = "metadata.json"


def file_sha256(path: str) -> str:
    """Return the SHA-256 of a file."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_commit() -> str:
    """Return the current git commit, or 'unknown' outside a repository."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=5,
            cwd=os.path.dirname(MODELS_DIR),
        )
        return result.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


class ModelRegistryWriter:
    """Writes versioned model artifacts and maintains the latest pointer."""

    def __init__(self, registry_dir: str = REGISTRY_DIR, pointer_path: str = LATEST_POINTER) -> None:
        self.registry_dir = registry_dir
        self.pointer_path = pointer_path

    def version_name(self, model_version: str) -> str:
        """Return a sortable, unique version directory name."""
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return f"{model_version}-{stamp}"

    def register(self, bundle: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
        """Persist the bundle and metadata, then repoint `latest`."""
        version = metadata.get("version") or self.version_name("model")
        target = os.path.join(self.registry_dir, version)
        os.makedirs(target, exist_ok=True)

        model_path = os.path.join(target, MODEL_FILENAME)
        joblib.dump(bundle, model_path)
        metadata = {**metadata, "artifact_sha256": file_sha256(model_path), "artifact_path": model_path}
        with open(os.path.join(target, METADATA_FILENAME), "w") as handle:
            json.dump(metadata, handle, indent=2, sort_keys=True, default=str)

        pointer = {
            "version": version,
            "directory": target,
            "model_path": model_path,
            "metadata_path": os.path.join(target, METADATA_FILENAME),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        os.makedirs(os.path.dirname(self.pointer_path), exist_ok=True)
        with open(self.pointer_path, "w") as handle:
            json.dump(pointer, handle, indent=2, sort_keys=True)
        logger.info("registered model version=%s path=%s", version, model_path)
        return pointer

    def list_versions(self) -> list[str]:
        """Return registered versions, newest first."""
        if not os.path.isdir(self.registry_dir):
            return []
        return sorted(os.listdir(self.registry_dir), reverse=True)


class ModelRegistryReader:
    """Resolves and loads the registered model artifact."""

    def __init__(self, pointer_path: str = LATEST_POINTER) -> None:
        self.pointer_path = pointer_path

    def pointer(self) -> dict[str, Any] | None:
        """Return the latest pointer, or None when nothing is registered."""
        if not os.path.exists(self.pointer_path):
            return None
        try:
            with open(self.pointer_path) as handle:
                return json.load(handle)
        except (OSError, json.JSONDecodeError):
            logger.exception("latest pointer is unreadable: %s", self.pointer_path)
            return None

    def load(self) -> tuple[dict[str, Any] | None, dict[str, Any]]:
        """Return (bundle, metadata); bundle is None when unavailable."""
        pointer = self.pointer()
        if pointer is None:
            return None, {}
        model_path = pointer.get("model_path", "")
        if not model_path or not os.path.exists(model_path):
            logger.error("registered model file is missing: %s", model_path)
            return None, {}
        bundle = joblib.load(model_path)
        return bundle, bundle.get("metadata", {})
