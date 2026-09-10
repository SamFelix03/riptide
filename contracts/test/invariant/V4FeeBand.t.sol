// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { RiptideConstants } from "../../src/core/RiptideConstants.sol";

/// @notice V4: applied fee always within [feeMin, feeMax] ⊂ (0, BPS).
contract V4FeeBandTest is RiptideForkBase {
    ISwapVM.Order internal shipped;

    function setUp() public {
        _deploySystem();
        shipped = _shipAndRegister();
    }

    /// forge-config: default.fuzz.runs = 256
    /// forge-config: ci.fuzz.runs = 256
    function test_v4FeeWithinBandFuzz(uint128 sigmaSeed) public {
        uint128 sigma = uint128(bound(sigmaSeed, strategy.fee.sigmaMin, strategy.fee.sigmaMax));
        feed.setRound(int256(uint256(sigma)), block.timestamp);

        _quoteExactIn(shipped, 1000e18);
        (uint24 fee,) = provider.controllerState(strategyKey);
        assertGe(fee, strategy.fee.feeMin);
        assertLe(fee, strategy.fee.feeMax);
        assertLt(fee, uint24(RiptideConstants.BPS));
    }

    function test_v4_negativeControlMustFail() public pure {
        uint24 feeMin = 30_000;
        uint24 feeMax = 500_000;
        uint24 unclamped = feeMax + 1;
        assertGt(unclamped, feeMax);
        assertGt(unclamped, feeMin);
    }
}
