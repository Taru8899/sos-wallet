let walletAddress = "";
const LOCAL_KEY = "sos69069_pending_offers_v1";
const REP_KEY = "sos69069_rep_v1";
const OFFERS_JSON_URL = "offers.json";

let communityOffers = [];
let pendingOffers = [];
let ethUsdPrice = null;

const connectButton = document.getElementById("connectButton");
const postOfferBtn = document.getElementById("postOfferBtn");
const signOfferBtn = document.getElementById("signOfferBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const reloadJsonBtn = document.getElementById("reloadJsonBtn");

postOfferBtn.disabled = true;
signOfferBtn.disabled = true;

// ---------- CONNECT ----------
connectButton.onclick = async function () {
  try {
    document.getElementById("status").innerText = "Connecting...";
    walletAddress = await connectWallet();
    document.getElementById("address").innerText = walletAddress;
    await refreshWallet();
    postOfferBtn.disabled = false;
    signOfferBtn.disabled = false;
    document.getElementById("status").innerText = "Connected";
    renderOffers();
  } catch (err) {
    console.error(err);
    document.getElementById("status").innerText = err.message;
  }
};

async function refreshWallet() {
  if (!walletAddress || !contract) return;
  const trust = await getTrust(walletAddress);
  const push = await getPushCount(walletAddress);
  const total = await getTotalSupply();
  document.getElementById("trust").innerText = trust.toString();
  document.getElementById("push").innerText = push.toString();
  document.getElementById("effective").innerText = (BigInt(trust) - BigInt(push)).toString();
  document.getElementById("totalSupply").innerText = total.toString();
}

document.getElementById("methodChips").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  document.getElementById("offerMethod").value = e.target.dataset.method;
  document.querySelectorAll("#methodChips button").forEach(b => b.classList.remove("chip-active"));
  e.target.classList.add("chip-active");
});

// ---------- STORAGE ----------
function loadPending() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); }
  catch { return []; }
}
function savePending(list) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

function loadRep() {
  try { return JSON.parse(localStorage.getItem(REP_KEY) || "{}"); }
  catch { return {}; }
}
function saveRep(rep) {
  localStorage.setItem(REP_KEY, JSON.stringify(rep));
}
function bumpRep(address, field) {
  if (!address) return;
  const key = address.toLowerCase();
  const rep = loadRep();
  if (!rep[key]) rep[key] = { closes: 0, accepts: 0, abandons: 0 };
  rep[key][field] = (rep[key][field] || 0) + 1;
  saveRep(rep);
}
function getRepLine(address) {
  const r = loadRep()[address.toLowerCase()];
  if (!r) return "";
  const parts = [];
  if (r.closes) parts.push(r.closes + " closed");
  if (r.accepts) parts.push(r.accepts + " accepted");
  if (r.abandons) parts.push(r.abandons + " abandoned");
  return parts.length ? "Rep (local): " + parts.join(" · ") : "";
}

async function fetchCommunityOffers() {
  try {
    const res = await fetch(OFFERS_JSON_URL + "?t=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    communityOffers = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("Could not load offers.json:", e);
    communityOffers = [];
  }
}

function allOffers() {
  const ids = new Set(communityOffers.map(o => o.id));
  const extra = pendingOffers.filter(o => !ids.has(o.id));
  return [...extra, ...communityOffers];
}

function persistOfferUpdate(offer) {
  pendingOffers = loadPending();
  const pi = pendingOffers.findIndex(o => o.id === offer.id);
  if (pi !== -1) {
    pendingOffers[pi] = offer;
  } else {
    pendingOffers.unshift(offer);
  }
  savePending(pendingOffers);

  const ci = communityOffers.findIndex(o => o.id === offer.id);
  if (ci !== -1) communityOffers[ci] = offer;
}

function findOffer(id) {
  return allOffers().find(o => o.id === id);
}

// ---------- FORM / POST ----------
function collectForm() {
  const type = document.getElementById("offerType").value;
  const amount = document.getElementById("offerAmount").value.trim();
  const price = document.getElementById("offerPrice").value.trim();
  const method = document.getElementById("offerMethod").value.trim();
  const contact = document.getElementById("offerContact").value.trim();
  const note = document.getElementById("offerNote").value.trim();

  if (!amount || Number(amount) < 1) {
    alert("Enter a valid amount of SOS (≥ 1)");
    return null;
  }
  if (!price) {
    alert("Describe what you want / offer in return");
    return null;
  }
  if (!method) {
    alert("Choose or type a payment / exchange method");
    return null;
  }
  if (!contact) {
    alert("Add a contact method so people can reach you");
    return null;
  }

  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    type,
    amount: String(Math.floor(Number(amount))),
    price,
    method,
    contact,
    note,
    poster: walletAddress,
    createdAt: new Date().toISOString(),
    status: "open",
    filled: false,
    signature: null,
    signedMessage: null,
    mintTx: null,
    accepts: [],
    flags: [],
    closeTx: null,
    closedAt: null
  };
}

