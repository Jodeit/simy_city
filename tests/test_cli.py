"""Tests for the `simy` CLI, in particular the `standoffs` command's optional
`present` filter (`simy standoffs residential_subdivision,fast_casual`) — this
was previously wired up in `find_standoffs()` and covered by
test_registry.py's `test_present_use_breaks_standoff`, but the CLI itself
never exposed it to a user; it always called `find_standoffs(reg)` with no
filter and printed a stub "once M1 connectors land" message instead.
"""

from __future__ import annotations

import pytest

from simy_city import cli
from simy_city.registry import load_registry


@pytest.fixture(scope="module")
def reg():
    return load_registry()


def test_standoffs_no_present_prints_structural_standoffs(capsys, reg):
    rc = cli.cmd_standoffs(reg)
    out = capsys.readouterr().out
    assert rc == 0
    assert "structural standoff(s) in the model" in out
    assert "Pass a comma-separated list of uses already present" in out


def test_standoffs_with_present_filters_and_labels_it(capsys, reg):
    rc = cli.cmd_standoffs(reg, present={"residential_subdivision"})
    out = capsys.readouterr().out
    assert rc == 0
    assert "Uses already present: residential_subdivision" in out
    assert "standoff(s) still stuck given what's already there" in out
    # The stub follow-up message only makes sense when nothing was filtered.
    assert "Pass a comma-separated list" not in out


def test_standoffs_with_present_that_breaks_every_cycle(capsys, reg):
    rc = cli.cmd_standoffs(reg, present=reg.all_use_ids())
    out = capsys.readouterr().out
    assert rc == 0
    assert "No standoffs remain stuck" in out


def test_main_standoffs_no_args(capsys):
    rc = cli.main(["standoffs"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "structural standoff(s)" in out


def test_main_standoffs_with_present_arg(capsys):
    rc = cli.main(["standoffs", "residential_subdivision,fast_casual"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "Uses already present: fast_casual, residential_subdivision" in out


def test_main_standoffs_unknown_use_id_errors(capsys):
    rc = cli.main(["standoffs", "not_a_real_use"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "unknown use id(s): not_a_real_use" in err


def test_main_standoffs_ignores_blank_entries(capsys):
    rc = cli.main(["standoffs", "residential_subdivision,,"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "Uses already present: residential_subdivision" in out
