pragma solidity ^0.4.23;

import "../node_modules/openzeppelin-solidity/contracts/ECRecovery.sol";
import "./ECTools.sol";

contract JehansExperiment {
    enum ChannelStatus {
        Open,
        Challenge
    }
    struct Channel {
        uint nonce;
        uint balanceA;
        uint balanceB;
        uint balanceTotal;
        ChannelStatus status;
        uint closeBlock;
    }

    event Debug(uint balance);

    // Channels are stored by <high address> => <low address> => Channel
    mapping (address => mapping(address => Channel)) public channels;

    // CONCERN: Should this be allowed during challenge?
    // CONCERN: Should this check and set the nonce?
    // CONCERN: Should this require explicit signatures?
    function deposit (
        address agentA,
        address agentB
    ) public payable {
        require(agentA > agentB, "agentA's address must be numerically greater than agentB's address.");
        Channel storage channel = channels[agentA][agentB];

        // is over/under flow a concern here?
        channel.balanceTotal += msg.value;

        emit Debug(msg.value);
        if (msg.sender == agentA) {
            channel.balanceA += msg.value;
        } else if (msg.sender == agentB) {
            channel.balanceB += msg.value;
        } else {
            revert("This is not your channel");
        }
    }

    // CONCERN: Is this missing anything? Compare it against the other contract and old Guac to be sure.
    function transfer(
        address agentA,
        address agentB,
        uint nonce,
        uint balanceA,
        uint balanceB,
        string sigA,
        string sigB
    ) public {
        require(agentA > agentB, "agentA's address must be numerically greater than agentB's address.");
        Channel storage channel = channels[agentA][agentB];

        bytes32 fingerprint = keccak256(
            abi.encodePacked(
                "Guac Transfer",
                agentA,
                agentB,
                nonce,
                balanceA,
                balanceB
            )
        );

        require(
            ECTools.isSignedBy(fingerprint, sigA, agentA),
            //ECRecovery.recover(fingerprint, sigA) == agentA,
            "AgentA signature not valid"
        );
        require(
            ECTools.isSignedBy(fingerprint, sigB, agentB),
            //ECRecovery.isSignedBy(fingerprint, sigB) == agentB
            "AgentB signature not valid"
        );
        require(
            balanceA + balanceB == channel.balanceTotal,
            "Balances do not add up to balanceTotal."
        );
        require(nonce > channel.nonce, "Nonce is not higher than on chain channel state.");

        channel.balanceA = balanceA;
        channel.balanceB = balanceB;
        channel.nonce = nonce;
    }

    // CONCERN: Should this be allowed during challenge?
    function withdraw (
        address agentA,
        address agentB,
        uint nonce,
        uint amount,
        string sigA,
        string sigB
    ) public {
        require(agentA > agentB, "agentA's address must be numerically greater than agentB's address.");
        Channel storage channel = channels[agentA][agentB];

        bytes32 fingerprint = keccak256(
            abi.encodePacked(
                "withdraw",
                agentA,
                agentB,
                nonce,
                amount,
                msg.sender
            )
        );

        require(
            ECTools.isSignedBy(fingerprint, sigA, agentA) == true,
            "AgentA signature not valid"
        );
        require(
            ECTools.isSignedBy(fingerprint, sigB, agentB) == true,
            "AgentB signature not valid"
        );
        require(
            nonce > channel.nonce,
            "Nonce is not higher than on chain channel state."
        );

        // CONCERN: Any reentrancy issues?
        channel.balanceTotal -= amount;

        if (msg.sender == agentA) {
            channel.balanceA -= amount;
            msg.sender.transfer(amount);
        } else if (msg.sender == agentB) {
            channel.balanceB -= amount;
            msg.sender.transfer(amount);
        } else {
            revert("This is not your channel");
        }

        require(
          channel.balanceTotal == channel.balanceA + channel.balanceB, 
          "Balance toal and current deposits don't add up"
        );

        channel.nonce = nonce;
    }

    function startChallenge (
        address agentA,
        address agentB
    ) public {
        require(agentA > agentB, "agentA's address must be numerically greater than agentB's address.");
        Channel storage channel = channels[agentA][agentB];

        require(channel.status == ChannelStatus.Challenge, "Channel status must be Open.");

        require(
            msg.sender == agentA || msg.sender == agentB,
            "Not your channel."
        );

        channel.closeBlock = block.number + 5000;
        channel.status = ChannelStatus.Challenge;
    }

    function close (
        address agentA,
        address agentB
    ) public {
        // CONCERN: anyone can call this function
        require(agentA > agentB, "agentA's address must be numerically greater than agentB's address.");
        Channel storage channel = channels[agentA][agentB];

        require(channel.status == ChannelStatus.Challenge, "Channel status must be Challenge.");
        require(channel.closeBlock > block.number, "Channel challenge period not over.");

        // CONCERN: Reentrancy/lockout issues at all here?
        uint balanceA = channel.balanceA;
        channel.balanceA = 0;
        agentA.transfer(balanceA);
        
        uint balanceB = channel.balanceB;
        channel.balanceB = 0;
        agentB.transfer(balanceB);

        delete channels[agentA][agentB];
    }
}
