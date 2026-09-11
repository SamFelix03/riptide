// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideSwapVMRouter } from "../../src/core/RiptideSwapVMRouter.sol";

/// @notice Runtime: docked strategy rejects swap/quote.
contract RuntimeDockedTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_dockedStrategyReverts() public {
        ISwapVM.Order memory order = _shipAndRegister();

        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenBase);
        tokens[1] = address(tokenQuote);
        vm.prank(maker);
        aqua.dock(address(swapRouter), orderHash, tokens);

        vm.expectRevert();
        aqua.safeBalances(maker, address(swapRouter), orderHash, address(tokenBase), address(tokenQuote));

        tokenQuote.mint(taker, 1000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(swapRouter), 1000e18);
        vm.expectRevert();
        swapRouter.riptideSwap(order, address(tokenQuote), address(tokenBase), 1000e18, _swapTakerData(true));
        vm.stopPrank();
    }
}