function clearForm() {
  document.getElementById("offerAmount").value = "";
  document.getElementById("offerPrice").value = "";
  document.getElementById("offerMethod").value = "";
  document.getElementById("offerContact").value = "";
  document.getElementById("offerNote").value = "";
  document.querySelectorAll("#methodChips button").forEach(b => b.classList.remove("chip-active"));
}

async function mintOne() {
  document.getElementById("status").innerText = "Confirm pushForMe in wallet (1 SOS)…";
  const receipt = await pushForMe();
  return receipt.hash;
}

async function finishPost(offer, doSign) {
  if (!walletAddress || !contract || !signer) {
    alert("Connect wallet first");
    return;
  }

  if (offer.type === "sell") {
    try {
      const trust = await getTrust(walletAddress);
      const push = await getPushCount(walletAddress);
      const effective = BigInt(trust) - BigInt(push);
      if (effective < BigInt(offer.amount)) {
        const ok = confirm(
          "Your effective balance is only " + effective + ". You are listing " + offer.amount + " SOS.\nContinue anyway?"
        );
        if (!ok) return;
      }
    } catch (e) {
      console.warn(e);
    }
  }

  const message =
    "SOS69069 Offer\n" +
    "Id: " + offer.id + "\n" +
    "Type: " + offer.type + "\n" +
    "Amount: " + offer.amount + " SOS\n" +
    "Price: " + offer.price + "\n" +
    "Method: " + offer.method + "\n" +
    "Contact: " + offer.contact + "\n" +
    "Poster: " + offer.poster + "\n" +
    "Time: " + offer.createdAt;

  if (doSign) {
    document.getElementById("status").innerText = "Waiting for signature…";
    try {
      offer.signature = await signer.signMessage(message);
      offer.signedMessage = message;
    } catch (err) {
      document.getElementById("status").innerText = err.shortMessage || err.message;
      return;
    }
  } else {
    offer.signedMessage = message;
  }

  try {
    offer.mintTx = await mintOne();
  } catch (err) {
    console.error(err);
    document.getElementById("status").innerText = err.shortMessage || err.message;
    return;
  }

  pendingOffers = loadPending();
  pendingOffers.unshift(offer);
  savePending(pendingOffers);

  clearForm();
  await refreshWallet();
  renderOffers();
  document.getElementById("status").innerText =
    "Offer posted + 1 SOS minted. Download offers.json and commit so others see it.";
}

postOfferBtn.onclick = async function () {
  const offer = collectForm();
  if (!offer) return;
  await finishPost(offer, false);
};

signOfferBtn.onclick = async function () {
  const offer = collectForm();
  if (!offer) return;
  await finishPost(offer, true);
};

// ---------- HANDSHAKE: ACCEPT / CLOSE ----------
async function acceptOffer(id) {
  if (!walletAddress || !contract || !signer) {
    alert("Connect wallet first");
    return;
  }
  const offer = findOffer(id);
  if (!offer) return;
  if (offer.filled || offer.status === "closed") {
    alert("This offer is already closed");
    return;
  }
  if (offer.poster.toLowerCase() === walletAddress.toLowerCase()) {
    alert("You cannot accept your own offer");
    return;
  }
  if ((offer.accepts || []).some(a => a.address.toLowerCase() === walletAddress.toLowerCase())) {
    alert("You already accepted this offer");
    return;
  }

  const acceptMsg =
    "SOS69069 Accept\n" +
    "OfferId: " + offer.id + "\n" +
    "Acceptor: " + walletAddress + "\n" +
    "Poster: " + offer.poster + "\n" +
    "Time: " + new Date().toISOString();

  let sig = null;
  try {
    document.getElementById("status").innerText = "Sign accept message…";
    sig = await signer.signMessage(acceptMsg);
  } catch (err) {
    document.getElementById("status").innerText = err.shortMessage || err.message;
    return;
  }

  let mintTx;
  try {
    mintTx = await mintOne();
  } catch (err) {
    console.error(err);
    document.getElementById("status").innerText = err.shortMessage || err.message;
    return;
  }

  if (!offer.accepts) offer.accepts = [];
  offer.accepts.push({
    address: walletAddress,
    mintTx,
    at: new Date().toISOString(),
    signature: sig,
    signedMessage: acceptMsg
  });
  offer.status = "accepted";
  persistOfferUpdate(offer);
  bumpRep(walletAddress, "accepts");

  await refreshWallet();
  renderOffers();
  document.getElementById("status").innerText =
    "Deal accepted (1 SOS minted). SOS-deliverer should mint first (pushTo), then payment. Poster closes when done. Download offers.json to publish.";
}

