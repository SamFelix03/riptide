// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

/// @notice Gate 4: Mechanism 1 dynamic fee + quote/swap parity.
contract Mechanism1Test is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_swapChargesCommittedFee_quoteSwapParity() public {
        ISwapVM.Order memory order = _shipAndRegister();

        (, uint256 quoteOut,) = _quoteExactIn(order, 1000e18);
        assertGt(quoteOut, 0);

        (uint256 swapIn, uint256 swapOut,) = _riptideSwapExactIn(order, 1000e18);
        assertGt(swapOut, 0);
        assertEq(swapIn, 1000e18);
        assertEq(quoteOut, swapOut, "quote/swap amountOut parity");

        (uint24 feeReported,) = provider.controllerState(strategyKey);
        assertEq(feeReported, strategy.fee.feeMin, "dynamic fee at sigma=0 equals feeMin");
    }
}
