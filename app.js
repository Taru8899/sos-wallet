let walletAddress = "";

const connectButton = document.getElementById("connectButton");
const mintButton = document.getElementById("mintButton");
const selfMintButton = document.getElementById("selfMintButton");

mintButton.disabled = true;
selfMintButton.disabled = true;

connectButton.onclick = async function () {

    try {

        document.getElementById("status").innerText =
        "Connecting...";

        walletAddress = await connectWallet();

        document.getElementById("address").innerText =
        walletAddress;

        await refreshWallet();

        mintButton.disabled = false;
        selfMintButton.disabled = false;

        document.getElementById("status").innerText =
        "Connected";

    }

    catch(err){

        console.error(err);

        document.getElementById("status").innerText =
        err.message;

    }

};

async function refreshWallet(){

    console.log("Loading SOS data");

    console.log("Contract:", contract);

    console.log(
        "Current wallet:",
        walletAddress
    );

    const trust =
    await getTrust(walletAddress);

    console.log(
        "Trust raw:",
        trust.toString()
    );

    const push =
    await getPushCount(walletAddress);

    const total =
    await getTotalSupply();

    document.getElementById("trust").innerText =
    trust.toString();

    document.getElementById("push").innerText =
    push.toString();

    document.getElementById("effective").innerText =
    (BigInt(trust) - BigInt(push)).toString();

    document.getElementById("totalSupply").innerText =
    total.toString();

}

mintButton.onclick = async function(){

    try{

        const receiver =
        document.getElementById("receiver").value.trim();

        if(receiver==""){

            alert("Enter receiver address");

            return;

        }

        document.getElementById("status").innerText =
        "Waiting for wallet confirmation...";

        await pushTo(receiver);

        document.getElementById("status").innerText =
        "Mint Successful";

        await refreshWallet();

    }

    catch(err){

        console.error(err);

        document.getElementById("status").innerText =
        err.shortMessage || err.message;

    }

};

selfMintButton.onclick = async function(){

    try{

        document.getElementById("status").innerText =
        "Waiting for wallet confirmation...";

        await pushForMe();

        document.getElementById("status").innerText =
        "Self Push Successful";

        await refreshWallet();

    }

    catch(err){

        console.error(err);

        document.getElementById("status").innerText =
        err.shortMessage || err.message;

    }

};
