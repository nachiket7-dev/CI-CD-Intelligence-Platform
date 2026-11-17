import pytest

from app.contract import (
    FEATURE_COLUMNS,
    FORBIDDEN_FIELDS,
    ContractViolation,
    check_columns,
    validate_payload,
)
from app.ml.features import build_features


def test_feature_builder_outputs_exactly_the_contract(frame):
    feats = build_features(frame, frame)
    assert list(feats.columns) == FEATURE_COLUMNS
    assert check_columns(feats.columns) == []


def test_forbidden_fields_are_flagged():
    assert check_columns(["duration_s", "lines_changed"]) == [
        "'duration_s' is only known after the run (forbidden)"
    ]


def test_unlisted_features_are_flagged():
    assert "not listed" in check_columns(["mystery"])[0]


@pytest.mark.parametrize("field", sorted(FORBIDDEN_FIELDS))
def test_payload_with_post_run_field_is_rejected(field):
    with pytest.raises(ContractViolation):
        validate_payload({"repo": "stable", field: 1})
