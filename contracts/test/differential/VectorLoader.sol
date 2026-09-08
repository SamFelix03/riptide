// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { stdJson } from "forge-std/StdJson.sol";

/// @notice Helpers for reading committed JSON vectors under ../test/vectors/.
abstract contract VectorLoader is Test {
    using stdJson for string;

    function _loadVector(string memory file) internal view returns (string memory json) {
        json = vm.readFile(string.concat("../test/vectors/", file));
    }

    function _caseCount(string memory json) internal view returns (uint256 n) {
        while (json.keyExists(string.concat(".cases[", vm.toString(n), "].id"))) {
            n++;
        }
    }

    function _assertUintOutput(uint256 actual, string memory json, string memory key) internal pure {
        string memory direction = json.readString(string.concat(key, ".direction"));
        uint256 floorVal = json.readUint(string.concat(key, ".floor"));
        if (keccak256(bytes(direction)) == keccak256("floor")) {
            require(actual == floorVal, "vector floor mismatch");
        } else {
            require(actual == json.readUint(string.concat(key, ".ceiling")), "vector ceiling mismatch");
        }
    }
}
