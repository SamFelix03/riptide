// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { RiptideSwapVMRouter } from "../../src/core/RiptideSwapVMRouter.sol";

contract DeploySizeTest is Test {
    function test_deploySwapRouter() public {
        RiptideSwapVMRouter router = new RiptideSwapVMRouter(
            address(1), address(2), address(this), "Riptide", "1", address(3), address(4)
        );
        assertTrue(address(router) != address(0));
    }
}
