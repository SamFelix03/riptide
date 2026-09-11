// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { WadMulDiv } from "../../src/libraries/WadMulDiv.sol";
import { DiamondSplit } from "../../src/libraries/DiamondSplit.sol";
import { VectorLoader } from "./VectorLoader.sol";
import { DutchPow } from "./DutchPow.sol";
import { stdJson } from "forge-std/StdJson.sol";

contract DifferentialDiamondSplitTest is VectorLoader {
    using stdJson for string;
    function test_diamondSplitVectors() public view {
        string memory json = _loadVector("diamond_split_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            uint256 surplus = json.readUint(string.concat(base, ".inputs.surplusWad"));
            uint256 beta = json.readUint(string.concat(base, ".inputs.beta"));
            (uint256 pay, uint256 retain) = DiamondSplit.split(surplus, beta);
            _assertUintOutput(pay, json, string.concat(base, ".outputs.payToResolver"));
            _assertUintOutput(retain, json, string.concat(base, ".outputs.retainToLP"));

            uint256 decay = 990000000000000000;
            uint256 factor = DutchPow.pow(decay, 100);
            uint256 dutch = WadMulDiv.mulDiv(1000000000000000000000, factor, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
            _assertUintOutput(dutch, json, string.concat(base, ".outputs.dutchBalanceIn"));
        }
    }
}
