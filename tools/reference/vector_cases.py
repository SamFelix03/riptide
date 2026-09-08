"""Deterministic scenario matrix for reference vector generation."""

from __future__ import annotations

from decimal import Decimal

from . import reference_math as rm

WAD = rm.WAD
BPS = rm.BPS


def _cpmm_cases() -> list[dict]:
    cases = []
    specs = [
        ("cpmm_exact_in_small", "exact_in", "1000000000000000000000", "2000000000000000000000", "100000000000000000", "30000"),
        ("cpmm_exact_in_mid", "exact_in", "5000000000000000000000", "5000000000000000000000", "1000000000000000000000", "50000"),
        ("cpmm_exact_in_large", "exact_in", "100000000000000000000000", "100000000000000000000000", "10000000000000000000000", "100000"),
        ("cpmm_exact_in_near_empty", "exact_in", "1000000000000000000000", "1000000000000000000", "100000000000000000", "0"),
        ("cpmm_exact_out_small", "exact_out", "1000000000000000000000", "2000000000000000000000", "50000000000000000", "30000"),
        ("cpmm_exact_out_mid", "exact_out", "5000000000000000000000", "5000000000000000000000", "500000000000000000000", "50000"),
        ("cpmm_exact_in_round_edge", "exact_in", "1000000000000000000001", "1000000000000000000001", "333333333333333333", "3333333"),
    ]
    for case_id, kind, rin, rout, amt, fee in specs:
        inputs = {
            "kind": kind,
            "reserveIn": rin,
            "reserveOut": rout,
            "feeBps": fee,
        }
        if kind == "exact_in":
            inputs["amountIn"] = amt
            out = rm.cpmm_exact_in(Decimal(rin), Decimal(rout), Decimal(amt), Decimal(fee))
            value = Decimal(rin) + Decimal(rout)
            sigma = Decimal("200000000000000000")
            ell_gen = rm.lvr_rate_general(sigma, Decimal(rin) * WAD // Decimal(rout), value)
            ell_cpmm = rm.lvr_rate_cpmm(sigma, value)
            outputs = {
                "amountOut": out["amountOut"],
                "amountIn": out["amountIn"],
                "lvrGeneral": rm.wad_interval(ell_gen, rm.Rounding.DOWN),
                "lvrCpmm": rm.wad_interval(ell_cpmm, rm.Rounding.DOWN),
            }
        else:
            inputs["amountOut"] = amt
            out = rm.cpmm_exact_out(Decimal(rin), Decimal(rout), Decimal(amt), Decimal(fee))
            outputs = {"amountIn": out["amountIn"], "amountOut": out["amountOut"]}
        cases.append({"id": case_id, "inputs": inputs, "outputs": outputs})
    return cases


def _volatility_cases() -> list[dict]:
    cases = []
    base = {
        "prevVar": "100000000000000000",
        "logReturn": "10000000000000000",
        "lambda": "940000000000000000",
        "dt": str(WAD),
        "sigmaMin": "10000000000000000",
        "sigmaMax": "1000000000000000000",
    }
    var = rm.ewma_var(Decimal(base["prevVar"]), Decimal(base["logReturn"]), Decimal(base["lambda"]))
    sigma = rm.sigma_from_var(var, Decimal(base["dt"]), Decimal(base["sigmaMin"]), Decimal(base["sigmaMax"]))
    cases.append({
        "id": "vol_ewma_mid",
        "inputs": dict(base),
        "outputs": {"varWad": rm.wad_interval(var, rm.Rounding.DOWN), "sigmaWad": rm.wad_interval(sigma, rm.Rounding.DOWN)},
    })

    gk_inputs = {
        "high": "1000000000000000000",
        "low": "1000000000000000000",
        "close": "1000000000000000000",
        "open": "1000000000000000000",
    }
    gk = rm.gk_term(
        Decimal(gk_inputs["high"]),
        Decimal(gk_inputs["low"]),
        Decimal(gk_inputs["close"]),
        Decimal(gk_inputs["open"]),
    )
    var_gk = rm.ewma_var(Decimal(base["prevVar"]), Decimal(base["logReturn"]), Decimal(base["lambda"]), gk)
    sigma_gk = rm.sigma_from_var(var_gk, Decimal(base["dt"]), Decimal(base["sigmaMin"]), Decimal(base["sigmaMax"]))
    cases.append({
        "id": "vol_gk_blend",
        "inputs": {**base, **gk_inputs},
        "outputs": {
            "gkTerm": rm.wad_interval(gk, rm.Rounding.DOWN),
            "varWad": rm.wad_interval(var_gk, rm.Rounding.DOWN),
            "sigmaWad": rm.wad_interval(sigma_gk, rm.Rounding.DOWN),
        },
    })

    sigma_clamp_low = rm.sigma_from_var(Decimal(0), Decimal(WAD), Decimal("100000000000000000"), Decimal("1000000000000000000"))
    cases.append({
        "id": "vol_clamp_min",
        "inputs": {
            "prevVar": "0",
            "logReturn": "0",
            "lambda": base["lambda"],
            "dt": str(WAD),
            "sigmaMin": "100000000000000000",
            "sigmaMax": "1000000000000000000",
        },
        "outputs": {"sigmaWad": rm.wad_interval(sigma_clamp_low, rm.Rounding.DOWN)},
    })

    high_var = rm.ewma_var(Decimal(0), Decimal("1000000000000000000"), Decimal("500000000000000000"))
    sigma_high = rm.sigma_from_var(high_var, Decimal(WAD), Decimal("10000000000000000"), Decimal("500000000000000000"))
    cases.append({
        "id": "vol_clamp_max",
        "inputs": {
            "prevVar": "0",
            "logReturn": "1000000000000000000",
            "lambda": "500000000000000000",
            "dt": str(WAD),
            "sigmaMin": "10000000000000000",
            "sigmaMax": "500000000000000000",
        },
        "outputs": {"sigmaWad": rm.wad_interval(sigma_high, rm.Rounding.DOWN)},
    })

    stale_sigma = rm.apply_stale_freeze(Decimal("200000000000000000"), Decimal("900000000000000000"), True)
    cases.append({
        "id": "vol_stale_freeze",
        "inputs": {"sigmaPrev": "200000000000000000", "sigmaCandidate": "900000000000000000", "isStale": "1"},
        "outputs": {"sigmaWad": rm.wad_interval(stale_sigma, rm.Rounding.DOWN)},
    })
    return cases


def _fee_controller_cases() -> list[dict]:
    cases = []
    sigma = Decimal("300000000000000000")
    lambda_q = Decimal("100000000000000000")
    fee_min = Decimal("30000")
    fee_max = Decimal("500000")
    target = rm.fee_target(sigma, lambda_q, fee_min, fee_max)
    cases.append({
        "id": "fee_target_mid",
        "inputs": {"sigmaWad": str(sigma), "lambdaQ": str(lambda_q), "feeMin": str(fee_min), "feeMax": str(fee_max)},
        "outputs": {"feeTarget": rm.wad_interval(target, rm.Rounding.DOWN)},
    })

    fee_prev = Decimal("100000")
    integral_prev = Decimal(0)
    kp = Decimal("500000000000000000")
    ki = Decimal("100000000000000000")
    i_max = Decimal("1000000000000000000")
    reported, integral = rm.pi_step(fee_prev, integral_prev, target, kp, ki, i_max, fee_min, fee_max)
    cases.append({
        "id": "pi_step_up",
        "inputs": {
            "feeReportedPrev": str(fee_prev),
            "integralPrev": "0",
            "feeTarget": str(target),
            "kp": str(kp),
            "ki": str(ki),
            "iMax": str(i_max),
            "feeMin": str(fee_min),
            "feeMax": str(fee_max),
        },
        "outputs": {
            "feeReported": rm.wad_interval(reported, rm.Rounding.DOWN),
            "integral": rm.wad_interval(integral, rm.Rounding.DOWN),
        },
    })

    large_error_target = fee_max
    reported2, integral2 = rm.pi_step(fee_min, Decimal(0), large_error_target, kp, ki, i_max, fee_min, fee_max)
    cases.append({
        "id": "pi_anti_windup",
        "inputs": {
            "feeReportedPrev": str(fee_min),
            "integralPrev": "0",
            "feeTarget": str(large_error_target),
            "kp": str(kp),
            "ki": str(ki),
            "iMax": str(i_max),
            "feeMin": str(fee_min),
            "feeMax": str(fee_max),
        },
        "outputs": {
            "feeReported": rm.wad_interval(reported2, rm.Rounding.DOWN),
            "integral": rm.wad_interval(integral2, rm.Rounding.DOWN),
        },
    })
    return cases


def _diamond_split_cases() -> list[dict]:
    cases = []
    for case_id, surplus, beta in [
        ("split_zero", "0", "950000000000000000"),
        ("split_tiny", "1", "950000000000000000"),
        ("split_mid", "1000000000000000000000", "950000000000000000"),
        ("split_large", "100000000000000000000000", "500000000000000000"),
        ("split_beta_low", "1000000000000000000000", "100000000000000000"),
        ("split_beta_high", "1000000000000000000000", "990000000000000000"),
    ]:
        out = rm.diamond_split(Decimal(surplus), Decimal(beta))
        dutch = rm.dutch_auction_balance_in(Decimal("1000000000000000000000"), Decimal("990000000000000000"), Decimal("100"))
        cases.append({
            "id": case_id,
            "inputs": {"surplusWad": surplus, "beta": beta},
            "outputs": {**out, "dutchBalanceIn": rm.wad_interval(dutch, rm.Rounding.DOWN)},
        })
    return cases


def _invalid_domain_cases() -> list[dict]:
    return [
        {"id": "neg_surplus", "fn": "diamond_split", "inputs": {"surplusWad": "-1", "beta": "950000000000000000"}, "expect": "DomainError"},
        {"id": "beta_zero", "fn": "diamond_split", "inputs": {"surplusWad": "1000", "beta": "0"}, "expect": "DomainError"},
        {"id": "beta_one", "fn": "diamond_split", "inputs": {"surplusWad": "1000", "beta": str(WAD)}, "expect": "DomainError"},
        {"id": "ln_zero", "fn": "ln_wad", "inputs": {"x": "0"}, "expect": "DomainError"},
        {"id": "pow_bad_base", "fn": "pow_wad", "inputs": {"base": "0", "exponent": str(WAD)}, "expect": "DomainError"},
        {"id": "cpmm_empty_pool", "fn": "cpmm_exact_in", "inputs": {"reserveIn": "0", "reserveOut": "1000", "amountIn": "1", "feeBps": "0"}, "expect": "DomainError"},
    ]


def all_vector_files() -> dict[str, list[dict]]:
    return {
        "cpmm_swap_v1.json": _cpmm_cases(),
        "volatility_v1.json": _volatility_cases(),
        "fee_controller_v1.json": _fee_controller_cases(),
        "diamond_split_v1.json": _diamond_split_cases(),
        "invalid_domains_v1.json": _invalid_domain_cases(),
    }
