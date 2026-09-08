"""RIPTIDE independent mathematical reference model."""

from __future__ import annotations

import math
from decimal import Decimal, getcontext, localcontext

BPS = Decimal("10000000")
WAD = Decimal("1000000000000000000")
LN2_WAD = 693147180559945309
LN2_COEFF_WAD = Decimal(2 * LN2_WAD - int(WAD))


class DomainError(Exception):
    """Input outside the declared mathematical domain."""


class Rounding:
    DOWN = "floor"
    UP = "ceiling"


def _d(x: Decimal | int | str) -> Decimal:
    return x if isinstance(x, Decimal) else Decimal(str(x))


def mul_div(x: Decimal, y: Decimal, d: Decimal, rounding: str) -> Decimal:
    if d == 0:
        raise DomainError("division by zero")
    with localcontext() as ctx:
        ctx.prec = 120
        q = (x * y) / d
        if rounding == Rounding.DOWN:
            return q.to_integral_value(rounding="ROUND_FLOOR")
        return (-(-q).to_integral_value(rounding="ROUND_FLOOR"))


def wad_floor(x: Decimal) -> int:
    return int(x.to_integral_value(rounding="ROUND_FLOOR"))


def wad_ceil(x: Decimal) -> int:
    return int((-(-x).to_integral_value(rounding="ROUND_FLOOR")))


def wad_interval(x: Decimal, direction: str) -> dict[str, str]:
    floor = wad_floor(x)
    ceil = wad_ceil(x)
    return {
        "ideal": format(x, "f"),
        "direction": direction,
        "floor": str(floor),
        "ceiling": str(ceil),
    }


def clamp(value: Decimal, lo: Decimal, hi: Decimal) -> Decimal:
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


def cpmm_exact_in(
    reserve_in: Decimal,
    reserve_out: Decimal,
    amount_in: Decimal,
    fee_bps: Decimal,
) -> dict:
    if reserve_in <= 0 or reserve_out <= 0 or amount_in <= 0:
        raise DomainError("non-positive reserves or amount")
    if fee_bps < 0 or fee_bps >= BPS:
        raise DomainError("fee out of range")
    k = reserve_in * reserve_out
    in_net = mul_div(amount_in, BPS - fee_bps, BPS, Rounding.DOWN)
    denom = reserve_in + in_net
    if denom == 0:
        raise DomainError("empty pool after input")
    amount_out = mul_div(reserve_out, in_net, denom, Rounding.DOWN)
    return {
        "amountIn": wad_interval(amount_in, Rounding.UP),
        "amountOut": wad_interval(amount_out, Rounding.DOWN),
        "inNet": wad_interval(in_net, Rounding.DOWN),
    }


def cpmm_exact_out(
    reserve_in: Decimal,
    reserve_out: Decimal,
    amount_out: Decimal,
    fee_bps: Decimal,
) -> dict:
    if reserve_in <= 0 or reserve_out <= 0 or amount_out <= 0:
        raise DomainError("non-positive reserves or amount")
    if amount_out >= reserve_out:
        raise DomainError("amount out exceeds reserve")
    if fee_bps < 0 or fee_bps >= BPS:
        raise DomainError("fee out of range")
    k = reserve_in * reserve_out
    in_net = mul_div(k, Decimal(1), reserve_out - amount_out, Rounding.UP) - reserve_in
    if in_net <= 0:
        raise DomainError("non-positive required input")
    amount_in = mul_div(in_net, BPS, BPS - fee_bps, Rounding.UP)
    return {
        "amountIn": wad_interval(amount_in, Rounding.UP),
        "amountOut": wad_interval(amount_out, Rounding.DOWN),
        "inNet": wad_interval(in_net, Rounding.UP),
    }


def lvr_rate_general(sigma_wad: Decimal, price_wad: Decimal, value_wad: Decimal) -> Decimal:
    if sigma_wad < 0 or price_wad <= 0 or value_wad <= 0:
        raise DomainError("invalid lvr inputs")
    v_double_prime = mul_div(value_wad, WAD, mul_div(price_wad, price_wad, WAD, Rounding.DOWN), Rounding.DOWN)
    v_double_prime = mul_div(v_double_prime, Decimal(1), Decimal(4), Rounding.DOWN)
    sigma2_p2 = mul_div(
        mul_div(sigma_wad, sigma_wad, WAD, Rounding.DOWN),
        mul_div(price_wad, price_wad, WAD, Rounding.DOWN),
        WAD,
        Rounding.DOWN,
    )
    return mul_div(sigma2_p2, v_double_prime, Decimal(2) * WAD, Rounding.DOWN)


def lvr_rate_cpmm(sigma_wad: Decimal, value_wad: Decimal) -> Decimal:
    if sigma_wad < 0 or value_wad <= 0:
        raise DomainError("invalid lvr cpmm inputs")
    return mul_div(mul_div(sigma_wad, sigma_wad, WAD, Rounding.DOWN), value_wad, Decimal(8) * WAD, Rounding.DOWN)


def ln_wad(x: Decimal) -> Decimal:
    if x <= 0:
        raise DomainError("log input out of domain")
    return Decimal(str(math.log(float(x / WAD)))) * WAD


def exp_wad(x: Decimal) -> Decimal:
    if x <= Decimal("-41446531673892822313"):
        return Decimal(0)
    if x >= Decimal("135305999368893231589"):
        raise DomainError("exp input out of domain")
    return Decimal(str(math.exp(float(x / WAD)))) * WAD


