// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { WadMulDiv } from "../../src/libraries/WadMulDiv.sol";
import { CpmmMath } from "../../src/libraries/CpmmMath.sol";
import { VectorLoader } from "./VectorLoader.sol";
import { stdJson } from "forge-std/StdJson.sol";

contract DifferentialCpmmTest is VectorLoader {
    using stdJson for string;

    function test_cpmmVectors() public view {
        string memory json = _loadVector("cpmm_swap_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            string memory kind = json.readString(string.concat(base, ".inputs.kind"));
            uint256 reserveIn = json.readUint(string.concat(base, ".inputs.reserveIn"));
            uint256 reserveOut = json.readUint(string.concat(base, ".inputs.reserveOut"));
            uint256 feeBps = json.readUint(string.concat(base, ".inputs.feeBps"));

            if (keccak256(bytes(kind)) == keccak256("exact_in")) {
                uint256 amountIn = json.readUint(string.concat(base, ".inputs.amountIn"));
                uint256 amountOut = CpmmMath.exactIn(reserveIn, reserveOut, amountIn, feeBps);
                _assertUintOutput(amountOut, json, string.concat(base, ".outputs.amountOut"));

                uint256 sigmaWad = 200000000000000000;
                uint256 valueWad = reserveIn + reserveOut;
                uint256 priceWad = WadMulDiv.mulDiv(reserveIn, WadMulDiv.WAD, reserveOut, WadMulDiv.Rounding.Down);
                _assertUintOutput(CpmmMath.lvrGeneral(sigmaWad, priceWad, valueWad), json, string.concat(base, ".outputs.lvrGeneral"));
                _assertUintOutput(CpmmMath.lvrCpmm(sigmaWad, valueWad), json, string.concat(base, ".outputs.lvrCpmm"));
            } else {
                uint256 amountOut = json.readUint(string.concat(base, ".inputs.amountOut"));
                uint256 amountIn = CpmmMath.exactOut(reserveIn, reserveOut, amountOut, feeBps);
                _assertUintOutput(amountIn, json, string.concat(base, ".outputs.amountIn"));
            }
        }
    }
}
