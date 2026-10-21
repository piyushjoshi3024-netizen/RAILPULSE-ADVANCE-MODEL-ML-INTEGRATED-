from datetime import datetime, timezone


class CapabilityService:
    """Builds the response envelopes for documented and future capabilities."""

    def unavailable_capability(self, capability: str, train_number: str) -> dict:
        """Return the future-data envelope for a train-scoped capability."""
        return {
            "train_number": train_number,
            "status": "future_data_required",
            "data_source": "route_schedule_and_live_network_feed_required",
            "limitation": (
                f"{capability} requires station sequence and live operational data; "
                "the current dataset contains only train-level historical arrival records."
            ),
        }

    def unavailable_alerts(self) -> dict:
        """Return the future-data envelope for alert generation."""
        return {
            "status": "future_data_required",
            "data_source": "live_event_and_alert_rules_feed_required",
            "limitation": (
                "Alerts are not generated because the current backend has no live feed, "
                "network events, or alert rules data source."
            ),
            "alerts": [],
        }

    def alert_document_to_response(self, document: dict) -> dict:
        """Map a stored alert document onto the alert response shape."""
        return {
            "alert_id": str(document.get("alert_id", document.get("_id", ""))),
            "train_number": document.get("train_number"),
            "alert_type": document["alert_type"],
            "severity": document["severity"],
            "message": document["message"],
            "created_at": document.get("created_at", datetime.now(timezone.utc)),
            "acknowledged": bool(document.get("acknowledged", False)),
        }


capability_service = CapabilityService()


def unavailable_capability(capability: str, train_number: str) -> dict:
    return capability_service.unavailable_capability(capability, train_number)


def unavailable_alerts() -> dict:
    return capability_service.unavailable_alerts()


def alert_document_to_response(document: dict) -> dict:
    return capability_service.alert_document_to_response(document)
