// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";

/// @notice Maker-gated rebalance registration and auction clock.
contract RebalanceAuthTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
        _shipAndRegister();
    }

    function test_strangerCannotRegisterOrSetAuctionStart() public {
        bytes32 market = RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken);
        address stranger = makeAddr("stranger");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideUnauthorizedResolver.selector, stranger));
        rebalanceRouter.setRebalanceAuctionStart(strategyKey, uint40(block.timestamp));

        vm.prank(maker);
        rebalanceRouter.registerStrategy(strategyKey, orderHash, market);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideUnauthorizedResolver.selector, stranger));
        rebalanceRouter.registerStrategy(strategyKey, keccak256("other"), market);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideUnauthorizedResolver.selector, stranger));
        rebalanceRouter.setRebalanceAuctionStart(strategyKey, uint40(block.timestamp));

        vm.prank(maker);
        rebalanceRouter.setRebalanceAuctionStart(strategyKey, uint40(block.timestamp));
        assertEq(rebalanceRouter.rebalanceAuctionStart(strategyKey), uint40(block.timestamp));
    }
}
