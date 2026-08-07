// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SOS69069 Presence Logger (Compact)
 * @author SOS69069
 * @notice Permissionless pure logger. Minimal on-chain data.
 * @dev Data format (compact):
 * - id              : sequential
 * - poster          : msg.sender
 * - type            : 'Y' = FOR_YOU , 'M' = FOR_ME
 * - amount          : uint256
 * - priceInReturn   : short string (max 5 chars)
 * - method          : single letter or short code (last letter of the old scheme)
 * - contact         : short (email / messenger handle) (max 15 chars)
 * - effective       : snapshot at post time
 * - timestamp       : block.timestamp
 *
 * Note, Trust and Push are NOT stored (can be read later from SOS).
 *
 * Rules still apply:
 * 1. Caller must have done SOS.pushTo(CREATOR) + SOS.pushForMe()
 * 2. FOR_YOU ('Y') is blocked when Effective < 0
 *
 * SOS : 0x61af906f53Eb927790055AC8eA99916a01873c15
 * Creator : 0x1C10e6574ee696f54b21A611a21313E4714628ad
 */

/**
 * @title ISOS
 * @notice Minimal external interface into the SOS contract used for
 * trust (balance) and push-count lookups.
 */
interface ISOS {
    /**
     * @notice Returns the SOS trust balance of an account.
     * @param account Address to query.
     * @return The account's SOS token balance.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @notice Returns how many times a user has "pushed" on SOS.
     * @param user Address to query.
     * @return The account's push count.
     */
    function pushCountOf(address user) external view returns (uint256);
}

/**
 * @title PresenceLogger
 * @notice Permissionless, fund-free logger for "Presence" posts, gated by
 * a caller's standing on the external SOS contract.
 * @dev Holds no ETH/ERC20 value itself; purely stores structured post data
 * and emits a matching event per post. All external SOS reads are `view`
 * calls (STATICCALL), so no reentrancy risk exists from those calls.
 */
