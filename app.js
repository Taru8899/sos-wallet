let walletAddress = "";

const connectButton = document.getElementById("connectButton");
const mintButton = document.getElementById("mintButton");
const selfMintButton = document.getElementById("selfMintButton");
const batchMintButton = document.getElementById("batchMintButton");

mintButton.disabled = true;
selfMintButton.disabled = true;
batchMintButton.disabled = true;

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
        batchMintButton.disabled = false;

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

batchMintButton.onclick = async function () {

    const progressEl = document.getElementById("batchMintProgress");
    const n = parseInt(document.getElementById("batchMintCount").value, 10);

    if (!n || n < 1) {
        alert("Enter how many SOS to mint (1 or more).");
        return;
    }

    if (n > 50) {
        alert("Max 50 per batch — that's already 50 separate wallet confirmations.");
        return;
    }

    if (n > 5) {
        const ok = confirm(
            "This will ask you to confirm " + n + " separate wallet transactions, one at a time, " +
            "and each one costs its own gas fee. Continue?"
        );
        if (!ok) return;
    }

    batchMintButton.disabled = true;
    let completed = 0;

    for (let i = 1; i <= n; i++) {
        progressEl.innerText = "Minting " + i + " of " + n + "… confirm in your wallet";
        document.getElementById("status").innerText = "Minting " + i + " of " + n + "…";

        try {
            await pushForMe();
            completed++;
            progressEl.innerText = completed + " of " + n + " confirmed ✓";
            await refreshWallet();
        } catch (err) {
            console.error(err);
            progressEl.innerText =
                "Stopped after " + completed + " of " + n + " — " + (err.shortMessage || err.message);
            document.getElementById("status").innerText =
                "Batch mint stopped: " + (err.shortMessage || err.message);
            batchMintButton.disabled = false;
            return;
        }
    }

    document.getElementById("status").innerText =
        "Batch mint complete — " + completed + " SOS minted";
    batchMintButton.disabled = false;
};
