const SOS_CONTRACT =
"0x61af906f53Eb927790055AC8eA99916a01873c15";


const SOS_ABI = [

{
    "inputs":[
        {
            "internalType":"address",
            "name":"",
            "type":"address"
        }
    ],
    "name":"trustOf",
    "outputs":[
        {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
        }
    ],
    "stateMutability":"view",
    "type":"function"
},


{
    "inputs":[
        {
            "internalType":"address",
            "name":"",
            "type":"address"
        }
    ],
    "name":"pushOf",
    "outputs":[
        {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
        }
    ],
    "stateMutability":"view",
    "type":"function"
},


{
    "inputs":[
        {
            "internalType":"address",
            "name":"",
            "type":"address"
        }
    ],
    "name":"balanceOf",
    "outputs":[
        {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
        }
    ],
    "stateMutability":"view",
    "type":"function"
},


{
    "inputs":[
        {
            "internalType":"address",
            "name":"to",
            "type":"address"
        }
    ],
    "name":"pushTo",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
}

];