contract PresenceLogger {

    /// @notice Address of the external SOS contract used for trust/push checks.
    address public constant SOS_CONTRACT = 0x61af906f53Eb927790055AC8eA99916a01873c15;

    /// @notice Address designated as the required push-to target ("CREATOR").
    address public constant CREATOR      = 0x1C10e6574ee696f54b21A611a21313E4714628ad;

    /// @notice Maximum allowed length (in bytes) for the `priceInReturn` field.
    uint256 public constant MAX_PRICE_IN_RETURN_LEN = 5;

    /// @notice Maximum allowed length (in bytes) for the `contact` field.
    uint256 public constant MAX_CONTACT_LEN = 15;

    /// @notice Immutable handle to the SOS contract, set once at deployment.
    ISOS public immutable sos;

    /**
     * @notice Compact on-chain record of a single Presence post.
     * @param id Sequential identifier assigned at creation.
     * @param poster Address that created the post (msg.sender at post time).
     * @param pType Post type: 'Y' = FOR_YOU, 'M' = FOR_ME.
     * @param amount Amount associated with the Presence post.
     * @param priceInReturn Short string describing what is asked/offered (max 5 chars).
     * @param method Single-byte code identifying payment/contact method (e.g. 'E'=ETH, 'U'=USDT, 'F'=Fiat).
     * @param contact Short contact string, e.g. email or handle (max 15 chars).
     * @param effective Snapshot of (trust - push) computed at post time.
     * @param timestamp Block timestamp at which the post was created.
     */
    struct Presence {
        uint256  id;
        address  poster;
        bytes1   pType;          // 'Y' or 'M'
        uint256  amount;
        string   priceInReturn;
        bytes1   method;         // single letter / short code
        string   contact;
        int256   effective;      // only value we keep from SOS state
        uint256  timestamp;
    }

    /// @notice ID to be assigned to the next logged Presence (starts at 1).
    uint256 public nextId = 1;

    /// @notice Maps a Presence id to its stored record.
    mapping(uint256 => Presence) public presences;

    /// @notice Maps a poster address to the list of Presence ids they created.
    mapping(address => uint256[]) public posterPresenceIds;

    /**
     * @notice Emitted whenever a new Presence is logged.
     * @param id Sequential identifier of the new Presence.
     * @param poster Address that created the post.
     * @param pType Post type: 'Y' = FOR_YOU, 'M' = FOR_ME.
     * @param amount Amount associated with the Presence post.
     * @param priceInReturn Short string describing what is asked/offered.
     * @param method Single-byte code identifying payment/contact method.
     * @param contact Short contact string.
     * @param effective Snapshot of (trust - push) computed at post time.
     * @param timestamp Block timestamp at which the post was created.
     */
    event PresenceLogged(
        uint256 indexed id,
        address indexed poster,
        bytes1  pType,
        uint256 amount,
        string  priceInReturn,
        bytes1  method,
        string  contact,
        int256  effective,
        uint256 timestamp
    );

    /**
     * @notice Deploys the logger and binds it to the fixed SOS contract address.
     * @dev SOS_CONTRACT is a hardcoded constant; this binding cannot be changed later.
     */
    constructor() {
        sos = ISOS(SOS_CONTRACT);
    }

    /**
     * @notice Log a new Presence (permissionless, compact).
     * @dev Requires the caller to already have a nonzero push count on SOS
     * (i.e. have called SOS.pushTo(CREATOR) + SOS.pushForMe() previously).
     * FOR_YOU ('Y') posts additionally require a non-negative `effective`
     * value (trust - push), computed fresh at call time via `_safeEffective`.
     * FOR_ME ('M') posts are not subject to the effective-balance check.
     * @param pType          'Y' = FOR_YOU, 'M' = FOR_ME
     * @param amount         amount of Presence
     * @param priceInReturn  short description of what is asked/offered (max 5 chars)
     * @param method         single byte (e.g. 'E'=ETH, 'U'=USDT, 'F'=Fiat ...)
     * @param contact        short contact (email / @handle / number) (max 15 chars)
     * @return id The sequential id assigned to the newly logged Presence.
     */
    function logPresence(
        bytes1 pType,
        uint256 amount,
        string calldata priceInReturn,
        bytes1 method,
        string calldata contact
    ) external returns (uint256 id) {
        require(pType == bytes1("Y") || pType == bytes1("M"), "Type must be Y or M");
        require(amount > 0, "Amount must be > 0");
        require(bytes(priceInReturn).length > 0, "priceInReturn required");
        require(bytes(priceInReturn).length <= MAX_PRICE_IN_RETURN_LEN, "priceInReturn too long");
        require(bytes(contact).length > 0, "contact required");
        require(bytes(contact).length <= MAX_CONTACT_LEN, "contact too long");

        uint256 push = sos.pushCountOf(msg.sender);
        require(push > 0, "Must mint to CREATOR + call pushForMe first");

        uint256 trust = sos.balanceOf(msg.sender);
        int256 effective = _safeEffective(trust, push);

        // Block FOR_YOU when Effective is negative
        if (pType == bytes1("Y")) {
            require(effective >= 0, "Effective is negative - FOR_YOU blocked");
        }

        id = nextId++;

        Presence storage p = presences[id];
        p.id            = id;
        p.poster        = msg.sender;
        p.pType         = pType;
        p.amount        = amount;
        p.priceInReturn = priceInReturn;
        p.method        = method;
        p.contact       = contact;
        p.effective     = effective;
        p.timestamp     = block.timestamp;

        posterPresenceIds[msg.sender].push(id);

        emit PresenceLogged(
            id,
            msg.sender,
            pType,
            amount,
            priceInReturn,
            method,
            contact,
            effective,
            block.timestamp
        );
    }

    // ---------- Internal ----------

    /**
     * @notice Safely computes (trust - push) as a signed value.
     * @dev Explicit `int256(uint256)` casts do not benefit from Solidity 0.8.x
     * checked-arithmetic overflow protection — they only reinterpret bits.
     * This helper guards against that by requiring both inputs to fit within
     * `type(int256).max` before casting, reverting otherwise instead of
     * silently producing an incorrect negative value.
     * @param trust The account's SOS trust balance.
     * @param push The account's SOS push count.
     * @return The signed difference (trust - push).
     */
    function _safeEffective(uint256 trust, uint256 push) internal pure returns (int256) {
        uint256 maxInt = uint256(type(int256).max);
        require(trust <= maxInt, "trust exceeds int256 range");
        require(push <= maxInt, "push exceeds int256 range");
        return int256(trust) - int256(push);
    }

    // ---------- Views ----------

    /**
     * @notice Retrieves a previously logged Presence by id.
     * @param id The Presence id to look up (must be in range [1, nextId)).
     * @return The full Presence record.
     */
    function getPresence(uint256 id) external view returns (Presence memory) {
        require(id > 0 && id < nextId, "Invalid id");
        return presences[id];
    }

    /**
     * @notice Lists all Presence ids created by a given poster.
     * @param poster Address whose Presence ids should be returned.
     * @return Array of Presence ids created by `poster`.
     */
    function getPosterPresenceIds(address poster) external view returns (uint256[] memory) {
        return posterPresenceIds[poster];
    }

    /**
     * @notice Returns the total number of Presence records logged so far.
     * @return Total count of logged Presence records.
     */
    function totalLogged() external view returns (uint256) {
        return nextId - 1;
    }

    /**
     * @notice Computes the current effective (trust - push) value for a wallet.
     * @dev Reads live values from SOS; not stored, purely a view calculation.
     * Uses the same overflow-safe path as `logPresence`.
     * @param wallet Address to compute the effective value for.
     * @return The signed effective value (trust - push).
     */
    function currentEffective(address wallet) external view returns (int256) {
        uint256 trust = sos.balanceOf(wallet);
        uint256 push  = sos.pushCountOf(wallet);
        return _safeEffective(trust, push);
    }

    /// @notice Rejects any plain ETH transfer to this contract.
    receive() external payable { revert("No ETH"); }

    /// @notice Rejects any ETH sent with non-matching calldata.
    fallback() external payable { revert("No ETH"); }
}