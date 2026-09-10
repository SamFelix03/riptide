// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title RiptideDemoToken
/// @notice Demo-only 18-decimal ERC-20 with a public faucet (CONTRACTS.md §15).
contract RiptideDemoToken is ERC20 {
    uint256 public constant FAUCET_CAP = 10_000e18;

    error FaucetCapExceeded(uint256 requested, uint256 cap);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function faucet(uint256 amount) external {
        if (amount > FAUCET_CAP) revert FaucetCapExceeded(amount, FAUCET_CAP);
        _mint(msg.sender, amount);
    }

    /// @notice Demo-only mint for deploy/seed scripts (no access control).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
