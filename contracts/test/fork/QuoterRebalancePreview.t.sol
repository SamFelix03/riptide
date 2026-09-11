// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideConstants } from "../../src/core/RiptideConstants.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";

/// @notice Quoter preview must match the rebalance Aqua order shipped at seed time.
contract QuoterRebalancePreviewTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
        strategy.feeProvider = address(provider);
    }

    function test_previewRebalanceAfterRebalanceShip() public {
        uint40 auctionStart = uint40(block.timestamp);
        ISwapVM.Order memory rebOrder = rebalanceRouter.buildRebalanceOrderWithAuctionStart(
            maker,
            strategy,
            RiptideConstants.SWAP_ORDER_DEADLINE,
            RiptideConstants.SEED_REBALANCE_OUT_WAD,
            address(0),
            true,
            auctionStart
        );
        bytes32 rebHash = rebalanceRouter.hash(rebOrder);
        strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);

        tokenBase.mint(maker, 1000e18);
        tokenQuote.mint(maker, 2_000_000e18);
        vm.startPrank(maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(rebalanceRouter), abi.encode(rebOrder), _tokens(), _amounts(100e18, 200_000e18));
        rebalanceRouter.registerStrategy(
            strategyKey, rebHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken)
        );
        rebalanceRouter.setRebalanceAuctionStart(strategyKey, auctionStart);
        vm.stopPrank();

        (RiptideTypes.RebalanceResult memory result,) =
            quoter.previewRebalance(strategy, RiptideConstants.SEED_REBALANCE_OUT_WAD, address(0));
        assertGt(result.surplusWad, 0, "preview surplus");
    }
}
