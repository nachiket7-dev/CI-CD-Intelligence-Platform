import numpy as np
import pytest

from app.ml.split import time_split


def test_time_split_orders_by_time_even_if_input_is_shuffled(frame):
    shuffled = frame.sample(frac=1.0, random_state=1)
    tr, va, te = time_split(shuffled)
    t = shuffled["started_at"]
    assert t.loc[tr].max() <= t.loc[va].min()
    assert t.loc[va].max() <= t.loc[te].min()


def test_time_split_covers_every_row_once(frame):
    tr, va, te = time_split(frame)
    assert len(tr) + len(va) + len(te) == len(frame)
    assert len(set(tr) | set(va) | set(te)) == len(frame)


def test_fractions_must_sum_to_one(frame):
    with pytest.raises(ValueError):
        time_split(frame, fractions=(0.5, 0.2, 0.2))


def test_split_sizes_are_roughly_sixty_twenty_twenty(frame):
    tr, va, te = time_split(frame)
    assert np.isclose(len(tr) / len(frame), 0.6, atol=0.01)