async function closeOffer(id) {
  if (!walletAddress || !contract || !signer) {
    alert("Connect wallet first");
    return;
  }
  const offer = findOffer(id);
  if (!offer) return;
  if (offer.poster.toLowerCase() !== walletAddress.toLowerCase()) {
    alert("Only the poster can close this deal");
    return;
  }
  if (offer.filled || offer.status === "closed") {
    alert("Already closed");
    return;
  }
  if (!offer.accepts || offer.accepts.length === 0) {
    const ok = confirm("No on-chain accept yet. Close anyway?");
    if (!ok) return;
  }

  let closeTx;
  try {
    closeTx = await mintOne();
  } catch (err) {
    console.error(err);
    document.getElementById("status").innerText = err.shortMessage || err.message;
    return;
  }

  offer.status = "closed";
  offer.filled = true;
  offer.closeTx = closeTx;
  offer.closedAt = new Date().toISOString();
  persistOfferUpdate(offer);
  bumpRep(walletAddress, "closes");
  (offer.accepts || []).forEach(a => bumpRep(a.address, "closes"));

  await refreshWallet();
  renderOffers();
  document.getElementById("status").innerText =
    "Deal closed (1 SOS minted). Download offers.json and commit to update the public list.";
}

/**
 * Flag no-pay: does NOT close the deal.
 * Requires at least one evidence tx hash (SOS mint to them and/or ETH/USDC you sent).
 */
function markAbandon(offerId, acceptorAddress) {
  const offer = findOffer(offerId);
  if (!offer || !walletAddress) return;
  if (offer.poster.toLowerCase() !== walletAddress.toLowerCase()) {
    alert("Only the poster can flag no-pay");
    return;
  }

  const mintEv = (prompt(
    "Evidence: paste tx hash where YOU minted SOS to their wallet (pushTo them).\n" +
    "Leave empty if you did not mint SOS to them."
  ) || "").trim();

  const payEv = (prompt(
    "Evidence: paste tx hash where YOU sent ETH / USDC (or other crypto) to them.\n" +
    "Leave empty if you did not send payment."
  ) || "").trim();

  if (!mintEv && !payEv) {
    alert("Add at least one tx hash as evidence (SOS mint and/or payment).");
    return;
  }

  function looksLikeTx(h) {
    return /^0x[a-fA-F0-9]{64}$/.test(h);
  }
  if (mintEv && !looksLikeTx(mintEv)) {
    const ok = confirm("SOS mint value does not look like a tx hash. Save anyway?");
    if (!ok) return;
  }
  if (payEv && !looksLikeTx(payEv)) {
    const ok = confirm("Payment value does not look like a tx hash. Save anyway?");
    if (!ok) return;
  }

  if (!offer.flags) offer.flags = [];
  offer.flags.push({
    address: acceptorAddress,
    by: walletAddress,
    at: new Date().toISOString(),
    mintTxEvidence: mintEv || null,
    payTxEvidence: payEv || null
  });
  persistOfferUpdate(offer);
  bumpRep(acceptorAddress, "abandons");

  document.getElementById("status").innerText =
    "Flagged no-pay with evidence (deal still open). Close deal separately if you want it CLOSED. Download offers.json to publish.";
  renderOffers();
}

// ---------- JSON ----------
downloadJsonBtn.onclick = function () {
  const merged = allOffers();
  const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "offers.json";
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById("status").innerText = "offers.json downloaded — commit it to the repo";
};

