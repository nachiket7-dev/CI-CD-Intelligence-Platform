from app.simulator.generate import simulate, simulate_scenario


def test_same_seed_gives_identical_dataset(scenarios):
    a = simulate(scenarios, 200, seed=3)
    b = simulate(scenarios, 200, seed=3)
    assert a.equals(b)


def test_different_seed_gives_different_dataset(scenarios):
    assert not simulate(scenarios, 200, seed=3).equals(simulate(scenarios, 200, seed=4))


def test_every_scenario_is_present_and_named(scenarios, frame):
    assert set(frame["repo"]) == {s.name for s in scenarios}


def test_scenarios_have_independent_random_streams(scenarios):
    only = simulate_scenario(scenarios[0], 100, seed=1)
    together = simulate(scenarios, 100, seed=1)
    mine = together[together["repo"] == scenarios[0].name].reset_index(drop=True)
    assert only.reset_index(drop=True).drop(columns=[]).equals(mine.drop(columns=["finished_at"]))


def test_failures_are_the_rare_class(frame):
    assert 0.05 < frame["failed"].mean() < 0.5
