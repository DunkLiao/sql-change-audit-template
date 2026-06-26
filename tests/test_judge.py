"""單元測試：_judge 容忍度判斷"""
import pytest
from audit_runner import _judge, TolItem


@pytest.mark.unit
def test_no_tolerance_returns_skip():
    status, _ = _judge("CNT", 0, 0, None)
    assert status == "SKIP"


@pytest.mark.unit
def test_abs_diff_pass():
    tol = TolItem(metric="CNT", max_abs_diff=10)
    status, _ = _judge("CNT", 5, None, tol)
    assert status == "PASS"


@pytest.mark.unit
def test_abs_diff_fail():
    tol = TolItem(metric="CNT", max_abs_diff=10)
    status, reason = _judge("CNT", 11, None, tol)
    assert status == "FAIL"
    assert "11" in reason


@pytest.mark.unit
def test_abs_diff_negative_value():
    """負值要看絕對值"""
    tol = TolItem(metric="CNT", max_abs_diff=10)
    status, _ = _judge("CNT", -11, None, tol)
    assert status == "FAIL"


@pytest.mark.unit
def test_pct_diff_pass():
    tol = TolItem(metric="SUM", max_pct_diff=0.01)
    status, _ = _judge("SUM", 100, 0.005, tol)
    assert status == "PASS"


@pytest.mark.unit
def test_pct_diff_fail():
    tol = TolItem(metric="SUM", max_pct_diff=0.01)
    status, reason = _judge("SUM", 100, 0.05, tol)
    assert status == "FAIL"
    assert "%" in reason


@pytest.mark.unit
def test_diff_none_treated_as_zero():
    tol = TolItem(metric="X", max_abs_diff=10)
    status, _ = _judge("X", None, None, tol)
    assert status == "PASS"


@pytest.mark.unit
def test_diff_str_invalid_treated_as_zero():
    tol = TolItem(metric="X", max_abs_diff=10)
    status, _ = _judge("X", "not_a_number", None, tol)
    assert status == "PASS"


@pytest.mark.unit
def test_both_tolerances_set():
    """同時設兩種，任一觸發就 FAIL"""
    tol = TolItem(metric="X", max_abs_diff=100, max_pct_diff=0.001)
    status, _ = _judge("X", 50, 0.01, tol)
    assert status == "FAIL"