reloadJsonBtn.onclick = async function () {
  document.getElementById("status").innerText = "Reloading offers.json…";
  await fetchCommunityOffers();
  pendingOffers = loadPending();
  renderOffers();
  document.getElementById("status").innerText = "Reloaded";
};

// ---------- RENDER ----------
let currentFilter = "all";

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderOffers();
  };
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(offer) {
  const st = offer.filled || offer.status === "closed" ? "closed"
    : (offer.status === "accepted" || (offer.accepts && offer.accepts.length)) ? "accepted"
    : "open";
  const label = st === "closed" ? "CLOSED" : st === "accepted" ? "ACCEPTED" : "OPEN";
  return '<span class="status-badge status-' + st + '">' + label + '</span>';
}

async function renderOffers() {
  updateMarketMids();
  const listEl = document.getElementById("offersList");
  let offers = allOffers().filter(o => {
    if (currentFilter === "sell" || currentFilter === "buy") return o.type === currentFilter;
    return true;
  });

  offers.sort((a, b) => {
    const ac = (a.filled || a.status === "closed") ? 1 : 0;
    const bc = (b.filled || b.status === "closed") ? 1 : 0;
    return ac - bc;
  });

  if (offers.length === 0) {
    listEl.innerHTML = '<p class="muted">No offers yet. Be the first!</p>';
    return;
  }

  listEl.innerHTML = "";
  const me = (walletAddress || "").toLowerCase();

  for (const o of offers) {
    const card = document.createElement("div");
    card.className = "offer-card " + o.type;
    const typeLabel = o.type === "sell" ? "SELL" : "BUY";
    const typeColor = o.type === "sell" ? "#16a34a" : "#2563eb";
    const isPoster = me && o.poster.toLowerCase() === me;
    const isClosed = o.filled || o.status === "closed";
    const alreadyAccepted = (o.accepts || []).some(a => a.address.toLowerCase() === me);

    let balanceHtml = "";
    if (o.type === "sell" && contract) {
      try {
        const trust = await getTrust(o.poster);
        const push = await getPushCount(o.poster);
        const effective = (BigInt(trust) - BigInt(push)).toString();
        balanceHtml = '<div class="offer-balance">On-chain effective: <strong>' + effective + '</strong> SOS</div>';
      } catch {
        balanceHtml = '<div class="offer-balance muted">Balance check failed</div>';
      }
    }

    const shortAddr = o.poster.slice(0, 6) + "…" + o.poster.slice(-4);
    const etherscan = "https://etherscan.io/address/" + o.poster;
    const time = new Date(o.createdAt).toLocaleString();
    const mintLink = o.mintTx
      ? ' · <a href="https://etherscan.io/tx/' + o.mintTx + '" target="_blank" rel="noopener">list mint</a>'
      : "";
    const closeLink = o.closeTx
      ? ' · <a href="https://etherscan.io/tx/' + o.closeTx + '" target="_blank" rel="noopener">close mint</a>'
      : "";
    const isPending = pendingOffers.some(p => p.id === o.id);
    const rep = getRepLine(o.poster);

    let acceptsHtml = "";
    if (o.accepts && o.accepts.length) {
      acceptsHtml = '<div class="accept-list"><strong>Accepts (on-chain):</strong><br>' +
        '<span class="muted">After accept: the side that must deliver SOS should mint first (pushTo), then payment.</span><br>' +
        o.accepts.map(a => {
          const as = a.address.slice(0, 6) + "…" + a.address.slice(-4);
          const tx = a.mintTx
            ? ' <a href="https://etherscan.io/tx/' + a.mintTx + '" target="_blank" rel="noopener">accept mint</a>'
            : "";
          const flag = isPoster && !isClosed
            ? ' <button class="small-btn danger abandon-btn" data-id="' + o.id + '" data-addr="' + a.address + '">Flag no-pay</button>'
            : "";
          return as + tx + flag + ' <span class="muted">' + getRepLine(a.address) + '</span>';
        }).join("<br>") +
        "</div>";
    }
    if (o.flags && o.flags.length) {
      acceptsHtml += '<div class="accept-list" style="color:#fca5a5"><strong>No-pay flags (evidence):</strong><br>' +
        o.flags.map(f => {
          const as = f.address.slice(0, 6) + "…" + f.address.slice(-4);
          const links = [];
          if (f.mintTxEvidence) {
            links.push('<a href="https://etherscan.io/tx/' + f.mintTxEvidence + '" target="_blank" rel="noopener">SOS mint tx</a>');
          }
          if (f.payTxEvidence) {
            links.push('<a href="https://etherscan.io/tx/' + f.payTxEvidence + '" target="_blank" rel="noopener">payment tx</a>');
          }
          return as + " · " + links.join(" · ");
        }).join("<br>") +
        "</div>";
    }

    const signedPreview = o.signedMessage
      ? '<button class="small-btn toggle-msg-btn" data-id="' + o.id + '">Show signed message</button>' +
        '<div class="signed-msg" id="msg-' + o.id + '">' + escapeHtml(o.signedMessage) +
        (o.signature ? "\n\nSignature:\n" + escapeHtml(o.signature) : "") +
        "</div>"
      : "";

    let actions = '<button class="small-btn copy-btn" data-id="' + o.id + '">Copy text</button>';
    if (!isClosed && me && !isPoster && !alreadyAccepted) {
      actions += '<button class="small-btn accept-btn" data-id="' + o.id + '" style="background:#2563eb">Accept (mint 1 SOS)</button>';
    }
    if (!isClosed && isPoster) {
      actions += '<button class="small-btn close-btn" data-id="' + o.id + '" style="background:#16a34a">Close deal (mint 1 SOS)</button>';
    }
    if (o.signature) {
      actions += '<button class="small-btn verify-btn" data-id="' + o.id + '">Verify sig</button>';
    }

    card.innerHTML =
      '<div class="offer-header">' +
        '<span class="offer-type" style="background:' + typeColor + '">' + typeLabel + '</span>' +
        '<span class="offer-amount">' + o.amount + ' SOS</span>' +
        statusBadge(o) +
        (o.signature ? '<span class="signed-badge">Signed</span>' : '') +
        (isPending ? '<span class="pending-badge">Pending commit</span>' : '') +
      '</div>' +
      '<div class="offer-price">' + escapeHtml(o.price) + '</div>' +
      '<div class="offer-method">via <strong>' + escapeHtml(o.method) + '</strong></div>' +
      balanceHtml +
      '<div class="offer-contact">Contact: ' + escapeHtml(o.contact) + ' <span class="muted">(negotiate here first)</span></div>' +
      (o.note ? '<div class="offer-note">' + escapeHtml(o.note) + '</div>' : '') +
      (rep ? '<div class="rep-line">' + escapeHtml(rep) + '</div>' : '') +
      acceptsHtml +
      '<div class="offer-meta">' +
        '<a href="' + etherscan + '" target="_blank" rel="noopener">' + shortAddr + '</a>' +
        ' · ' + time + mintLink + closeLink +
      '</div>' +
      signedPreview +
      '<div class="offer-actions">' + actions + '</div>';

    listEl.appendChild(card);
  }

  listEl.querySelectorAll(".copy-btn").forEach(btn => {
    btn.onclick = () => copyOfferText(btn.dataset.id);
  });
  listEl.querySelectorAll(".accept-btn").forEach(btn => {
    btn.onclick = () => acceptOffer(btn.dataset.id);
  });
  listEl.querySelectorAll(".close-btn").forEach(btn => {
    btn.onclick = () => closeOffer(btn.dataset.id);
  });
  listEl.querySelectorAll(".abandon-btn").forEach(btn => {
    btn.onclick = () => markAbandon(btn.dataset.id, btn.dataset.addr);
  });
  listEl.querySelectorAll(".verify-btn").forEach(btn => {
    btn.onclick = () => verifySignature(btn.dataset.id);
  });
  listEl.querySelectorAll(".toggle-msg-btn").forEach(btn => {
    btn.onclick = () => {
      const el = document.getElementById("msg-" + btn.dataset.id);
      if (!el) return;
      el.classList.toggle("show");
      btn.textContent = el.classList.contains("show") ? "Hide signed message" : "Show signed message";
    };
  });
}

