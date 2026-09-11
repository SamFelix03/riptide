// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { VolatilityMath } from "../../src/libraries/VolatilityMath.sol";
import { VectorLoader } from "./VectorLoader.sol";
import { stdJson } from "forge-std/StdJson.sol";

contract DifferentialVolatilityTest is VectorLoader {
    using stdJson for string;
    function test_volatilityVectors() public view {
        string memory json = _loadVector("volatility_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            string memory id = json.readString(string.concat(base, ".id"));

            if (keccak256(bytes(id)) == keccak256("vol_stale_freeze")) {
                uint128 sigmaPrev = uint128(json.readUint(string.concat(base, ".inputs.sigmaPrev")));
                uint128 sigmaCandidate = uint128(json.readUint(string.concat(base, ".inputs.sigmaCandidate")));
                bool isStale = json.readBool(string.concat(base, ".inputs.isStale"));
                uint128 frozen = VolatilityMath.applyStaleFreeze(sigmaPrev, sigmaCandidate, isStale);
                _assertUintOutput(frozen, json, string.concat(base, ".outputs.sigmaWad"));
                continue;
            }

            if (keccak256(bytes(id)) == keccak256("vol_clamp_min")) {
                uint128 clampedMin = VolatilityMath.sigmaFromVar(
                    0,
                    uint64(json.readUint(string.concat(base, ".inputs.dt"))),
                    uint64(json.readUint(string.concat(base, ".inputs.sigmaMin"))),
                    uint64(json.readUint(string.concat(base, ".inputs.sigmaMax")))
                );
                _assertUintOutput(clampedMin, json, string.concat(base, ".outputs.sigmaWad"));
                continue;
            }

            if (keccak256(bytes(id)) == keccak256("vol_clamp_max")) {
                uint128 varAtMax = VolatilityMath.ewmaVar(
                    0,
                    int256(json.readUint(string.concat(base, ".inputs.logReturn"))),
                    uint64(json.readUint(string.concat(base, ".inputs.lambda"))),
                    0,
                    false
                );
                uint128 clampedMax = VolatilityMath.sigmaFromVar(
                    varAtMax,
                    uint64(json.readUint(string.concat(base, ".inputs.dt"))),
                    uint64(json.readUint(string.concat(base, ".inputs.sigmaMin"))),
                    uint64(json.readUint(string.concat(base, ".inputs.sigmaMax")))
                );
                _assertUintOutput(clampedMax, json, string.concat(base, ".outputs.sigmaWad"));
                continue;
            }

            uint64 lambdaWad = uint64(json.readUint(string.concat(base, ".inputs.lambda")));
            int256 logReturn = int256(json.readUint(string.concat(base, ".inputs.logReturn")));
            uint128 prevVar = uint128(json.readUint(string.concat(base, ".inputs.prevVar")));
            bool useGk = json.keyExists(string.concat(base, ".inputs.high"));
            uint128 gk = 0;
            if (useGk) {
                gk = VolatilityMath.gkTerm(
                    json.readUint(string.concat(base, ".inputs.high")),
                    json.readUint(string.concat(base, ".inputs.low")),
                    json.readUint(string.concat(base, ".inputs.close")),
                    json.readUint(string.concat(base, ".inputs.open"))
                );
                _assertUintOutput(gk, json, string.concat(base, ".outputs.gkTerm"));
            }

            uint128 varWad = VolatilityMath.ewmaVar(prevVar, logReturn, lambdaWad, gk, useGk);
            if (json.keyExists(string.concat(base, ".outputs.varWad"))) {
                _assertUintOutput(varWad, json, string.concat(base, ".outputs.varWad"));
            }

            uint128 sigma = VolatilityMath.sigmaFromVar(
                varWad,
                uint64(json.readUint(string.concat(base, ".inputs.dt"))),
                uint64(json.readUint(string.concat(base, ".inputs.sigmaMin"))),
                uint64(json.readUint(string.concat(base, ".inputs.sigmaMax")))
            );
            _assertUintOutput(sigma, json, string.concat(base, ".outputs.sigmaWad"));
        }
    }
}
