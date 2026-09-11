// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { IRiptideLens } from "../../src/interfaces/IRiptideLens.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";

/// @notice Lens reports live Aqua balances after push desync.
contract RiptideLensTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_lensLiveAquaAfterPush() public {
        _shipAndRegister();
        vm.prank(maker);
        rebalanceRouter.registerStrategy(strategyKey, orderHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken));

        IRiptideLens.StrategyState memory before = lens.strategyState(
            maker, orderHash, address(tokenBase), address(tokenQuote)
        );

        tokenQuote.mint(address(this), 25_000e18);
        tokenQuote.approve(address(aqua), 25_000e18);
        aqua.push(maker, address(swapRouter), orderHash, address(tokenQuote), 25_000e18);

        IRiptideLens.StrategyState memory afterPush = lens.strategyState(
            maker, orderHash, address(tokenBase), address(tokenQuote)
        );

        assertEq(afterPush.aquaQuote, before.aquaQuote + 25_000e18);
        assertEq(afterPush.aquaBase, before.aquaBase);
    }
}