function copyOfferText(id) {
  const offer = findOffer(id);
  if (!offer) return;
  const text =
    "SOS69069 " + offer.type.toUpperCase() + " offer\n" +
    "Id: " + offer.id + "\n" +
    offer.amount + " SOS for: " + offer.price + "\n" +
    "Method: " + offer.method + "\n" +
    "Contact: " + offer.contact + "\n" +
    (offer.note ? "Note: " + offer.note + "\n" : "") +
    "Poster: " + offer.poster + "\n" +
    "Status: " + (offer.status || "open") + "\n" +
    "Etherscan: https://etherscan.io/address/" + offer.poster + "\n" +
    (offer.mintTx ? "List mint: https://etherscan.io/tx/" + offer.mintTx + "\n" : "") +
    (offer.signedMessage ? "\n--- signed message ---\n" + offer.signedMessage + "\n" : "");
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById("status").innerText = "Offer text copied";
  });
}

async function verifySignature(id) {
  const offer = findOffer(id);
  if (!offer || !offer.signature || !offer.signedMessage) {
    alert("No signature on this offer");
    return;
  }
  try {
    const recovered = ethers.verifyMessage(offer.signedMessage, offer.signature);
    if (recovered.toLowerCase() === offer.poster.toLowerCase()) {
      alert("✅ Signature valid\nRecovered address matches the poster.\n\nOpen “Show signed message” on the card or read signedMessage in offers.json.");
    } else {
      alert("❌ Signature does NOT match the poster address!");
    }
  } catch (e) {
    alert("Verification failed: " + e.message);
  }
}

