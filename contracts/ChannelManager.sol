pragma solidity ^0.4.21;

import "./ECTools.sol";

contract ChannelManager {
    event ChannelOpen(
        bytes32 indexed channelId,
        address indexed agentA,
        address indexed agentB,
        uint256 depositA,
        uint256 challenge
    );
    event ChannelJoin(
        bytes32 indexed channelId,
        address indexed agentA,
        address indexed agentB,
        uint256 depositA,
        uint256 depositB
    );
    event ChannelChallenge(
        bytes32 indexed channelId,
        uint256 closeTime
    );
    event ChannelUpdateState(
        bytes32 indexed channelId,
        uint256 nonce
    );
    event ChannelClose(bytes32 indexed channelId);

    enum ChannelStatus {
        Open,
        Joined,
        Challenge,
        Closed
    }

    struct Channel {
        address agentA;
        address agentB;
        uint depositA; // Deposit of agent A
        uint depositB; // Deposit of agent B
        ChannelStatus status; 
        uint challenge;
        uint nonce;
        uint closeTime;
        uint balanceA; // for state update
        uint balanceB; // for state update
    }

    mapping (bytes32 => Channel) public channels;
    mapping (address => mapping(address => bytes32)) public activeIds;

    function openChannel(address to, uint challenge) payable public {
        require(challenge != 0); // need to have challenge period
        require(to != address(0)); // need counterparty address
        require(to != msg.sender); // cant create with yourself
        require(activeIds[msg.sender][to] == bytes32(0)); // if channel is already open dont create
        require(activeIds[to][msg.sender] == bytes32(0)); // dont allow to open both ways

        bytes32 id = keccak256(msg.sender, to, now);
        Channel memory channel;
        channel.agentA = msg.sender;
        channel.agentB = to;
        channel.depositA = msg.value;
        channel.balanceA = msg.value; // so that close can happen without any state updates
        channel.status = ChannelStatus.Open;
        channel.challenge = challenge;

        // save to state
        channels[id] = channel;
        // Add it to the lookup table
        activeIds[msg.sender][to] = id;
        emit ChannelOpen(id, channel.agentA, channel.agentB, channel.depositA, channel.challenge);
    }

    function joinChannel(bytes32 id) payable public {
        Channel storage channel = channels[id];

        require(msg.sender == channel.agentB);
        require(channel.status == ChannelStatus.Open);

        channel.depositB = msg.value;
        channel.balanceB = msg.value;

        channel.status = ChannelStatus.Joined;
        emit ChannelJoin(id, channel.agentA, channel.agentB, channel.depositA, channel.depositB);
    }

    function isValidStateUpdate(
        bytes32 channelId,
        uint256 nonce,
        uint256 balanceA,
        uint256 balanceB,
        string sigA,
        string sigB,
        bool requireSigA,
        bool requireSigB
    ) 
        public
        view
        returns (bool)
    {
        Channel memory channel = channels[channelId];

        require(balanceA + balanceB == channel.depositA + channel.depositB); // balances must add up to deposit
        require(channel.status == ChannelStatus.Joined || channel.status == ChannelStatus.Challenge); // channel must be joined

        // require state info to be signed by both participants
        // we are using eth_signTypedData, references:
        // https://medium.com/metamask/scaling-web3-with-signtypeddata-91d6efc8b290
        // https://github.com/ukstv/sign-typed-data-test/blob/master/contracts/SignTypedData.sol#L11
        // https://github.com/MetaMask/eth-sig-util/blob/master/index.js
        bytes32 fingerprint = keccak256(channelId, nonce, balanceA, balanceB);
        bytes32 signTypedDataFingerprint = keccak256(
            keccak256("bytes32 hash"),
            keccak256(fingerprint)
        );

        if (requireSigA) {
            require(ECTools.isSignedBy(signTypedDataFingerprint, sigA, channel.agentA) == true);
        }

        if (requireSigB) {
            require(ECTools.isSignedBy(signTypedDataFingerprint, sigB, channel.agentB) == true);
        }

        // return true if all conditions pass
        return true;
    }

    function updateState(
        bytes32 channelId,
        uint256 nonce,
        uint256 balanceA,
        uint256 balanceB,
        string sigA,
        string sigB
    ) 
        public
    {
        Channel storage channel = channels[channelId];

        // sanity checks
        require(msg.sender == channel.agentA || msg.sender == channel.agentB); // comes from agent
        require(channel.status != ChannelStatus.Closed); // channel open or challenge status
        require(
            isValidStateUpdate(channelId, nonce, balanceA, balanceB, sigA, sigB, true, true) == true
        ); // valid signatures from both parties
        require(nonce > channel.nonce); // need a higher sequence update

        // set state variables
        channel.balanceA = balanceA;
        channel.balanceB = balanceB;
        channel.nonce = nonce;

        emit ChannelUpdateState(channelId, nonce);
    }

    function startChallenge(bytes32 channelId) public {
        Channel storage channel = channels[channelId];

        // sanity checks
        require(msg.sender == channel.agentA || msg.sender == channel.agentB); // comes from agent
        require(channel.status == ChannelStatus.Joined || channel.status == ChannelStatus.Open); // channel open or joined status

        // update channel status
        channel.status = ChannelStatus.Challenge;
        channel.closeTime = now + channel.challenge;
        
        emit ChannelChallenge(channelId, channel.closeTime);
    }

    function closeChannel(
        bytes32 channelId
    )
        public
    {
        Channel memory channel = channels[channelId];

        // request must come from agents
        require(msg.sender == channel.agentA || msg.sender == channel.agentB);

        // channel must be in challenge and challenge period over
        require(channel.status == ChannelStatus.Challenge);
        require(now > channel.closeTime);

        // if true, then use final state to close channel
        channel.agentA.transfer(channel.balanceA);
        channel.agentB.transfer(channel.balanceB);

        delete channels[channelId];
        delete activeIds[channel.agentA][channel.agentB];

        emit ChannelClose(channelId);
    }

    function getChannel(bytes32 id) public view returns(
        address,
        address,
        uint,
        uint,
        uint,
        uint,
        uint,
        uint,
        uint,
        uint
    ) {
        Channel memory channel = channels[id];
        return (
            channel.agentA,
            channel.agentB,
            channel.depositA,
            channel.depositB,
            uint(channel.status),
            channel.challenge,
            channel.nonce,
            channel.closeTime,
            channel.balanceA,
            channel.balanceB
        );
    }
}