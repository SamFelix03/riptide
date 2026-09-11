// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";

contract RevertingQuoteToken is ERC20 {
    constructor() ERC20("RevertingQuote", "RQT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("transferFrom reverts");
    }
}

/// @notice Runtime: failed taker transfer rolls back Aqua balances.
contract RuntimeRollbackTest is RiptideForkBase {
    RevertingQuoteToken internal badQuote;

    function setUp() public {
        _deploySystem();
        badQuote = new RevertingQuoteToken();
    }

    function test_swapRollbackPreservesAquaBalances() public {
        strategy.quoteToken = address(badQuote);
        strategy.feeProvider = address(provider);

        ISwapVM.Order memory order = swapRouter.buildSwapOrder(maker, strategy, uint40(block.timestamp + 1 hours));
        orderHash = swapRouter.hash(order);
        strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);

        badQuote.mint(maker, 2_000_000e18);
        tokenBase.mint(maker, 1000e18);
        vm.startPrank(maker);
        badQuote.approve(address(aqua), type(uint256).max);
        tokenBase.approve(address(aqua), type(uint256).max);
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenBase);
        tokens[1] = address(badQuote);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e18;
        amounts[1] = 200_000e18;
        aqua.ship(address(swapRouter), abi.encode(order), tokens, amounts);
        swapRouter.registerStrategy(strategyKey, orderHash, strategy, maker);
        vm.stopPrank();

        (uint256 baseBefore, uint256 quoteBefore) =
            aqua.safeBalances(maker, address(swapRouter), orderHash, address(tokenBase), address(badQuote));

        badQuote.mint(taker, 1000e18);
        vm.startPrank(taker);
        badQuote.approve(address(swapRouter), 1000e18);
        vm.expectRevert();
        swapRouter.riptideSwap(order, address(badQuote), address(tokenBase), 1000e18, _swapTakerData(true));
        vm.stopPrank();

        (uint256 baseAfter, uint256 quoteAfter) =
            aqua.safeBalances(maker, address(swapRouter), orderHash, address(tokenBase), address(badQuote));
        assertEq(baseBefore, baseAfter);
        assertEq(quoteBefore, quoteAfter);
    }
}
