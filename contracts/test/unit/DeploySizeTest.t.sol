// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { RiptideSystemDeployer } from "../helpers/RiptideSystemDeployer.sol";

contract DeploySizeTest is Test {
    uint256 internal constant EIP170 = 24_576;

    function test_twoRouterSplitDeploys() public {
        Aqua aqua = new Aqua();
        RiptideSystemDeployer deployer = new RiptideSystemDeployer();
        RiptideSystemDeployer.System memory sys = deployer.deploy(address(aqua), address(this));

        uint256 swapSize = address(sys.swapRouter).code.length;
        uint256 rebSize = address(sys.rebalanceRouter).code.length;
        emit log_named_uint("swapRouter runtime bytecode", swapSize);
        emit log_named_uint("rebalanceRouter runtime bytecode", rebSize);
        assertTrue(address(sys.swapRouter) != address(0));
        assertTrue(address(sys.rebalanceRouter) != address(0));
        assertLe(swapSize, EIP170, "swap router exceeds EIP-170");
        assertLe(rebSize, EIP170, "rebalance router exceeds EIP-170");
    }
}
