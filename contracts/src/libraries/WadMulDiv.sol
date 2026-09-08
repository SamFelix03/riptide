// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideErrors } from "../types/RiptideErrors.sol";

/// @title WadMulDiv
/// @notice 512-bit mulDiv and WAD helpers (LVR_MATH.md §1.1).
library WadMulDiv {
    enum Rounding {
        Down,
        Up
    }

    uint256 internal constant WAD = 1e18;

    function mulDiv(uint256 x, uint256 y, uint256 denominator, Rounding rounding) internal pure returns (uint256 result) {
        if (denominator == 0) revert RiptideErrors.RiptideMathDivisionByZero();

        uint256 prod0;
        uint256 prod1;
        assembly {
            let mm := mulmod(x, y, not(0))
            prod0 := mul(x, y)
            prod1 := sub(sub(mm, prod0), lt(mm, prod0))
        }

        if (prod1 == 0) {
            result = prod0 / denominator;
            if (rounding == Rounding.Up && mulmod(x, y, denominator) > 0) {
                if (result == type(uint256).max) revert RiptideErrors.RiptideMathOverflow();
                result += 1;
            }
            return result;
        }

        if (denominator <= prod1) revert RiptideErrors.RiptideMathOverflow();

        uint256 remainder;
        assembly {
            remainder := mulmod(x, y, denominator)
        }
        assembly {
            prod1 := sub(prod1, gt(remainder, prod0))
            prod0 := sub(prod0, remainder)
        }

        uint256 twos = denominator & (~denominator + 1);
        assembly {
            denominator := div(denominator, twos)
            prod0 := div(prod0, twos)
            prod0 := or(prod0, mul(prod1, lt(prod0, twos)))
        }

        uint256 inverse = (3 * denominator) ^ 2;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;

        result = prod0 * inverse;
        if (rounding == Rounding.Up && mulmod(x, y, denominator) > 0) {
            if (result == type(uint256).max) revert RiptideErrors.RiptideMathOverflow();
            result += 1;
        }
    }

    function toWad(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals > 18) revert RiptideErrors.RiptideUnsupportedTokenDecimals(address(0), decimals);
        if (decimals == 18) return amount;
        uint256 factor = 10 ** (18 - decimals);
        if (amount > type(uint256).max / factor) revert RiptideErrors.RiptideAmountOverflow(amount);
        return amount * factor;
    }

    function fromWad(uint256 amountWad, uint8 decimals) internal pure returns (uint256) {
        if (decimals > 18) revert RiptideErrors.RiptideUnsupportedTokenDecimals(address(0), decimals);
        if (decimals == 18) return amountWad;
        uint256 factor = 10 ** (18 - decimals);
        return amountWad / factor;
    }
}