// ---------- MARKET MID ----------
async function fetchEthUsd() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    const data = await res.json();
    if (data && data.ethereum && data.ethereum.usd) {
      ethUsdPrice = Number(data.ethereum.usd);
    }
  } catch (e) {
    console.warn("ETH/USD fetch failed", e);
  }
}

function parsePriceToUsdc(priceText, amountSos) {
  if (!priceText) return null;
  const t = String(priceText).trim();
  const amt = Math.max(1, Number(amountSos) || 1);
  let m = t.match(/([\d.,]+)\s*(ETH|eth|Ξ)/);
  if (m && ethUsdPrice) {
    const eth = parseFloat(m[1].replace(",", "."));
    if (!isNaN(eth) && eth > 0) return (eth * ethUsdPrice) / amt;
  }
  m = t.match(/(?:USDC|USD|USDT|\$)\s*([\d.,]+)/i) ||
      t.match(/([\d.,]+)\s*(?:USDC|USD|USDT|\$|bucks|dollars)/i) ||
      t.match(/^([\d.,]+)$/);
  if (m) {
    const usd = parseFloat(m[1].replace(",", "."));
    if (!isNaN(usd) && usd > 0) return usd / amt;
  }
  return null;
}

function median(nums) {
  if (!nums.length) return null;
  const a = nums.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function formatEthUsdc(usdcPerSos) {
  if (usdcPerSos == null || isNaN(usdcPerSos)) return "—";
  const usdcStr = usdcPerSos >= 1 ? usdcPerSos.toFixed(2) : usdcPerSos.toPrecision(3);
  if (ethUsdPrice && ethUsdPrice > 0) {
    const eth = usdcPerSos / ethUsdPrice;
    const ethStr = eth >= 0.001 ? eth.toFixed(5) : eth.toExponential(2);
    return ethStr + " ETH (" + usdcStr + " USDC)";
  }
  return usdcStr + " USDC";
}

function updateMarketMids() {
  const offers = allOffers().filter(o => !o.filled && o.status !== "closed");
  const sellUsdc = [];
  const buyUsdc = [];
  for (const o of offers) {
    const p = parsePriceToUsdc(o.price, o.amount);
    if (p == null) continue;
    if (o.type === "sell") sellUsdc.push(p);
    else if (o.type === "buy") buyUsdc.push(p);
  }
  const midAsk = median(sellUsdc);
  const midBid = median(buyUsdc);
  const elBuy = document.getElementById("midBuy");
  const elSell = document.getElementById("midSell");
  const elMeta = document.getElementById("midMeta");
  if (!elBuy) return;
  elBuy.innerText = formatEthUsdc(midAsk);
  elSell.innerText = formatEthUsdc(midBid);
  const parts = [];
  if (sellUsdc.length) parts.push(sellUsdc.length + " sell");
  if (buyUsdc.length) parts.push(buyUsdc.length + " buy");
  if (ethUsdPrice) parts.push("ETH ≈ $" + ethUsdPrice.toFixed(0));
  elMeta.innerText = parts.length
    ? "Based on " + parts.join(" · ")
    : "No USDC/ETH-priced offers yet — use prices like “5 USDC” or “0.002 ETH”";
}

(async function init() {
  pendingOffers = loadPending();
  await Promise.all([fetchCommunityOffers(), fetchEthUsd()]);
  renderOffers();
  updateMarketMids();
})();
