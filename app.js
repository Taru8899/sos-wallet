let walletAddress = "";

const connectButton = document.getElementById("connectButton");
const mintButton = document.getElementById("mintButton");
const selfMintButton = document.getElementById("selfMintButton");


// CONNECT WALLET

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



// READ SOS DATA

async function refreshWallet(){

    try {


        console.log("Loading SOS data");


        console.log(
            "Contract:",
            contract
        );


        console.log(
            "Current wallet:",
            walletAddress
        );



        const trust =
        await getTrust(walletAddress);



        const push =
        await getPushCount(walletAddress);



        const total =
        await getTotalSupply();



        console.log(
            "Trust:",
            trust.toString()
        );


        console.log(
            "Push:",
            push.toString()
        );


        console.log(
            "Total Supply:",
            total.toString()
        );



        document.getElementById("trust").innerText =
        trust.toString();



        document.getElementById("push").innerText =
        push.toString();



        // Protocol balance view:
        // trustOf - pushOf

        document.getElementById("effective").innerText =
        (
            BigInt(trust) -
            BigInt(push)
        ).toString();



        document.getElementById("totalSupply").innerText =
        total.toString();


    }

    catch(err){

        console.error(
            "Refresh error:",
            err
        );


        document.getElementById("status").innerText =
        err.message;

    }

}




// PUSH TO ANOTHER ADDRESS

mintButton.onclick = async function(){

    try{


        const receiver =
        document
        .getElementById("receiver")
        .value
        .trim();



        if(receiver === ""){

            alert(
                "Enter receiver address"
            );

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
        err.shortMessage ||
        err.message;


    }

};




// SELF PUSH

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
        err.shortMessage ||
        err.message;


    }

};
