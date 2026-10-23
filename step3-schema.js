// Step 3: Schema design (embedding vs. referencing) on the seeded dataset
// Run in mongosh AFTER seed.js:  load("queries/step3-schema.js")

const lab = db.getSiblingDB("firewall_lab");
const show = (label, value) => { print(`\n--- ${label} ---`); printjson(value); };

// ---------- EMBEDDING ----------
// Interfaces and tags live inside the device document: few per device,
// owned by one device, and read together with it. One read returns everything.
show("Embedded example: web server", lab.devices.findOne({ _id: "dev-03" }));

// Dot notation: query a field inside an embedded array of documents
show("Devices with a wireless interface (dot notation)",
  lab.devices.find({ "interfaces.name": "wlan0" }, { hostname: 1, _id: 0 }).toArray());

// Array match: a single value matches any array that contains it
show("Devices tagged critical (array match)",
  lab.devices.find({ tags: "critical" }, { hostname: 1, tags: 1, _id: 0 }).toArray());

// ---------- REFERENCING ----------
// Events store a deviceId instead of living inside the device:
// they grow without limit, and a document can't exceed 16 MB.
const ev = lab.events.findOne({ action: "deny" });
show("Referenced example: a denied event", ev);

// Following a reference by hand takes two queries ($lookup in Step 5 does it in one)
show("The device that event points to", lab.devices.findOne({ _id: ev.deviceId }));

// ---------- FLEXIBLE SCHEMA IN PRACTICE ----------
// Denied events have a rule field but no bytes; allowed events have bytes but no rule.
show("Denied events WITHOUT bytes", lab.events.countDocuments({ action: "deny", bytes: { $exists: false } }));
show("Allowed events WITH bytes", lab.events.countDocuments({ action: "allow", bytes: { $exists: true } }));

// ---------- COUNTS ON THE FULL DATASET ----------
show("Total events", lab.events.countDocuments());
show("Denied events", lab.events.countDocuments({ action: "deny" }));
show("Denied RDP (3389) events", lab.events.countDocuments({ action: "deny", destPort: 3389 }));

// Largest transfers
show("Top 5 transfers over 45,000 bytes",
  lab.events.find({ bytes: { $gt: 45000 } }, { sourceIp: 1, destIp: 1, destPort: 1, bytes: 1, _id: 0 })
    .sort({ bytes: -1 }).limit(5).toArray());
