// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { RiptideDemoToken } from "../../src/demo/RiptideDemoToken.sol";

contract RiptideDemoTokenTest is Test {
    RiptideDemoToken internal token;

    function setUp() public {
        token = new RiptideDemoToken("Demo Base", "DBASE");
    }

    function test_decimals18() public view {
        assertEq(token.decimals(), 18);
    }

    function test_faucetMints() public {
        address user = makeAddr("user");
        vm.prank(user);
        token.faucet(1000e18);
        assertEq(token.balanceOf(user), 1000e18);
    }

    function test_faucetCapEnforced() public {
        vm.expectRevert(abi.encodeWithSelector(RiptideDemoToken.FaucetCapExceeded.selector, 10_001e18, 10_000e18));
        token.faucet(10_001e18);
    }
}
