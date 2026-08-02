let walletAddress = "";

const connectButton = document.getElementById("connectButton");
const mintButton = document.getElementById("mintButton");
const selfMintButton = document.getElementById("selfMintButton");

connectButton.onclick = async function () {

    try {

        document.getElementById("status").innerText =
        "Connecting...";

        walletAddress = await connectWallet();

        document.getElementById("address").innerText =
        walletAddress;

        await refreshWallet();

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

    const trust =
    await getTrust(walletAddress);

    const push =
    await getPushCount(walletAddress);

    const total =
    await getTotalSupply();

    document.getElementById("trust").innerText =
    trust.toString();

    document.getElementById("push").innerText =
    push.toString();

    document.getElementById("effective").innerText =
    (trust - push).toString();

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
        "Waiting for MetaMask...";

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
        "Waiting for MetaMask...";

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
