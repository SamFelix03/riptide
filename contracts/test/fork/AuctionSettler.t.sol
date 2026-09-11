// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

/// @notice Permissionless auction settler fork tests.
contract AuctionSettlerTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_permissionlessSettlePaysResolver() public {
        strategy.feeProvider = address(provider);
        _shipRebalanceStrategy();

        uint256 resolverBefore = tokenQuote.balanceOf(resolver);
        tokenQuote.mint(resolver, 500_000e18);
        vm.startPrank(resolver);
        tokenQuote.approve(address(settler), type(uint256).max);
        RiptideTypes.RebalanceResult memory result =
            settler.settleRebalance(maker, strategy, 1e18, 500_000e18, uint40(block.timestamp + 1 hours));
        vm.stopPrank();

        assertGt(tokenQuote.balanceOf(resolver), resolverBefore);
        assertGt(result.payToResolver, 0);
    }

    function test_expiredSettleReverts() public {
        strategy.feeProvider = address(provider);
        _shipRebalanceStrategy();

        vm.warp(block.timestamp + 2 hours);
        tokenQuote.mint(resolver, 500_000e18);
        vm.startPrank(resolver);
        tokenQuote.approve(address(settler), type(uint256).max);
        vm.expectRevert();
        settler.settleRebalance(maker, strategy, 1e18, 500_000e18, uint40(block.timestamp - 1));
        vm.stopPrank();
    }
}
