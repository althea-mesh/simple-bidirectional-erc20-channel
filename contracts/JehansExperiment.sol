pragma solidity ^0.4.23;

import "../node_modules/openzeppelin-solidity/contracts/ECRecovery.sol";
import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

import "./ECTools.sol";


/*
@tile Bi-directional ethereum payment channel
@notice a simple bi directional payment channel with esy deposits and withdrawls
*/
contract JehansExperiment {
  using SafeMath for uint256;
  
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
  /*
   @notice desposit 
   @dev functions acts as a an initializer of the payemtn channel and a way for 
   quickly adding more balance to the contract. Channel mapping depends on both
   parties addresses. 
   @param agentA Address of agentA
   @param agentB Address of agentB

  */
  function deposit (
      address agentA,
      address agentB
  ) public payable {
      require(
        agentA > agentB,
        "agentA's address must be numerically greater than agentB's address."
      );
      Channel storage channel = channels[agentA][agentB];
      channel.balanceTotal = channel.balanceTotal.add(msg.value);

      emit Debug(msg.value);
      if (msg.sender == agentA) {
          channel.balanceA = channel.balanceA.add(msg.value);
      } else if (msg.sender == agentB) {
          channel.balanceB = channel.balanceB.add(msg.value);
      } else {
          revert("This is not your channel");
      }
  }

  // CONCERN: Is this missing anything? Compare it against the other contract and old Guac to be sure.
  /*
     @notice transfer
     @dev 
     @param agentA numerically greater address
     @param agentB numerically lesser address
     @param nonce Payment channel nonce. must be greater than the previous nonce
     @param balanceA new balance for agentA in the the payment channel
     @param balanceB new balance for agentB in the the payment channel
     @param sigA signature from agentA of the fingerprint(keccak256(params)) of the input parameters
     @param sigB signature from agentB of the fingerprint(keccak256(params)) of the input parameters
  */
  function transfer(
      address agentA,
      address agentB,
      uint nonce,
      uint balanceA,
      uint balanceB,
      string sigA,
      string sigB
  ) public {
      require(
        agentA > agentB,
        "agentA's address must be numerically greater than agentB's address."
      );
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
      require(
        agentA > agentB,
        "agentA's address must be numerically greater than agentB's address."
      );
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
          ECTools.isSignedBy(fingerprint, sigA, agentA),
          //ECRecovery.recover(fingerprint, sigA) == agentA,
          "AgentA signature not valid"
      );
      require(
          ECTools.isSignedBy(fingerprint, sigB, agentB),
          //ECRecovery.recover(fingerprint, sigB) == agentB,
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
