// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { RiptideMakerTraits } from "../../src/core/RiptideMakerTraits.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { BrokenRebalanceProgram } from "../negative/BrokenRebalanceProgram.sol";

/// @notice V2: no-surplus safety on rebalance router dispatch.
contract V2NoSurplusTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function _shipWithStaleIn(uint256 staleInWad) internal returns (ISwapVM.Order memory order) {
        strategy.feeProvider = address(provider);
        RiptideTypes.Strategy memory s = strategy;
        bytes memory data = bytes.concat(
            RiptideStrategyCodec.encode(s),
            BrokenRebalanceProgram.build(s, uint40(block.timestamp + 1 hours), staleInWad, resolver, true)
        );
        order = RiptideMakerTraits.buildOrder(maker, data);
        orderHash = rebalanceRouter.hash(order);
        strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);

        tokenBase.mint(maker, 1000e18);
        tokenQuote.mint(maker, 2_000_000e18);
        vm.startPrank(maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(rebalanceRouter), abi.encode(order), _tokens(), _amounts(100e18, 200_000e18));
        swapRouter.registerStrategy(strategyKey, orderHash, strategy, maker);
        rebalanceRouter.registerStrategy(
            strategyKey, orderHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken)
        );
        vm.stopPrank();
    }

    function test_v2NoSurplusRevertsOnRouter() public {
        ISwapVM.Order memory order = _shipWithStaleIn(type(uint128).max);

        tokenQuote.mint(taker, 500_000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(rebalanceRouter), type(uint256).max);
        vm.expectRevert();
        rebalanceRouter.swap(order, address(tokenQuote), address(tokenBase), 1e18, _swapTakerData(false));
        vm.stopPrank();
    }

    function test_v2NoSurplusFuzz(uint128 executed, uint128 stale) public {
        executed = uint128(bound(executed, 0, type(uint128).max - 1));
        stale = uint128(bound(stale, uint256(executed) + 1, type(uint128).max));
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideNoSurplus.selector, int256(uint256(executed)) - int256(uint256(stale))));
        kernel.splitSurplus(executed, stale, strategy.auction.beta);
    }

    function test_v2_negativeControlMustFail() public {
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideNoSurplus.selector, int256(-1)));
        kernel.splitSurplus(100, 101, strategy.auction.beta);
    }
}
