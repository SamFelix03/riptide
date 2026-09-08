// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FeeController } from "../../src/libraries/FeeController.sol";
import { VectorLoader } from "./VectorLoader.sol";
import { stdJson } from "forge-std/StdJson.sol";

contract DifferentialFeeControllerTest is VectorLoader {
    using stdJson for string;

    function test_feeControllerVectors() public view {
        string memory json = _loadVector("fee_controller_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            string memory id = json.readString(string.concat(base, ".id"));

            if (keccak256(bytes(id)) == keccak256("fee_target_mid")) {
                uint24 target = FeeController.feeTarget(
                    json.readUint(string.concat(base, ".inputs.sigmaWad")),
                    json.readUint(string.concat(base, ".inputs.lambdaQ")),
                    uint24(json.readUint(string.concat(base, ".inputs.feeMin"))),
                    uint24(json.readUint(string.concat(base, ".inputs.feeMax")))
                );
                _assertUintOutput(target, json, string.concat(base, ".outputs.feeTarget"));
                continue;
            }

            FeeController.PiState memory state = FeeController.PiState({
                feeReported: uint24(json.readUint(string.concat(base, ".inputs.feeReportedPrev"))),
                integral: int192(int256(json.readUint(string.concat(base, ".inputs.integralPrev")))),
                kp: uint64(json.readUint(string.concat(base, ".inputs.kp"))),
                ki: uint64(json.readUint(string.concat(base, ".inputs.ki"))),
                iMax: uint64(json.readUint(string.concat(base, ".inputs.iMax"))),
                feeMin: uint24(json.readUint(string.concat(base, ".inputs.feeMin"))),
                feeMax: uint24(json.readUint(string.concat(base, ".inputs.feeMax")))
            });
            (uint24 feeReported, int192 integral) =
                FeeController.piStep(state, uint24(json.readUint(string.concat(base, ".inputs.feeTarget"))));
            _assertUintOutput(feeReported, json, string.concat(base, ".outputs.feeReported"));
            _assertUintOutput(uint256(int256(integral)), json, string.concat(base, ".outputs.integral"));
        }
    }
}
