// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { LnExpMath } from "../../src/libraries/LnExpMath.sol";
import { DiamondSplit } from "../../src/libraries/DiamondSplit.sol";
import { CpmmMath } from "../../src/libraries/CpmmMath.sol";
import { VectorLoader } from "./VectorLoader.sol";
import { stdJson } from "forge-std/StdJson.sol";

contract DifferentialInvalidDomainsTest is VectorLoader {
    using stdJson for string;

    function test_invalidDomainVectors() public {
        string memory json = _loadVector("invalid_domains_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            string memory fn = json.readString(string.concat(base, ".fn"));

            if (keccak256(bytes(fn)) == keccak256("diamond_split")) {
                int256 surplus = json.readInt(string.concat(base, ".inputs.surplusWad"));
                uint256 beta = json.readUint(string.concat(base, ".inputs.beta"));
                if (surplus < 0) {
                    vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideNoSurplus.selector, surplus));
                    this.revertDiamondSplit(uint256(surplus), beta);
                } else {
                    vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidBeta.selector, beta));
                    this.revertDiamondSplit(uint256(surplus), beta);
                }
            } else if (keccak256(bytes(fn)) == keccak256("ln_wad")) {
                vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideLogInputOutOfDomain.selector, uint256(0)));
                this.revertLnWad(0);
            } else if (keccak256(bytes(fn)) == keccak256("pow_wad")) {
                vm.expectRevert(
                    abi.encodeWithSelector(
                        RiptideErrors.RiptidePowOutOfDomain.selector, uint256(0), int256(1000000000000000000)
                    )
                );
                this.revertPowWad(0, int256(1000000000000000000));
            } else if (keccak256(bytes(fn)) == keccak256("cpmm_exact_in")) {
                vm.expectRevert(RiptideErrors.RiptideMathDivisionByZero.selector);
                this.revertCpmmExactIn(
                    json.readUint(string.concat(base, ".inputs.reserveIn")),
                    json.readUint(string.concat(base, ".inputs.reserveOut")),
                    json.readUint(string.concat(base, ".inputs.amountIn")),
                    json.readUint(string.concat(base, ".inputs.feeBps"))
                );
            }
        }
    }

    function revertDiamondSplit(uint256 surplus, uint256 beta) external pure {
        DiamondSplit.split(surplus, beta);
    }

    function revertLnWad(uint256 x) external pure {
        LnExpMath.lnWad(x);
    }

    function revertPowWad(uint256 base, int256 exponent) external pure {
        LnExpMath.powWad(base, exponent);
    }

    function revertCpmmExactIn(uint256 reserveIn, uint256 reserveOut, uint256 amountIn, uint256 feeBps) external pure {
        CpmmMath.exactIn(reserveIn, reserveOut, amountIn, feeBps);
    }
}
