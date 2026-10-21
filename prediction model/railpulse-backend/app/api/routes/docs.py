from fastapi import APIRouter

router = APIRouter()


@router.get("/capabilities", summary="What this backend can and cannot do")
async def get_capability_catalog():
    """Return the capability catalogue, with the reason for each gap."""
    return {
        "available": [
            "live_train_state",
            "prediction_history",
            "eta_prediction",
            "delay_quantiles_p10_p50_p90",
            "probability_of_delay_over_15_minutes",
            "destination_station_eta",
            "train_and_station_reference_search",
            "model_health",
            "simulation_state_separation",
        ],
        "future_data_required": [
            "intermediate_station_eta",
            "delay_propagation",
            "operational_risk",
            "network_alert_generation",
        ],
        "data_contract_note": (
            "Future-data capabilities expose typed response envelopes and return no inferred records "
            "until route schedules, station sequences, or live network feeds are connected."
        ),
        "model_note": (
            "The delay model is trained on a small historical sample; /health reports its dataset "
            "size and whether it beat its baseline on the held-out test set."
        ),
    }
