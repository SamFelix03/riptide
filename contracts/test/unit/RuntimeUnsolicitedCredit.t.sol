// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";

/// @notice Runtime: unsolicited Aqua credit is visible to live-balance quotes.
contract RuntimeUnsolicitedCreditTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_unsolicitedPushQuoteStillSucceeds() public {
        ISwapVM.Order memory order = _shipAndRegister();

        tokenQuote.mint(address(this), 50_000e18);
        tokenQuote.approve(address(aqua), 50_000e18);
        aqua.push(maker, address(swapRouter), orderHash, address(tokenQuote), 50_000e18);

        (, uint256 quoteOut,) = _quoteExactIn(order, 1000e18);
        assertGt(quoteOut, 0);

        (uint256 swapIn, uint256 swapOut,) = _riptideSwapExactIn(order, 1000e18);
        assertGt(swapOut, 0);
        assertEq(swapIn, 1000e18);
    }
}
