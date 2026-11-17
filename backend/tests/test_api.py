def _prepare(client, *, candidate="hist_gb"):
    # 1,000 runs per scenario is the app default and gives the gate enough data to be meaningful.
    client.post("/api/simulate", json={"runs_per_scenario": 1000, "pending": 6, "seed": 42})
    return client.post("/api/models/train", json={"candidate": candidate, "seed": 42}).json()


def test_predict_needs_an_active_model(client):
    client.post("/api/simulate", json={"runs_per_scenario": 300, "pending": 6})
    run_id = client.get("/api/runs?status=pending").json()["items"][0]["id"]
    res = client.post(f"/api/runs/{run_id}/predict")
    assert res.status_code == 409


def test_training_needs_enough_finished_runs(client):
    res = client.post("/api/models/train", json={})
    assert res.status_code == 409


def test_full_flow_scores_before_the_outcome_exists(client):
    model = _prepare(client)
    assert model["status"] == "candidate", model["gate"]["reason"]
    assert client.post(f"/api/models/{model['id']}/promote").json()["status"] == "active"

    run_id = client.get("/api/runs?status=pending").json()["items"][0]["id"]
    scored = client.post(f"/api/runs/{run_id}/predict").json()
    assert scored["status"] == "pending" and scored["outcome"] is None
    probability = scored["prediction"]["probability"]
    assert 0.0 <= probability <= 1.0 and scored["prediction"]["signals"]

    done = client.post(f"/api/runs/{run_id}/finish").json()
    assert done["status"] in ("passed", "failed")
    assert done["predicted_before_outcome"] is True
    assert done["prediction"]["probability"] == probability  # the stored prediction is untouched

    tracker = client.get("/api/tracker").json()
    assert tracker["n_scored"] == 1


def test_weak_candidate_is_rejected_and_cannot_be_promoted(client):
    model = _prepare(client, candidate="weak_stump")
    assert model["status"] == "rejected"
    res = client.post(f"/api/models/{model['id']}/promote")
    assert res.status_code == 409


def test_finished_runs_cannot_be_scored_in_hindsight(client):
    model = _prepare(client)
    assert model["status"] == "candidate", model["gate"]["reason"]
    client.post(f"/api/models/{model['id']}/promote")
    finished_id = client.get("/api/runs?status=passed&limit=1").json()["items"][0]["id"]
    assert client.post(f"/api/runs/{finished_id}/predict").status_code == 409


def test_predict_rejects_post_run_fields(client):
    res = client.post("/api/predict", json={"repo": "stable", "duration_s": 12, "failed": True})
    assert res.status_code == 422
    assert "after a run finishes" in res.json()["detail"]


def test_unknown_run_is_a_404(client):
    assert client.get("/api/runs/999999").status_code == 404


def test_health_reports_scenarios(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and "stable" in body["scenarios"]
