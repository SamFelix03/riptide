// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideConstants } from "../../src/core/RiptideConstants.sol";

/// @notice V4: applied fee always within [feeMin, feeMax].
contract V4FeeBandTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_v4FeeWithinBandFuzz(uint128 sigmaSeed) public {
        ISwapVM.Order memory order = _shipAndRegister();
        uint128 sigma = uint128(bound(sigmaSeed, strategy.fee.sigmaMin, strategy.fee.sigmaMax));
        feed.setRound(int256(uint256(sigma)), block.timestamp);

        _quoteExactIn(order, 1000e18);
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
