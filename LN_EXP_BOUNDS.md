# ln / exp / pow domain bounds

RIPTIDE wraps Solady `FixedPointMathLib` (pinned in `contracts/lib/solady`, v0.1.26 per `DEPENDENCY_LOCK.md`) behind `LnExpMath.sol`.

## Domains (LVR_MATH §1.2)

| Function | Accepted domain | RIPTIDE revert |
|----------|-----------------|----------------|
| `lnWad` | `x > 0` | `RiptideLogInputOutOfDomain` |
| `expWad` | `EXP_WAD_MIN < x < EXP_WAD_MAX` | `RiptideExpInputOutOfDomain` (upper); returns `0` at/below min |
| `powWad` | `base > 0`; `expArg` in `expWad` domain | `RiptidePowOutOfDomain` |
| `sqrtWad` | `x >= 0` | via `sqrt(x * WAD)` |

### Solady constants used

```text
EXP_WAD_MIN = -41446531673892822313
EXP_WAD_MAX =  135305999368893231589
```

## Identity bypasses (`powWad`)

Evaluated before generic `ln * exp` path:

1. `base == 0` → revert (checked first)
2. `exponent == 0` → `WAD`
3. `base == WAD` → `WAD`
4. `exponent == WAD` → `base`

## Call-site narrowing

| Call site | Function | Narrowing |
|-----------|----------|-----------|
| `VolatilityMath.gkTerm` | `lnWad` | Ratios `high/low`, `close/open` are WAD-scaled prices `> 0` |
| `VolatilityMath.sigmaFromVar` | `sqrtWad` | `varWad >= 0`; uses `sqrt(var * WAD / dt)` |
| Dutch auction (vectors/tests) | integer `pow` | SwapVM `Power.sol` integer exponent; not `powWad` |
| Future fee/oracle paths | `lnWad` / `expWad` | Must stay inside domains above |

## GK coefficient

Garman–Klass term uses `LN2_COEFF_WAD = 2 * ln(2) * WAD - WAD` with `ln(2)` approximated as `693147180559945309` (WAD), matching Solady-scale fixed-point discipline.

## Differential coverage

Committed vectors under `test/vectors/` exercise `lnWad`/`sqrtWad` indirectly via volatility GK and σ estimation. Solidity differential tests (`Differential*`) and `@riptide/riptide-math` vitest suites assert bit-for-bit parity with the Python differential oracle.
