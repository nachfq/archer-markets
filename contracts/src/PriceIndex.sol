// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Four-level sparse bitmap over uint32 ticks. Zero is reserved.
library PriceIndex {
    struct Tree {
        mapping(uint8 => mapping(uint32 => uint256)) words;
    }

    function set(Tree storage t, uint32 price, bool present) internal {
        require(price != 0);
        uint32 key = price;
        for (uint8 level; level < 4; ++level) {
            uint32 parent = key >> 8;
            uint256 mask = uint256(1) << uint8(key);
            uint256 beforeWord = t.words[level][parent];
            uint256 afterWord = present ? beforeWord | mask : beforeWord & ~mask;
            if (beforeWord == afterWord) return;
            t.words[level][parent] = afterWord;
            if (present ? beforeWord != 0 : afterWord != 0) return;
            key = parent;
        }
    }

    function bit(uint256 word, bool highest) private pure returns (uint32) {
        if (highest) return uint32(Math.log2(word));
        unchecked {
            return uint32(Math.log2(word & (~word + 1)));
        }
    }

    function descend(Tree storage t, uint32 prefix, uint8 levels, bool highest) private view returns (uint32) {
        while (levels != 0) {
            --levels;
            prefix = (prefix << 8) | bit(t.words[levels][prefix], highest);
        }
        return prefix;
    }

    function best(Tree storage t, bool highest) internal view returns (uint32) {
        uint256 root = t.words[3][0];
        return root == 0 ? 0 : descend(t, bit(root, highest), 3, highest);
    }

    /// @notice Strict successor/predecessor; work is bounded by the four index levels.
    function next(Tree storage t, uint32 price, bool highest) internal view returns (uint32) {
        uint32 key = price;
        for (uint8 level; level < 4; ++level) {
            uint8 digit = uint8(key);
            uint32 prefix = key >> 8;
            uint256 word = t.words[level][prefix];
            if (highest) word &= (uint256(1) << digit) - 1;
            else word &= digit == 255 ? 0 : type(uint256).max << (uint256(digit) + 1);
            if (word != 0) return descend(t, (prefix << 8) | bit(word, highest), level, highest);
            key = prefix;
        }
        return 0;
    }
}
