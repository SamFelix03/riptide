// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";

/// @notice V3: quote/swap fee determinism; provider unchanged in static quote.
contract V3FeeDeterminismTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_v3QuoteMatchesSwapFee() public {
        ISwapVM.Order memory order = _shipAndRegister();

        (uint24 feeBefore,) = provider.controllerState(strategyKey);
        (, uint256 quoteOut,) = _quoteExactIn(order, 1000e18);
        (uint24 feeAfterQuote,) = provider.controllerState(strategyKey);

        assertEq(feeBefore, feeAfterQuote, "static quote must not mutate provider");

        (uint256 swapIn, uint256 swapOut,) = _riptideSwapExactIn(order, 1000e18);
        (uint24 feeAfterSwap,) = provider.controllerState(strategyKey);

        assertEq(quoteOut, swapOut);
        assertEq(swapIn, 1000e18);
        assertEq(feeAfterSwap, feeBefore, "fee reported unchanged until swap advances controller");
    }

    function test_v3_negativeControlMustFail() public {
        ISwapVM.Order memory order = _shipAndRegister();
        (, uint256 quoteOut1,) = _quoteExactIn(order, 1000e18);
        _riptideSwapExactIn(order, 1000e18);
        (, uint256 quoteOut2,) = _quoteExactIn(order, 1000e18);
        assertLt(quoteOut2, quoteOut1, "post-swap quote differs - static determinism broken without isolation");
    }
}
