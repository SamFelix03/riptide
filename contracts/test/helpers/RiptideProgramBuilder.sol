// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import { Context } from "@1inch/swap-vm/libs/VM.sol";

struct RiptideProgram {
    function(Context memory, bytes calldata) internal[] opcodes;
}

library RiptideProgramBuilder {
    using SafeCast for uint256;

    error OpcodeNotFound();

    function init(function(Context memory, bytes calldata) internal[] memory opcodes) internal pure returns (RiptideProgram memory) {
        return RiptideProgram({ opcodes: opcodes });
    }

    function build(RiptideProgram memory self, function(Context memory, bytes calldata) internal instruction)
        internal
        pure
        returns (bytes memory)
    {
        return build(self, instruction, "");
    }

    function build(RiptideProgram memory self, function(Context memory, bytes calldata) internal instruction, bytes memory args)
        internal
        pure
        returns (bytes memory)
    {
        uint8 opcode = findOpcode(self, instruction);
        return abi.encodePacked(opcode, args.length.toUint8(), args);
    }

    function findOpcode(RiptideProgram memory self, function(Context memory, bytes calldata) internal targetOpcode)
        internal
        pure
        returns (uint8)
    {
        for (uint256 i = 0; i < self.opcodes.length; i++) {
            if (self.opcodes[i] == targetOpcode) {
                return i.toUint8();
            }
        }
        revert OpcodeNotFound();
    }
}