def _pow_wad_int(base: Decimal, exponent: int) -> Decimal:
    """base^exponent with base WAD-scaled (matches SwapVM Power.sol)."""
    if exponent < 0:
        raise DomainError("negative exponent")
    result = WAD
    exp = exponent
    b = base
    while exp > 0:
        if exp & 1:
            result = mul_div(result, b, WAD, Rounding.DOWN)
        b = mul_div(b, b, WAD, Rounding.DOWN)
        exp >>= 1
    return result


def pow_wad(base: Decimal, exponent: Decimal) -> Decimal:
    if exponent == 0:
        return WAD
    if base == WAD:
        return WAD
    if exponent == WAD:
        return base
    if base <= 0:
        raise DomainError("pow base out of domain")
    ln_base = ln_wad(base)
    exp_arg = mul_div(ln_base, exponent, WAD, Rounding.DOWN)
    if exp_arg <= Decimal("-41446531673892822313") or exp_arg >= Decimal("135305999368893231589"):
        raise DomainError("pow exponent out of domain")
    return exp_wad(exp_arg)


def sqrt_wad(x: Decimal) -> Decimal:
    if x < 0:
        raise DomainError("sqrt negative")
    if x == 0:
        return Decimal(0)
    xi = int(x)
    return Decimal(math.isqrt(xi * int(WAD)))


def ewma_var(prev_var: Decimal, log_return: Decimal, lambda_: Decimal, gk_term_val: Decimal | None = None) -> Decimal:
    if not (Decimal(0) < lambda_ < WAD):
        raise DomainError("lambda out of range")
    obs = mul_div(log_return, log_return, WAD, Rounding.DOWN)
    if gk_term_val is not None:
        obs = obs + gk_term_val
    if obs < 0:
        obs = Decimal(0)
    one_minus = WAD - lambda_
    return mul_div(lambda_, prev_var, WAD, Rounding.DOWN) + mul_div(one_minus, obs, WAD, Rounding.DOWN)


def gk_term(high: Decimal, low: Decimal, close: Decimal, open_: Decimal) -> Decimal:
    if high <= 0 or low <= 0 or close <= 0 or open_ <= 0 or low > high:
        raise DomainError("invalid ohlc")
    hl = ln_wad(mul_div(high, WAD, low, Rounding.DOWN))
    co = ln_wad(mul_div(close, WAD, open_, Rounding.DOWN))
    term_hl = mul_div(hl, hl, WAD, Rounding.DOWN) / Decimal(2)
    term_co = mul_div(mul_div(co, co, WAD, Rounding.DOWN), LN2_COEFF_WAD, WAD, Rounding.DOWN)
    gk = term_hl - term_co
    return gk if gk > 0 else Decimal(0)


def sigma_from_var(var_wad: Decimal, dt_wad: Decimal, sigma_min: Decimal, sigma_max: Decimal) -> Decimal:
    if var_wad < 0 or dt_wad <= 0:
        raise DomainError("invalid variance inputs")
    if var_wad == 0:
        sigma = Decimal(0)
    else:
        sigma = sqrt_wad(mul_div(var_wad, WAD, dt_wad, Rounding.DOWN))
    return clamp(sigma, sigma_min, sigma_max)


def apply_stale_freeze(sigma_prev: Decimal, sigma_candidate: Decimal, is_stale: bool) -> Decimal:
    return sigma_prev if is_stale else sigma_candidate


def fee_break_even(sigma_wad: Decimal, lambda_q: Decimal) -> Decimal:
    if sigma_wad < 0 or lambda_q <= 0:
        raise DomainError("invalid fee break-even inputs")
    return mul_div(mul_div(sigma_wad, sigma_wad, WAD, Rounding.DOWN), WAD, Decimal(8) * lambda_q, Rounding.DOWN)


def fee_target(sigma_wad: Decimal, lambda_q: Decimal, fee_min: Decimal, fee_max: Decimal) -> Decimal:
    phi_star = fee_break_even(sigma_wad, lambda_q)
    raw = mul_div(phi_star, BPS, WAD, Rounding.DOWN)
    return clamp(raw, fee_min, fee_max)


def pi_step(
    fee_reported_prev: Decimal,
    integral_prev: Decimal,
    fee_target_val: Decimal,
    kp: Decimal,
    ki: Decimal,
    i_max: Decimal,
    fee_min: Decimal,
    fee_max: Decimal,
) -> tuple[Decimal, Decimal]:
    error = fee_target_val - fee_reported_prev
    integral_new = clamp(integral_prev + mul_div(ki, error, WAD, Rounding.DOWN), -i_max, i_max)
    fee_reported = clamp(
        fee_reported_prev + mul_div(kp, error, WAD, Rounding.DOWN) + integral_new,
        fee_min,
        fee_max,
    )
    return fee_reported, integral_new


def diamond_split(surplus_wad: Decimal, beta: Decimal) -> dict:
    if surplus_wad < 0:
        raise DomainError("negative surplus")
    if not (Decimal(0) < beta < WAD):
        raise DomainError("beta out of range")
    pay = mul_div(WAD - beta, surplus_wad, WAD, Rounding.DOWN)
    retain = surplus_wad - pay
    return {
        "payToResolver": wad_interval(pay, Rounding.DOWN),
        "retainToLP": wad_interval(retain, Rounding.DOWN),
        "surplus": wad_interval(surplus_wad, Rounding.DOWN),
    }


def dutch_auction_balance_in(balance: Decimal, decay: Decimal, elapsed: Decimal) -> Decimal:
    if not (Decimal(0) < decay < WAD):
        raise DomainError("decay out of range")
    if elapsed < 0:
        raise DomainError("negative elapsed")
    factor = _pow_wad_int(decay, int(elapsed))
    return mul_div(balance, factor, WAD, Rounding.DOWN)
